package http

import (
	"bytes"
	"container/list"
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/sync/semaphore"
	"golang.org/x/sync/singleflight"

	"github.com/oguaa/backend/internal/platform/ogcard"
)

// ── branded news covers: cached, and rendered a couple at a time ────────────
//
// A branded cover is a 1600×900 PNG drawn on request: about 50 ms of CPU and
// 20 MB or more of heap each. Drawn per request, sixty at once came to
// ~820 MB on a 512 MB instance. So a cover is drawn once per (slug, title,
// source, date) and kept in a small LRU (a PNG is 70–150 KB, so ~5 MB in
// all), concurrent requests for one cover share a single draw, at most two
// covers are drawn at a time, and a request that can't get a turn within a
// moment is told to come back (503 + Retry-After) instead of queueing.

const (
	newsCoverCacheEntries = 32
	newsCoverRenderSlots  = 2
	// A list page can ask for a dozen cold covers at once; a few may wait
	// briefly for a turn (two slots clear a dozen in well under a second).
	newsCoverMaxWaiting = 8
	newsCoverMaxWait    = 2 * time.Second
)

// errNewsCoverBusy means every render slot (and the short queue) is taken.
var errNewsCoverBusy = errors.New("news cover renderer busy")

// newsCoverRenderer renders branded covers through a bounded LRU cache.
type newsCoverRenderer struct {
	render  func(io.Writer, ogcard.NewsCover) error
	slots   *semaphore.Weighted
	maxWait time.Duration
	queue   int64        // most requests that may wait for a slot
	waiting atomic.Int64 // requests waiting now
	group   singleflight.Group

	mu      sync.Mutex
	size    int
	order   *list.List // front = most recently used; values are *newsCoverEntry
	entries map[string]*list.Element
}

type newsCoverEntry struct {
	key string
	png []byte
}

func newNewsCoverRenderer(size, slots, queue int, maxWait time.Duration) *newsCoverRenderer {
	return &newsCoverRenderer{
		render: ogcard.RenderNewsCover, slots: semaphore.NewWeighted(int64(slots)), maxWait: maxWait, queue: int64(queue),
		size: size, order: list.New(), entries: map[string]*list.Element{},
	}
}

// newsCoverKey identifies a drawn cover: everything that is drawn on it.
func newsCoverKey(c ogcard.NewsCover) string {
	return strings.Join([]string{c.Seed, c.Kicker, c.Title, c.Source, c.Date}, "\x00")
}

// png returns the cover's PNG bytes, drawing it only when it is not cached.
// Treat the result as read-only: it is shared with the cache.
func (r *newsCoverRenderer) png(c ogcard.NewsCover) ([]byte, error) {
	key := newsCoverKey(c)
	if b, ok := r.cached(key); ok {
		return b, nil
	}
	v, err, _ := r.group.Do(key, func() (any, error) {
		if b, ok := r.cached(key); ok { // drawn while this caller waited
			return b, nil
		}
		if !r.acquire() {
			return nil, errNewsCoverBusy
		}
		defer r.slots.Release(1)
		var buf bytes.Buffer
		if err := r.render(&buf, c); err != nil {
			return nil, err
		}
		b := buf.Bytes()
		r.store(key, b)
		return b, nil
	})
	if err != nil {
		return nil, err
	}
	return v.([]byte), nil
}

// acquire takes a render slot, waiting a moment for one when all are busy,
// as long as only a few other requests are already waiting.
func (r *newsCoverRenderer) acquire() bool {
	if r.slots.TryAcquire(1) {
		return true
	}
	if r.waiting.Add(1) > r.queue {
		r.waiting.Add(-1)
		return false
	}
	defer r.waiting.Add(-1)
	ctx, cancel := context.WithTimeout(context.Background(), r.maxWait)
	defer cancel()
	return r.slots.Acquire(ctx, 1) == nil
}

func (r *newsCoverRenderer) cached(key string) ([]byte, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	el, ok := r.entries[key]
	if !ok {
		return nil, false
	}
	r.order.MoveToFront(el)
	return el.Value.(*newsCoverEntry).png, true
}

func (r *newsCoverRenderer) store(key string, png []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if el, ok := r.entries[key]; ok {
		r.order.MoveToFront(el)
		return
	}
	r.entries[key] = r.order.PushFront(&newsCoverEntry{key: key, png: png})
	for r.order.Len() > r.size {
		oldest := r.order.Back()
		r.order.Remove(oldest)
		delete(r.entries, oldest.Value.(*newsCoverEntry).key)
	}
}

// coverRenderer is the handler's cover renderer, made on first use (so a
// Handler built without NewHandler still has one).
func (h *Handler) coverRenderer() *newsCoverRenderer {
	h.newsCoversOnce.Do(func() {
		if h.newsCovers == nil {
			h.newsCovers = newNewsCoverRenderer(newsCoverCacheEntries, newsCoverRenderSlots, newsCoverMaxWaiting, newsCoverMaxWait)
		}
	})
	return h.newsCovers
}
