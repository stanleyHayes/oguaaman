package http

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
	"github.com/oguaa/backend/internal/service/adsfake"
)

const (
	adServeLanding = "https://kotokuraba.test/market"
	adServeUA      = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
)

type adServeHTTP struct {
	mux      *http.ServeMux
	ads      *adsfake.Ads
	delivery *adsfake.Delivery
	serving  *service.AdServingService
}

// newAdServeHTTP wires serving with ads on and one running feed-card ad.
func newAdServeHTTP(t *testing.T) *adServeHTTP {
	t.Helper()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	settings := service.NewSettingsService(&adSettingsStore{docs: map[string][]byte{}}, log)
	set := service.DefaultAdSettings()
	set.AdsEnabled = true
	if err := settings.Save(context.Background(), service.SettingsChange{Key: domain.SettingsKeyAds, Doc: &set, ActorName: "Steward", Reason: "turn ads on"}); err != nil {
		t.Fatal(err)
	}
	f := &adServeHTTP{ads: adsfake.NewAds(), delivery: adsfake.NewDelivery()}
	sponsors := adsfake.NewSponsors()
	_ = sponsors.Insert(context.Background(), domain.AdSponsor{ID: "asp-1", Kind: domain.AdSponsorCommercial, DisplayName: "Kotokuraba Traders",
		LegalName: "Kotokuraba Traders Ltd", Status: domain.AdSponsorVerified})
	now := time.Now().UTC()
	f.ads.Put(domain.AdCampaign{
		ID: "ad-1", SponsorID: "asp-1", SponsorLine: "Sponsored · Kotokuraba Traders", Placement: domain.AdPlacementPortalFeedCard,
		Creative: domain.AdCreative{Format: domain.AdFormatCard, ImageURL: "https://res.cloudinary.com/demo/image/upload/v1/ad.jpg",
			Headline: "Market days", Alt: "Stalls at Kotokuraba market", LandingURL: adServeLanding},
		StartDate: now.AddDate(0, 0, -1).Format(time.DateOnly), EndDate: now.AddDate(0, 0, 9).Format(time.DateOnly),
		BookedImpressions: 5000, Price: service.PriceAd(5000, 5000, 0, 1), Status: domain.AdStatusActive,
		PaymentStatus: domain.AdPaymentSuccess, PaidAt: now.Add(-time.Hour).Format(time.RFC3339),
		StatusHistory: []domain.AdStatusChange{{From: domain.AdStatusPendingReview, To: domain.AdStatusApproved}},
	})
	f.serving = service.NewAdServingService(service.AdServingDeps{
		Campaigns: f.ads, Sponsors: sponsors, Delivery: f.delivery, Settings: settings, TokenSecret: "http-test-secret-0123456789abcdefghij",
		APIURL: "https://api.oguaaman.test", Log: log,
	})
	h := NewHandler(HandlerDeps{AuthRequired: true, Log: log}).WithAdServing(AdServingDeps{
		Serving: f.serving, Library: service.NewAdLibraryService(f.ads, sponsors, log), Report: service.NewAdReportService(f.ads, f.delivery, log),
	})
	f.mux = http.NewServeMux()
	h.RegisterAdServingRoutes(f.mux)
	return f
}

func (f *adServeHTTP) do(req *http.Request) *httptest.ResponseRecorder {
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", adServeUA)
	}
	w := httptest.NewRecorder()
	f.mux.ServeHTTP(w, req)
	return w
}

func (f *adServeHTTP) slate(t *testing.T, mutate func(*http.Request)) (service.AdSlate, *httptest.ResponseRecorder) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/ads/slate?placement=portal-feed-card&section=news&political=0&surface=portal", nil)
	if mutate != nil {
		mutate(req)
	}
	w := f.do(req)
	var s service.AdSlate
	if w.Code == http.StatusOK {
		if err := json.Unmarshal(w.Body.Bytes(), &s); err != nil {
			t.Fatal(err)
		}
	}
	return s, w
}

func TestAdSlateRoute(t *testing.T) {
	f := newAdServeHTTP(t)
	s, w := f.slate(t, nil)
	if w.Code != http.StatusOK || w.Header().Get("Cache-Control") != "no-store" || len(s.Ads) != 1 || s.Why == "" {
		t.Fatalf("slate = %d %q %s", w.Code, w.Header().Get("Cache-Control"), w.Body)
	}
	for _, key := range []string{`"clickUrl":"https://api.oguaaman.test/api/ads/c/ad-1?`, `"chip":"Ad"`, `"imageUrlDesktop":""`, `"weight":`, `"exp":`} {
		if !strings.Contains(w.Body.String(), key) {
			t.Errorf("slate lacks %s: %s", key, w.Body)
		}
	}
	if strings.Contains(w.Body.String(), adServeLanding) {
		t.Error("the slate exposes the landing URL; clicks must go through the counting redirect")
	}
	req := httptest.NewRequest(http.MethodGet, "/api/ads/slate?placement=sidebar", nil)
	if w := f.do(req); w.Code != http.StatusBadRequest || decodeMap(t, w)["error"] != service.AdErrInvalidPlacement {
		t.Fatalf("unknown placement = %d %s", w.Code, w.Body)
	}
}

func TestAdSlateNeverReadsTheSession(t *testing.T) {
	f := newAdServeHTTP(t)
	anon, _ := f.slate(t, nil)
	signedIn, w := f.slate(t, func(r *http.Request) {
		r.Header.Set("Authorization", "Bearer not-a-real-token")
		r.AddCookie(&http.Cookie{Name: "session", Value: "abc"})
		*r = *asMember(r, adSteward)
	})
	if w.Code != http.StatusOK || len(signedIn.Ads) != len(anon.Ads) || signedIn.Ads[0].ID != anon.Ads[0].ID || signedIn.Why != anon.Why {
		t.Fatalf("signed-in slate differs: %s", w.Body)
	}
}

func TestAdBeaconRouteAlwaysAnswers204(t *testing.T) {
	f := newAdServeHTTP(t)
	s, _ := f.slate(t, nil)
	a := s.Ads[0]
	body, _ := json.Marshal(map[string]any{"c": a.ID, "p": s.Placement, "v": "5f0e4d1a-9a4b-4c3a-b52b-000000000001", "t": a.Token, "e": a.Exp})
	cases := []struct {
		name string
		body string
		ua   string
	}{
		{"valid", string(body), adServeUA},
		{"duplicate", string(body), adServeUA},
		{"bot", strings.Replace(string(body), "000000000001", "000000000002", 1), "Googlebot/2.1"},
		{"not json", "{", adServeUA},
		{"too big", `{"c":"` + strings.Repeat("a", 2000) + `"}`, adServeUA},
		{"empty", "", adServeUA},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodPost, "/api/ads/v", strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "text/plain")
		req.Header.Set("User-Agent", tc.ua)
		req.Header.Set("Authorization", "Bearer ignored")
		if w := f.do(req); w.Code != http.StatusNoContent || w.Body.Len() != 0 {
			t.Errorf("%s: %d %q", tc.name, w.Code, w.Body)
		}
	}
	if d := f.ads.Peek("ad-1").Delivered; d != 1 {
		t.Fatalf("delivered = %d, want 1", d)
	}
}

func TestAdClickRoute(t *testing.T) {
	f := newAdServeHTTP(t)
	s, _ := f.slate(t, nil)
	click, _ := url.Parse(s.Ads[0].ClickURL)
	req := httptest.NewRequest(http.MethodGet, click.RequestURI(), nil)
	w := f.do(req)
	if w.Code != http.StatusFound || w.Header().Get("Location") != adServeLanding || w.Header().Get("Referrer-Policy") != "origin" ||
		w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("good click = %d %v", w.Code, w.Header())
	}
	if f.ads.Peek("ad-1").Clicks != 1 {
		t.Fatal("good click not counted")
	}
	// A forged token (and a smuggled destination) still goes to the stored URL, uncounted.
	req = httptest.NewRequest(http.MethodGet, "/api/ads/c/ad-1?p=portal-feed-card&t=forged&e=1&url=https://evil.test", nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 Firefox/131")
	if w := f.do(req); w.Code != http.StatusFound || w.Header().Get("Location") != adServeLanding {
		t.Fatalf("bad token click = %d %v", w.Code, w.Header())
	}
	if f.ads.Peek("ad-1").Clicks != 1 {
		t.Fatal("bad-token click counted")
	}
	w = f.do(httptest.NewRequest(http.MethodGet, "/api/ads/c/ad-nope", nil))
	if w.Code != http.StatusNotFound || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/plain") || w.Header().Get("Location") != "" {
		t.Fatalf("unknown ad = %d %v %q", w.Code, w.Header(), w.Body)
	}
}

// ── flood limits per network (security review) ──────────────────────────────

// fromAddr sets the caller's address and a user agent of its own choosing.
func fromAddr(req *http.Request, addr string, n int) *http.Request {
	req.RemoteAddr = net.JoinHostPort(addr, "40000")
	req.Header.Set("User-Agent", adServeUA+" Build/"+strconv.Itoa(n))
	return req
}

func (f *adServeHTTP) beaconReq(a service.AdSlateItem, placement string, n int) *http.Request {
	body, _ := json.Marshal(map[string]any{"c": a.ID, "p": placement, "v": fmt.Sprintf("5f0e4d1a-9a4b-4c3a-b52b-%012d", n), "t": a.Token, "e": a.Exp})
	req := httptest.NewRequest(http.MethodPost, "/api/ads/v", bytes.NewReader(body))
	req.Header.Set("Content-Type", "text/plain")
	return req
}

func TestAdBeaconRouteDropsAFloodBeforeAnyWork(t *testing.T) {
	f := newAdServeHTTP(t)
	second := f.ads.Peek("ad-1")
	second.ID = "ad-2"
	f.ads.Put(second)
	s, _ := f.slate(t, nil)
	ads := map[string]service.AdSlateItem{}
	for _, a := range s.Ads {
		ads[a.ID] = a
	}
	if len(ads) != 2 {
		t.Fatalf("slate = %v", s.Ads)
	}
	n := 0
	beacon := func(id, addr string) int {
		n++
		return f.do(fromAddr(f.beaconReq(ads[id], s.Placement, n), addr, n)).Code
	}
	for range adBeaconsPerNetworkMinute {
		if code := beacon("ad-1", "41.66.1.2"); code != http.StatusNoContent {
			t.Fatalf("beacon = %d, want 204", code)
		}
	}
	// One user agent per beacon, but one address: only the serving
	// service's network cap was billed, and nothing else was stored.
	if d, stored := f.ads.Peek("ad-1").Delivered, len(f.delivery.ViewIDs); d == 0 || d > 20 || int(d) != stored {
		t.Fatalf("delivered %d, view ids stored %d; want a handful, one id per billed view", d, stored)
	}
	// Past the network's beacon limit even a fresh campaign is dropped
	// unread — and the answer is still 204.
	if code := beacon("ad-2", "41.66.1.2"); code != http.StatusNoContent || f.ads.Peek("ad-2").Delivered != 0 {
		t.Fatalf("over the limit: %d, ad-2 delivered %d", code, f.ads.Peek("ad-2").Delivered)
	}
	if code := beacon("ad-2", "41.66.1.3"); code != http.StatusNoContent || f.ads.Peek("ad-2").Delivered != 1 {
		t.Fatalf("another network: %d, ad-2 delivered %d", code, f.ads.Peek("ad-2").Delivered)
	}
}

func TestAdClickRouteLimitsANetwork(t *testing.T) {
	f := newAdServeHTTP(t)
	s, _ := f.slate(t, nil)
	click, _ := url.Parse(s.Ads[0].ClickURL)
	get := func(addr string, n int) *httptest.ResponseRecorder {
		return f.do(fromAddr(httptest.NewRequest(http.MethodGet, click.RequestURI(), nil), addr, n))
	}
	for i := range adClicksPerNetworkMinute {
		if w := get("41.66.1.2", i); w.Code != http.StatusFound {
			t.Fatalf("click %d = %d", i, w.Code)
		}
	}
	w := get("41.66.1.2", 999)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" || w.Header().Get("Location") != "" ||
		!strings.HasPrefix(w.Header().Get("Content-Type"), "text/plain") {
		t.Fatalf("over the limit = %d %v", w.Code, w.Header())
	}
	if w := get("41.66.1.3", 1); w.Code != http.StatusFound {
		t.Fatalf("another network = %d", w.Code)
	}
}

func TestAdSlateRouteLimitsANetworkNotAUserAgent(t *testing.T) {
	f := newAdServeHTTP(t)
	slate := func(addr string, n int) int {
		return f.do(fromAddr(httptest.NewRequest(http.MethodGet, "/api/ads/slate?placement=portal-feed-card", nil), addr, n)).Code
	}
	for i := range adSlatesPerNetworkMinute {
		if code := slate("2001:db8:1:2::"+strconv.FormatInt(int64(i%500+1), 16), i); code != http.StatusOK {
			t.Fatalf("slate %d = %d", i, code)
		}
	}
	// A new user agent and another address in the same /64 are the same network.
	if code := slate("2001:db8:1:2::ffff", 99_999); code != http.StatusTooManyRequests {
		t.Fatalf("over the limit = %d, want 429", code)
	}
	if code := slate("2001:db8:1:3::1", 1); code != http.StatusOK {
		t.Fatalf("the next /64 = %d", code)
	}
}

func TestAdLibraryRoute(t *testing.T) {
	f := newAdServeHTTP(t)
	w := f.do(httptest.NewRequest(http.MethodGet, "/api/ads/library?tab=running&q=koto&page=1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("library = %d %s", w.Code, w.Body)
	}
	body := decodeMap(t, w)
	items, _ := body["items"].([]any)
	if body["total"] != float64(1) || body["perPage"] != float64(20) || len(items) != 1 {
		t.Fatalf("library = %v", body)
	}
	item := items[0].(map[string]any)
	for _, key := range []string{"sponsorLine", "legalName", "partyName", "candidateName", "constituency", "electionName", "placement",
		"startDate", "endDate", "delivered", "amountPaidPesewas", "refundedPesewas", "status", "removalReason", "syntheticMedia", "chip"} {
		if _, ok := item[key]; !ok {
			t.Errorf("library item lacks %s", key)
		}
	}
	// A commercial ad shows only what readers saw: no legal name, no spend.
	if item["legalName"] != "" || item["amountPaidPesewas"] != float64(0) || item["sponsorLine"] != "Sponsored · Kotokuraba Traders" {
		t.Errorf("item = %v", item)
	}
	w = f.do(httptest.NewRequest(http.MethodGet, "/api/ads/library", nil))
	if w.Code != http.StatusOK || decodeMap(t, w)["total"] != float64(0) {
		t.Fatalf("political tab = %d %s", w.Code, w.Body)
	}
}

func TestAdReportRoute(t *testing.T) {
	f := newAdServeHTTP(t)
	get := func(path string, m *domain.Member) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if m != nil {
			req = asMember(req, m)
		}
		return f.do(req)
	}
	if w := get("/api/admin/ads/report", nil); w.Code != http.StatusForbidden {
		t.Fatalf("signed out = %d", w.Code)
	}
	if w := get("/api/admin/ads/report", &domain.Member{ID: "m-mod", Role: domain.RoleModerator}); w.Code != http.StatusForbidden {
		t.Fatalf("moderator = %d", w.Code)
	}
	w := get("/api/admin/ads/report?from=2026-10-01&to=2026-10-31", &domain.Member{ID: "m-c", Role: domain.RoleCurator})
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"placements":[{"slug":"portal-home-banner"`) ||
		!strings.Contains(w.Body.String(), `"bookedRemaining":5000`) {
		t.Fatalf("report = %d %s", w.Code, w.Body)
	}
	w = get("/api/admin/ads/report?from=2026-10-31&to=2026-10-01", adSteward)
	if body := decodeMap(t, w); w.Code != http.StatusBadRequest || body["error"] != service.AdErrInvalidDates || body["field"] != "from" {
		t.Fatalf("reversed window = %d %v", w.Code, body)
	}
}

func TestAdServingRoutesWithoutTheServicesWired(t *testing.T) {
	h := NewHandler(HandlerDeps{AuthRequired: true, Log: slog.New(slog.NewTextHandler(io.Discard, nil))})
	mux := http.NewServeMux()
	h.RegisterAdServingRoutes(mux)
	call := func(method, path string, m *domain.Member) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader("{}"))
		if m != nil {
			req = asMember(req, m)
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		return w
	}
	if w := call(http.MethodGet, "/api/ads/slate?placement=marketing-card", nil); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"ads":[]`) {
		t.Errorf("slate = %d %s", w.Code, w.Body)
	}
	if w := call(http.MethodGet, "/api/ads/slate?placement=nope", nil); w.Code != http.StatusBadRequest {
		t.Errorf("bad placement = %d", w.Code)
	}
	if w := call(http.MethodPost, "/api/ads/v", nil); w.Code != http.StatusNoContent {
		t.Errorf("beacon = %d", w.Code)
	}
	if w := call(http.MethodGet, "/api/ads/c/ad-1", nil); w.Code != http.StatusNotFound {
		t.Errorf("click = %d", w.Code)
	}
	if w := call(http.MethodGet, "/api/ads/library", nil); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"items":[]`) {
		t.Errorf("library = %d %s", w.Code, w.Body)
	}
	if w := call(http.MethodGet, "/api/admin/ads/report", adSteward); w.Code != http.StatusServiceUnavailable {
		t.Errorf("report = %d", w.Code)
	}
}

// The report route must win over the campaign route /api/admin/ads/{id}.
func TestAdReportRouteBeatsTheCampaignRoute(t *testing.T) {
	f := newAdServeHTTP(t)
	h := NewHandler(HandlerDeps{Log: slog.New(slog.NewTextHandler(io.Discard, nil))})
	h.RegisterAdRoutes(f.mux)
	w := f.do(asMember(httptest.NewRequest(http.MethodGet, "/api/admin/ads/report", nil), adSteward))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"totals"`) {
		t.Fatalf("report via the full mux = %d %s", w.Code, w.Body)
	}
}
