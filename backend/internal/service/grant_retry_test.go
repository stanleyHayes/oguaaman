package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

var errPrimaryStepDown = errors.New("not primary")

// flakyGrants fails the next grant write (paid-until or featured window)
// once, the way a primary step-down fails one write after the claim landed.
type flakyGrants struct {
	*fakeRepo
	failNext bool
}

func (f *flakyGrants) fail() error {
	if f.failNext {
		f.failNext = false
		return errPrimaryStepDown
	}
	return nil
}

func (f *flakyGrants) SetSubscribedUntil(ctx context.Context, id, plan, until string) error {
	if err := f.fail(); err != nil {
		return err
	}
	return f.fakeRepo.SetSubscribedUntil(ctx, id, plan, until)
}

func (f *flakyGrants) SetFeatured(ctx context.Context, id string, featured bool, until string) error {
	if err := f.fail(); err != nil {
		return err
	}
	return f.fakeRepo.SetFeatured(ctx, id, featured, until)
}

// R21: a subscription whose paid-until write failed after the claim is
// granted by the retried confirm, from the period stored at settlement.
func TestConfirmSubscription_retryAppliesAFailedGrant(t *testing.T) {
	ctx := context.Background()
	_, base, subs := subsFixture(true, 5_000)
	listings := &flakyGrants{fakeRepo: base}
	svc := NewSubscriptionsService(listings, subs, &fakePlans{}, stubMembers{}, &fakePaystack{verifyOK: true, verifyAmount: 5_000}, "http://p", "http://c")
	_, _, ref, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@example.com", "")
	if err != nil {
		t.Fatal(err)
	}
	listings.failNext = true
	if _, err := svc.ConfirmSubscription(ctx, ref); !errors.Is(err, errPrimaryStepDown) {
		t.Fatalf("first confirm err=%v, want the write failure (so the webhook retries)", err)
	}
	if subs.rows[0].Status != domain.PledgeSuccess || !subs.rows[0].GrantPending {
		t.Fatalf("claim should stand with the grant owed: %+v", subs.rows[0])
	}
	if base.listings[0].Details["subscribedUntil"] != nil {
		t.Fatal("listing was granted despite the failed write")
	}
	sub, err := svc.ConfirmSubscription(ctx, ref) // Paystack's retry
	if err != nil {
		t.Fatalf("retry: %v", err)
	}
	if base.listings[0].Details["subscribedUntil"] != sub.PeriodEnd || sub.PeriodEnd == "" || subs.rows[0].GrantPending {
		t.Fatalf("retry did not grant: listing=%v sub=%+v", base.listings[0].Details, subs.rows[0])
	}
	// A further replay changes nothing.
	if again, err := svc.ConfirmSubscription(ctx, ref); err != nil || again.PeriodEnd != sub.PeriodEnd {
		t.Fatalf("replay: %+v %v", again, err)
	}
}

// R21: the same for a paid promotion's featured window.
func TestConfirmPromotion_retryAppliesAFailedGrant(t *testing.T) {
	ctx := context.Background()
	_, base, promos := promosFixture(true, 7_000)
	listings := &flakyGrants{fakeRepo: base}
	svc := NewPromotionsService(listings, promos, &fakePaystack{verifyOK: true, verifyAmount: 7_000}, "http://p")
	_, _, ref, err := svc.StartPromotion(ctx, "b-1", "m-yaw", "yaw@example.com", 7)
	if err != nil {
		t.Fatal(err)
	}
	listings.failNext = true
	if _, err := svc.ConfirmPromotion(ctx, ref); !errors.Is(err, errPrimaryStepDown) {
		t.Fatalf("first confirm err=%v", err)
	}
	if base.listings[0].Featured || !promos.rows[0].GrantPending || promos.rows[0].FeaturedUntil == "" {
		t.Fatalf("state after failed grant: listing=%+v promo=%+v", base.listings[0], promos.rows[0])
	}
	if _, err := svc.ConfirmPromotion(ctx, ref); err != nil {
		t.Fatalf("retry: %v", err)
	}
	l := base.listings[0]
	if !l.Featured || l.FeaturedUntil != promos.rows[0].FeaturedUntil || l.PromotedUntil != l.FeaturedUntil || promos.rows[0].GrantPending {
		t.Fatalf("retry did not grant: listing=%+v promo=%+v", l, promos.rows[0])
	}
}

// R21: a pledge whose credit failed after the claim is credited by the retry,
// exactly once however often the confirm is replayed.
func TestConfirmPledge_retryCreditsAFailedGrantOnce(t *testing.T) {
	ctx := context.Background()
	svc, listings, pledges, _ := paymentsFixture(true, 10_000)
	_, _, ref, err := svc.StartPledge(ctx, "library-corner", "m-1", "a@example.com", 10_000)
	if err != nil {
		t.Fatal(err)
	}
	listings.creditErr = errPrimaryStepDown
	if _, err := svc.ConfirmPledge(ctx, ref); !errors.Is(err, errPrimaryStepDown) {
		t.Fatalf("first confirm err=%v", err)
	}
	if raised, _ := listings.listings[0].Details["raisedPesewas"].(int64); raised != 0 || !pledges.rows[0].GrantPending {
		t.Fatalf("raised=%d pledge=%+v", raised, pledges.rows[0])
	}
	for range 3 { // Paystack's retry, then the payer's redirect, then a replay
		if _, err := svc.ConfirmPledge(ctx, ref); err != nil {
			t.Fatalf("retry: %v", err)
		}
	}
	net := pledges.rows[0].NetPesewas
	if raised, _ := listings.listings[0].Details["raisedPesewas"].(int64); net == 0 || raised != net || pledges.rows[0].GrantPending {
		t.Fatalf("raised=%d, want the net %d credited once", raised, net)
	}
}

// R21: the credit is keyed on the reference, so a grant re-run after the
// credit landed but before the flag cleared never counts the pledge twice.
func TestConfirmPledge_grantRerunAfterCreditDoesNotDoubleCount(t *testing.T) {
	ctx := context.Background()
	svc, listings, pledges, _ := paymentsFixture(true, 10_000)
	_, _, ref, err := svc.StartPledge(ctx, "library-corner", "m-1", "a@example.com", 10_000)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ConfirmPledge(ctx, ref); err != nil {
		t.Fatal(err)
	}
	pledges.rows[0].GrantPending = true // as if clearing the flag had failed
	if _, err := svc.ConfirmPledge(ctx, ref); err != nil {
		t.Fatal(err)
	}
	if raised, _ := listings.listings[0].Details["raisedPesewas"].(int64); raised != pledges.rows[0].NetPesewas {
		t.Fatalf("raised=%d, want %d (credited once)", raised, pledges.rows[0].NetPesewas)
	}
}
