package http

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

const webhookSecret = "sk_test_webhook"

// webhookPaystack verifies every charge as successful unless verifyErr is set
// (Paystack or the network being unreachable — a transient failure).
type webhookPaystack struct{ verifyErr error }

// webhookCharged is what each fixture record's checkout charged.
var webhookCharged = map[string]int64{"pro-1": 7_000, "plg-library-corner-1": 10_000}

func (webhookPaystack) Simulated() bool { return false }
func (webhookPaystack) Initialize(context.Context, string, int64, string, string, string) (string, string, error) {
	return "https://pay.example/checkout", "ACCESS", nil
}
func (p webhookPaystack) Verify(_ context.Context, ref string) (service.PaymentCheck, error) {
	if p.verifyErr != nil {
		return service.PaymentCheck{}, p.verifyErr
	}
	return service.PaymentCheck{Outcome: service.PaymentPaid, AmountPesewas: webhookCharged[ref], Currency: "GHS", Reference: ref}, nil
}

// webhookListings is the handler tests' listing fake with lookups by id.
type webhookListings struct{ submitListings }

func (l *webhookListings) GetByID(_ context.Context, id string) (*domain.Listing, error) {
	for i := range l.inserted {
		if l.inserted[i].ID == id {
			return &l.inserted[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "listing"}
}

// webhookPromos is an in-memory PromotionRepository with the real repo's
// conditional-settlement semantics.
type webhookPromos struct{ rows []domain.Promotion }

func (f *webhookPromos) Insert(_ context.Context, p domain.Promotion) error {
	f.rows = append(f.rows, p)
	return nil
}
func (f *webhookPromos) ByReference(_ context.Context, ref string) (*domain.Promotion, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			return &f.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "promotion"}
}
func (f *webhookPromos) MarkSuccess(_ context.Context, ref, at, _ string) (bool, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status != domain.PledgeSuccess {
			f.rows[i].Status, f.rows[i].ConfirmedAt = domain.PledgeSuccess, at
			return true, nil
		}
	}
	return false, nil
}
func (f *webhookPromos) MarkFailed(context.Context, string) error { return nil }
func (f *webhookPromos) PendingBetween(context.Context, string, string, int) ([]domain.Promotion, error) {
	return nil, nil
}
func (f *webhookPromos) ExpirePending(context.Context, string, string, string) (bool, error) {
	return false, nil
}
func (f *webhookPromos) MarkGranted(context.Context, string) error       { return nil }
func (f *webhookPromos) All(context.Context) ([]domain.Promotion, error) { return f.rows, nil }
func (f *webhookPromos) ByMember(context.Context, string) ([]domain.Promotion, error) {
	return f.rows, nil
}

// webhookPledges is an in-memory PledgeRepository with the real repo's
// conditional-settlement semantics.
type webhookPledges struct{ rows []domain.Pledge }

func (f *webhookPledges) Insert(_ context.Context, p domain.Pledge) error {
	f.rows = append(f.rows, p)
	return nil
}
func (f *webhookPledges) ByReference(_ context.Context, ref string) (*domain.Pledge, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			return &f.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "pledge"}
}
func (f *webhookPledges) MarkSuccess(_ context.Context, ref, at string, fee, net int64) (bool, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status != domain.PledgeSuccess {
			f.rows[i].Status, f.rows[i].ConfirmedAt = domain.PledgeSuccess, at
			f.rows[i].FeePesewas, f.rows[i].NetPesewas = fee, net
			return true, nil
		}
	}
	return false, nil
}
func (f *webhookPledges) MarkFailed(context.Context, string) error { return nil }
func (f *webhookPledges) PendingBetween(context.Context, string, string, int) ([]domain.Pledge, error) {
	return nil, nil
}
func (f *webhookPledges) ExpirePending(context.Context, string, string, string) (bool, error) {
	return false, nil
}
func (f *webhookPledges) MarkGranted(context.Context, string) error { return nil }
func (f *webhookPledges) ByMember(context.Context, string) ([]domain.Pledge, error) {
	return f.rows, nil
}
func (f *webhookPledges) ByProject(context.Context, string) ([]domain.Pledge, error) {
	return f.rows, nil
}
func (f *webhookPledges) All(context.Context) ([]domain.Pledge, error) { return f.rows, nil }

type webhookFixture struct {
	h       *Handler
	promos  *webhookPromos
	pledges *webhookPledges
}

func newWebhookFixture(ps service.PaystackClient) webhookFixture {
	listings := &webhookListings{submitListings{inserted: []domain.Listing{
		{ID: "b-1", Slug: "castle-view", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Title: "Castle View", Details: map[string]any{}},
		{ID: "pr-1", Slug: "library-corner", Type: domain.TypeProject, OwnerID: "m-aidoo", Status: domain.StatusApproved, Title: "Library corner", Details: map[string]any{}},
	}}}
	promos := &webhookPromos{rows: []domain.Promotion{
		{ID: "ppro-1", Reference: "pro-1", ListingID: "b-1", Days: 7, AmountPesewas: 7_000, Status: domain.PledgePending},
	}}
	pledges := &webhookPledges{rows: []domain.Pledge{
		{ID: "pplg-1", Reference: "plg-library-corner-1", ProjectID: "pr-1", AmountPesewas: 10_000, Status: domain.PledgePending},
	}}
	h := NewHandler(HandlerDeps{
		Promotions:     service.NewPromotionsService(listings, promos, ps, "http://portal.test"),
		Payments:       service.NewPaymentsService(listings, pledges, nil, nil, nil, ps, "http://portal.test", 5),
		PaystackSecret: webhookSecret,
		Log:            slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	return webhookFixture{h: h, promos: promos, pledges: pledges}
}

// signedCharge builds a charge.success webhook for ref, signed like Paystack.
func signedCharge(ref string) *http.Request {
	body := []byte(`{"event":"charge.success","data":{"reference":"` + ref + `"}}`)
	mac := hmac.New(sha512.New, []byte(webhookSecret))
	mac.Write(body)
	req := httptest.NewRequest(http.MethodPost, "/api/payments/paystack/webhook", bytes.NewReader(body))
	req.Header.Set("x-paystack-signature", hex.EncodeToString(mac.Sum(nil)))
	return req
}

// A promotion paid through the hosted page is settled by the webhook alone
// (previously every non-order reference was sent to the pledge ledger).
func TestPaystackWebhook_settlesEveryFlowByPrefix(t *testing.T) {
	f := newWebhookFixture(webhookPaystack{})

	w := httptest.NewRecorder()
	f.h.PaystackWebhook(w, signedCharge("pro-1"))
	if w.Code != http.StatusOK {
		t.Fatalf("promotion webhook status = %d, want 200", w.Code)
	}
	if f.promos.rows[0].Status != domain.PledgeSuccess {
		t.Errorf("promotion status = %q, want success", f.promos.rows[0].Status)
	}

	w = httptest.NewRecorder()
	f.h.PaystackWebhook(w, signedCharge("plg-library-corner-1"))
	if w.Code != http.StatusOK || f.pledges.rows[0].Status != domain.PledgeSuccess {
		t.Errorf("pledge webhook = %d / %q, want 200 / success", w.Code, f.pledges.rows[0].Status)
	}
}

// A transient failure must not be acknowledged, or Paystack never retries and
// the payer's charge is never applied.
func TestPaystackWebhook_transientFailureAsksPaystackToRetry(t *testing.T) {
	f := newWebhookFixture(webhookPaystack{verifyErr: errors.New("paystack verify failed: connection reset")})

	w := httptest.NewRecorder()
	f.h.PaystackWebhook(w, signedCharge("pro-1"))
	if w.Code < 500 {
		t.Fatalf("status = %d, want a 5xx so Paystack retries", w.Code)
	}
	if f.promos.rows[0].Status != domain.PledgePending {
		t.Errorf("promotion status = %q, want it still pending", f.promos.rows[0].Status)
	}
}

// Outcomes a retry cannot change are acknowledged so Paystack stops retrying.
func TestPaystackWebhook_acksFinalOutcomes(t *testing.T) {
	f := newWebhookFixture(webhookPaystack{})
	for _, ref := range []string{"pro-unknown", "tkt-no-ticket-service-here", "xyz-not-ours"} {
		w := httptest.NewRecorder()
		f.h.PaystackWebhook(w, signedCharge(ref))
		if w.Code != http.StatusOK {
			t.Errorf("%s: status = %d, want 200", ref, w.Code)
		}
	}
}

func TestPaystackWebhook_rejectsBadSignature(t *testing.T) {
	f := newWebhookFixture(webhookPaystack{})
	req := signedCharge("pro-1")
	req.Header.Set("x-paystack-signature", "forged")
	w := httptest.NewRecorder()
	f.h.PaystackWebhook(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", w.Code)
	}
	if f.promos.rows[0].Status != domain.PledgePending {
		t.Error("a forged webhook must not settle anything")
	}
}

// pendingPaystack reports every charge as still processing (a Mobile Money
// prompt the payer has not approved yet).
type pendingPaystack struct{ webhookPaystack }

func (pendingPaystack) Verify(context.Context, string) (service.PaymentCheck, error) {
	return service.PaymentCheck{Outcome: service.PaymentInProgress}, nil
}

// C1: confirm endpoints answer 409 payment_pending while Paystack is still
// processing, and 503 payment_check_unavailable when Paystack can't be asked;
// the record stays pending either way.
func TestConfirmPledge_C1Responses(t *testing.T) {
	cases := []struct {
		name   string
		ps     service.PaystackClient
		status int
		code   string
	}{
		{"pending", pendingPaystack{}, http.StatusConflict, `"error":"payment_pending"`},
		{"paystack down", webhookPaystack{verifyErr: fmt.Errorf("%w: HTTP 429", service.ErrPaymentCheckUnavailable)}, http.StatusServiceUnavailable, `"error":"payment_check_unavailable"`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newWebhookFixture(tc.ps)
			w := httptest.NewRecorder()
			f.h.ConfirmPledge(w, httptest.NewRequest(http.MethodGet, "/api/pledges/confirm?reference=plg-library-corner-1", nil))
			if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.code) || !strings.Contains(w.Body.String(), `"message"`) {
				t.Fatalf("status/body = %d %s, want %d %s", w.Code, w.Body.String(), tc.status, tc.code)
			}
			if f.pledges.rows[0].Status != domain.PledgePending {
				t.Fatalf("pledge status = %q, want pending", f.pledges.rows[0].Status)
			}
		})
	}
}

// A charge.success whose verify still says "processing" is retried, not acked.
func TestPaystackWebhook_pendingVerifyAsksPaystackToRetry(t *testing.T) {
	f := newWebhookFixture(pendingPaystack{})
	w := httptest.NewRecorder()
	f.h.PaystackWebhook(w, signedCharge("pro-1"))
	if w.Code < 500 || f.promos.rows[0].Status != domain.PledgePending {
		t.Fatalf("status = %d promo = %q, want a 5xx and the promotion still pending", w.Code, f.promos.rows[0].Status)
	}
}

// C2: the bank list refuses unknown kinds and answers payments_unavailable
// when no Paystack client can list banks.
func TestPaymentBanks(t *testing.T) {
	h := NewHandler(HandlerDeps{Commerce: service.NewCommerceService(nil, nil, nil, nil, nil, service.DisabledPaystack{}, "", 5)})
	w := httptest.NewRecorder()
	h.PaymentBanks(w, httptest.NewRequest(http.MethodGet, "/api/payments/banks?type=crypto", nil))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("bad type: %d", w.Code)
	}
	w = httptest.NewRecorder()
	h.PaymentBanks(w, httptest.NewRequest(http.MethodGet, "/api/payments/banks?type=mobile_money", nil))
	if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "payments_unavailable") {
		t.Fatalf("disabled: %d %s", w.Code, w.Body.String())
	}
	sim := NewHandler(HandlerDeps{Commerce: service.NewCommerceService(nil, nil, nil, nil, nil, service.SimulatedPaystack{}, "", 5)})
	w = httptest.NewRecorder()
	sim.PaymentBanks(w, httptest.NewRequest(http.MethodGet, "/api/payments/banks?type=mobile_money", nil))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"type":"mobile_money"`) || strings.Contains(w.Body.String(), `"type":"bank"`) {
		t.Fatalf("simulated: %d %s", w.Code, w.Body.String())
	}
}

// signedBody signs an arbitrary webhook body like Paystack does.
func signedBody(body string) *http.Request {
	mac := hmac.New(sha512.New, []byte(webhookSecret))
	mac.Write([]byte(body))
	req := httptest.NewRequest(http.MethodPost, "/api/payments/paystack/webhook", strings.NewReader(body))
	req.Header.Set("x-paystack-signature", hex.EncodeToString(mac.Sum(nil)))
	return req
}

// C5: on the shared Paystack integration only Oguaa's charges are processed;
// another app's charge is acknowledged (never retried) and left alone.
func TestPaystackWebhook_ignoresOtherAppsCharges(t *testing.T) {
	f := newWebhookFixture(webhookPaystack{})
	for _, body := range []string{
		`{"event":"charge.success","data":{"reference":"pro-1","metadata":{"app":"other-shop"}}}`,
		`{"event":"charge.success","data":{"reference":"pro-1","metadata":"{\"app\":\"other-shop\"}"}}`,
		`{"event":"charge.success","data":{"reference":"T583920113","metadata":{"app":"oguaa"}}}`,
		`{"event":"charge.success","data":{"reference":"other-app-order-77"}}`,
	} {
		w := httptest.NewRecorder()
		f.h.PaystackWebhook(w, signedBody(body))
		if w.Code != http.StatusOK || f.promos.rows[0].Status != domain.PledgePending {
			t.Fatalf("%s: status %d, promotion %q; want 200 and nothing settled", body, w.Code, f.promos.rows[0].Status)
		}
	}
	// Oguaa's own tag (object or stringified) is processed.
	w := httptest.NewRecorder()
	f.h.PaystackWebhook(w, signedBody(`{"event":"charge.success","data":{"reference":"pro-1","metadata":"{\"app\":\"oguaa\",\"flow\":\"pro\"}"}}`))
	if w.Code != http.StatusOK || f.promos.rows[0].Status != domain.PledgeSuccess {
		t.Fatalf("oguaa charge: %d %q", w.Code, f.promos.rows[0].Status)
	}
}

// C5: namespaced references settle through their flow.
func TestPaystackWebhook_settlesNamespacedReference(t *testing.T) {
	f := newWebhookFixture(webhookPaystack{})
	f.promos.rows = append(f.promos.rows, domain.Promotion{ID: "poguaa-pro-2", Reference: "oguaa-pro-2", ListingID: "b-1", Days: 7, AmountPesewas: 7_000, Status: domain.PledgePending})
	webhookCharged["oguaa-pro-2"] = 7_000
	w := httptest.NewRecorder()
	f.h.PaystackWebhook(w, signedBody(`{"event":"charge.success","data":{"reference":"oguaa-pro-2","metadata":{"app":"oguaa","flow":"pro"}}}`))
	if w.Code != http.StatusOK || f.promos.rows[1].Status != domain.PledgeSuccess {
		t.Fatalf("namespaced: %d %q", w.Code, f.promos.rows[1].Status)
	}
}
