package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// P35: an escrow charge that did not complete is a settled outcome (the
// webhook acks it instead of retrying forever); one still processing is not.
func TestConfirmFunding_unpaidOutcomes(t *testing.T) {
	ctx := context.Background()
	ps := &countingPaystack{ok: false, amt: 50_000}
	svc, jobs, _, j := quotedJob(t, ps)
	_, _, ref, err := svc.AcceptAndFund(ctx, j.ID, "m-client", "ama@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ConfirmFunding(ctx, ref); !errors.Is(err, ErrPaymentNotCompleted) || !SettlementFinal(err) {
		t.Fatalf("failed charge: err=%v, want the settled ErrPaymentNotCompleted", err)
	}
	svc.paystack = &checkPaystack{check: PaymentCheck{Outcome: PaymentInProgress}}
	if _, err := svc.ConfirmFunding(ctx, ref); !errors.Is(err, ErrPaymentPending) || SettlementFinal(err) {
		t.Fatalf("processing charge: err=%v, want the retryable ErrPaymentPending", err)
	}
	svc.paystack = &checkPaystack{check: PaymentCheck{Outcome: PaymentPaid, AmountPesewas: 40_000, Currency: "GHS", Reference: "*"}}
	var ve *domain.ValidationError
	if _, err := svc.ConfirmFunding(ctx, ref); !errors.As(err, &ve) || !SettlementFinal(err) {
		t.Fatalf("short charge: err=%v, want a settled validation error", err)
	}
	if got := jobs.m[j.ID]; got.Status != domain.JobStatusQuoted || got.Escrow.Status != domain.EscrowPending {
		t.Fatalf("job moved without a full payment: %+v", got)
	}
}

// P35: a second payment, on an earlier checkout of a job that is already
// funded, is recorded once for a staff refund instead of being dropped.
func TestConfirmFunding_recordsASecondPaymentForRefund(t *testing.T) {
	ctx := context.Background()
	ps := &countingPaystack{ok: true, amt: 50_000}
	svc, jobs, _, j := quotedJob(t, ps)
	_, _, first, err := svc.AcceptAndFund(ctx, j.ID, "m-client", "ama@example.com")
	if err != nil {
		t.Fatal(err)
	}
	legacy := jobs.m[j.ID] // force a second checkout (as for a job with no stored one)
	legacy.CheckoutURL = ""
	jobs.m[j.ID] = legacy
	_, _, second, err := svc.AcceptAndFund(ctx, j.ID, "m-client", "ama@example.com")
	if err != nil || second == first {
		t.Fatalf("second checkout: %q %v", second, err)
	}
	if got, err := svc.ConfirmFunding(ctx, second); err != nil || got.Escrow.PaymentReference != second {
		t.Fatalf("funding: %+v %v", got, err)
	}
	// Replaying the funding reference changes nothing.
	if got, err := svc.ConfirmFunding(ctx, second); err != nil || len(got.ExtraPayments) != 0 {
		t.Fatalf("replay: %+v %v", got, err)
	}
	// The client also paid the first checkout.
	got, err := svc.ConfirmFunding(ctx, first)
	if err != nil || got.Status != domain.JobStatusFunded || len(got.ExtraPayments) != 1 ||
		got.ExtraPayments[0].Reference != first || got.ExtraPayments[0].AmountPesewas != 50_000 {
		t.Fatalf("extra payment not recorded: %+v %v", got, err)
	}
	if _, err := svc.ConfirmFunding(ctx, first); err != nil || len(jobs.m[j.ID].ExtraPayments) != 1 {
		t.Fatalf("extra payment recorded twice: %+v", jobs.m[j.ID].ExtraPayments)
	}
	if queue, _ := svc.AdminDisputes(ctx); len(queue) != 1 {
		t.Fatalf("staff queue = %+v, want the job listed for its refund", queue)
	}
	if _, err := svc.ResolveDispute(ctx, j.ID, "release", "", false, domain.Member{}); err == nil {
		t.Fatal("an extra payment was released instead of refunded")
	}
	res, err := svc.ResolveDispute(ctx, j.ID, "refund", "refunded on Paystack", false, domain.Member{})
	if err != nil || res.Status != domain.JobStatusFunded || res.Escrow.Status != domain.EscrowHeld || res.ExtraPayments[0].RefundedAt == "" {
		t.Fatalf("refund of the extra payment: %+v %v", res, err)
	}
	if queue, _ := svc.AdminDisputes(ctx); len(queue) != 0 {
		t.Fatalf("staff queue after refund = %+v", queue)
	}
}
