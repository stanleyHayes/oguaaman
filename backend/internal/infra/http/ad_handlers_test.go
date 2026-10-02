package http

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
	"github.com/oguaa/backend/internal/service/adsfake"
)

// adSettingsStore is an in-memory settings repository (bson round trip, so
// stored fields lay over the caller's defaults like Mongo).
type adSettingsStore struct {
	mu   sync.Mutex
	docs map[string][]byte
}

func (s *adSettingsStore) Get(_ context.Context, key string, out any) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, ok := s.docs[key]
	if !ok {
		return false, nil
	}
	return true, bson.Unmarshal(raw, out)
}

func (s *adSettingsStore) Put(_ context.Context, key string, doc any, _ int, _ domain.SettingsAudit) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, err := bson.Marshal(doc)
	s.docs[key] = raw
	return err
}

func (s *adSettingsStore) Audit(context.Context, string, int) ([]domain.SettingsAudit, error) {
	return nil, nil
}

// adHTTPPay is a refunding Paystack fake that reports scripted charges.
type adHTTPPay struct {
	mu   sync.Mutex
	paid map[string]int64
}

func (p *adHTTPPay) Simulated() bool { return false }
func (p *adHTTPPay) Initialize(_ context.Context, _ string, _ int64, _, ref, _ string) (string, string, error) {
	return "https://checkout.paystack.test/" + ref, "AC", nil
}
func (p *adHTTPPay) Verify(_ context.Context, ref string) (service.PaymentCheck, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if amount, ok := p.paid[ref]; ok {
		return service.PaymentCheck{Outcome: service.PaymentPaid, AmountPesewas: amount, Currency: "GHS", Reference: ref}, nil
	}
	return service.PaymentCheck{Outcome: service.PaymentInProgress}, nil
}
func (p *adHTTPPay) Refund(context.Context, string, int64, string) (service.RefundResult, error) {
	return service.RefundResult{RefundID: "rf-1", Status: service.RefundPending}, nil
}
func (p *adHTTPPay) RefundStatus(_ context.Context, id string) (service.RefundResult, error) {
	return service.RefundResult{RefundID: id, Status: service.RefundProcessed}, nil
}

type adHTTPFixture struct {
	h   *Handler
	mux *http.ServeMux
	ads *adsfake.Ads
	pay *adHTTPPay
}

var (
	adAdvertiser = &domain.Member{ID: "m-ama", DisplayName: "Ama Mensah", Role: domain.RoleMember, Email: "ama@example.test"}
	adSteward    = &domain.Member{ID: "m-nana", DisplayName: "Nana Essien", Role: domain.RoleSteward}
)

func newAdHTTPFixture(t *testing.T, ps service.RefundingPaystack) *adHTTPFixture {
	t.Helper()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	settings := service.NewSettingsService(&adSettingsStore{docs: map[string][]byte{}}, log)
	set := service.DefaultAdSettings()
	set.AdsEnabled = true
	if err := settings.Save(context.Background(), service.SettingsChange{Key: domain.SettingsKeyAds, Doc: &set, ActorName: "Steward", Reason: "turn ads on"}); err != nil {
		t.Fatal(err)
	}
	f := &adHTTPFixture{ads: adsfake.NewAds()}
	if p, ok := ps.(*adHTTPPay); ok {
		f.pay = p
	}
	sponsors := adsfake.NewSponsors()
	_ = sponsors.Insert(context.Background(), domain.AdSponsor{ID: "asp-1", MemberID: adAdvertiser.ID, Kind: domain.AdSponsorCommercial,
		EntityType: domain.AdEntityBusiness, DisplayName: "Kotokuraba Traders", LegalName: "Kotokuraba Traders Ltd", Status: domain.AdSponsorVerified})
	svc := service.NewAdsService(service.AdsDeps{
		Campaigns: f.ads, Sponsors: sponsors, Settings: settings, Paystack: ps,
		PortalURL: "https://portal.test", CloudinaryCloudName: "demo", Log: log,
	})
	f.h = NewHandler(HandlerDeps{AuthRequired: true, PaystackSecret: webhookSecret, Log: log}).WithAds(svc)
	f.mux = http.NewServeMux()
	f.h.RegisterAdRoutes(f.mux)
	return f
}

func (f *adHTTPFixture) do(method, path, body string, m *domain.Member) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if m != nil {
		req = asMember(req, m)
	}
	w := httptest.NewRecorder()
	f.mux.ServeHTTP(w, req)
	return w
}

func decodeMap(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("body %q: %v", w.Body.String(), err)
	}
	return out
}

const adSubmitBody = `{"sponsorId":"asp-1","placement":"portal-feed-card","category":"retail",
 "creative":{"imageUrl":"https://res.cloudinary.com/demo/image/upload/v1/oguaa/m/m-ama/ad.jpg","headline":"Market days at Kotokuraba",
  "alt":"Stalls at Kotokuraba market","landingUrl":"https://kotokuraba.test"},
 "startDate":"2099-01-05","endDate":"2099-01-20","impressions":3000,"acceptTerms":true,"startConsent":true}`

func TestAdRoutesWithoutTheServiceWired(t *testing.T) {
	h := NewHandler(HandlerDeps{Log: slog.New(slog.NewTextHandler(io.Discard, nil))})
	mux := http.NewServeMux()
	h.RegisterAdRoutes(mux)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/ads/rate-card", nil))
	if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), codeUnavailable) {
		t.Fatalf("rate card unwired = %d %s", w.Code, w.Body)
	}
}

func TestAdQuoteRoute(t *testing.T) {
	f := newAdHTTPFixture(t, &adHTTPPay{paid: map[string]int64{}})
	if w := f.do(http.MethodPost, "/api/ads/quote", `{`, nil); w.Code != http.StatusBadRequest || decodeMap(t, w)["error"] != codeInvalidJSON {
		t.Fatalf("bad json = %d %s", w.Code, w.Body)
	}
	w := f.do(http.MethodPost, "/api/ads/quote", `{"placement":"portal-feed-card","startDate":"2099-01-05","endDate":"2099-01-10","impressions":3500}`, nil)
	body := decodeMap(t, w)
	if w.Code != http.StatusBadRequest || body["error"] != service.AdErrInvalidImpressions || body["field"] != "impressions" {
		t.Fatalf("off-step = %d %v", w.Code, body)
	}
	// The feed card's fallback forecast sells 200 a day: 6 days hold 1,200.
	w = f.do(http.MethodPost, "/api/ads/quote", `{"placement":"portal-feed-card","startDate":"2099-01-05","endDate":"2099-01-10","impressions":5000}`, nil)
	body = decodeMap(t, w)
	if w.Code != http.StatusConflict || body["error"] != service.AdErrInventoryUnavailable || body["maxAvailable"] != float64(1000) {
		t.Fatalf("sold out = %d %v", w.Code, body)
	}
	w = f.do(http.MethodGet, "/api/ads/rate-card", "", nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"registration":"BN843072020"`) {
		t.Fatalf("rate card = %d %s", w.Code, w.Body)
	}
}

func TestAdRoutesAreGuarded(t *testing.T) {
	f := newAdHTTPFixture(t, &adHTTPPay{paid: map[string]int64{}})
	if w := f.do(http.MethodPost, "/api/me/ads", adSubmitBody, nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("signed out submit = %d", w.Code)
	}
	if w := f.do(http.MethodGet, "/api/admin/ads", "", adAdvertiser); w.Code != http.StatusForbidden {
		t.Fatalf("member reads the queue = %d", w.Code)
	}
	if w := f.do(http.MethodPut, "/api/admin/settings/ads", `{}`, &domain.Member{ID: "m-c", Role: domain.RoleCurator}); w.Code != http.StatusForbidden {
		t.Fatalf("curator saves settings = %d", w.Code)
	}
	if w := f.do(http.MethodPost, "/api/admin/ads/x/refund", `{}`, &domain.Member{ID: "m-c", Role: domain.RoleCurator}); w.Code != http.StatusForbidden {
		t.Fatalf("curator refunds = %d", w.Code)
	}
	if w := f.do(http.MethodGet, "/api/admin/settings/ads", "", &domain.Member{ID: "m-c", Role: domain.RoleCurator}); w.Code != http.StatusOK {
		t.Fatalf("curator reads settings = %d", w.Code)
	}
}

// The whole advertiser path over HTTP: submit, approve, checkout, then the
// webhook settles the oguaa-adv- charge and the redirect confirm reads it.
func TestAdPurchaseOverHTTP(t *testing.T) {
	f := newAdHTTPFixture(t, &adHTTPPay{paid: map[string]int64{}})
	w := f.do(http.MethodPost, "/api/me/ads", adSubmitBody, adAdvertiser)
	if w.Code != http.StatusCreated {
		t.Fatalf("submit = %d %s", w.Code, w.Body)
	}
	id, _ := decodeMap(t, w)["id"].(string)
	if strings.Contains(w.Body.String(), "memberId") || strings.Contains(w.Body.String(), "ama@example.test") {
		t.Fatalf("advertiser shape leaks private fields: %s", w.Body)
	}
	w = f.do(http.MethodPost, "/api/admin/ads/"+id+"/approve", `{"checklist":{"sponsorIdentified":true}}`, adSteward)
	if w.Code != http.StatusBadRequest || decodeMap(t, w)["error"] != service.AdErrChecklistIncomplete {
		t.Fatalf("partial checklist = %d %s", w.Code, w.Body)
	}
	checklist := `{"checklist":{"sponsorIdentified":true,"notDisguisedAsNews":true,"noFalseOrUnsubstantiatedClaims":true,"noHateOrSectionalAppeal":true,"noVoterSuppressionOrResultClaims":true,"categoryLicenceChecked":true,"landingPageMatches":true,"ghsPricingOnly":true,"aiMediaDisclosed":true,"noPartySymbolsIfDistrictAssembly":true}}`
	if w = f.do(http.MethodPost, "/api/admin/ads/"+id+"/approve", checklist, adSteward); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"checklist"`) {
		t.Fatalf("approve = %d %s", w.Code, w.Body)
	}
	w = f.do(http.MethodPost, "/api/me/ads/"+id+"/checkout", "", adAdvertiser)
	if w.Code != http.StatusOK {
		t.Fatalf("checkout = %d %s", w.Code, w.Body)
	}
	ref, _ := decodeMap(t, w)["reference"].(string)
	if !strings.HasPrefix(ref, "oguaa-adv-") {
		t.Fatalf("reference = %q", ref)
	}
	if w = f.do(http.MethodGet, "/api/ads/confirm?reference="+ref, "", adAdvertiser); w.Code != http.StatusConflict || decodeMap(t, w)["error"] != "payment_pending" {
		t.Fatalf("pending confirm = %d %s", w.Code, w.Body)
	}
	f.pay.paid[ref] = f.ads.Peek(id).Price.TotalPesewas
	hook := httptest.NewRecorder()
	f.h.PaystackWebhook(hook, signedCharge(ref))
	if hook.Code != http.StatusOK || f.ads.Peek(id).Status != domain.AdStatusScheduled {
		t.Fatalf("webhook = %d, status %q", hook.Code, f.ads.Peek(id).Status)
	}
	w = f.do(http.MethodGet, "/api/ads/confirm?reference="+ref, "", adAdvertiser)
	campaign, _ := decodeMap(t, w)["campaign"].(map[string]any)
	if w.Code != http.StatusOK || campaign["status"] != domain.AdStatusScheduled {
		t.Fatalf("confirm = %d %s", w.Code, w.Body)
	}
	if w = f.do(http.MethodGet, "/api/ads/confirm?reference="+ref, "", &domain.Member{ID: "m-other"}); w.Code != http.StatusNotFound {
		t.Fatalf("someone else's confirm = %d", w.Code)
	}
	if w = f.do(http.MethodGet, "/api/me/ads/"+id, "", adAdvertiser); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"status":"scheduled"`) {
		t.Fatalf("my ad = %d %s", w.Code, w.Body)
	}
	if w = f.do(http.MethodPost, "/api/me/ads/"+id+"/cancel", `{"reason":"Plans changed"}`, adAdvertiser); w.Code != http.StatusOK {
		t.Fatalf("cancel = %d %s", w.Code, w.Body)
	}
	if w = f.do(http.MethodPost, "/api/me/ads/"+id+"/cancel", `{}`, adAdvertiser); w.Code != http.StatusConflict {
		t.Fatalf("cancel twice = %d %s", w.Code, w.Body)
	}
}

// Spec §4.3: checkout and confirm answer 503 payments_unavailable when
// payments are switched off.
func TestAdPaymentsUnavailable(t *testing.T) {
	f := newAdHTTPFixture(t, service.DisabledPaystack{})
	w := f.do(http.MethodPost, "/api/me/ads/ad-1/checkout", "", adAdvertiser)
	if w.Code != http.StatusServiceUnavailable || decodeMap(t, w)["error"] != "payments_unavailable" {
		t.Fatalf("checkout = %d %s", w.Code, w.Body)
	}
	f.ads.Put(domain.AdCampaign{ID: "ad-1", MemberID: adAdvertiser.ID, Reference: "oguaa-adv-ad-1-1", Status: domain.AdStatusApproved, PaymentStatus: domain.AdPaymentPending})
	w = f.do(http.MethodGet, "/api/ads/confirm?reference=oguaa-adv-ad-1-1", "", adAdvertiser)
	if w.Code != http.StatusServiceUnavailable || decodeMap(t, w)["error"] != "payments_unavailable" {
		t.Fatalf("confirm = %d %s", w.Code, w.Body)
	}
}

// A legacy adv- reference no record holds is acknowledged, not retried.
func TestPaystackWebhookAdsReferences(t *testing.T) {
	f := newAdHTTPFixture(t, &adHTTPPay{paid: map[string]int64{"adv-unknown": 100, "oguaa-adv-unknown": 100}})
	for _, ref := range []string{"adv-unknown", "oguaa-adv-unknown"} {
		w := httptest.NewRecorder()
		f.h.PaystackWebhook(w, signedCharge(ref))
		if w.Code != http.StatusOK {
			t.Errorf("%s: status = %d", ref, w.Code)
		}
	}
}

// Ad documents open through the ad or sponsor they belong to, so moderators
// (who review commercial ads) reach these documents and nothing else.
func TestAdDocumentRoutes(t *testing.T) {
	f := newAdHTTPFixture(t, &adHTTPPay{paid: map[string]int64{}})
	moderator := &domain.Member{ID: "m-mod", DisplayName: "Moderator", Role: domain.RoleModerator}
	f.ads.Put(domain.AdCampaign{ID: "ad-doc", SponsorID: "asp-1", Status: domain.AdStatusPendingReview})
	if w := f.do(http.MethodGet, "/api/admin/ads/ad-doc/documents/approval", "", adAdvertiser); w.Code != http.StatusForbidden {
		t.Fatalf("a member opens a document = %d", w.Code)
	}
	if w := f.do(http.MethodGet, "/api/admin/ads/ad-doc/documents/approval", "", moderator); w.Code != http.StatusNotFound {
		t.Fatalf("no letter on file = %d %s", w.Code, w.Body)
	}
	if w := f.do(http.MethodGet, "/api/admin/ad-sponsors/asp-1/documents/passport", "", moderator); w.Code != http.StatusNotFound {
		t.Fatalf("unknown document kind = %d %s", w.Code, w.Body)
	}
	if w := f.do(http.MethodPost, "/api/admin/ads/ad-doc/refunds/r-1", `{"status":"processed","reason":"Seen on Paystack"}`, moderator); w.Code != http.StatusForbidden {
		t.Fatalf("a moderator resolves a refund = %d", w.Code)
	}
	if w := f.do(http.MethodPost, "/api/admin/ads/ad-doc/refunds/r-1", `{"status":"processed","reason":"Seen on Paystack"}`, adSteward); w.Code != http.StatusNotFound {
		t.Fatalf("no such refund = %d %s", w.Code, w.Body)
	}
}
