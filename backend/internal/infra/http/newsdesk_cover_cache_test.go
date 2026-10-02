package http

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/platform/ogcard"
)

// ── branded cover cache (security review: cover.png could exhaust memory) ──

// countingRender stands in for the real renderer and counts draws; when hold
// is set, each draw waits for it to close.
type countingRender struct {
	draws   atomic.Int32
	started chan string
	hold    chan struct{}
}

func (c *countingRender) render(w io.Writer, cover ogcard.NewsCover) error {
	c.draws.Add(1)
	if c.started != nil {
		c.started <- cover.Seed
	}
	if c.hold != nil {
		<-c.hold
	}
	_, err := io.WriteString(w, "png:"+cover.Seed+":"+cover.Title)
	return err
}

func cover(seed, title string) ogcard.NewsCover {
	return ogcard.NewsCover{Seed: seed, Kicker: newsCoverKicker, Title: title, Source: "GNA", Date: "1 Oct 2026"}
}

func TestNewsCoverRendererCachesAndSharesDraws(t *testing.T) {
	r := newNewsCoverRenderer(2, 2, 0, time.Millisecond)
	c := &countingRender{}
	r.render = c.render
	a1, err := r.png(cover("a", "Market reopens"))
	if err != nil {
		t.Fatal(err)
	}
	a2, _ := r.png(cover("a", "Market reopens"))
	if c.draws.Load() != 1 || !bytes.Equal(a1, a2) {
		t.Fatalf("draws = %d, want one (the second request is a cache hit)", c.draws.Load())
	}
	// A new headline is a new cover.
	if b, _ := r.png(cover("a", "Market trades again")); c.draws.Load() != 2 || bytes.Equal(a1, b) {
		t.Fatalf("draws after a headline change = %d", c.draws.Load())
	}
	// Concurrent requests for one cover share a single draw.
	c.hold, c.started = make(chan struct{}), make(chan string, 1)
	var wg sync.WaitGroup
	for range 20 {
		wg.Go(func() {
			if _, err := r.png(cover("b", "Fishing season opens")); err != nil {
				t.Error(err)
			}
		})
	}
	<-c.started
	time.Sleep(20 * time.Millisecond) // let the others pile up behind the draw
	close(c.hold)
	wg.Wait()
	if c.draws.Load() != 3 {
		t.Fatalf("draws after 20 concurrent requests for one cover = %d, want 3", c.draws.Load())
	}
	// The cache holds 2: drawing a third evicts the least recently used.
	c.hold, c.started = nil, nil
	_, _ = r.png(cover("c", "Rain expected"))
	if r.order.Len() != 2 {
		t.Fatalf("cache holds %d covers, want 2", r.order.Len())
	}
	_, _ = r.png(cover("a", "Market reopens")) // evicted earlier: drawn again
	if c.draws.Load() != 5 {
		t.Fatalf("draws = %d, want 5", c.draws.Load())
	}
}

func TestNewsCoverRendererIsBusyWhenEverySlotIsTaken(t *testing.T) {
	r := newNewsCoverRenderer(32, 2, 1, 30*time.Millisecond)
	c := &countingRender{hold: make(chan struct{}), started: make(chan string, 2)}
	r.render = c.render
	var wg sync.WaitGroup
	for _, seed := range []string{"one", "two"} {
		wg.Go(func() { _, _ = r.png(cover(seed, "Headline")) })
	}
	<-c.started
	<-c.started
	start := time.Now()
	if _, err := r.png(cover("three", "Headline")); !errors.Is(err, errNewsCoverBusy) {
		t.Fatalf("third concurrent draw: err = %v, want busy", err)
	}
	if waited := time.Since(start); waited < 30*time.Millisecond || waited > time.Second {
		t.Fatalf("waited %v for a slot, want about the 30 ms allowance", waited)
	}
	close(c.hold)
	wg.Wait()
	if _, err := r.png(cover("three", "Headline")); err != nil || c.draws.Load() != 3 {
		t.Fatalf("after the draws finished: err = %v, draws = %d", err, c.draws.Load())
	}
}

func TestNewsCoverPNGIsServedFromTheCache(t *testing.T) {
	e := newDeskEnv(t)
	c := &countingRender{}
	r := newNewsCoverRenderer(newsCoverCacheEntries, newsCoverRenderSlots, newsCoverMaxWaiting, newsCoverMaxWait)
	r.render = func(w io.Writer, cv ogcard.NewsCover) error {
		c.draws.Add(1)
		return ogcard.RenderNewsCover(w, cv)
	}
	e.h.newsCovers = r
	first := e.do(t, http.MethodGet, "/api/news/"+deskSlug+"/cover.png", "", nil)
	second := e.do(t, http.MethodGet, "/api/news/"+deskSlug+"/cover.png", "", nil)
	if first.Code != http.StatusOK || second.Code != http.StatusOK || !bytes.Equal(first.Body.Bytes(), second.Body.Bytes()) ||
		second.Header().Get("Cache-Control") != newsCoverCache {
		t.Fatalf("covers = %d / %d %v", first.Code, second.Code, second.Header())
	}
	if c.draws.Load() != 1 {
		t.Fatalf("draws = %d, want 1", c.draws.Load())
	}
	a, _ := e.news.BySlug(context.Background(), deskSlug)
	a.Title = "Kotokuraba market trades again"
	e.news.set(*a)
	if w := e.do(t, http.MethodGet, "/api/news/"+deskSlug+"/cover.png", "", nil); w.Code != http.StatusOK || c.draws.Load() != 2 {
		t.Fatalf("after a new headline: %d, draws = %d", w.Code, c.draws.Load())
	}
}

func TestNewsCoverAnswers503WhenTheRendererIsBusy(t *testing.T) {
	e := newDeskEnv(t)
	r := newNewsCoverRenderer(newsCoverCacheEntries, newsCoverRenderSlots, 0, time.Millisecond)
	e.h.newsCovers = r
	if err := r.slots.Acquire(context.Background(), newsCoverRenderSlots); err != nil { // two draws in progress
		t.Fatal(err)
	}
	w := e.do(t, http.MethodGet, "/api/news/"+deskSlug+"/cover.png", "", nil)
	if w.Code != http.StatusServiceUnavailable || w.Header().Get("Retry-After") != newsCoverRetryAfter ||
		w.Header().Get("Cache-Control") != cacheNoStore || decodeMap(t, w)["error"] != codeNewsCoverBusy {
		t.Fatalf("busy = %d %v %s", w.Code, w.Header(), w.Body)
	}
	r.slots.Release(newsCoverRenderSlots)
	if w := e.do(t, http.MethodGet, "/api/news/"+deskSlug+"/cover.png", "", nil); w.Code != http.StatusOK {
		t.Fatalf("after the draws finished = %d", w.Code)
	}
}
