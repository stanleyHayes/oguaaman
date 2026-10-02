package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// twoCheckouts approves a campaign and opens two checkouts: the first is
// reported failed so the second can start (as Paystack's "abandoned" does),
// but its page stays payable.
func twoCheckouts(t *testing.T, f *adFix) (id, first, second string) {
	t.Helper()
	ctx := context.Background()
	c := f.submit()
	f.approve(c.ID, curatorA)
	a, err := f.svc.Checkout(ctx, adMember, c.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	f.pay.failed[a.Reference] = true
	b, err := f.svc.Checkout(ctx, adMember, c.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	f.pay.failed[a.Reference] = false
	return c.ID, a.Reference, b.Reference
}

// Paying the older page books the campaign; the newer page stays findable,
// so paying it too is refunded as a duplicate instead of being lost.
func TestOlderCheckoutPaidFirstKeepsTheNewerOneFindable(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	id, first, second := twoCheckouts(t, f)
	total := f.ads.Peek(id).Price.TotalPesewas

	f.pay.paid[first] = total
	if _, err := f.svc.ConfirmPayment(ctx, first); err != nil {
		t.Fatal(err)
	}
	f.pay.paid[second] = total
	if _, err := f.svc.ConfirmPayment(ctx, second); err != nil {
		t.Fatalf("the newer checkout must still be found: %v", err)
	}
	got := f.ads.Peek(id)
	if got.Reference != first || got.Status != domain.AdStatusScheduled {
		t.Fatalf("booked = %s %s", got.Reference, got.Status)
	}
	if len(got.Refunds) != 1 || got.Refunds[0].Reason != domain.AdRefundDuplicateCharge || got.Refunds[0].Reference != second {
		t.Fatalf("refunds = %+v", got.Refunds)
	}
	if want := second + ":" + itoa64(total); len(f.pay.refunds) != 1 || f.pay.refunds[0] != want {
		t.Fatalf("paystack refunds = %v, want %s", f.pay.refunds, want)
	}
}

// A confirm that loses the booking race to another charge records its own
// charge as a duplicate rather than reporting success and moving on.
func TestLosingTheBookingRaceRefundsTheOtherCharge(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	id, first, second := twoCheckouts(t, f)
	stale := f.ads.Peek(id) // what the slower confirm read: approved, unpaid
	total := stale.Price.TotalPesewas
	f.pay.paid[second] = total
	if _, err := f.svc.ConfirmPayment(ctx, second); err != nil {
		t.Fatal(err)
	}
	f.pay.paid[first] = total
	if _, err := f.svc.settlePaid(ctx, &stale, first); err != nil {
		t.Fatal(err)
	}
	got := f.ads.Peek(id)
	if got.Reference != second || len(got.Refunds) != 1 || got.Refunds[0].Reference != first {
		t.Fatalf("after the lost race = %s %+v", got.Reference, got.Refunds)
	}
}

// A duplicate charge's refund has its own budget: cancelling afterwards still
// refunds the real payment in full.
func TestDuplicateRefundLeavesTheRealRefundIntact(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	id := f.booked()
	c := f.ads.Peek(id)
	paidRef, total := c.Reference, c.Price.TotalPesewas
	c.PastReferences = append(c.PastReferences, "oguaa-adv-older-page")
	f.ads.Put(c)
	f.pay.paid["oguaa-adv-older-page"] = total
	if _, err := f.svc.ConfirmPayment(ctx, "oguaa-adv-older-page"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.Cancel(ctx, adMember, id, ""); err != nil {
		t.Fatal(err)
	}
	f.svc.RunScheduler(ctx)
	got := f.ads.Peek(id)
	if got.RefundOwed != "" || len(got.Refunds) != 2 {
		t.Fatalf("refunds = %+v owed %q", got.Refunds, got.RefundOwed)
	}
	want := []string{"oguaa-adv-older-page:" + itoa64(total), paidRef + ":" + itoa64(total)}
	if len(f.pay.refunds) != 2 || f.pay.refunds[0] != want[0] || f.pay.refunds[1] != want[1] {
		t.Fatalf("paystack refunds = %v, want %v", f.pay.refunds, want)
	}
}

// Nobody pays for an ad that could only be refunded: past its dates, off
// sale, from a sponsor no longer verified, or political in a blackout.
func TestCheckoutRefusesAdsThatCannotRun(t *testing.T) {
	ctx := context.Background()
	longApproval := func(s *domain.AdSettings) { s.ApprovalValidHours = 24 * 30 }

	t.Run("dates passed", func(t *testing.T) {
		f := newAdFix(t, longApproval)
		c := f.submit()
		f.approve(c.ID, curatorA)
		f.at("2026-10-19")
		if _, err := f.svc.Checkout(ctx, adMember, c.ID, ""); adCode(err) != AdErrInvalidDates {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("placement off sale", func(t *testing.T) {
		f := newAdFix(t)
		c := f.submit()
		f.approve(c.ID, curatorA)
		set := f.svc.Settings(ctx)
		for i := range set.Placements {
			set.Placements[i].Active = set.Placements[i].Slug != domain.AdPlacementPortalFeedCard
		}
		if err := f.settings.Save(ctx, SettingsChange{Key: domain.SettingsKeyAds, Doc: &set, ExpectedVersion: set.Version, ActorName: "Steward", Reason: "feed card off"}); err != nil {
			t.Fatal(err)
		}
		if _, err := f.svc.Checkout(ctx, adMember, c.ID, ""); adCode(err) != AdErrInventoryUnavailable {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("sponsor suspended", func(t *testing.T) {
		f := newAdFix(t)
		c := f.submit()
		f.approve(c.ID, curatorA)
		sp := f.sponsors.Rows[adSponsorID]
		sp.Status = domain.AdSponsorSuspended
		f.sponsors.Rows[adSponsorID] = sp
		if _, err := f.svc.Checkout(ctx, adMember, c.ID, ""); adCode(err) != AdErrSponsorNotVerified {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("political in a blackout", func(t *testing.T) {
		f := newAdFix(t)
		f.addSponsor("asp-pol", domain.AdSponsorPolitical, domain.AdSponsorVerified)
		c := f.submit(func(in *AdSubmitInput) {
			in.SponsorID, in.Political, in.PoliticalType, in.Category = "asp-pol", true, domain.AdPoliticalIssue, ""
		})
		f.approve(c.ID, stewardStaff)
		f.addElection("elc-snap", domain.ElectionParliamentaryBy, "2026-10-04") // blackout from 3 October
		f.clock = time.Date(2026, 10, 3, 10, 0, 0, 0, time.UTC)
		if _, err := f.svc.Checkout(ctx, adMember, c.ID, ""); adCode(err) != AdErrPoliticalDisabled {
			t.Fatalf("err = %v", err)
		}
	})
}

// The sweep re-checks the pages of earlier checkouts: a payment made on one
// without a webhook or redirect still books the campaign.
func TestSweepRechecksEarlierCheckoutPages(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	id, first, _ := twoCheckouts(t, f)
	f.pay.paid[first] = f.ads.Peek(id).Price.TotalPesewas

	f.clock = adNow.Add(time.Hour)
	r := NewPaymentReconciler(nil, nil, nil, nil, nil, nil).WithAds(f.svc)
	r.now = func() time.Time { return f.clock }
	r.Run(ctx)
	if got := f.ads.Peek(id); got.PaymentStatus != domain.AdPaymentSuccess || got.Reference != first {
		t.Fatalf("after the sweep = %s %s", got.PaymentStatus, got.Reference)
	}
}

// The amount left to refund is checked in the write, so a refund prepared
// from a stale read can't take refunds past what was paid.
func TestManualRefundsCannotPassTheAmountPaid(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	id := f.booked()
	stale := f.ads.Peek(id)
	total := stale.Price.TotalPesewas
	if _, err := f.svc.ManualRefund(ctx, id, AdRefundInput{AmountPesewas: total * 6 / 10, Reason: "Partial goodwill refund"}, stewardStaff); err != nil {
		t.Fatal(err)
	}
	r := domain.AdRefund{ID: id + "-manual-late", AmountPesewas: total * 6 / 10, Reason: domain.AdRefundManual, Status: domain.AdRefundRequesting}
	if err := f.svc.sendRefund(ctx, &stale, r, "second tab"); adCode(err) != AdErrInvalidAmount {
		t.Fatalf("err = %v", err)
	}
	if len(f.pay.refunds) != 1 {
		t.Fatalf("only the first refund reaches Paystack: %v", f.pay.refunds)
	}
}

// An approval doesn't lapse under a payment still in progress: a checkout
// started before the expiry holds it for the grace hour.
func TestApprovalHeldWhilePaymentInProgress(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	c := f.submit()
	f.approve(c.ID, curatorA) // valid for 72 hours
	f.clock = adNow.Add(71*time.Hour + 30*time.Minute)
	if _, err := f.svc.Checkout(ctx, adMember, c.ID, ""); err != nil {
		t.Fatal(err)
	}
	f.clock = adNow.Add(72*time.Hour + 20*time.Minute)
	f.svc.RunScheduler(ctx)
	if got := f.ads.Peek(c.ID).Status; got != domain.AdStatusApproved {
		t.Fatalf("within the grace hour = %s", got)
	}
	f.clock = adNow.Add(73 * time.Hour)
	f.svc.RunScheduler(ctx)
	if got := f.ads.Peek(c.ID).Status; got != domain.AdStatusExpired {
		t.Fatalf("after the grace hour = %s", got)
	}
}

// A steward settles a refund that needed a person once Paystack is checked.
func TestStewardResolvesARefundThatNeededAPerson(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	id := f.booked()
	f.pay.refundErr = errors.New("timeout")
	for _, amount := range []int64{4000, 3000} {
		if _, err := f.svc.ManualRefund(ctx, id, AdRefundInput{AmountPesewas: amount, Reason: "Under-delivery goodwill"}, stewardStaff); err != nil {
			t.Fatal(err)
		}
	}
	rows := f.ads.Peek(id).Refunds
	if len(rows) != 2 || rows[0].Status != domain.AdRefundManualCheck || rows[1].Status != domain.AdRefundManualCheck {
		t.Fatalf("refunds = %+v", rows)
	}
	if _, err := f.svc.ResolveRefund(ctx, id, rows[0].ID, AdResolveRefundInput{Status: domain.AdRefundProcessed, Reason: "Seen on the dashboard"}, stewardStaff); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.ResolveRefund(ctx, id, rows[1].ID, AdResolveRefundInput{Status: domain.AdRefundFailed, Reason: "Not on the dashboard"}, stewardStaff); err != nil {
		t.Fatal(err)
	}
	got := f.ads.Peek(id)
	if got.RefundedPesewas != 4000 || got.RefundCommittedPesewas() != 4000 || got.Refunds[0].Note != "Nana Essien: Seen on the dashboard" {
		t.Fatalf("resolved = %d %d %+v", got.RefundedPesewas, got.RefundCommittedPesewas(), got.Refunds)
	}
	if _, err := f.svc.ResolveRefund(ctx, id, rows[0].ID, AdResolveRefundInput{Status: domain.AdRefundFailed, Reason: "Changed my mind"}, stewardStaff); adCode(err) != AdErrInvalidTransition {
		t.Fatalf("a resolved refund is final: %v", err)
	}
}

// A refund Paystack flagged for attention keeps being polled, and settles
// when Paystack does.
func TestFlaggedRefundsArePolledUntilPaystackSettlesThem(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	id := f.booked()
	f.pay.refundStatus = RefundNeedsAttention
	if _, err := f.svc.ManualRefund(ctx, id, AdRefundInput{AmountPesewas: 5000, Reason: "Under-delivery goodwill"}, stewardStaff); err != nil {
		t.Fatal(err)
	}
	if r := f.ads.Peek(id).Refunds[0]; r.Status != domain.AdRefundManualCheck || r.PaystackRefundID == "" {
		t.Fatalf("flagged = %+v", r)
	}
	f.pay.pollStatus = RefundProcessed
	f.svc.RunScheduler(ctx)
	if got := f.ads.Peek(id); got.Refunds[0].Status != domain.AdRefundProcessed || got.RefundedPesewas != 5000 {
		t.Fatalf("after Paystack settled it = %+v %d", got.Refunds[0], got.RefundedPesewas)
	}
}
