package http

import (
	"crypto/sha256"
	"encoding/hex"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// msgRateLimited is the 429 body for every throttled request (and for a
// sign-in that is locked after repeated failures, so the two look the same).
const msgRateLimited = "You're doing that a bit too often — please wait a little and try again."

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

// clientKey identifies the caller for rate-limiting ordinary signed-in writes:
// the signed-in member when present, else the client IP. Never use it for
// sign-in, sign-up or code checks — there the caller's own token says nothing
// about who is being targeted; key those on clientIP and the target account.
func clientKey(r *http.Request) string {
	if m := currentMember(r); m != nil {
		return "m:" + m.ID
	}
	return "ip:" + clientIP(r)
}

// limiterSubject turns a caller-supplied value (an email or phone number) into
// a short, fixed-size rate-limit key component, so keys stay small and hold no
// raw identifiers.
func limiterSubject(v string) string {
	sum := sha256.Sum256([]byte(v))
	return hex.EncodeToString(sum[:8])
}

// internalNets are our own platform's addresses — loopback, private
// (RFC 1918/4193) and link-local. A hop from one of these was added by the
// hosting proxies, never chosen by the client.
var internalNets = mustCIDRs(
	"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16",
	"::1/128", "fc00::/7", "fe80::/10",
)

// cloudflareNets are Cloudflare's published edge ranges
// (https://www.cloudflare.com/ips/). Render fronts every service with
// Cloudflare, whose edge appends the address it accepted the connection from.
var cloudflareNets = mustCIDRs(
	"173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
	"141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
	"197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
	"104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
	"2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
	"2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
)

func mustCIDRs(cidrs ...string) []*net.IPNet {
	out := make([]*net.IPNet, 0, len(cidrs))
	for _, c := range cidrs {
		_, block, err := net.ParseCIDR(c)
		if err != nil {
			panic("ratelimit: bad CIDR " + c)
		}
		out = append(out, block)
	}
	return out
}

func inNets(ip net.IP, nets []*net.IPNet) bool {
	for _, n := range nets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// clientNet is the client's network for keying per-account auth limits: the
// client IP, widened to its /64 for IPv6, where one subscriber commonly
// holds a whole /64 and could otherwise rotate addresses for free.
func clientNet(r *http.Request) string {
	addr := clientIP(r)
	ip := net.ParseIP(addr)
	if ip == nil || ip.To4() != nil {
		return addr
	}
	prefix := net.CIDRMask(64, 128)
	return (&net.IPNet{IP: ip.Mask(prefix), Mask: prefix}).String()
}

// clientIP returns the address of the client that reached our edge. Every
// proxy appends the address it accepted the connection from to
// X-Forwarded-For, and the client controls only what it sent itself — the
// entries to the LEFT of the first proxy's. So the chain is read from the
// right, and only as far as trusted proxies vouch for it:
//
//   - a request whose peer is not one of our internal proxies came straight
//     from the client: X-Forwarded-For is its own invention and is ignored;
//   - internal hops (Render's load balancers) are skipped;
//   - the first hop past them is the client — unless it is Cloudflare's edge,
//     in which case the entry Cloudflare appended (one further left) is. We
//     never walk further: an attacker cannot choose their rate-limit key by
//     sending their own X-Forwarded-For.
func clientIP(r *http.Request) string {
	remote := r.RemoteAddr
	if host, _, err := net.SplitHostPort(remote); err == nil {
		remote = host
	}
	if ip := net.ParseIP(remote); ip == nil || !inNets(ip, internalNets) {
		return remote
	}
	hops := forwardedHops(r)
	for i := len(hops) - 1; i >= 0; i-- {
		ip := parseHop(hops[i])
		switch {
		case ip == nil:
			return remote // malformed chain: fall back to the proxy itself
		case inNets(ip, internalNets):
			continue
		case inNets(ip, cloudflareNets) && i > 0:
			if client := parseHop(hops[i-1]); client != nil {
				return client.String()
			}
		}
		return ip.String()
	}
	return remote
}

// forwardedHops returns every X-Forwarded-For entry in order, across all
// header lines (a proxy may add its own line rather than extend the first).
func forwardedHops(r *http.Request) []string {
	var hops []string
	for _, line := range r.Header.Values("X-Forwarded-For") {
		for _, h := range strings.Split(line, ",") {
			if h = strings.TrimSpace(h); h != "" {
				hops = append(hops, h)
			}
		}
	}
	return hops
}

// parseHop parses one X-Forwarded-For entry, tolerating a port ("1.2.3.4:80",
// "[::1]:80").
func parseHop(h string) net.IP {
	if ip := net.ParseIP(h); ip != nil {
		return ip
	}
	if host, _, err := net.SplitHostPort(h); err == nil {
		return net.ParseIP(host)
	}
	return nil
}

// rateLimited writes a 429 with a friendly message and reports true when the
// caller is over the limit for key. Use at the top of a write handler:
//
//	if h.rateLimited(w, r, "submit:"+clientKey(r), 15, time.Hour) { return }
func (h *Handler) rateLimited(w http.ResponseWriter, r *http.Request, key string, limit int, per time.Duration) bool {
	if h.limiter.allow(key, limit, per) {
		return false
	}
	fail(w, http.StatusTooManyRequests, msgRateLimited)
	return true
}
