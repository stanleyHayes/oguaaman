package service

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service/adsfake"
)

// ── fixture ─────────────────────────────────────────────────────────────────

const (
	adServeSecret = "test-ads-token-secret-0123456789abcdef"
	adServeAPI    = "https://api.oguaaman.test"
	adServeToday  = "2026-10-02" // adNow's Accra date
	adBrowserUA   = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36"
	adLanding     = "https://kotokuraba.test/market"
)

var adReader = AdVisitor{ClientKey: "41.66.1.2", UserAgent: adBrowserUA}

type serveFix struct {
	*adFix
	serving  *AdServingService
	delivery *adsfake.Delivery
}

// newServeFix builds serving over the ads fixture (ads and political ads on).
// Elections must be added through withElections before the first slate.
func newServeFix(t *testing.T, mutate ...func(*domain.AdSettings)) *serveFix {
	t.Helper()
	f := &serveFix{adFix: newAdFix(t, mutate...), delivery: adsfake.NewDelivery()}
	f.serving = f.newServing(adServeSecret)
	return f
}

func (f *serveFix) newServing(secret string) *AdServingService {
	s := NewAdServingService(AdServingDeps{
		Campaigns: f.ads, Sponsors: f.sponsors, Delivery: f.delivery, Settings: f.settings,
		Elections: NewElectionsService(f.elections, f.settings, nil), TokenSecret: secret, APIURL: adServeAPI + "/",
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	s.now = func() time.Time { return f.clock }
	return s
}

// activeAd stores a paid, running feed-card campaign: 10,000 impressions
// from 1 to 10 October (9 days left on the 2nd, counting the 2nd).
func (f *serveFix) activeAd(id string, mutate ...func(*domain.AdCampaign)) domain.AdCampaign {
	c := domain.AdCampaign{
		ID: id, MemberID: adMember, SponsorID: adSponsorID, SponsorLine: "Sponsored · Kotokuraba Traders",
		Category: AdCategoryRetail, Placement: domain.AdPlacementPortalFeedCard,
		Creative: domain.AdCreative{
			Format: domain.AdFormatCard, ImageURL: adImg, Headline: "Market days at Kotokuraba", Body: "Fresh fish every Saturday.",
			Alt: "Stalls at Kotokuraba market", LandingURL: adLanding,
		},
		StartDate: "2026-10-01", EndDate: "2026-10-10", BookedImpressions: 10_000,
		Price:  PriceAd(10_000, 5000, 0, 1),
		Status: domain.AdStatusActive, PaymentStatus: domain.AdPaymentSuccess, PaidAt: "2026-09-30T10:00:00Z",
		StatusHistory: []domain.AdStatusChange{
			{From: domain.AdStatusPendingReview, To: domain.AdStatusApproved, At: "2026-09-29T10:00:00Z", ActorName: "Nana Essien"},
			{From: domain.AdStatusApproved, To: domain.AdStatusActive, At: "2026-09-30T10:00:00Z", ActorName: domain.AdActorSystem},
		},
	}
	for _, m := range mutate {
		m(&c)
	}
	f.ads.Put(c)
	return c
}

func political(c *domain.AdCampaign) {
	c.Political, c.PoliticalType, c.SponsorLine, c.ElectionName = true, domain.AdPoliticalElection, "Paid for by Ama Mensah", "Cape Coast North by-election"
}

func (f *serveFix) slate(placement string, noPolitical bool) *AdSlate {
	f.t.Helper()
	s, err := f.serving.Slate(context.Background(), placement, noPolitical, adReader, "http://ignored.test")
	if err != nil {
		f.t.Fatalf("slate: %v", err)
	}
	return s
}

func slateIDs(s *AdSlate) []string {
	out := []string{}
	for _, a := range s.Ads {
		out = append(out, a.ID)
	}
	return out
}

// beacon builds a well-formed beacon for a campaign on a fresh slate.
func (f *serveFix) beacon(id, viewID string) AdBeacon {
	exp := f.clock.Add(adTokenTTL).Unix()
	return AdBeacon{C: id, P: domain.AdPlacementPortalFeedCard, V: viewID, T: f.serving.sign(id, domain.AdPlacementPortalFeedCard, exp), E: exp}
}

func viewID(n int) string {
	return "0b4c3a52-5f0e-4d1a-9a4b-" + strings.Repeat("0", 12-len(strconv.Itoa(n))) + strconv.Itoa(n)
}

// ── slate ───────────────────────────────────────────────────────────────────

func TestAdSlateShapeTokenAndClickURL(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	s := f.slate(domain.AdPlacementPortalFeedCard, false)
	if s.Placement != domain.AdPlacementPortalFeedCard || s.Why != "Oguaa news and events pages" || len(s.Ads) != 1 {
		t.Fatalf("slate = %+v", s)
	}
	a := s.Ads[0]
	if a.Chip != AdChipCommercial || a.SponsorLine != "Sponsored · Kotokuraba Traders" || a.Format != domain.AdFormatCard ||
		a.Alt == "" || a.Political || a.SyntheticMedia {
		t.Fatalf("item = %+v", a)
	}
	if a.Exp != adNow.Add(15*time.Minute).Unix() {
		t.Errorf("exp = %d", a.Exp)
	}
	if !f.serving.tokenValid("ad-1", domain.AdPlacementPortalFeedCard, a.Token, a.Exp) {
		t.Error("token does not verify")
	}
	if f.serving.tokenValid("ad-1", domain.AdPlacementPortalHomeBanner, a.Token, a.Exp) || f.serving.tokenValid("ad-2", domain.AdPlacementPortalFeedCard, a.Token, a.Exp) ||
		f.serving.tokenValid("ad-1", domain.AdPlacementPortalFeedCard, a.Token, a.Exp+1) {
		t.Error("token verifies for another campaign, placement or expiry")
	}
	u, err := url.Parse(a.ClickURL)
	if err != nil || u.Scheme+"://"+u.Host != adServeAPI || u.Path != "/api/ads/c/ad-1" ||
		u.Query().Get("p") != domain.AdPlacementPortalFeedCard || u.Query().Get("t") != a.Token || u.Query().Get("e") != strconv.FormatInt(a.Exp, 10) {
		t.Fatalf("click url = %s", a.ClickURL)
	}
	// 10,000 over 9 days → 1,112 today, none delivered yet.
	if a.Weight != 1112 {
		t.Errorf("weight = %d, want 1112", a.Weight)
	}
}

func TestAdSlateUnknownPlacement(t *testing.T) {
	f := newServeFix(t)
	if _, err := f.serving.Slate(context.Background(), "sidebar", false, adReader, ""); adCode(err) != AdErrInvalidPlacement {
		t.Fatalf("err = %v", err)
	}
}

func TestAdSlateKillSwitches(t *testing.T) {
	cases := []struct {
		name      string
		mutate    func(*domain.AdSettings)
		placement string
		secret    string
		want      int
	}{
		{"ads on", nil, domain.AdPlacementPortalFeedCard, adServeSecret, 1},
		{"ads off", func(s *domain.AdSettings) { s.AdsEnabled = false }, domain.AdPlacementPortalFeedCard, adServeSecret, 0},
		{"placement inactive", func(s *domain.AdSettings) { s.Placements[1].Active = false }, domain.AdPlacementPortalFeedCard, adServeSecret, 0},
		{"no token secret", nil, domain.AdPlacementPortalFeedCard, "", 0},
		{"app card, delivery off", func(s *domain.AdSettings) { s.Placements[4].Active = true }, domain.AdPlacementAppCard, adServeSecret, 0},
		{"app card, delivery on", func(s *domain.AdSettings) { s.Placements[4].Active, s.AppDeliveryEnabled = true, true }, domain.AdPlacementAppCard, adServeSecret, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var mutate []func(*domain.AdSettings)
			if tc.mutate != nil {
				mutate = append(mutate, tc.mutate)
			}
			f := newServeFix(t, mutate...)
			f.serving = f.newServing(tc.secret)
			f.activeAd("ad-1", func(c *domain.AdCampaign) { c.Placement = tc.placement })
			if got := f.slate(tc.placement, false); len(got.Ads) != tc.want || got.Ads == nil {
				t.Fatalf("ads = %v, want %d", slateIDs(got), tc.want)
			}
		})
	}
}

func TestAdSlatePoliticalExclusions(t *testing.T) {
	t.Run("served when allowed", func(t *testing.T) {
		f := newServeFix(t)
		f.activeAd("ad-pol", political)
		got := f.slate(domain.AdPlacementPortalFeedCard, false)
		if len(got.Ads) != 1 || got.Ads[0].Chip != AdChipPolitical || got.Ads[0].SponsorLine != "Paid for by Ama Mensah" ||
			got.Ads[0].ElectionName == "" || !got.Ads[0].Political {
			t.Fatalf("political slate = %+v", got.Ads)
		}
	})
	t.Run("political switch off", func(t *testing.T) {
		f := newServeFix(t, func(s *domain.AdSettings) { s.PoliticalEnabled = false })
		f.activeAd("ad-pol", political)
		f.activeAd("ad-com")
		if ids := slateIDs(f.slate(domain.AdPlacementPortalFeedCard, false)); len(ids) != 1 || ids[0] != "ad-com" {
			t.Fatalf("ids = %v", ids)
		}
	})
	t.Run("page asks for none", func(t *testing.T) {
		f := newServeFix(t)
		f.activeAd("ad-pol", political)
		f.activeAd("ad-com")
		if ids := slateIDs(f.slate(domain.AdPlacementPortalFeedCard, true)); len(ids) != 1 || ids[0] != "ad-com" {
			t.Fatalf("ids = %v", ids)
		}
	})
	t.Run("election blackout", func(t *testing.T) {
		f := newServeFix(t)
		f.addElection("el-1", domain.ElectionParliamentaryBy, "2026-10-03") // blackout 2 Oct 00:00 → 5 Oct 00:00
		f.serving = f.newServing(adServeSecret)
		f.activeAd("ad-pol", political)
		f.activeAd("ad-com")
		if ids := slateIDs(f.slate(domain.AdPlacementPortalFeedCard, false)); len(ids) != 1 || ids[0] != "ad-com" {
			t.Fatalf("ids = %v", ids)
		}
	})
	t.Run("no election calendar", func(t *testing.T) {
		f := newServeFix(t)
		f.serving.elections = nil
		f.activeAd("ad-pol", political)
		if ids := slateIDs(f.slate(domain.AdPlacementPortalFeedCard, false)); len(ids) != 0 {
			t.Fatalf("ids = %v", ids)
		}
	})
}

func TestAdSlateDropsLapsedFDAApproval(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-lapsed", func(c *domain.AdCampaign) { c.Compliance.FDAApprovalExpiresOn = "2026-10-01" })
	f.activeAd("ad-today", func(c *domain.AdCampaign) { c.Compliance.FDAApprovalExpiresOn = adServeToday })
	if ids := slateIDs(f.slate(domain.AdPlacementPortalFeedCard, false)); len(ids) != 1 || ids[0] != "ad-today" {
		t.Fatalf("ids = %v", ids)
	}
}

func TestAdPaceWeight(t *testing.T) {
	base := domain.AdCampaign{BookedImpressions: 1000, EndDate: "2026-10-11"} // 10 days left on the 2nd
	cases := []struct {
		name       string
		delivered  int64
		todayViews int64
		want       int64
	}{
		{"behind: nothing yet today", 0, 0, 100},
		{"part way through today", 40, 40, 60},
		{"on target", 100, 100, 0},
		{"over target", 150, 150, 0},
		{"catching up after a slow week", 0, 0, 100},
		{"fully delivered", 1000, 0, 0},
	}
	for _, tc := range cases {
		c := base
		c.Delivered = tc.delivered
		if got := paceWeight(c, adServeToday, tc.todayViews); got != tc.want {
			t.Errorf("%s: weight = %d, want %d", tc.name, got, tc.want)
		}
	}
	behind := base
	behind.Delivered, behind.EndDate = 500, "2026-10-02" // last day, 500 still owed
	if got := paceWeight(behind, adServeToday, 0); got != 500 {
		t.Errorf("last day weight = %d, want 500", got)
	}
	behind.Delivered = 700 // 200 of them today: 300 left, all due today
	if got := paceWeight(behind, adServeToday, 200); got != 300 {
		t.Errorf("last day after 200 today = %d, want 300", got)
	}
	if got := paceWeight(domain.AdCampaign{BookedImpressions: 10, EndDate: "2026-10-01"}, adServeToday, 0); got != 0 {
		t.Errorf("ended campaign weight = %d", got)
	}
}

func TestAdSlatePacingUsesTodaysViewsAndOrdersByWeight(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-a")                                                                                // 1,112 due today
	f.activeAd("ad-b", func(c *domain.AdCampaign) { c.BookedImpressions = 3000 })                     // 334 due today
	f.activeAd("ad-done", func(c *domain.AdCampaign) { c.BookedImpressions, c.Delivered = 900, 100 }) // 100 due, all delivered today
	_ = f.delivery.AddCounts(context.Background(), []domain.AdCampaignDayDelta{{CampaignID: "ad-done", Day: adServeToday, Views: 100}}, nil)
	s := f.slate(domain.AdPlacementPortalFeedCard, false)
	if ids := slateIDs(s); len(ids) != 2 || ids[0] != "ad-a" || ids[1] != "ad-b" {
		t.Fatalf("ids = %v", ids)
	}
	if s.Ads[1].Weight != 334 {
		t.Errorf("ad-b weight = %d", s.Ads[1].Weight)
	}
}

func TestAdSlateCachesEligibilityButNotPacing(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1", func(c *domain.AdCampaign) { c.BookedImpressions, c.EndDate = 3, adServeToday })
	f.slate(domain.AdPlacementPortalFeedCard, false)
	f.slate(domain.AdPlacementPortalFeedCard, false)
	if f.delivery.ViewsOnCalls != 1 {
		t.Fatalf("ViewsOn calls = %d, want 1 (cached)", f.delivery.ViewsOnCalls)
	}
	// Unflushed views count at once: two of three delivered today leaves one.
	for i := range 2 {
		if r := f.serving.RecordView(context.Background(), f.beacon("ad-1", viewID(i)), AdVisitor{ClientKey: "ip-" + strconv.Itoa(i), UserAgent: adBrowserUA}); r.Outcome != AdViewBilled {
			t.Fatalf("view %d = %+v", i, r)
		}
	}
	if s := f.slate(domain.AdPlacementPortalFeedCard, false); len(s.Ads) != 1 || s.Ads[0].Weight != 1 {
		t.Fatalf("after two views = %+v", s.Ads)
	}
	f.clock = f.clock.Add(31 * time.Second)
	f.slate(domain.AdPlacementPortalFeedCard, false)
	if f.delivery.ViewsOnCalls != 2 {
		t.Fatalf("ViewsOn calls after expiry = %d, want 2", f.delivery.ViewsOnCalls)
	}
}

func TestAdSlateKeepsTheTenFurthestBehind(t *testing.T) {
	f := newServeFix(t)
	for i := range 12 {
		f.activeAd("ad-"+strconv.Itoa(10+i), func(c *domain.AdCampaign) { c.BookedImpressions = int64(1000 * (i + 1)) })
	}
	s := f.slate(domain.AdPlacementPortalFeedCard, false)
	if len(s.Ads) != adSlateMaxAds || s.Ads[0].ID != "ad-21" || s.Ads[9].ID != "ad-12" {
		t.Fatalf("ids = %v", slateIDs(s))
	}
}

func TestAdSlateDegradesToNoAdsOnStoreErrors(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	f.delivery.FailViews = errors.New("mongo down")
	if s := f.slate(domain.AdPlacementPortalFeedCard, false); len(s.Ads) != 1 || s.Ads[0].Weight != 1112 {
		t.Fatalf("views unreadable: pacing should start from zero, got %+v", s.Ads)
	}
}

func TestAdSlateCountsOpportunities(t *testing.T) {
	f := newServeFix(t, func(s *domain.AdSettings) { s.AdsEnabled = false })
	ctx := context.Background()
	for range 3 {
		_, _ = f.serving.Slate(ctx, domain.AdPlacementPortalHomeBanner, false, adReader, "")
	}
	_, _ = f.serving.Slate(ctx, domain.AdPlacementPortalHomeBanner, false, AdVisitor{ClientKey: "1.2.3.4", UserAgent: "Googlebot/2.1"}, "")
	_, _ = f.serving.Slate(ctx, domain.AdPlacementPortalHomeBanner, false, AdVisitor{ClientKey: "1.2.3.4", UserAgent: adBrowserUA, Prefetch: true}, "")
	for range adOpportunitiesPerMinute + 5 {
		_, _ = f.serving.Slate(ctx, domain.AdPlacementPortalHomeBanner, false, AdVisitor{ClientKey: "9.9.9.9", UserAgent: adBrowserUA}, "")
	}
	if err := f.serving.Flush(ctx); err != nil {
		t.Fatal(err)
	}
	// 3 from the reader, none from bots or prefetches, 30 (the cap) from the flood.
	if got := f.delivery.PlacementDay(domain.AdPlacementPortalHomeBanner, adServeToday); got != 3+adOpportunitiesPerMinute {
		t.Fatalf("opportunities = %d", got)
	}
}

// ── beacons ─────────────────────────────────────────────────────────────────

func TestAdBeaconOutcomes(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	f.activeAd("ad-full", func(c *domain.AdCampaign) { c.BookedImpressions, c.Delivered = 5, 5 })
	ctx := context.Background()
	good := f.beacon("ad-1", viewID(1))

	expired := f.beacon("ad-1", viewID(2))
	expired.E = f.clock.Add(-time.Second).Unix()
	expired.T = f.serving.sign("ad-1", expired.P, expired.E)
	forged := f.beacon("ad-1", viewID(3))
	forged.C = "ad-full"
	badID := f.beacon("ad-1", "short")
	wrongPlacement := f.beacon("ad-1", viewID(4))
	wrongPlacement.P = domain.AdPlacementPortalHomeBanner

	cases := []struct {
		name    string
		b       AdBeacon
		v       AdVisitor
		outcome string
		reason  string
	}{
		{"billed", good, adReader, AdViewBilled, ""},
		{"duplicate view id", good, AdVisitor{ClientKey: "41.66.9.9", UserAgent: adBrowserUA}, AdViewUnbilled, adWhyDuplicate},
		{"bot", f.beacon("ad-1", viewID(5)), AdVisitor{ClientKey: "66.249.1.1", UserAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)"}, AdViewUnbilled, adWhyBot},
		{"empty user agent", f.beacon("ad-1", viewID(6)), AdVisitor{ClientKey: "1.1.1.1"}, AdViewUnbilled, adWhyBot},
		{"headless", f.beacon("ad-1", viewID(7)), AdVisitor{ClientKey: "1.1.1.2", UserAgent: "Mozilla/5.0 HeadlessChrome/128"}, AdViewUnbilled, adWhyBot},
		{"old okhttp", f.beacon("ad-1", viewID(8)), AdVisitor{ClientKey: "1.1.1.3", UserAgent: "okhttp/2.7.5"}, AdViewUnbilled, adWhyBot},
		{"prefetch", f.beacon("ad-1", viewID(9)), AdVisitor{ClientKey: "1.1.1.4", UserAgent: adBrowserUA, Prefetch: true}, AdViewUnbilled, adWhyBot},
		{"fully delivered", f.beacon("ad-full", viewID(10)), AdVisitor{ClientKey: "1.1.1.5", UserAgent: adBrowserUA}, AdViewUnbilled, adWhyNotBillable},
		{"expired token", expired, adReader, AdViewIgnored, adWhyExpired},
		{"forged token", forged, adReader, AdViewIgnored, adWhyBadToken},
		{"token for another placement", wrongPlacement, adReader, AdViewIgnored, adWhyBadToken},
		{"malformed view id", badID, adReader, AdViewIgnored, adWhyMalformed},
	}
	for _, tc := range cases {
		if got := f.serving.RecordView(ctx, tc.b, tc.v); got.Outcome != tc.outcome || got.Reason != tc.reason {
			t.Errorf("%s: got %+v, want %s/%s", tc.name, got, tc.outcome, tc.reason)
		}
	}
	if d := f.ads.Peek("ad-1").Delivered; d != 1 {
		t.Errorf("ad-1 delivered = %d, want 1", d)
	}
	if err := f.serving.Flush(ctx); err != nil {
		t.Fatal(err)
	}
	if row := f.delivery.CampaignDay("ad-1", adServeToday); row.Views != 1 || row.Unbilled != 6 {
		t.Errorf("ad-1 day = %+v, want 1 billed, 6 unbilled", row)
	}
	if row := f.delivery.CampaignDay("ad-full", adServeToday); row.Views != 0 || row.Unbilled != 1 {
		t.Errorf("ad-full day = %+v", row)
	}
}

func TestAdBeaconRateLimits(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	f.activeAd("ad-2")
	ctx := context.Background()
	for i := range adBillableViewsPerVisitorCampaign {
		if r := f.serving.RecordView(ctx, f.beacon("ad-1", viewID(i)), adReader); r.Outcome != AdViewBilled {
			t.Fatalf("view %d = %+v", i, r)
		}
	}
	if r := f.serving.RecordView(ctx, f.beacon("ad-1", viewID(50)), adReader); r.Reason != adWhyRateLimited {
		t.Fatalf("4th view in 5 min = %+v", r)
	}
	if r := f.serving.RecordView(ctx, f.beacon("ad-2", viewID(51)), adReader); r.Outcome != AdViewBilled {
		t.Fatalf("another campaign = %+v", r)
	}
	f.clock = f.clock.Add(adBillableViewsWindow + time.Second)
	if r := f.serving.RecordView(ctx, f.beacon("ad-1", viewID(52)), adReader); r.Outcome != AdViewBilled {
		t.Fatalf("after the window = %+v", r)
	}
	// 60 beacons a minute in all, whatever the campaign.
	flood := AdVisitor{ClientKey: "10.0.0.9", UserAgent: adBrowserUA}
	limited := 0
	for i := range adBeaconsPerVisitor + 10 {
		r := f.serving.RecordView(ctx, AdBeacon{C: "ad-x", P: domain.AdPlacementPortalFeedCard, V: viewID(100 + i),
			T: f.serving.sign("ad-x", domain.AdPlacementPortalFeedCard, f.clock.Add(time.Minute).Unix()), E: f.clock.Add(time.Minute).Unix()}, flood)
		if r.Reason == adWhyRateLimited {
			limited++
		}
	}
	if limited < 10 {
		t.Fatalf("beacon flood limited %d times", limited)
	}
}

func TestAdBeaconNotBilledWhileAdsAreOff(t *testing.T) {
	f := newServeFix(t, func(s *domain.AdSettings) { s.AdsEnabled = false })
	f.activeAd("ad-1")
	if r := f.serving.RecordView(context.Background(), f.beacon("ad-1", viewID(1)), adReader); r.Reason != adWhyAdsDisabled {
		t.Fatalf("got %+v", r)
	}
	if f.ads.Peek("ad-1").Delivered != 0 {
		t.Fatal("billed while ads are off")
	}
}

func TestAdVisitorHashRotatesDaily(t *testing.T) {
	f := newServeFix(t)
	a := f.serving.visitorHash(adReader, adNow)
	if f.serving.visitorHash(adReader, adNow.Add(time.Hour)) != a {
		t.Fatal("hash changed within the day")
	}
	if f.serving.visitorHash(AdVisitor{ClientKey: "41.66.1.3", UserAgent: adBrowserUA}, adNow) == a {
		t.Fatal("two addresses share a hash")
	}
	if f.serving.visitorHash(adReader, adNow.Add(24*time.Hour)) == a {
		t.Fatal("hash survived midnight")
	}
	if strings.Contains(a, "41.66") {
		t.Fatal("hash leaks the address")
	}
}

// ── clicks ──────────────────────────────────────────────────────────────────

func (f *serveFix) click(id, token string, exp int64, v AdVisitor) (string, bool, error) {
	return f.serving.Click(context.Background(), AdClick{CampaignID: id, Placement: domain.AdPlacementPortalFeedCard, Token: token, Exp: exp}, v)
}

func TestAdClickRedirectsAndCounts(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	exp := f.clock.Add(adTokenTTL).Unix()
	token := f.serving.sign("ad-1", domain.AdPlacementPortalFeedCard, exp)

	landing, counted, err := f.click("ad-1", token, exp, adReader)
	if err != nil || landing != adLanding || !counted {
		t.Fatalf("good click = %q %v %v", landing, counted, err)
	}
	if _, counted, _ = f.click("ad-1", token, exp, adReader); counted {
		t.Error("second click within a minute counted")
	}
	landing, counted, _ = f.click("ad-1", "forged", exp, AdVisitor{ClientKey: "5.5.5.5", UserAgent: adBrowserUA})
	if landing != adLanding || counted {
		t.Errorf("bad token: %q counted=%v; want the stored URL, uncounted", landing, counted)
	}
	if _, counted, _ = f.click("ad-1", token, exp, AdVisitor{ClientKey: "5.5.5.6", UserAgent: "curl/8.4"}); counted {
		t.Error("bot click counted")
	}
	f.clock = time.Unix(exp, 0).Add(29 * time.Minute)
	if _, counted, _ = f.click("ad-1", token, exp, AdVisitor{ClientKey: "5.5.5.7", UserAgent: adBrowserUA}); !counted {
		t.Error("click within 30 minutes of expiry not counted")
	}
	f.clock = time.Unix(exp, 0).Add(31 * time.Minute)
	if _, counted, _ = f.click("ad-1", token, exp, AdVisitor{ClientKey: "5.5.5.8", UserAgent: adBrowserUA}); counted {
		t.Error("stale click counted")
	}
	if c := f.ads.Peek("ad-1").Clicks; c != 2 {
		t.Errorf("clicks = %d, want 2", c)
	}
	f.clock = adNow
	_ = f.serving.Flush(context.Background())
	if row := f.delivery.CampaignDay("ad-1", adServeToday); row.Clicks != 2 {
		t.Errorf("day clicks = %d", row.Clicks)
	}
}

func TestAdClickDailyLimit(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	counted := 0
	// One click every 21 minutes stays under the per-network cap of 3 an
	// hour, so only the daily limits (10) stop the 11th and later.
	for range 15 {
		exp := f.clock.Add(adTokenTTL).Unix()
		if _, ok, _ := f.click("ad-1", f.serving.sign("ad-1", domain.AdPlacementPortalFeedCard, exp), exp, adReader); ok {
			counted++
		}
		f.clock = f.clock.Add(21 * time.Minute)
	}
	if counted != adClicksPerDay {
		t.Fatalf("counted %d clicks, want %d", counted, adClicksPerDay)
	}
}

func TestAdClickRefusesUnknownAndUnreviewedCampaigns(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-pending", func(c *domain.AdCampaign) { c.Status, c.StatusHistory = domain.AdStatusPendingReview, nil })
	f.activeAd("ad-cancelled-early", func(c *domain.AdCampaign) {
		c.Status = domain.AdStatusCancelled
		c.StatusHistory = []domain.AdStatusChange{{From: domain.AdStatusPendingReview, To: domain.AdStatusCancelled}}
	})
	f.activeAd("ad-removed", func(c *domain.AdCampaign) { c.Status = domain.AdStatusRemoved })
	f.activeAd("ad-completed", func(c *domain.AdCampaign) { c.Status = domain.AdStatusCompleted })
	for _, id := range []string{"ad-missing", "ad-pending", "ad-cancelled-early", "ad-removed"} {
		if _, _, err := f.click(id, "", 0, adReader); !errors.Is(err, ErrAdNotFound) {
			t.Errorf("%s: err = %v, want not found", id, err)
		}
	}
	if landing, counted, err := f.click("ad-completed", "", 0, adReader); err != nil || landing != adLanding || counted {
		t.Errorf("completed ad: %q %v %v", landing, counted, err)
	}
}

// ── flush ───────────────────────────────────────────────────────────────────

func TestAdFlushKeepsCountersWhenTheWriteFails(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	ctx := context.Background()
	f.serving.RecordView(ctx, f.beacon("ad-1", viewID(1)), adReader)
	f.delivery.FailAdd = errors.New("mongo down")
	if err := f.serving.Flush(ctx); err == nil {
		t.Fatal("flush error swallowed")
	}
	if f.serving.counters.pendingViews("ad-1", adServeToday) != 1 {
		t.Fatal("counters lost on a failed flush")
	}
	f.delivery.FailAdd = nil
	if err := f.serving.Flush(ctx); err != nil {
		t.Fatal(err)
	}
	if row := f.delivery.CampaignDay("ad-1", adServeToday); row.Views != 1 {
		t.Fatalf("views = %d", row.Views)
	}
	if f.serving.counters.pendingViews("ad-1", adServeToday) != 0 {
		t.Fatal("counters not cleared after a flush")
	}
	// The ads scheduler's step 1 runs the flush.
	f.serving.RecordView(ctx, f.beacon("ad-1", viewID(2)), AdVisitor{ClientKey: "2.2.2.2", UserAgent: adBrowserUA})
	f.svc.SetDeliveryFlush(f.serving.Flush)
	f.svc.RunScheduler(ctx)
	if row := f.delivery.CampaignDay("ad-1", adServeToday); row.Views != 2 {
		t.Fatalf("scheduler flush: views = %d", row.Views)
	}
}

func TestIsAdPrefetch(t *testing.T) {
	if !IsAdPrefetch("prefetch;anonymous-client-ip") || !IsAdPrefetch("", "Prerender") || IsAdPrefetch("", "") {
		t.Fatal("prefetch detection")
	}
}
