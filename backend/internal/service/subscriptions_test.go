package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// fakeSubs is an in-memory SubscriptionRepository.
type fakeSubs struct{ rows []domain.Subscription }

func (f *fakeSubs) Insert(_ context.Context, s domain.Subscription) error {
	f.rows = append(f.rows, s)
	return nil
}
func (f *fakeSubs) ByReference(_ context.Context, ref string) (*domain.Subscription, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			return &f.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "subscription"}
}
func (f *fakeSubs) UpdateStatus(_ context.Context, ref, status, at string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			f.rows[i].Status = status
			if status == domain.PledgeSuccess {
				f.rows[i].ConfirmedAt = at
			}
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "subscription"}
}
func (f *fakeSubs) SetPeriodEnd(_ context.Context, ref, until string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			f.rows[i].PeriodEnd = until
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "subscription"}
}
func (f *fakeSubs) ByMember(_ context.Context, memberID string) ([]domain.Subscription, error) {
	out := []domain.Subscription{}
	for _, s := range f.rows {
		if s.MemberID == memberID {
			out = append(out, s)
		}
	}
	return out, nil
}
func (f *fakeSubs) All(context.Context) ([]domain.Subscription, error) { return f.rows, nil }
func (f *fakeSubs) ActiveByListing(_ context.Context, listingID, now string) (bool, error) {
	for _, s := range f.rows {
		if s.ListingID == listingID && s.Status == domain.PledgeSuccess && s.PeriodEnd > now {
			return true, nil
		}
	}
	return false, nil
}

func subsFixture(verifyOK bool, verifyAmount int64) (*SubscriptionsService, *fakeRepo, *fakeSubs) {
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "b-1", Slug: "castle-view-guesthouse", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Title: "Castle View Guesthouse", Details: map[string]any{}},
		{ID: "b-2", Slug: "oguaa-prints", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusPending, Title: "Oguaa Prints", Details: map[string]any{}},
	}}
	subs := &fakeSubs{}
	ps := &fakePaystack{verifyOK: verifyOK, verifyAmount: verifyAmount}
	svc := NewSubscriptionsService(listings, subs, &fakePlans{}, ps, "http://localhost:5173")
	return svc, listings, subs
}

func TestStartSubscription_ownerOnly(t *testing.T) {
	svc, _, _ := subsFixture(true, 0)
	ctx := context.Background()

	// A stranger may not subscribe someone else's business.
	_, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-stranger", "a@b.c", "")
	var fb *domain.ForbiddenError
	if !errors.As(err, &fb) {
		t.Errorf("non-owner: expected ForbiddenError, got %v", err)
	}
	// An unapproved business can't be subscribed either.
	if _, _, err := svc.StartSubscription(ctx, "oguaa-prints", "m-yaw", "a@b.c", ""); !errors.As(err, &fb) {
		t.Errorf("unapproved: expected ForbiddenError, got %v", err)
	}
	// The owner can.
	_, ref, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "")
	if err != nil {
		t.Fatalf("owner subscribe failed: %v", err)
	}
	if !strings.HasPrefix(ref, "sub-castle-view-guesthouse-") {
		t.Errorf("reference = %q, want sub-<slug>-<ts>", ref)
	}
	if _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "", ""); err == nil {
		t.Error("expected a missing email to be rejected")
	}
}

func TestConfirmSubscription_setsPeriodEndAndListing(t *testing.T) {
	svc, listings, subs := subsFixture(true, 5_000)
	ctx := context.Background()

	_, ref, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "")
	if err != nil {
		t.Fatalf("StartSubscription failed: %v", err)
	}
	if subs.rows[0].Status != domain.PledgePending {
		t.Errorf("new subscription status = %q, want pending", subs.rows[0].Status)
	}
	sub, err := svc.ConfirmSubscription(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmSubscription failed: %v", err)
	}
	if sub.Status != domain.PledgeSuccess {
		t.Errorf("confirmed status = %q, want success", sub.Status)
	}
	end, err := time.Parse(time.RFC3339, sub.PeriodEnd)
	if err != nil {
		t.Fatalf("periodEnd %q is not RFC3339", sub.PeriodEnd)
	}
	if until := end.Sub(time.Now().UTC()); until < 29*24*time.Hour || until > 31*24*time.Hour {
		t.Errorf("periodEnd is %v from now, want ~30 days", until)
	}
	// The listing's paid-until date must match.
	if listings.listings[0].Details["subscribedUntil"] != sub.PeriodEnd {
		t.Errorf("listing subscribedUntil = %v, want %q", listings.listings[0].Details["subscribedUntil"], sub.PeriodEnd)
	}

	// Idempotent: confirming again returns the same subscription, period unchanged.
	sub2, err := svc.ConfirmSubscription(ctx, ref)
	if err != nil {
		t.Fatalf("second confirm errored: %v", err)
	}
	if sub2.PeriodEnd != sub.PeriodEnd {
		t.Errorf("double-confirm changed the period: %q → %q", sub.PeriodEnd, sub2.PeriodEnd)
	}
}

func TestConfirmSubscription_stacksOntoCurrentPeriod(t *testing.T) {
	svc, listings, _ := subsFixture(true, 5_000)
	ctx := context.Background()

	// The business is already paid up until 10 days from now; a renewal must
	// extend from that date, not restart from today.
	existing := time.Now().UTC().Add(10 * 24 * time.Hour).Format(time.RFC3339)
	listings.listings[0].Details["subscribedUntil"] = existing

	_, ref, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "")
	if err != nil {
		t.Fatalf("StartSubscription failed: %v", err)
	}
	sub, err := svc.ConfirmSubscription(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmSubscription failed: %v", err)
	}
	want, _ := time.Parse(time.RFC3339, existing)
	want = want.Add(30 * 24 * time.Hour)
	got, _ := time.Parse(time.RFC3339, sub.PeriodEnd)
	if !got.Equal(want) {
		t.Errorf("stacked periodEnd = %q, want %q (existing + 30 days)", sub.PeriodEnd, want.Format(time.RFC3339))
	}
}

func TestConfirmSubscription_failedVerification(t *testing.T) {
	svc, _, subs := subsFixture(false, 0)
	ctx := context.Background()
	_, ref, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "")
	if err != nil {
		t.Fatalf("StartSubscription failed: %v", err)
	}
	if _, err := svc.ConfirmSubscription(ctx, ref); err == nil {
		t.Error("expected confirm to fail when verification fails")
	}
	if subs.rows[0].Status != domain.PledgeFailed {
		t.Errorf("subscription status = %q, want failed", subs.rows[0].Status)
	}
	if subs.rows[0].PeriodEnd != "" {
		t.Errorf("failed subscription should have no period end, got %q", subs.rows[0].PeriodEnd)
	}
}

func TestStartSubscription_usesCatalogPrice(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "b-1", Slug: "castle-view-guesthouse", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Title: "Castle View", Details: map[string]any{}},
	}}
	plans := &fakePlans{rows: []domain.Plan{
		{ID: "plan-supporter", Slug: "supporter", Name: "Supporter", Audience: "business", Interval: "month",
			Prices: map[string]int64{"default": 3_000, "business": 5_500}, Active: true},
	}}
	subs := &fakeSubs{}
	svc := NewSubscriptionsService(listings, subs, plans, &fakePaystack{verifyOK: true}, "http://localhost:5173")

	if _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", ""); err != nil {
		t.Fatalf("StartSubscription failed: %v", err)
	}
	if subs.rows[0].AmountPesewas != 5_500 {
		t.Errorf("amount = %d, want the catalog's business price 5500", subs.rows[0].AmountPesewas)
	}
	if subs.rows[0].Plan != "supporter" {
		t.Errorf("plan = %q, want the catalog slug", subs.rows[0].Plan)
	}
}

func TestStartSubscription_explicitPlanIsStrict(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "b-1", Slug: "castle-view-guesthouse", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Title: "Castle View", Details: map[string]any{}},
	}}
	plans := &fakePlans{rows: []domain.Plan{
		{ID: "plan-old", Slug: "old-bundle", Name: "Old", Audience: "business", Interval: "month",
			Prices: map[string]int64{"default": 9_000}, Active: false},
	}}
	svc := NewSubscriptionsService(listings, &fakeSubs{}, plans, &fakePaystack{verifyOK: true}, "http://localhost:5173")

	if _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "no-such-plan"); err == nil {
		t.Error("expected not-found for an unknown plan slug")
	}
	if _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "old-bundle"); err == nil {
		t.Error("expected an error subscribing to an inactive plan")
	}
}

func TestConfirmSubscription_appliesBundledPromoDays(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "b-1", Slug: "castle-view-guesthouse", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Title: "Castle View", Details: map[string]any{}},
	}}
	plans := &fakePlans{rows: []domain.Plan{
		{ID: "plan-featured", Slug: "featured", Name: "Featured bundle", Audience: "business", Interval: "month",
			Prices: map[string]int64{"default": 12_000}, IncludedPromoDays: 7, Active: true},
	}}
	subs := &fakeSubs{}
	svc := NewSubscriptionsService(listings, subs, plans, &fakePaystack{verifyOK: true, verifyAmount: 12_000}, "http://localhost:5173")

	_, ref, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "featured")
	if err != nil {
		t.Fatalf("StartSubscription failed: %v", err)
	}
	if _, err := svc.ConfirmSubscription(ctx, ref); err != nil {
		t.Fatalf("ConfirmSubscription failed: %v", err)
	}
	l := listings.listings[0]
	if !l.Featured {
		t.Error("featured bundle should flag the listing as featured")
	}
	until, err := time.Parse(time.RFC3339, l.FeaturedUntil)
	if err != nil {
		t.Fatalf("featuredUntil = %q, want RFC3339", l.FeaturedUntil)
	}
	lo, hi := time.Now().UTC().Add(6*24*time.Hour), time.Now().UTC().Add(8*24*time.Hour)
	if until.Before(lo) || until.After(hi) {
		t.Errorf("featuredUntil = %v, want ~7 days out", until)
	}
	if raw, _ := l.Details["subscribedUntil"].(string); raw == "" {
		t.Error("subscribedUntil should still be set alongside the promo days")
	}
}
