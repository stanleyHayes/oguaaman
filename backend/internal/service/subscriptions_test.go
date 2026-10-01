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

// MarkSuccess mirrors the repository's conditional write: only a subscription
// that has not already succeeded transitions, and the result says whether it did.
func (f *fakeSubs) MarkSuccess(_ context.Context, ref, at, periodEnd, featuredUntil string) (bool, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status != domain.PledgeSuccess {
			f.rows[i].Status = domain.PledgeSuccess
			f.rows[i].ConfirmedAt = at
			f.rows[i].PeriodEnd = periodEnd
			f.rows[i].FeaturedUntil = featuredUntil
			f.rows[i].GrantPending = true
			return true, nil
		}
	}
	return false, nil
}
func (f *fakeSubs) MarkGranted(_ context.Context, ref string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			f.rows[i].GrantPending = false
		}
	}
	return nil
}
func (f *fakeSubs) MarkFailed(_ context.Context, ref string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status != domain.PledgeSuccess {
			f.rows[i].Status = domain.PledgeFailed
		}
	}
	return nil
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
	svc := NewSubscriptionsService(listings, subs, &fakePlans{}, stubMembers{}, ps, "http://localhost:5173", "http://localhost:5175")
	return svc, listings, subs
}

func TestStartSubscription_ownerOnly(t *testing.T) {
	svc, _, _ := subsFixture(true, 0)
	ctx := context.Background()

	// A stranger may not subscribe someone else's business.
	_, _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-stranger", "a@b.c", "")
	var fb *domain.ForbiddenError
	if !errors.As(err, &fb) {
		t.Errorf("non-owner: expected ForbiddenError, got %v", err)
	}
	// An unapproved business can't be subscribed either.
	if _, _, _, err := svc.StartSubscription(ctx, "oguaa-prints", "m-yaw", "a@b.c", ""); !errors.As(err, &fb) {
		t.Errorf("unapproved: expected ForbiddenError, got %v", err)
	}
	// The owner can.
	_, _, ref, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "")
	if err != nil {
		t.Fatalf("owner subscribe failed: %v", err)
	}
	if !strings.HasPrefix(ref, "oguaa-sub-castle-view-guesthouse-") {
		t.Errorf("reference = %q, want oguaa-sub-<slug>-<ts>", ref)
	}
	if _, _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "", ""); err == nil {
		t.Error("expected a missing email to be rejected")
	}
}

func TestConfirmSubscription_setsPeriodEndAndListing(t *testing.T) {
	svc, listings, subs := subsFixture(true, 5_000)
	ctx := context.Background()

	_, _, ref, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "")
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

	_, _, ref, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "")
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
	_, _, ref, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "")
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
	svc := NewSubscriptionsService(listings, subs, plans, stubMembers{}, &fakePaystack{verifyOK: true}, "http://localhost:5173", "http://localhost:5175")

	if _, _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", ""); err != nil {
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
	svc := NewSubscriptionsService(listings, &fakeSubs{}, plans, stubMembers{}, &fakePaystack{verifyOK: true}, "http://localhost:5173", "http://localhost:5175")

	if _, _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "no-such-plan"); err == nil {
		t.Error("expected not-found for an unknown plan slug")
	}
	if _, _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "old-bundle"); err == nil {
		t.Error("expected an error subscribing to an inactive plan")
	}
}

// A plan is only sold on its own audience's path: a creator can't buy the 0%
// take-rate business Supporter plan at the default price, and a business
// can't buy a creator plan whose storefront caps are zero (F135).
func TestStartSubscription_enforcesPlanAudience(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "b-1", Slug: "castle-view-guesthouse", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Title: "Castle View", Details: map[string]any{}},
	}}
	plans := creatorPlans()
	plans.rows = append(plans.rows, domain.Plan{ID: "plan-patron", Slug: "patron", Name: "Patron", Audience: "any",
		Prices: map[string]int64{"default": 4_000}, Interval: "month", Active: true})
	members := &monMembers{byID: map[string]*domain.Member{"m-kwesi": {ID: "m-kwesi"}, "m-yaw": {ID: "m-yaw"}}}
	subs := &fakeSubs{}
	svc := NewSubscriptionsService(listings, subs, plans, members, &fakePaystack{verifyOK: true}, "http://portal.test", "http://creator.test")

	var ve *domain.ValidationError
	if _, _, _, err := svc.StartCreatorSubscription(ctx, "m-kwesi", "kwesi@example.com", "supporter"); !errors.As(err, &ve) {
		t.Errorf("creator buying the business plan: want a validation error, got %v", err)
	}
	if _, _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@example.com", "creator-supporter"); !errors.As(err, &ve) {
		t.Errorf("business buying a creator plan: want a validation error, got %v", err)
	}
	if len(subs.rows) != 0 {
		t.Fatalf("refused purchases must not record a subscription, got %d", len(subs.rows))
	}
	// Plans for "any" audience, and each audience's own plans, still sell.
	if _, _, _, err := svc.StartCreatorSubscription(ctx, "m-kwesi", "kwesi@example.com", "patron"); err != nil {
		t.Errorf("creator buying an any-audience plan: %v", err)
	}
	if _, _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@example.com", "supporter"); err != nil {
		t.Errorf("business buying its own plan: %v", err)
	}
	if _, _, _, err := svc.StartCreatorSubscription(ctx, "m-kwesi", "kwesi@example.com", ""); err != nil {
		t.Errorf("creator default plan: %v", err)
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
	svc := NewSubscriptionsService(listings, subs, plans, stubMembers{}, &fakePaystack{verifyOK: true, verifyAmount: 12_000}, "http://localhost:5173", "http://localhost:5175")

	_, _, ref, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@oguaa.test", "featured")
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
	if l.PromotedUntil != l.FeaturedUntil {
		t.Errorf("bundled promo days are paid placement: promotedUntil = %q, want %q", l.PromotedUntil, l.FeaturedUntil)
	}
}

// daysFromNow parses an RFC3339 value and reports how many whole days away it is.
func daysFromNow(t *testing.T, raw string) int {
	t.Helper()
	at, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		t.Fatalf("%q is not RFC3339", raw)
	}
	return int(time.Until(at).Round(24*time.Hour) / (24 * time.Hour))
}

// One Featured payment confirmed twice at once (redirect + webhook, or a
// replay burst) buys one month and one set of bundled promo days (F136/F139).
func TestConfirmSubscription_concurrentConfirmsExtendOnce(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "b-1", Slug: "castle-view-guesthouse", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Title: "Castle View", Details: map[string]any{}},
	}}
	plans := &fakePlans{rows: []domain.Plan{
		{ID: "plan-featured", Slug: "featured", Name: "Featured bundle", Audience: "business", Interval: "month",
			Prices: map[string]int64{"default": 12_000}, IncludedPromoDays: 7, Active: true},
	}}
	subs := &fakeSubs{}
	ps := &racingPaystack{fakePaystack: fakePaystack{verifyOK: true, verifyAmount: 12_000}}
	svc := NewSubscriptionsService(listings, subs, plans, stubMembers{}, ps, "http://portal.test", "http://creator.test")

	_, _, ref, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@example.com", "featured")
	if err != nil {
		t.Fatalf("StartSubscription: %v", err)
	}
	ps.meanwhile = func() {
		if _, err := svc.ConfirmSubscription(ctx, ref); err != nil {
			t.Errorf("inner confirm: %v", err)
		}
	}
	sub, err := svc.ConfirmSubscription(ctx, ref)
	if err != nil {
		t.Fatalf("outer confirm: %v", err)
	}
	l := listings.listings[0]
	if got := daysFromNow(t, l.Details["subscribedUntil"].(string)); got != 30 {
		t.Errorf("subscribedUntil is %d days out, want 30 — one payment, one month", got)
	}
	if got := daysFromNow(t, l.FeaturedUntil); got != 7 {
		t.Errorf("featuredUntil is %d days out, want 7 — one payment, one set of promo days", got)
	}
	if sub.PeriodEnd != l.Details["subscribedUntil"] {
		t.Errorf("returned periodEnd %q differs from the listing's %q", sub.PeriodEnd, l.Details["subscribedUntil"])
	}
}

// The same holds for member-level creator plans.
func TestConfirmCreatorSubscription_concurrentConfirmsExtendOnce(t *testing.T) {
	ctx := context.Background()
	members := &monMembers{byID: map[string]*domain.Member{"m-kwesi": {ID: "m-kwesi"}}}
	ps := &racingPaystack{fakePaystack: fakePaystack{verifyOK: true, verifyAmount: 3_000}}
	svc := NewSubscriptionsService(&fakeRepo{}, &fakeSubs{}, creatorPlans(), members, ps, "http://portal.test", "http://creator.test")

	_, _, ref, err := svc.StartCreatorSubscription(ctx, "m-kwesi", "kwesi@example.com", "creator-supporter")
	if err != nil {
		t.Fatalf("StartCreatorSubscription: %v", err)
	}
	ps.meanwhile = func() {
		if _, err := svc.ConfirmSubscription(ctx, ref); err != nil {
			t.Errorf("inner confirm: %v", err)
		}
	}
	if _, err := svc.ConfirmSubscription(ctx, ref); err != nil {
		t.Fatalf("outer confirm: %v", err)
	}
	if got := daysFromNow(t, members.byID["m-kwesi"].CreatorSubscribedUntil); got != 30 {
		t.Errorf("creatorSubscribedUntil is %d days out, want 30", got)
	}
}

// A different plan can't be stacked onto a window still paid under another
// plan: it would re-stamp the new plan's take-rate/caps over time already paid
// at another price (F141). Renewing the same plan still stacks.
func TestStartSubscription_refusesPlanSwitchDuringPaidPeriod(t *testing.T) {
	ctx := context.Background()
	paidUntil := time.Now().UTC().Add(60 * 24 * time.Hour).Format(time.RFC3339)
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "b-1", Slug: "castle-view-guesthouse", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Title: "Castle View",
			Details: map[string]any{"plan": "featured", "subscribedUntil": paidUntil}},
	}}
	plans := creatorPlans()
	plans.rows = append(plans.rows,
		domain.Plan{ID: "plan-featured", Slug: "featured", Name: "Featured", Audience: "business", Interval: "month",
			Prices: map[string]int64{"default": 12_000}, MaxProducts: 30, Active: true},
		domain.Plan{ID: "plan-creator-pro", Slug: "creator-pro", Name: "Creator Pro", Audience: "creator", Interval: "month",
			Prices: map[string]int64{"default": 8_000}, TakeRatePercent: 10, Active: true})
	members := &monMembers{byID: map[string]*domain.Member{
		"m-kwesi": {ID: "m-kwesi", CreatorPlan: "creator-supporter", CreatorSubscribedUntil: paidUntil},
	}}
	subs := &fakeSubs{}
	svc := NewSubscriptionsService(listings, subs, plans, members, &fakePaystack{verifyOK: true}, "http://portal.test", "http://creator.test")

	var ve *domain.ValidationError
	if _, _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@example.com", "supporter"); !errors.As(err, &ve) {
		t.Errorf("business switching plans mid-period: want a validation error, got %v", err)
	}
	if _, _, _, err := svc.StartCreatorSubscription(ctx, "m-kwesi", "kwesi@example.com", "creator-pro"); !errors.As(err, &ve) {
		t.Errorf("creator switching plans mid-period: want a validation error, got %v", err)
	}
	if len(subs.rows) != 0 {
		t.Fatalf("refused switches must not record a subscription, got %d", len(subs.rows))
	}
	if _, _, _, err := svc.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@example.com", "featured"); err != nil {
		t.Errorf("renewing the same business plan: %v", err)
	}
	if _, _, _, err := svc.StartCreatorSubscription(ctx, "m-kwesi", "kwesi@example.com", "creator-supporter"); err != nil {
		t.Errorf("renewing the same creator plan: %v", err)
	}
	// Once the paid window has ended, any plan sells.
	members.byID["m-kwesi"].CreatorSubscribedUntil = time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	if _, _, _, err := svc.StartCreatorSubscription(ctx, "m-kwesi", "kwesi@example.com", "creator-pro"); err != nil {
		t.Errorf("switching after the period ended: %v", err)
	}
}

// Two checkouts for different plans that both settle: the second plan starts
// now instead of being stamped over the first plan's already-paid window.
func TestConfirmCreatorSubscription_differentPlanDoesNotRestampPaidTime(t *testing.T) {
	ctx := context.Background()
	plans := creatorPlans()
	plans.rows = append(plans.rows, domain.Plan{ID: "plan-creator-pro", Slug: "creator-pro", Name: "Creator Pro", Audience: "creator",
		Interval: "month", Prices: map[string]int64{"default": 8_000}, TakeRatePercent: 10, Active: true})
	members := &monMembers{byID: map[string]*domain.Member{"m-kwesi": {ID: "m-kwesi"}}}
	svc := NewSubscriptionsService(&fakeRepo{}, &fakeSubs{}, plans, members, &fakePaystack{verifyOK: true, verifyAmount: 8_000}, "http://portal.test", "http://creator.test")
	_, _, refPro, err := svc.StartCreatorSubscription(ctx, "m-kwesi", "kwesi@example.com", "creator-pro")
	if err != nil {
		t.Fatalf("start pro: %v", err)
	}
	// A long creator-supporter window lands first.
	members.byID["m-kwesi"].CreatorPlan = "creator-supporter"
	members.byID["m-kwesi"].CreatorSubscribedUntil = time.Now().UTC().Add(300 * 24 * time.Hour).Format(time.RFC3339)
	if _, err := svc.ConfirmSubscription(ctx, refPro); err != nil {
		t.Fatalf("confirm pro: %v", err)
	}
	if got := daysFromNow(t, members.byID["m-kwesi"].CreatorSubscribedUntil); got != 30 {
		t.Errorf("creator-pro runs %d days, want 30 from now — never stacked over supporter time", got)
	}
}
