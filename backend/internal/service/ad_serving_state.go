package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"hash/maphash"
	"net"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── paid advertising: serving's in-memory state ─────────────────────────────
//
// Counters, rate limits and the visitor salt live in this process only [A1].
// The raw network address is never stored: it is hashed with a salt of 32
// random bytes that is replaced at midnight in Accra and never written down.
// Every table here is bounded, whatever keys a caller makes up.

// adBotPattern matches crawlers, link previewers, headless browsers and
// scripted clients. The first group is the link-preview list the portal's
// nginx routes to the Open Graph shim (frontend/nginx.conf).
var adBotPattern = regexp.MustCompile(`(?i)(facebookexternalhit|twitterbot|linkedinbot|whatsapp|slackbot|telegrambot|discordbot|pinterest|redditbot|embedly|applebot|` +
	`bot|spider|crawl|headless|lighthouse|preview|python-requests|curl|wget|go-http-client|okhttp/[0-2])`)

// isBot reports a visitor whose views and clicks are never billed: no user
// agent, a bot-like one, or a speculative prefetch / prerender.
func (v AdVisitor) isBot() bool {
	ua := strings.TrimSpace(v.UserAgent)
	return ua == "" || v.Prefetch || adBotPattern.MatchString(ua)
}

// IsAdPrefetch reports whether a Sec-Purpose or Purpose header value marks a
// speculative request.
func IsAdPrefetch(values ...string) bool {
	for _, v := range values {
		v = strings.ToLower(v)
		if strings.Contains(v, "prefetch") || strings.Contains(v, "prerender") {
			return true
		}
	}
	return false
}

// ── visitor hash ────────────────────────────────────────────────────────────

const adSaltBytes = 32

// adDailySalt is the in-memory salt of visitor hashes, replaced each Accra day.
type adDailySalt struct {
	mu   sync.Mutex
	day  string
	salt []byte
}

// get returns today's salt, drawing a new one when the day has turned.
func (d *adDailySalt) get(now time.Time) []byte {
	day := adDay(now)
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.day != day || d.salt == nil {
		salt := make([]byte, adSaltBytes)
		_, _ = rand.Read(salt) // crypto/rand.Read never fails (Go 1.24+)
		d.day, d.salt = day, salt
	}
	return d.salt
}

// visitorHash is sha256(dailySalt || clientKey || UA), truncated: it tells
// one visitor from another for today's rate limits and nothing else.
func (s *AdServingService) visitorHash(v AdVisitor, now time.Time) string {
	h := sha256.New()
	h.Write(s.salt.get(now))
	h.Write([]byte(v.ClientKey))
	h.Write([]byte{0})
	h.Write([]byte(v.UserAgent))
	return hex.EncodeToString(h.Sum(nil)[:16])
}

// networkHash is sha256(dailySalt || "net" || network), truncated: the
// visitor's network (adNetwork) with no user agent, so a caller cannot
// become someone new by inventing one. Like visitorHash it lives one day.
func (s *AdServingService) networkHash(v AdVisitor, now time.Time) string {
	h := sha256.New()
	h.Write(s.salt.get(now))
	h.Write([]byte("net"))
	h.Write([]byte{0})
	h.Write([]byte(adNetwork(v.ClientKey)))
	return hex.EncodeToString(h.Sum(nil)[:16])
}

// adIPv6NetworkBits is the IPv6 prefix treated as one network: a subscriber
// (a phone on a mobile network, a home router) is normally given a whole
// /64, so its addresses must not count as different readers.
const adIPv6NetworkBits = 64

// adNetwork is the network a client address belongs to: an IPv4 address as
// is, an IPv6 address widened to its /64. A key that is not an address is
// used unchanged.
func adNetwork(clientKey string) string {
	ip := net.ParseIP(strings.TrimSpace(clientKey))
	if ip == nil {
		return clientKey
	}
	if v4 := ip.To4(); v4 != nil {
		return v4.String()
	}
	mask := net.CIDRMask(adIPv6NetworkBits, 8*net.IPv6len)
	return (&net.IPNet{IP: ip.Mask(mask), Mask: mask}).String()
}

// ── rate limits ─────────────────────────────────────────────────────────────

const (
	// adLimiterBucket is how finely windows are expired: every window that
	// ends within one bucket is dropped in one go once the bucket has passed,
	// so expiring never walks the table.
	adLimiterBucket = time.Minute

	// Table sizes. An entry is a 64-bit key hash and its window (about 43
	// bytes with the map's overhead, measured), so both tables together stay
	// under ~13 MB however many keys a flood invents.
	adVisitorLimiterMax = 100_000
	adNetworkLimiterMax = 200_000
)

// adLimiter is a bounded fixed-window limiter that never writes a response:
// over the limit just means "don't bill" or "don't count".
//
// Keys are hashed to 64 bits with a per-process seed, so an entry costs the
// same whatever the caller sent, and each window is filed under the minute
// it ends in; a minute's windows are dropped together once it has passed.
// At most max windows live at once. A new key arriving at a full table gets
// whenFull and is not stored: false where the keys are networks (the
// billing caps — refusing is the safe answer), true where they include the
// user agent, which a flood can invent faster than windows expire (the
// network caps still hold those callers).
type adLimiter struct {
	mu       sync.Mutex
	seed     maphash.Seed
	max      int
	whenFull bool
	hits     map[uint64]adWindow
	expiry   map[int64][]uint64 // bucket a window ends in → the keys filed there
	swept    int64              // every bucket before this one has been dropped
}

type adWindow struct {
	count   int
	resetAt int64 // unix nanoseconds; the window is open while now <= resetAt
}

func newAdLimiter(maxEntries int, whenFull bool) *adLimiter {
	return &adLimiter{
		seed: maphash.MakeSeed(), max: maxEntries, whenFull: whenFull,
		hits: map[uint64]adWindow{}, expiry: map[int64][]uint64{},
	}
}

// adBucket is the expiry bucket of a window ending at t (unix nanoseconds).
func adBucket(t int64) int64 { return t / int64(adLimiterBucket) }

// allow records a hit for key and reports whether it is within limit per window.
func (l *adLimiter) allow(key string, limit int, per time.Duration, now time.Time) bool {
	k := maphash.String(l.seed, key)
	at := now.UnixNano()
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweepLocked(at)
	w, ok := l.hits[k]
	if ok && at <= w.resetAt {
		if w.count >= limit {
			return false
		}
		w.count++
		l.hits[k] = w
		return true
	}
	if !ok && len(l.hits) >= l.max {
		return l.whenFull
	}
	reset := at + int64(per)
	l.hits[k] = adWindow{count: 1, resetAt: reset}
	b := adBucket(reset)
	l.expiry[b] = append(l.expiry[b], k)
	return true
}

// sweepLocked drops the windows filed in every bucket that has fully passed.
// Each window is filed once, so the work done is proportional to the windows
// that expired, never to the size of the table.
func (l *adLimiter) sweepLocked(now int64) {
	cur := adBucket(now)
	switch {
	case cur < l.swept:
		l.swept = cur // the clock went back; no window ends before now
	case cur-l.swept > int64(len(l.expiry)):
		// After a quiet spell, visit the buckets there are rather than
		// every minute since the last sweep.
		for b, keys := range l.expiry {
			if b < cur {
				l.dropLocked(b, keys)
			}
		}
		l.swept = cur
	default:
		for b := l.swept; b < cur; b++ {
			if keys, ok := l.expiry[b]; ok {
				l.dropLocked(b, keys)
			}
		}
		l.swept = cur
	}
}

// dropLocked deletes the windows of bucket b. A key renewed since it was
// filed here has a later window (filed in its own bucket) and stays.
func (l *adLimiter) dropLocked(b int64, keys []uint64) {
	for _, k := range keys {
		if w, ok := l.hits[k]; ok && adBucket(w.resetAt) == b {
			delete(l.hits, k)
		}
	}
	delete(l.expiry, b)
}

// size is the number of live windows (tests).
func (l *adLimiter) size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.hits)
}

// ── delivery counters ───────────────────────────────────────────────────────

// adDayKey is one campaign's (or placement's) day.
type adDayKey struct{ id, day string }

// adCounters buffers views, clicks and opportunities until the next flush.
// billed counts each campaign's billed views for the life of the process; a
// flush never resets it, so pacing can measure views since a snapshot.
type adCounters struct {
	mu         sync.Mutex
	campaigns  map[adDayKey]*domain.AdCampaignDayDelta
	placements map[adDayKey]int64
	billed     map[string]int64
}

func newAdCounters() *adCounters {
	return &adCounters{campaigns: map[adDayKey]*domain.AdCampaignDayDelta{}, placements: map[adDayKey]int64{}, billed: map[string]int64{}}
}

// campaignRow returns the buffered row of a campaign's day; call with mu held.
func (c *adCounters) campaignRow(id, day string) *domain.AdCampaignDayDelta {
	k := adDayKey{id, day}
	row := c.campaigns[k]
	if row == nil {
		row = &domain.AdCampaignDayDelta{CampaignID: id, Day: day}
		c.campaigns[k] = row
	}
	return row
}

func (c *adCounters) addView(id, day string, billed bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	row := c.campaignRow(id, day)
	if billed {
		row.Views++
		c.billed[id]++
	} else {
		row.Unbilled++
	}
}

func (c *adCounters) addClick(id, day string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.campaignRow(id, day).Clicks++
}

func (c *adCounters) addOpportunity(placement, day string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.placements[adDayKey{placement, day}]++
}

// pendingViews is a campaign's unflushed billable views on day.
func (c *adCounters) pendingViews(id, day string) int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	if row := c.campaigns[adDayKey{id, day}]; row != nil {
		return row.Views
	}
	return 0
}

// billedTotal is a campaign's billed views since the process started.
func (c *adCounters) billedTotal(id string) int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.billed[id]
}

// take empties the buffer and returns what it held.
func (c *adCounters) take() ([]domain.AdCampaignDayDelta, []domain.AdPlacementDayDelta) {
	c.mu.Lock()
	defer c.mu.Unlock()
	campaigns := make([]domain.AdCampaignDayDelta, 0, len(c.campaigns))
	for _, row := range c.campaigns {
		campaigns = append(campaigns, *row)
	}
	placements := make([]domain.AdPlacementDayDelta, 0, len(c.placements))
	for k, n := range c.placements {
		placements = append(placements, domain.AdPlacementDayDelta{Placement: k.id, Day: k.day, Opportunities: n})
	}
	c.campaigns = map[adDayKey]*domain.AdCampaignDayDelta{}
	c.placements = map[adDayKey]int64{}
	return campaigns, placements
}

// restore adds a batch that could not be written back into the buffer.
func (c *adCounters) restore(campaigns []domain.AdCampaignDayDelta, placements []domain.AdPlacementDayDelta) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, d := range campaigns {
		row := c.campaignRow(d.CampaignID, d.Day)
		row.Views += d.Views
		row.Unbilled += d.Unbilled
		row.Clicks += d.Clicks
	}
	for _, d := range placements {
		c.placements[adDayKey{d.Placement, d.Day}] += d.Opportunities
	}
}

// Flush writes the buffered counters (scheduler step 1; also call it on
// shutdown). A failed write puts the batch back for the next pass. Without a
// delivery store the counters are discarded.
func (s *AdServingService) Flush(ctx context.Context) error {
	campaigns, placements := s.counters.take()
	if s.delivery == nil || (len(campaigns) == 0 && len(placements) == 0) {
		return nil
	}
	if err := s.delivery.AddCounts(ctx, campaigns, placements); err != nil {
		s.counters.restore(campaigns, placements)
		return err
	}
	return nil
}
