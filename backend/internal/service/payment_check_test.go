package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// checkPaystack reports a fixed verdict (or error) for every reference.
type checkPaystack struct {
	check PaymentCheck
	err   error
	sim   bool
}

func (p *checkPaystack) Simulated() bool { return p.sim }
func (p *checkPaystack) Initialize(_ context.Context, _ string, _ int64, _, ref, cb string) (string, string, error) {
	return "https://pay.example/" + ref + "?cb=" + cb, "ACCESS_" + ref, nil
}
func (p *checkPaystack) Verify(_ context.Context, ref string) (PaymentCheck, error) {
	c := p.check
	if c.Reference == "*" {
		c.Reference = ref
	}
	return c, p.err
}

// verifyAgainst runs the live client's Verify against a scripted Paystack.
func verifyAgainst(t *testing.T, status int, body string) (PaymentCheck, error) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sk_test_x" {
			t.Errorf("Authorization = %q", r.Header.Get("Authorization"))
		}
		w.WriteHeader(status)
		_, _ = fmt.Fprint(w, body)
	}))
	defer srv.Close()
	p := NewPaystackClient("sk_test_x")
	p.base = srv.URL
	return p.Verify(context.Background(), "plg-x-1")
}

// P03/P20 (C1): Paystack's statuses map onto paid / in progress / failed,
// and API errors are transient, never "not paid".
func TestPaystackVerify_outcomes(t *testing.T) {
	cases := []struct {
		name      string
		status    int
		body      string
		want      PaymentOutcome
		transient bool
	}{
		{"success", 200, `{"status":true,"data":{"status":"success","amount":500,"currency":"GHS","reference":"plg-x-1"}}`, PaymentPaid, false},
		{"momo prompt open", 200, `{"status":true,"data":{"status":"ongoing","amount":500,"currency":"GHS","reference":"plg-x-1"}}`, PaymentInProgress, false},
		{"pending", 200, `{"status":true,"data":{"status":"pending"}}`, PaymentInProgress, false},
		{"processing", 200, `{"status":true,"data":{"status":"processing"}}`, PaymentInProgress, false},
		{"queued", 200, `{"status":true,"data":{"status":"queued"}}`, PaymentInProgress, false},
		{"failed", 200, `{"status":true,"data":{"status":"failed"}}`, PaymentFailed, false},
		{"abandoned", 200, `{"status":true,"data":{"status":"abandoned"}}`, PaymentFailed, false},
		{"reversed", 200, `{"status":true,"data":{"status":"reversed"}}`, PaymentFailed, false},
		{"unknown reference", 400, `{"status":false,"message":"Transaction reference not found","code":"transaction_not_found"}`, PaymentFailed, false},
		{"rate limited", 429, `{"status":false,"message":"Too many requests"}`, 0, true},
		{"server error", 500, `{"status":false,"message":"Internal error"}`, 0, true},
		{"bad key", 401, `{"status":false,"message":"Invalid key"}`, 0, true},
		{"status false on 200", 200, `{"status":false,"message":"Something went wrong"}`, 0, true},
		{"not json", 502, `<html>bad gateway</html>`, 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := verifyAgainst(t, tc.status, tc.body)
			if tc.transient {
				if !errors.Is(err, ErrPaymentCheckUnavailable) {
					t.Fatalf("err = %v, want ErrPaymentCheckUnavailable", err)
				}
				return
			}
			if err != nil || got.Outcome != tc.want {
				t.Fatalf("Verify = %+v, %v; want outcome %v", got, err, tc.want)
			}
		})
	}
}

func TestPaystackVerify_readsCurrencyAndReference(t *testing.T) {
	got, err := verifyAgainst(t, 200, `{"status":true,"data":{"status":"success","amount":500,"currency":"NGN","reference":"plg-x-1"}}`)
	if err != nil || got.Currency != "NGN" || got.Reference != "plg-x-1" || got.AmountPesewas != 500 {
		t.Fatalf("Verify = %+v, %v", got, err)
	}
}

// P04/P21: a live charge must be exactly the amount due, in GHS, on this
// reference; unknowns pass only in the labelled simulation.
func TestChargeVerdict(t *testing.T) {
	paid := func(amount int64, currency, ref string) PaymentCheck {
		return PaymentCheck{Outcome: PaymentPaid, AmountPesewas: amount, Currency: currency, Reference: ref}
	}
	cases := []struct {
		name  string
		check PaymentCheck
		sim   bool
		want  error
	}{
		{"exact", paid(500, "GHS", "r"), false, nil},
		{"in progress", PaymentCheck{Outcome: PaymentInProgress}, false, ErrPaymentPending},
		{"failed", PaymentCheck{Outcome: PaymentFailed}, false, ErrPaymentNotCompleted},
		{"short", paid(400, "GHS", "r"), false, ErrPaymentMismatch},
		{"over", paid(600, "GHS", "r"), false, ErrPaymentMismatch},
		{"unknown amount live", paid(0, "GHS", "r"), false, ErrPaymentMismatch},
		{"unknown amount simulated", paid(0, "", ""), true, nil},
		{"other currency", paid(500, "NGN", "r"), false, ErrPaymentMismatch},
		{"no currency live", paid(500, "", "r"), false, ErrPaymentMismatch},
		{"other reference", paid(500, "GHS", "other"), false, ErrPaymentMismatch},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := chargeVerdict(tc.check, "r", 500, tc.sim)
			if !errors.Is(err, tc.want) || (tc.want == nil && err != nil) {
				t.Fatalf("verdict = %v, want %v", err, tc.want)
			}
		})
	}
	if !errors.Is(ErrPaymentMismatch, ErrPaymentNotCompleted) || !SettlementFinal(ErrPaymentMismatch) {
		t.Fatal("a mismatched charge must be a settled outcome")
	}
	if SettlementFinal(ErrPaymentPending) || SettlementFinal(fmt.Errorf("%w: 503", ErrPaymentCheckUnavailable)) {
		t.Fatal("pending and an unreachable Paystack must be retried, not settled")
	}
}

// pledgeWith starts a GH₵5 pledge against a scripted Paystack.
func pledgeWith(t *testing.T, ps PaystackClient) (*PaymentsService, *fakePledges, string) {
	t.Helper()
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "pr-1", Slug: "library-corner", Type: domain.TypeProject, OwnerID: "m-aidoo", Status: domain.StatusApproved, Title: "Library corner", Details: map[string]any{}},
	}}
	pledges := &fakePledges{}
	svc := NewPaymentsService(listings, pledges, stubNotifs{}, stubMembers{}, &fakePlans{}, ps, "http://portal.test", 5)
	_, _, ref, err := svc.StartPledge(context.Background(), "library-corner", "m-1", "ama@oguaa.test", 5_00)
	if err != nil {
		t.Fatal(err)
	}
	return svc, pledges, ref
}

// C1: a charge Paystack is still processing leaves the pledge pending; a
// transient Paystack error changes nothing; only a final failure fails it.
func TestConfirmPledge_C1Outcomes(t *testing.T) {
	cases := []struct {
		name       string
		ps         *checkPaystack
		wantErr    error
		wantStatus string
	}{
		{"still processing", &checkPaystack{check: PaymentCheck{Outcome: PaymentInProgress}}, ErrPaymentPending, domain.PledgePending},
		{"paystack down", &checkPaystack{err: fmt.Errorf("%w: HTTP 503", ErrPaymentCheckUnavailable)}, ErrPaymentCheckUnavailable, domain.PledgePending},
		{"abandoned", &checkPaystack{check: PaymentCheck{Outcome: PaymentFailed}}, ErrPaymentNotCompleted, domain.PledgeFailed},
		{"wrong currency", &checkPaystack{check: PaymentCheck{Outcome: PaymentPaid, AmountPesewas: 5_00, Currency: "USD", Reference: "*"}}, ErrPaymentMismatch, domain.PledgeFailed},
		{"amount unknown live", &checkPaystack{check: PaymentCheck{Outcome: PaymentPaid, Currency: "GHS", Reference: "*"}}, ErrPaymentMismatch, domain.PledgeFailed},
		{"paid", &checkPaystack{check: PaymentCheck{Outcome: PaymentPaid, AmountPesewas: 5_00, Currency: "GHS", Reference: "*"}}, nil, domain.PledgeSuccess},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, pledges, ref := pledgeWith(t, tc.ps)
			_, err := svc.ConfirmPledge(context.Background(), ref)
			if !errors.Is(err, tc.wantErr) || (tc.wantErr == nil && err != nil) {
				t.Fatalf("ConfirmPledge err = %v, want %v", err, tc.wantErr)
			}
			if got := pledges.rows[0].Status; got != tc.wantStatus {
				t.Fatalf("status = %q, want %q", got, tc.wantStatus)
			}
		})
	}
}

// A pending ticket, subscription and promotion behave the same way.
func TestConfirm_pendingLeavesEveryFlowPending(t *testing.T) {
	ctx := context.Background()
	pending := &checkPaystack{check: PaymentCheck{Outcome: PaymentInProgress}}

	tsvc, tickets := ticketsFixture(true, 5_000)
	tsvc.paystack = pending
	_, _, tref, err := tsvc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "Grand Durbar stand", 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tsvc.ConfirmTicket(ctx, tref); !errors.Is(err, ErrPaymentPending) || tickets.rows[0].Status != domain.PledgePending {
		t.Fatalf("ticket: err=%v status=%q, want pending", err, tickets.rows[0].Status)
	}

	ssvc, _, subs := subsFixture(true, 5_000)
	ssvc.paystack = pending
	subs.rows = append(subs.rows, domain.Subscription{Reference: "sub-x-1", AmountPesewas: 5_000, Status: domain.PledgePending})
	if _, err := ssvc.ConfirmSubscription(ctx, "sub-x-1"); !errors.Is(err, ErrPaymentPending) || subs.rows[0].Status != domain.PledgePending {
		t.Fatalf("subscription: err=%v status=%q, want pending", err, subs.rows[0].Status)
	}
}
