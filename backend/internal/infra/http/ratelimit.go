package http

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// rateLimiter is a small fixed-window in-process limiter for spam control on the
// public write endpoints (spec §8.10). It is per-instance: good enough to blunt
// floods of the moderation queue at launch; a shared store (Redis) is the scale-up
// path when the API runs multi-instance.
type rateLimiter struct {
	mu   sync.Mutex
	hits map[string]*window
}

type window struct {
	count   int
	resetAt time.Time
}

func newRateLimiter() *rateLimiter { return &rateLimiter{hits: map[string]*window{}} }

// allow records a hit for key and reports whether it is within `limit` per `per`.
func (l *rateLimiter) allow(key string, limit int, per time.Duration) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.hits) > 5000 {
		l.pruneLocked(now)
	}
	w := l.hits[key]
	if w == nil || now.After(w.resetAt) {
		l.hits[key] = &window{count: 1, resetAt: now.Add(per)}
		return true
	}
	if w.count >= limit {
		return false
	}
	w.count++
	return true
}

func (l *rateLimiter) pruneLocked(now time.Time) {
	for k, w := range l.hits {
		if now.After(w.resetAt) {
			delete(l.hits, k)
		}
	}
}

// clientKey identifies the caller for rate-limiting: the signed-in member when
// present (most precise), else the client IP.
func clientKey(r *http.Request) string {
	if m := currentMember(r); m != nil {
		return "m:" + m.ID
	}
	return "ip:" + clientIP(r)
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// rateLimited writes a 429 with a friendly message and reports true when the
// caller is over the limit for key. Use at the top of a write handler:
//
//	if h.rateLimited(w, r, "submit:"+clientKey(r), 15, time.Hour) { return }
func (h *Handler) rateLimited(w http.ResponseWriter, r *http.Request, key string, limit int, per time.Duration) bool {
	if h.limiter.allow(key, limit, per) {
		return false
	}
	fail(w, http.StatusTooManyRequests, "You're doing that a bit too often — please wait a little and try again.")
	return true
}
