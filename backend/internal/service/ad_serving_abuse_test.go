package service

import (
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── abuse: one machine inventing user agents (security review) ──────────────
//
// Every serving limit used to key on hash(address + user agent), and the
// caller writes the user agent. From one address the reviewer billed 2,000
// of 2,000 beacons, counted 5,000 opportunities and 3,000 of 3,000 clicks.
// The network caps key on the address alone (an IPv6 /64), and every table
// behind them is bounded.

// rotatingUA is a different, browser-like user agent for each n.
func rotatingUA(n int) string {
	return "Mozilla/5.0 (Linux; Android 14) Chrome/128." + strconv.Itoa(n) + " Mobile Safari/537.36"
}

func fromNetwork(addr string, n int) AdVisitor {
	return AdVisitor{ClientKey: addr, UserAgent: rotatingUA(n)}
}

func TestAdBeaconUserAgentRotationBillsOnlyTheNetworkCap(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	ctx := context.Background()
	beacons := 0
	send := func(addr string, n int) bool {
		beacons++
		return f.serving.RecordView(ctx, f.beacon("ad-1", viewID(beacons)), fromNetwork(addr, n)).Outcome == AdViewBilled
	}
	billed := 0
	for i := range 2000 {
		if send("41.66.1.2", i) {
			billed++
		}
	}
	if billed != adNetworkViewsPerHour {
		t.Fatalf("one address, rotating user agents: billed %d of 2000, want the hourly cap %d", billed, adNetworkViewsPerHour)
	}
	// A beacon past the cap writes nothing: only the billed views stored an id.
	if n := len(f.delivery.ViewIDs); n != billed {
		t.Fatalf("ad_views written = %d, want %d (one per billed view)", n, billed)
	}
	// Hour after hour the day cap takes over: 6 + 6 + 6 + 2 = 20.
	for range 4 {
		f.clock = f.clock.Add(adHourWindow + time.Second)
		for i := range 50 {
			if send("41.66.1.2", 10_000+i) {
				billed++
			}
		}
	}
	if billed != adNetworkViewsPerDay {
		t.Fatalf("one address over a day: billed %d, want the daily cap %d", billed, adNetworkViewsPerDay)
	}
	if d := f.ads.Peek("ad-1").Delivered; d != int64(billed) {
		t.Fatalf("delivered = %d, want %d", d, billed)
	}
	// Another address is another network; the cap is per network.
	if !send("41.66.1.3", 1) {
		t.Fatal("a reader on another address was not billed")
	}
}

func TestAdBeaconIPv6NetworkIsTheSlash64(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	ctx := context.Background()
	billed := 0
	for i := range 40 {
		// Every address in 2001:db8:1:2::/64 is the same subscriber.
		addr := "2001:db8:1:2::" + strconv.FormatInt(int64(i+1), 16)
		if f.serving.RecordView(ctx, f.beacon("ad-1", viewID(i)), fromNetwork(addr, i)).Outcome == AdViewBilled {
			billed++
		}
	}
	if billed != adNetworkViewsPerHour {
		t.Fatalf("addresses of one /64 billed %d, want %d", billed, adNetworkViewsPerHour)
	}
	if r := f.serving.RecordView(ctx, f.beacon("ad-1", viewID(99)), fromNetwork("2001:db8:1:3::1", 99)); r.Outcome != AdViewBilled {
		t.Fatalf("the next /64 = %+v, want billed", r)
	}
}

func TestAdNetwork(t *testing.T) {
	cases := map[string]string{
		"41.66.1.2":                "41.66.1.2",
		"::ffff:41.66.1.2":         "41.66.1.2",
		"2001:db8:1:2:aa:bb:cc:dd": "2001:db8:1:2::/64",
		"2001:db8:1:2::1":          "2001:db8:1:2::/64",
		"not-an-ip":                "not-an-ip",
	}
	for in, want := range cases {
		if got := adNetwork(in); got != want {
			t.Errorf("adNetwork(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestAdOpportunityUserAgentRotationCountsOnlyTheNetworkCap(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	ctx := context.Background()
	for i := range 5000 {
		if _, err := f.serving.Slate(ctx, domain.AdPlacementPortalFeedCard, false, fromNetwork("41.66.1.2", i), ""); err != nil {
			t.Fatal(err)
		}
	}
	f.clock = f.clock.Add(time.Minute + time.Second)
	for i := range 100 {
		_, _ = f.serving.Slate(ctx, domain.AdPlacementPortalFeedCard, false, fromNetwork("41.66.1.2", 5000+i), "")
	}
	if err := f.serving.Flush(ctx); err != nil {
		t.Fatal(err)
	}
	if got := f.delivery.PlacementDay(domain.AdPlacementPortalFeedCard, adServeToday); got != 2*adNetworkOpportunitiesPerMinute {
		t.Fatalf("opportunities from one address over two minutes = %d, want %d", got, 2*adNetworkOpportunitiesPerMinute)
	}
}

func TestAdClickUserAgentRotationCountsOnlyTheNetworkCap(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	exp := f.clock.Add(adTokenTTL).Unix()
	token := f.serving.sign("ad-1", domain.AdPlacementPortalFeedCard, exp)
	counted := 0
	for i := range 3000 {
		landing, ok, err := f.click("ad-1", token, exp, fromNetwork("41.66.1.2", i))
		if err != nil || landing != adLanding {
			t.Fatalf("click %d = %q %v; every click still redirects", i, landing, err)
		}
		if ok {
			counted++
		}
	}
	if counted != adNetworkClicksPerHour {
		t.Fatalf("one address, rotating user agents: counted %d of 3000 clicks, want %d", counted, adNetworkClicksPerHour)
	}
	if c := f.ads.Peek("ad-1").Clicks; c != int64(counted) {
		t.Fatalf("campaign clicks = %d, want %d", c, counted)
	}
	if _, ok, _ := f.click("ad-1", token, exp, fromNetwork("41.66.1.3", 1)); !ok {
		t.Fatal("a click from another address was not counted")
	}
}

// ── the limiter tables stay bounded ─────────────────────────────────────────

func TestAdLimiterStaysBoundedUnderAFloodOfKeys(t *testing.T) {
	const capacity = 1000
	now := adNow
	strict := newAdLimiter(capacity, false)
	lenient := newAdLimiter(capacity, true)
	refused, waved := 0, 0
	for i := range 200_000 {
		key := "click|" + strconv.Itoa(i) + "|ad-1|day"
		if !strict.allow(key, 10, adDayWindow, now) {
			refused++
		}
		if lenient.allow(key, 10, adDayWindow, now) {
			waved++
		}
	}
	if strict.size() != capacity || lenient.size() != capacity {
		t.Fatalf("tables grew to %d and %d entries, want %d", strict.size(), lenient.size(), capacity)
	}
	if refused != 200_000-capacity || waved != 200_000 {
		t.Fatalf("full table: strict refused %d, lenient allowed %d", refused, waved)
	}
	// Keys already in the table keep counting while it is full.
	for range 9 {
		strict.allow("click|0|ad-1|day", 10, adDayWindow, now)
	}
	if strict.allow("click|0|ad-1|day", 10, adDayWindow, now) {
		t.Fatal("a stored key went past its limit while the table was full")
	}
	// Once the windows end, the next call drops them (by bucket, no scan)
	// and new keys are stored again.
	later := now.Add(adDayWindow + adLimiterBucket)
	if !strict.allow("fresh", 1, time.Minute, later) || strict.size() != 1 {
		t.Fatalf("after the windows ended: %d entries, want 1", strict.size())
	}
}

func TestAdLimiterExpiryKeepsRenewedWindows(t *testing.T) {
	l := newAdLimiter(100, false)
	t0 := adNow // on a minute boundary
	if !l.allow("a", 1, time.Minute, t0) {
		t.Fatal("first hit refused")
	}
	if !l.allow("a", 1, time.Minute, t0.Add(61*time.Second)) {
		t.Fatal("a hit after the window ended was refused")
	}
	// Sweeping the bucket the first window ended in must not drop the
	// renewed window, which is still full.
	if l.allow("a", 1, time.Minute, t0.Add(121*time.Second)) {
		t.Fatal("the renewed window was dropped with the old bucket")
	}
	l.allow("b", 1, time.Minute, t0.Add(10*time.Minute))
	if l.size() != 1 {
		t.Fatalf("expired windows left behind: %d entries", l.size())
	}
	// A clock that goes back loses nothing and breaks nothing.
	if !l.allow("c", 1, time.Minute, t0) || l.size() != 2 {
		t.Fatalf("after the clock went back: %d entries", l.size())
	}
	l.allow("d", 1, time.Minute, t0.Add(30*time.Minute))
	if l.size() != 1 {
		t.Fatalf("windows filed before the clock went back were never dropped: %d entries", l.size())
	}
}
