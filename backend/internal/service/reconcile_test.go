package service

import (
	"context"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// refPaystack reports a scripted verdict per reference (in progress when
// unscripted) and counts verifies.
type refPaystack struct {
	commercePaystackFake
	checks   map[string]PaymentCheck
	errs     map[string]error
	verified []string
}

func (p *refPaystack) Verify(_ context.Context, ref string) (PaymentCheck, error) {
	p.verified = append(p.verified, ref)
	if err := p.errs[ref]; err != nil {
		return PaymentCheck{}, err
	}
	if c, ok := p.checks[ref]; ok {
		return c, nil
	}
	return PaymentCheck{Outcome: PaymentInProgress}, nil
}

func paidCheck(ref string, amount int64) PaymentCheck {
	return PaymentCheck{Outcome: PaymentPaid, AmountPesewas: amount, Currency: "GHS", Reference: ref}
}

// C5: the sweep re-verifies pending records between 2 minutes and 48 hours
// old through the confirm paths, leaves fresh ones to the payer, and closes
// records still unpaid after 48 hours as abandoned.
func TestPaymentReconciler(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	ago := func(d time.Duration) string { return now.Add(-d).Format(time.RFC3339) }
	ps := &refPaystack{
		checks: map[string]PaymentCheck{
			"oguaa-plg-paid":    paidCheck("oguaa-plg-paid", 5_00),
			"oguaa-plg-failed":  {Outcome: PaymentFailed},
			"oguaa-plg-latepay": paidCheck("oguaa-plg-latepay", 5_00),
			"oguaa-ord-old":     {Outcome: PaymentFailed},
		},
		errs: map[string]error{"oguaa-plg-down": ErrPaymentCheckUnavailable},
	}
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "pr-1", Slug: "library-corner", Type: domain.TypeProject, OwnerID: "m-aidoo", Status: domain.StatusApproved, Title: "Library corner", Details: map[string]any{}},
		commerceShop(),
	}}
	pledge := func(ref, created string) domain.Pledge {
		return domain.Pledge{ID: "p" + ref, Reference: ref, ProjectID: "pr-1", ProjectSlug: "library-corner", AmountPesewas: 5_00, Status: domain.PledgePending, CreatedAt: created}
	}
	pledges := &fakePledges{rows: []domain.Pledge{
		pledge("oguaa-plg-paid", ago(10*time.Minute)),
		pledge("oguaa-plg-processing", ago(30*time.Minute)),
		pledge("oguaa-plg-failed", ago(time.Hour)),
		pledge("oguaa-plg-down", ago(2*time.Hour)),
		pledge("oguaa-plg-fresh", ago(time.Minute)),
		pledge("oguaa-plg-stale", ago(50*time.Hour)),
		pledge("oguaa-plg-latepay", ago(60*time.Hour)),
	}}
	orders := &orderFake{rows: []domain.CommerceOrder{{ID: "o1", Reference: "oguaa-ord-old", ListingID: "b1", AmountPesewas: 10_000, Status: domain.OrderPending, CreatedAt: ago(49 * time.Hour)}}}
	payments := NewPaymentsService(listings, pledges, stubNotifs{}, stubMembers{}, &fakePlans{}, ps, "http://portal.test", 5)
	commerce := NewCommerceService(listings, commerceVerifiedShop(), orders, &couponFake{}, nil, ps, "", 5)
	r := NewPaymentReconciler(payments, nil, nil, nil, commerce, nil)
	r.now = func() time.Time { return now }

	got := r.Run(context.Background())

	status := map[string]domain.Pledge{}
	for _, p := range pledges.rows {
		status[p.Reference] = p
	}
	want := map[string]string{
		"oguaa-plg-paid": domain.PledgeSuccess, "oguaa-plg-processing": domain.PledgePending, "oguaa-plg-failed": domain.PledgeFailed,
		"oguaa-plg-down": domain.PledgePending, "oguaa-plg-fresh": domain.PledgePending, "oguaa-plg-stale": domain.PledgeFailed,
		"oguaa-plg-latepay": domain.PledgeSuccess,
	}
	for ref, w := range want {
		if status[ref].Status != w {
			t.Errorf("%s: status %q, want %q", ref, status[ref].Status, w)
		}
	}
	if status["oguaa-plg-stale"].FailureReason != AbandonedReason || status["oguaa-plg-failed"].FailureReason != "" {
		t.Errorf("reasons: stale %q failed %q", status["oguaa-plg-stale"].FailureReason, status["oguaa-plg-failed"].FailureReason)
	}
	for _, ref := range ps.verified {
		if ref == "oguaa-plg-fresh" {
			t.Error("a checkout under 2 minutes old was re-verified")
		}
	}
	if c := got["pledges"]; c.Checked != 6 || c.Settled != 2 || c.Pending != 1 || c.Failed != 1 || c.Errors != 1 || c.Expired != 1 {
		t.Errorf("pledge counts = %+v", c)
	}
	if orders.rows[0].Status != domain.OrderCancelled || orders.rows[0].CancelReason != AbandonedReason || got["orders"].Expired != 1 {
		t.Errorf("stale order = %+v counts %+v", orders.rows[0], got["orders"])
	}
}
