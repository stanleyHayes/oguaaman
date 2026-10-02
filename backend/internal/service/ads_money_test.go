package service

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

func TestRefFlowsIncludeAds(t *testing.T) {
	if !slices.Contains(refFlows, RefPrefixAd) || RefPrefixAd != "adv-" {
		t.Fatalf("refFlows = %v", refFlows)
	}
	if prefix, ns := RefFlow("adv-legacy-1"); prefix != RefPrefixAd || ns {
		t.Fatalf("legacy adv- = %q %v", prefix, ns)
	}
	if refFlowName("oguaa-adv-ad-1-2") != "adv" {
		t.Fatal("metadata.flow must be adv")
	}
}

// C5: the sweep re-verifies pending ad checkouts by their checkout time and
// marks a 48-hour-old unpaid checkout failed, leaving the campaign approved.
func TestReconcileAdsFlow(t *testing.T) {
	f := newAdFix(t, func(s *domain.AdSettings) {
		for i := range s.Placements {
			s.Placements[i].FallbackDailyViews = 10_000
		}
	})
	ctx := context.Background()
	checkout := func(at time.Time) domain.AdCampaign {
		c := f.submit()
		f.approve(c.ID, curatorA)
		if _, err := f.svc.Checkout(ctx, adMember, c.ID, ""); err != nil {
			t.Fatal(err)
		}
		row := f.ads.Peek(c.ID)
		row.CheckoutAt = at.Format(time.RFC3339)
		f.ads.Put(row)
		return row
	}
	sweepAt := adNow.Add(49 * time.Hour)
	paid := checkout(sweepAt.Add(-time.Hour))
	f.pay.paid[paid.Reference] = paid.Price.TotalPesewas
	stale := checkout(adNow)                     // 49 hours old: abandoned
	fresh := checkout(sweepAt.Add(-time.Minute)) // the payer is still on the page

	f.clock = sweepAt
	r := NewPaymentReconciler(nil, nil, nil, nil, nil, nil).WithAds(f.svc)
	r.now = func() time.Time { return f.clock }
	got := r.Run(ctx)["ads"]
	if got.Settled != 1 || got.Expired != 1 {
		t.Fatalf("ads sweep = %+v", got)
	}
	if c := f.ads.Peek(paid.ID); c.PaymentStatus != domain.AdPaymentSuccess {
		t.Fatalf("paid = %s", c.PaymentStatus)
	}
	if c := f.ads.Peek(stale.ID); c.PaymentStatus != domain.AdPaymentFailed || c.FailureReason != AbandonedReason || c.Status != domain.AdStatusApproved {
		t.Fatalf("stale = %s %q %s", c.PaymentStatus, c.FailureReason, c.Status)
	}
	if c := f.ads.Peek(fresh.ID); c.PaymentStatus != domain.AdPaymentPending {
		t.Fatalf("fresh = %s", c.PaymentStatus)
	}
	if NewPaymentReconciler(nil, nil, nil, nil, nil, nil).WithAds(nil).flows != nil {
		t.Fatal("a nil ads service adds no flow")
	}
}

// A campaign paid on two Paystack pages refunds the second charge in full,
// on that charge's own reference, once however often it is confirmed.
func TestDuplicatePaymentIsRefundedOnItsOwnReference(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	c := f.submit()
	f.approve(c.ID, curatorA)
	first, _ := f.svc.Checkout(ctx, adMember, c.ID, "")
	f.pay.failed[first.Reference] = true
	second, _ := f.svc.Checkout(ctx, adMember, c.ID, "")
	f.pay.failed[first.Reference] = false
	f.pay.paid[first.Reference] = c.Price.TotalPesewas
	f.pay.paid[second.Reference] = c.Price.TotalPesewas
	if _, err := f.svc.ConfirmPayment(ctx, second.Reference); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if _, err := f.svc.ConfirmPayment(ctx, first.Reference); err != nil {
			t.Fatal(err)
		}
	}
	got := f.ads.Peek(c.ID)
	if len(got.Refunds) != 1 || got.Refunds[0].Reason != domain.AdRefundDuplicateCharge || got.Refunds[0].AmountPesewas != c.Price.TotalPesewas || got.Reference != second.Reference {
		t.Fatalf("duplicate = %+v ref %s", got.Refunds, got.Reference)
	}
	if want := first.Reference + ":" + itoa64(c.Price.TotalPesewas); len(f.pay.refunds) != 1 || f.pay.refunds[0] != want {
		t.Fatalf("the second charge goes back on its own reference: %v, want %s", f.pay.refunds, want)
	}
	if got.RefundCommittedPesewas() != 0 {
		t.Fatalf("a duplicate refund leaves the real payment's refunds untouched: %d", got.RefundCommittedPesewas())
	}
}

// Spec §3.11: the ads stream is what advertisers paid less processed refunds;
// simulated payments are counted apart.
func TestRevenueIncludesAds(t *testing.T) {
	ads := newAdFix(t).ads
	ads.Put(domain.AdCampaign{ID: "ad-1", PaymentStatus: domain.AdPaymentSuccess, Price: domain.AdPriceSnapshot{NetPesewas: 18_000, TotalPesewas: 18_000}, RefundedPesewas: 6000})
	ads.Put(domain.AdCampaign{ID: "ad-2", PaymentStatus: domain.AdPaymentSuccess, Price: domain.AdPriceSnapshot{NetPesewas: 15_000, TotalPesewas: 15_000}})
	ads.Put(domain.AdCampaign{ID: "ad-3", PaymentStatus: domain.AdPaymentSuccess, Simulated: true, Price: domain.AdPriceSnapshot{TotalPesewas: 99_000}})
	ads.Put(domain.AdCampaign{ID: "ad-4", PaymentStatus: domain.AdPaymentPending, Price: domain.AdPriceSnapshot{TotalPesewas: 50_000}})
	svc := NewRevenueService(&fakePledges{}, &fakeTickets{}, &fakeSubs{}, &fakePromos{}, nil).WithAds(ads)
	out, err := svc.Overview(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if out.Ads.GrossPesewas != 27_000 || out.Ads.Count != 2 || out.TotalPesewas != 27_000 || out.Simulated.GrossPesewas != 99_000 {
		t.Fatalf("revenue = %+v", out)
	}
}

// Tax collected on an ad is owed to GRA, not income: the stream counts the
// net share of what was kept.
func TestAdIncomeLeavesOutTax(t *testing.T) {
	c := domain.AdCampaign{Price: domain.AdPriceSnapshot{NetPesewas: 10_000, TaxPesewas: 2_190, TotalPesewas: 12_190}}
	if got := adIncome(c); got != 10_000 {
		t.Fatalf("income = %d, want the net 10000", got)
	}
	c.RefundedPesewas = 6_095 // half refunded: half the net is kept
	if got := adIncome(c); got != 5_000 {
		t.Fatalf("income after a half refund = %d", got)
	}
	c.RefundedPesewas = c.Price.TotalPesewas
	if got := adIncome(c); got != 0 {
		t.Fatalf("income after a full refund = %d", got)
	}
}
