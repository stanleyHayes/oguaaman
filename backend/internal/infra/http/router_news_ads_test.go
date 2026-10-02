package http

import (
	"bytes"
	"context"
	"encoding/json"
	"image/png"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
	"github.com/oguaa/backend/internal/service/adsfake"
)

// ── end-to-end: the news desk, elections, settings and ads through NewRouter ──
//
// These tests send real requests through the production router (Auth, CORS
// and security middleware included) with real Bearer tokens, wired the way
// cmd/server wires HandlerDeps, over in-memory repositories.

const (
	e2eTokenSecret = "router-e2e-token-secret-0123456789abcdef"
	e2eLanding     = "https://kotokuraba.test/market"
	e2eUA          = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36"
	e2eFeedCard    = "portal-feed-card"
	e2eChecklist   = `{"checklist":{"sponsorIdentified":true,"notDisguisedAsNews":true,"noFalseOrUnsubstantiatedClaims":true,"noHateOrSectionalAppeal":true,"noVoterSuppressionOrResultClaims":true,"categoryLicenceChecked":true,"landingPageMatches":true,"ghsPricingOnly":true,"aiMediaDisclosed":true,"noPartySymbolsIfDistrictAssembly":true}}`
	muxNotFound    = "404 page not found\n"
)

// e2eReports is an in-memory reports repository.
type e2eReports struct {
	mu   sync.Mutex
	rows []domain.Report
}

func (r *e2eReports) Insert(_ context.Context, rep domain.Report) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rows = append(r.rows, rep)
	return nil
}
func (r *e2eReports) All(context.Context) ([]domain.Report, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]domain.Report(nil), r.rows...), nil
}
func (r *e2eReports) Get(_ context.Context, id string) (*domain.Report, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.rows {
		if r.rows[i].ID == id {
			rep := r.rows[i]
			return &rep, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "report"}
}
func (r *e2eReports) UpdateStatus(context.Context, string, string, string, string, string) error {
	return nil
}
func (r *e2eReports) OpenCount(context.Context) (int, error) { return len(r.rows), nil }
func (r *e2eReports) OpenByTarget(_ context.Context, targetType, targetID string) ([]domain.Report, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []domain.Report
	for _, rep := range r.rows {
		if rep.TargetType == targetType && rep.TargetID == targetID {
			out = append(out, rep)
		}
	}
	return out, nil
}
func (r *e2eReports) Resolve(context.Context, string, string, string, string, string, string) error {
	return nil
}

// e2eSettings is an in-memory settings repository that enforces versions
// and keeps the audit trail, like the Mongo one.
type e2eSettings struct {
	mu       sync.Mutex
	docs     map[string][]byte
	versions map[string]int
	audit    []domain.SettingsAudit
}

func (s *e2eSettings) Get(_ context.Context, key string, out any) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, ok := s.docs[key]
	if !ok {
		return false, nil
	}
	return true, bson.Unmarshal(raw, out)
}

func (s *e2eSettings) Put(_ context.Context, key string, doc any, expectedVersion int, row domain.SettingsAudit) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.versions[key] != expectedVersion {
		return domain.ErrSettingsConflict
	}
	raw, err := bson.Marshal(doc)
	if err != nil {
		return err
	}
	s.docs[key], s.versions[key] = raw, expectedVersion+1
	s.audit = append(s.audit, row)
	return nil
}

func (s *e2eSettings) AppendAudit(_ context.Context, row domain.SettingsAudit) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.audit = append(s.audit, row)
	return nil
}

func (s *e2eSettings) Audit(_ context.Context, key string, limit int) ([]domain.SettingsAudit, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []domain.SettingsAudit
	for i := len(s.audit) - 1; i >= 0 && len(out) < limit; i-- {
		if s.audit[i].Key == key {
			out = append(out, s.audit[i])
		}
	}
	return out, nil
}

type e2eRouter struct {
	t       *testing.T
	router  http.Handler
	auth    *service.AuthService
	ads     *adsfake.Ads
	pay     *adHTTPPay
	news    *deskNews
	reports *e2eReports
	tokens  map[string]string // role → Bearer token
}

// newE2ERouter wires every new feature into HandlerDeps exactly as
// cmd/server does, with ads switched on (and no lead time, so a campaign
// paid today runs today) and one automated brief with a ready report draft.
func newE2ERouter(t *testing.T) *e2eRouter {
	t.Helper()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	ctx := context.Background()

	advertiser := staffMember(t, "m-ama", "ama@example.test", domain.RoleMember, false)
	other := staffMember(t, "m-kojo", "kojo@example.test", domain.RoleMember, false)
	editor := staffMember(t, "m-ed", "kofi@example.test", domain.RoleEditor, false)
	curator := staffMember(t, "m-cu", "efua@example.test", domain.RoleCurator, false)
	steward := staffMember(t, "m-st", "nana@example.test", domain.RoleSteward, false)
	store := newMemStore(advertiser, other, editor, curator, steward)
	auth := service.NewAuthService(store, "test-secret")

	settings := service.NewSettingsService(&e2eSettings{docs: map[string][]byte{}, versions: map[string]int{}}, log)
	adSet := service.DefaultAdSettings()
	adSet.AdsEnabled, adSet.MinLeadDays = true, 0
	if err := settings.Save(ctx, service.SettingsChange{Key: domain.SettingsKeyAds, Doc: &adSet, ActorName: "Steward", Reason: "turn ads on"}); err != nil {
		t.Fatal(err)
	}
	elections := service.NewElectionsService(&elRepo{rows: map[string]domain.Election{}}, settings, log)

	f := &e2eRouter{t: t, auth: auth, ads: adsfake.NewAds(), pay: &adHTTPPay{paid: map[string]int64{}}, reports: &e2eReports{}}
	sponsors := adsfake.NewSponsors()
	_ = sponsors.Insert(ctx, domain.AdSponsor{ID: "asp-1", MemberID: advertiser.ID, Kind: domain.AdSponsorCommercial,
		EntityType: domain.AdEntityBusiness, DisplayName: "Kotokuraba Traders", LegalName: "Kotokuraba Traders Ltd", Status: domain.AdSponsorVerified})
	delivery := adsfake.NewDelivery()
	ads := service.NewAdsService(service.AdsDeps{
		Campaigns: f.ads, Sponsors: sponsors, Stats: delivery, Settings: settings, Elections: elections, Paystack: f.pay,
		Reports: f.reports, PortalURL: "https://citizen.oguaaman.test", CloudinaryCloudName: "demo", TokenSecretConfigured: true, Log: log,
	})
	serving := service.NewAdServingService(service.AdServingDeps{
		Campaigns: f.ads, Sponsors: sponsors, Delivery: delivery, Settings: settings, Elections: elections,
		TokenSecret: e2eTokenSecret, APIURL: deskAPIURL, Log: log,
	})
	ads.SetDeliveryFlush(serving.Flush)
	elections.SetCampaigns(ads)

	// The automated brief "news-1" (and a draft), with "nrj-1", a ready
	// report draft for it.
	env := newDeskEnv(t)
	f.news = env.news
	desk := service.NewNewsDesk(service.NewsDeskDeps{News: f.news, Jobs: env.jobs, Settings: settings, Elections: elections, Log: log})

	svc := service.New(service.Deps{Members: store, Claims: noClaims{}, News: f.news, Reports: f.reports, Log: log})
	svc.SetAdReports(ads)
	h := NewHandler(HandlerDeps{
		Svc: svc, Auth: auth, AuthRequired: true, PaystackSecret: webhookSecret, UploadBase: deskAPIURL, Log: log,
		Foundations: FoundationsDeps{Settings: settings, Elections: elections},
		NewsDesk:    desk,
		Ads:         ads,
		AdServing: AdServingDeps{
			Serving: serving, Library: service.NewAdLibraryService(f.ads, sponsors, log), Report: service.NewAdReportService(f.ads, delivery, log),
		},
	})
	f.router = NewRouter(h, nil, nil, log)
	f.tokens = map[string]string{}
	for role, m := range map[string]*domain.Member{"advertiser": advertiser, "other": other, "editor": editor, "curator": curator, "steward": steward} {
		token, _, err := auth.Login(ctx, m.Email, handlerTestPassword)
		if err != nil {
			t.Fatalf("login %s: %v", role, err)
		}
		f.tokens[role] = token
	}
	return f
}

// call sends one request through the router; as names a role ("" = anonymous).
func (f *e2eRouter) call(method, path, body, as string) *httptest.ResponseRecorder {
	f.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("User-Agent", e2eUA)
	if as != "" {
		req.Header.Set("Authorization", "Bearer "+f.tokens[as])
	}
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)
	return w
}

func (f *e2eRouter) want(w *httptest.ResponseRecorder, status int, what string) map[string]any {
	f.t.Helper()
	if w.Code != status {
		f.t.Fatalf("%s = %d %s, want %d", what, w.Code, w.Body.String(), status)
	}
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return out
}

// newsAdsRoutes is every route of spec §4 (with ids that may not exist).
var newsAdsRoutes = []struct{ method, path string }{
	{http.MethodGet, "/api/news/some-story/cover.png"},
	{http.MethodGet, "/api/admin/news/research?status=ready&page=1"},
	{http.MethodGet, "/api/admin/news/news-x/research"},
	{http.MethodPost, "/api/admin/news/news-x/research/approve"},
	{http.MethodPost, "/api/admin/news/news-x/research/reject"},
	{http.MethodPost, "/api/admin/news/news-x/research/rerun"},
	{http.MethodPost, "/api/admin/news/news-x/research/cover"},
	{http.MethodPost, "/api/admin/news/news-x/corrections"},
	{http.MethodGet, "/api/admin/settings/news-desk"},
	{http.MethodPut, "/api/admin/settings/news-desk"},
	{http.MethodGet, "/api/admin/settings/audit?key=ads&limit=50"},
	{http.MethodGet, "/api/elections?upcoming=1"},
	{http.MethodGet, "/api/admin/elections"},
	{http.MethodPost, "/api/admin/elections"},
	{http.MethodPut, "/api/admin/elections/el-x"},
	{http.MethodDelete, "/api/admin/elections/el-x"},
	{http.MethodGet, "/api/ads/rate-card"},
	{http.MethodPost, "/api/ads/quote"},
	{http.MethodGet, "/api/me/ad-sponsors"},
	{http.MethodPost, "/api/me/ad-sponsors"},
	{http.MethodPut, "/api/me/ad-sponsors/asp-x"},
	{http.MethodPost, "/api/me/ads"},
	{http.MethodGet, "/api/me/ads"},
	{http.MethodGet, "/api/me/ads/ad-x"},
	{http.MethodPost, "/api/me/ads/ad-x/checkout"},
	{http.MethodGet, "/api/ads/confirm?reference=oguaa-adv-ad-x-1"},
	{http.MethodPost, "/api/me/ads/ad-x/cancel"},
	{http.MethodGet, "/api/ads/slate?placement=portal-feed-card"},
	{http.MethodPost, "/api/ads/v"},
	{http.MethodGet, "/api/ads/c/ad-x"},
	{http.MethodGet, "/api/ads/library?tab=political"},
	{http.MethodGet, "/api/admin/ads?status=pending_review"},
	{http.MethodGet, "/api/admin/ads/ad-x"},
	{http.MethodPost, "/api/admin/ads/ad-x/approve"},
	{http.MethodPost, "/api/admin/ads/ad-x/reject"},
	{http.MethodPost, "/api/admin/ads/ad-x/pause"},
	{http.MethodPost, "/api/admin/ads/ad-x/resume"},
	{http.MethodPost, "/api/admin/ads/ad-x/remove"},
	{http.MethodPost, "/api/admin/ads/ad-x/refund"},
	{http.MethodPost, "/api/admin/ads/kill"},
	{http.MethodGet, "/api/admin/ad-sponsors?status=pending"},
	{http.MethodPost, "/api/admin/ad-sponsors/asp-x/verify"},
	{http.MethodPost, "/api/admin/ad-sponsors/asp-x/reject"},
	{http.MethodPost, "/api/admin/ad-sponsors/asp-x/suspend"},
	{http.MethodGet, "/api/admin/settings/ads"},
	{http.MethodPut, "/api/admin/settings/ads"},
	{http.MethodGet, "/api/admin/ads/report?from=2026-10-01&to=2026-10-31"},
}

// Every route of spec §4 reaches a handler (never the mux's own 404/405),
// and none of them crashes, signed in or not.
func TestRouterServesEveryNewsAndAdsRoute(t *testing.T) {
	f := newE2ERouter(t)
	for _, rt := range newsAdsRoutes {
		for _, as := range []string{"", "steward"} {
			w := f.call(rt.method, rt.path, "{}", as)
			if w.Code == http.StatusMethodNotAllowed || w.Body.String() == muxNotFound || w.Code >= http.StatusInternalServerError && w.Code != http.StatusServiceUnavailable {
				t.Errorf("%s %s (as %q) = %d %q", rt.method, rt.path, as, w.Code, w.Body.String())
			}
		}
	}
}

// With nothing new wired (the zero HandlerDeps fields), every new route still
// answers sensibly: 503 feature_unavailable or an empty public response,
// never a crash.
func TestRouterNewRoutesWithoutTheFeaturesWired(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	steward := staffMember(t, "m-st", "nana@example.test", domain.RoleSteward, false)
	store := newMemStore(steward)
	auth := service.NewAuthService(store, "test-secret")
	h := NewHandler(HandlerDeps{Svc: service.New(service.Deps{Members: store, Claims: noClaims{}, News: &deskNews{}}), Auth: auth, AuthRequired: true, Log: log})
	router := NewRouter(h, nil, nil, log)
	token, _, err := auth.Login(context.Background(), steward.Email, handlerTestPassword)
	if err != nil {
		t.Fatal(err)
	}
	for _, rt := range newsAdsRoutes {
		req := httptest.NewRequest(rt.method, rt.path, strings.NewReader("{}"))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("User-Agent", e2eUA)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code == http.StatusMethodNotAllowed || w.Body.String() == muxNotFound || w.Code >= http.StatusInternalServerError && w.Code != http.StatusServiceUnavailable {
			t.Errorf("%s %s = %d %q", rt.method, rt.path, w.Code, w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/ads/slate?placement=portal-feed-card", nil))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"ads":[]`) {
		t.Fatalf("unwired slate = %d %s, want an empty slate", w.Code, w.Body.String())
	}
}

// The whole ads path through the router: rate card, quote, submit, review,
// checkout, the Paystack webhook, confirm, then serving: slate, a billable
// view, a counted click, the library, a report on the ad and the ads report.
func TestRouterAdsEndToEnd(t *testing.T) {
	f := newE2ERouter(t)
	today := time.Now().UTC()
	start, end := today.Format(time.DateOnly), today.AddDate(0, 0, 20).Format(time.DateOnly)

	card := f.want(f.call(http.MethodGet, "/api/ads/rate-card", "", ""), http.StatusOK, "rate card")
	if card["adsEnabled"] != true || card["currency"] != "GHS" {
		t.Fatalf("rate card = %v", card)
	}
	quote := `{"placement":"` + e2eFeedCard + `","startDate":"` + start + `","endDate":"` + end + `","impressions":3000}`
	q := f.want(f.call(http.MethodPost, "/api/ads/quote", quote, ""), http.StatusOK, "quote")
	price, _ := q["price"].(map[string]any)
	if price["totalPesewas"] != float64(15000) || q["days"] != float64(21) {
		t.Fatalf("quote = %v", q)
	}

	submit := `{"sponsorId":"asp-1","placement":"` + e2eFeedCard + `","category":"retail",
	 "creative":{"imageUrl":"https://res.cloudinary.com/demo/image/upload/v1/oguaa/m/m-ama/ad.jpg","headline":"Market days at Kotokuraba",
	  "alt":"Stalls at Kotokuraba market","landingUrl":"` + e2eLanding + `"},
	 "startDate":"` + start + `","endDate":"` + end + `","impressions":3000,"acceptTerms":true,"startConsent":true}`
	f.want(f.call(http.MethodPost, "/api/me/ads", submit, ""), http.StatusUnauthorized, "anonymous submit")
	ad := f.want(f.call(http.MethodPost, "/api/me/ads", submit, "advertiser"), http.StatusCreated, "submit")
	id, _ := ad["id"].(string)
	if ad["status"] != domain.AdStatusPendingReview {
		t.Fatalf("submitted = %v", ad)
	}

	f.want(f.call(http.MethodPost, "/api/admin/ads/"+id+"/approve", e2eChecklist, "advertiser"), http.StatusForbidden, "member approve")
	f.want(f.call(http.MethodPost, "/api/admin/ads/"+id+"/approve", e2eChecklist, "steward"), http.StatusOK, "approve")
	queue := f.want(f.call(http.MethodGet, "/api/admin/ads?status=approved", "", "curator"), http.StatusOK, "admin queue")
	if queue["total"] != float64(1) {
		t.Fatalf("admin queue = %v", queue)
	}

	f.want(f.call(http.MethodPost, "/api/me/ads/"+id+"/checkout", "{}", "other"), http.StatusNotFound, "someone else's checkout")
	co := f.want(f.call(http.MethodPost, "/api/me/ads/"+id+"/checkout", "{}", "advertiser"), http.StatusOK, "checkout")
	ref, _ := co["reference"].(string)
	if !strings.HasPrefix(ref, "oguaa-adv-") || co["authorizationUrl"] == "" {
		t.Fatalf("checkout = %v", co)
	}
	// Paystack reports the charge; the shared webhook routes oguaa-adv- to ads.
	f.pay.paid[ref] = f.ads.Peek(id).Price.TotalPesewas
	hook := httptest.NewRecorder()
	f.router.ServeHTTP(hook, signedCharge(ref))
	if hook.Code != http.StatusOK || f.ads.Peek(id).Status != domain.AdStatusActive {
		t.Fatalf("webhook = %d, status %q", hook.Code, f.ads.Peek(id).Status)
	}
	confirmed := f.want(f.call(http.MethodGet, "/api/ads/confirm?reference="+ref, "", "advertiser"), http.StatusOK, "confirm")
	if c, _ := confirmed["campaign"].(map[string]any); c["status"] != domain.AdStatusActive || c["paymentStatus"] != domain.AdPaymentSuccess {
		t.Fatalf("confirm = %v", confirmed)
	}

	// Serving: the paid ad is on the slate, whoever asks.
	var slate service.AdSlate
	w := f.call(http.MethodGet, "/api/ads/slate?placement="+e2eFeedCard+"&section=news&political=0&surface=portal", "", "other")
	if w.Code != http.StatusOK || w.Header().Get("Cache-Control") != "no-store" || json.Unmarshal(w.Body.Bytes(), &slate) != nil || len(slate.Ads) != 1 {
		t.Fatalf("slate = %d %s", w.Code, w.Body.String())
	}
	served := slate.Ads[0]
	if served.ID != id || served.Chip != "Ad" || served.SponsorLine != "Sponsored · Kotokuraba Traders" || !strings.HasPrefix(served.ClickURL, deskAPIURL+"/api/ads/c/"+id) {
		t.Fatalf("served = %+v", served)
	}
	beacon, _ := json.Marshal(map[string]any{"c": served.ID, "p": slate.Placement, "v": "0b8f3c1e-7d2a-4e5b-9c61-000000000001", "t": served.Token, "e": served.Exp})
	if w := f.call(http.MethodPost, "/api/ads/v", string(beacon), ""); w.Code != http.StatusNoContent || w.Body.Len() != 0 {
		t.Fatalf("beacon = %d %q", w.Code, w.Body.String())
	}
	if d := f.ads.Peek(id).Delivered; d != 1 {
		t.Fatalf("delivered = %d, want 1", d)
	}
	click, _ := url.Parse(served.ClickURL)
	if w := f.call(http.MethodGet, click.RequestURI(), "", ""); w.Code != http.StatusFound || w.Header().Get("Location") != e2eLanding {
		t.Fatalf("click = %d %v", w.Code, w.Header())
	}
	if f.ads.Peek(id).Clicks != 1 {
		t.Fatal("click not counted")
	}

	lib := f.want(f.call(http.MethodGet, "/api/ads/library?tab=running", "", ""), http.StatusOK, "library")
	if lib["total"] != float64(1) || !strings.Contains(f.call(http.MethodGet, "/api/ads/library?tab=running", "", "").Body.String(), `"amountPaidPesewas":0`) {
		t.Fatalf("library (a commercial ad's spend stays private) = %v", lib)
	}

	// A reader reports the ad: it goes to the queue and is never auto-hidden.
	rep := f.want(f.call(http.MethodPost, "/api/reports", `{"targetType":"ad","targetId":"`+id+`","reason":"scam","details":"Fake offer"}`, "other"),
		http.StatusCreated, "report the ad")
	if rep["hidden"] != false || len(f.reports.rows) != 1 || f.ads.Peek(id).Status != domain.AdStatusActive {
		t.Fatalf("report = %v, rows %d, status %q", rep, len(f.reports.rows), f.ads.Peek(id).Status)
	}

	f.want(f.call(http.MethodGet, "/api/admin/ads/report?from="+start+"&to="+end, "", "advertiser"), http.StatusForbidden, "member ads report")
	f.want(f.call(http.MethodGet, "/api/admin/ads/report?from="+start+"&to="+end, "", "curator"), http.StatusOK, "ads report")
	mine := f.want(f.call(http.MethodGet, "/api/me/ads/"+id, "", "advertiser"), http.StatusOK, "my ad")
	if mine["delivered"] != float64(1) || mine["clicks"] != float64(1) {
		t.Fatalf("my ad = %v", mine)
	}
	if w := f.call(http.MethodGet, "/api/me/ads/"+id, "", "other"); w.Code != http.StatusNotFound {
		t.Fatalf("someone else's ad = %d %s", w.Code, w.Body.String())
	}
}

// Ads settings: stewards save (with a reason), curators read, members can't;
// the slate empties the moment a steward switches ads off.
func TestRouterAdSettingsKillSwitch(t *testing.T) {
	f := newE2ERouter(t)
	f.want(f.call(http.MethodGet, "/api/admin/settings/ads", "", "advertiser"), http.StatusForbidden, "member reads ad settings")
	got := f.want(f.call(http.MethodGet, "/api/admin/settings/ads", "", "curator"), http.StatusOK, "curator reads ad settings")
	if got["tokenSecretConfigured"] != true || got["adsEnabled"] != true {
		t.Fatalf("settings = %v", got)
	}
	got["adsEnabled"] = false
	got["reason"] = "Pause all ads for review"
	body, _ := json.Marshal(got)
	f.want(f.call(http.MethodPut, "/api/admin/settings/ads", string(body), "curator"), http.StatusForbidden, "curator saves ad settings")
	// An empty document is a field error, not a crash (impressionStep 0 once
	// divided by zero in validation).
	if w := f.call(http.MethodPut, "/api/admin/settings/ads", `{"reason":"Empty save"}`, "steward"); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"error":"invalid_setting"`) {
		t.Fatalf("empty settings save = %d %s", w.Code, w.Body.String())
	}
	f.want(f.call(http.MethodPut, "/api/admin/settings/ads", string(body), "steward"), http.StatusOK, "steward saves ad settings")
	card := f.want(f.call(http.MethodGet, "/api/ads/rate-card", "", ""), http.StatusOK, "rate card")
	if card["adsEnabled"] != false {
		t.Fatalf("rate card after kill = %v", card)
	}
	w := f.call(http.MethodGet, "/api/ads/slate?placement="+e2eFeedCard, "", "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"ads":[]`) {
		t.Fatalf("slate with ads off = %d %s", w.Code, w.Body.String())
	}
	if w := f.call(http.MethodPost, "/api/ads/quote", `{"placement":"`+e2eFeedCard+`","impressions":3000}`, ""); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("quote with ads off = %d %s", w.Code, w.Body.String())
	}
}

// The news desk through the router: the public branded cover, the editor's
// queue and approval (the brief upgrades in place), corrections and the
// news-desk settings.
func TestRouterNewsDeskEndToEnd(t *testing.T) {
	f := newE2ERouter(t)
	art := f.want(f.call(http.MethodGet, "/api/news/"+deskSlug, "", ""), http.StatusOK, "public article")
	cover, _ := art["coverImageUrl"].(string)
	if !strings.HasPrefix(cover, deskAPIURL+"/api/news/"+deskSlug+"/cover.png?v=") || art["coverImageKind"] != domain.CoverKindBranded {
		t.Fatalf("public cover = %v", art)
	}
	coverURL, _ := url.Parse(cover)
	w := f.call(http.MethodGet, coverURL.RequestURI(), "", "")
	if w.Code != http.StatusOK || w.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("cover.png = %d %v", w.Code, w.Header())
	}
	if img, err := png.Decode(bytes.NewReader(w.Body.Bytes())); err != nil || img.Bounds().Dx() != 1600 || img.Bounds().Dy() != 900 {
		t.Fatalf("cover image = %v", err)
	}

	f.want(f.call(http.MethodGet, "/api/admin/news/research?status=ready", "", "advertiser"), http.StatusForbidden, "member reads the queue")
	queue := f.want(f.call(http.MethodGet, "/api/admin/news/research?status=ready", "", "editor"), http.StatusOK, "editor queue")
	if queue["perPage"] != float64(20) {
		t.Fatalf("queue = %v", queue)
	}
	job := f.want(f.call(http.MethodGet, "/api/admin/news/news-1/research", "", "editor"), http.StatusOK, "research job")
	if job["status"] != domain.NewsJobReady {
		t.Fatalf("job = %v", job)
	}
	approve := `{"title":"Kotokuraba market trades again","summary":"Repairs are done.","body":"Traders are back [1]. Costs were GH₵1.2m [2].","cover":"keep",
	 "checklist":{"factsMatchSources":true,"noUnattributedAllegations":true,"quotesAccurate":true,"rightOfReplyConsidered":true}}`
	f.want(f.call(http.MethodPost, "/api/admin/news/news-1/research/approve", approve, "editor"), http.StatusOK, "approve")
	art = f.want(f.call(http.MethodGet, "/api/news/"+deskSlug, "", ""), http.StatusOK, "upgraded article")
	sources, _ := art["sources"].([]any)
	if art["tier"] != domain.NewsTierReport || art["title"] != "Kotokuraba market trades again" || art["reviewedByName"] != "Staff m-ed" || len(sources) != 2 {
		t.Fatalf("upgraded article = %v", art)
	}
	f.want(f.call(http.MethodPost, "/api/admin/news/news-1/corrections", `{"note":"Corrected the repair cost."}`, "editor"), http.StatusOK, "correction")
	art = f.want(f.call(http.MethodGet, "/api/news/"+deskSlug, "", ""), http.StatusOK, "corrected article")
	if corr, _ := art["corrections"].([]any); len(corr) != 1 {
		t.Fatalf("corrections = %v", art["corrections"])
	}

	set := f.want(f.call(http.MethodGet, "/api/admin/settings/news-desk", "", "editor"), http.StatusOK, "news-desk settings")
	if set["longformEnabled"] != false || set["deskEnabled"] != true {
		t.Fatalf("defaults = %v", set)
	}
	set["longformEnabled"] = true
	set["reason"] = "Start long-form reports"
	body, _ := json.Marshal(set)
	f.want(f.call(http.MethodPut, "/api/admin/settings/news-desk", string(body), "editor"), http.StatusForbidden, "editor saves desk settings")
	saved := f.want(f.call(http.MethodPut, "/api/admin/settings/news-desk", string(body), "steward"), http.StatusOK, "steward saves desk settings")
	if saved["longformEnabled"] != true || saved["version"] != float64(1) {
		t.Fatalf("saved = %v", saved)
	}
	if w := f.call(http.MethodPut, "/api/admin/settings/news-desk", string(body), "steward"); w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "settings_conflict") {
		t.Fatalf("stale save = %d %s", w.Code, w.Body.String())
	}
}

// Elections through the router: stewards keep the calendar, the public reads
// it, and the settings audit is curator-only.
func TestRouterElectionsEndToEnd(t *testing.T) {
	f := newE2ERouter(t)
	f.want(f.call(http.MethodPost, "/api/admin/elections", electionBody, "curator"), http.StatusForbidden, "curator creates an election")
	created := f.want(f.call(http.MethodPost, "/api/admin/elections", electionBody, "steward"), http.StatusCreated, "steward creates an election")
	id, _ := created["id"].(string)
	if id == "" || created["blackoutStart"] == "" {
		t.Fatalf("created = %v", created)
	}
	w := f.call(http.MethodGet, "/api/elections?upcoming=1", "", "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"name":"2028 General Election"`) {
		t.Fatalf("public calendar = %d %s", w.Code, w.Body.String())
	}
	f.want(f.call(http.MethodGet, "/api/admin/settings/audit?key=elections", "", "advertiser"), http.StatusForbidden, "member reads the audit")
	if w := f.call(http.MethodGet, "/api/admin/settings/audit?key=elections", "", "curator"); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"key":"elections"`) {
		t.Fatalf("curator reads the audit = %d %s", w.Code, w.Body.String())
	}
	if w := f.call(http.MethodDelete, "/api/admin/elections/"+id, "", "steward"); w.Code != http.StatusNoContent {
		t.Fatalf("delete = %d %s", w.Code, w.Body.String())
	}
}
