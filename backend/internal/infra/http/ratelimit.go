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
	// X-Forwarded-For can be spoofed by clients. In a single-proxy deployment
	// (nginx / cloud LB) the proxy appends the real client IP as the rightmost
	// entry — clients control only leftmost entries. We walk right-to-left and
	// take the first syntactically valid, non-private IP, falling back to
	// RemoteAddr when absent or when every XFF entry is invalid/private.
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		for i := len(parts) - 1; i >= 0; i-- {
			raw := strings.TrimSpace(parts[i])
			if raw == "" {
				continue
			}
			// net.ParseIP accepts "1.2.3.4" and "::1"; reject hostnames.
			if ip := net.ParseIP(raw); ip != nil && !isPrivateIP(ip) {
				return raw
			}
		}
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// isPrivateIP reports whether an IP is a loopback or RFC-1918/4193 private
// address — these are injected by internal infrastructure, not clients.
func isPrivateIP(ip net.IP) bool {
	private := []string{
		"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
		"fc00::/7", "127.0.0.0/8", "::1/128",
	}
	for _, cidr := range private {
		_, block, err := net.ParseCIDR(cidr)
		if err == nil && block.Contains(ip) {
			return true
		}
	}
	return false
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
