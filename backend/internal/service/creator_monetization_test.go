package service

import (
	"context"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// monMembers is a stateful MemberRepository for Creator Monetization tests: it
// embeds the no-op stubMembers and overrides the reads/writes the flows touch.
type monMembers struct {
	stubMembers
	byID map[string]*domain.Member
}

func (m *monMembers) ByID(_ context.Context, id string) (*domain.Member, error) {
	if v, ok := m.byID[id]; ok {
		return v, nil
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}
func (m *monMembers) SetCreatorSubscription(_ context.Context, id, plan, until string) error {
	if v, ok := m.byID[id]; ok {
		v.CreatorPlan = plan
		v.CreatorSubscribedUntil = until
	}
	return nil
}
func (m *monMembers) SetCampaignerVetted(_ context.Context, id string, vetted bool) error {
	if v, ok := m.byID[id]; ok {
		v.CampaignerVetted = vetted
	}
	return nil
}

func futureRFC3339() string { return time.Now().UTC().Add(20 * 24 * time.Hour).Format(time.RFC3339) }

func creatorPlans() *fakePlans {
	return &fakePlans{rows: []domain.Plan{
		{ID: "plan-creator-supporter", Slug: "creator-supporter", Name: "Creator Supporter", Audience: "creator",
			Prices: map[string]int64{"default": 3_000, "creator": 3_000}, Interval: "month", TakeRatePercent: 15, Active: true},
		{ID: "plan-supporter", Slug: "supporter", Name: "Supporter", Audience: "business",
			Prices: map[string]int64{"default": 3_000, "business": 5_000}, Interval: "month",
			MaxProducts: 2, MaxServices: 2, Active: true},
		{ID: "plan-starter", Slug: "starter", Name: "Starter", Audience: "any",
			Prices: map[string]int64{"default": 0}, Interval: "free", MaxServices: 1, Active: true},
	}}
}

// A donation to a subscribed artist takes the platform fee from the owner's
// plan take-rate (15%), not the flat platform fee (5%), and credits the net.
func TestStartDonation_usesPlanTakeRate(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "art-1", Slug: "kwesi-sings", Type: domain.TypeArtist, OwnerID: "m-kwesi", Status: domain.StatusApproved, Title: "Kwesi", Details: map[string]any{}},
	}}
	members := &monMembers{byID: map[string]*domain.Member{
		"m-kwesi": {ID: "m-kwesi", CreatorPlan: "creator-supporter", CreatorSubscribedUntil: futureRFC3339()},
	}}
	pledges := &fakePledges{}
	svc := NewPaymentsService(listings, pledges, stubNotifs{}, members, creatorPlans(), &fakePaystack{verifyOK: true}, "http://localhost:5173", 5)

	_, _, ref, err := svc.StartDonation(ctx, "kwesi-sings", "m-fan", "fan@oguaa.test", 10_000, "keep singing!", false)
	if err != nil {
		t.Fatalf("StartDonation failed: %v", err)
	}
	if pledges.rows[0].Kind != domain.PledgeKindDonation {
		t.Errorf("kind = %q, want donation", pledges.rows[0].Kind)
	}
	got, err := svc.ConfirmPledge(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmPledge failed: %v", err)
	}
	if got.FeePesewas != 1_500 || got.NetPesewas != 8_500 { // 15% of 10,000
		t.Errorf("fee/net = %d/%d, want 1500/8500 (plan take-rate 15%%)", got.FeePesewas, got.NetPesewas)
	}
	art, _ := listings.GetByID(ctx, "art-1")
	if cur, _ := art.Details["donationsNetPesewas"].(int64); cur != 8_500 {
		t.Errorf("artist donationsNetPesewas = %d, want 8500", cur)
	}
}

// Donations are a paid feature: an artist whose owner has no active creator
// subscription cannot receive them.
func TestStartDonation_gatedBySubscription(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "art-1", Slug: "ama-beats", Type: domain.TypeArtist, OwnerID: "m-ama", Status: domain.StatusApproved, Title: "Ama", Details: map[string]any{}},
	}}
	members := &monMembers{byID: map[string]*domain.Member{"m-ama": {ID: "m-ama"}}} // no subscription
	svc := NewPaymentsService(listings, &fakePledges{}, stubNotifs{}, members, creatorPlans(), &fakePaystack{verifyOK: true}, "http://localhost:5173", 5)

	_, _, _, err := svc.StartDonation(ctx, "ama-beats", "m-fan", "fan@oguaa.test", 10_000, "", false)
	var fb *domain.ForbiddenError
	if err == nil || !asForbidden(err, &fb) {
		t.Fatalf("expected a forbidden error for an unsubscribed artist, got %v", err)
	}
}

// A legacy civic project (owner with no creator plan) keeps the flat platform fee.
func TestConfirmPledge_legacyProjectUsesFlatFee(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "pr-1", Slug: "library-corner", Type: domain.TypeProject, OwnerID: "m-steward", Status: domain.StatusApproved, Title: "Library", Details: map[string]any{}},
	}}
	members := &monMembers{byID: map[string]*domain.Member{"m-steward": {ID: "m-steward"}}}
	pledges := &fakePledges{}
	svc := NewPaymentsService(listings, pledges, stubNotifs{}, members, creatorPlans(), &fakePaystack{verifyOK: true}, "http://localhost:5173", 5)

	_, _, ref, err := svc.StartPledge(ctx, "library-corner", "m-fan", "fan@oguaa.test", 10_000)
	if err != nil {
		t.Fatalf("StartPledge failed: %v", err)
	}
	got, err := svc.ConfirmPledge(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmPledge failed: %v", err)
	}
	if got.FeePesewas != 500 || got.NetPesewas != 9_500 { // flat 5%
		t.Errorf("fee/net = %d/%d, want 500/9500 (flat platform fee)", got.FeePesewas, got.NetPesewas)
	}
}

// Confirming a member-level creator subscription extends the member's paid-until
// and stamps the plan slug (the entitlement gate for donations & campaigns).
func TestConfirmCreatorSubscription_extendsMember(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{}
	subs := &fakeSubs{}
	members := &monMembers{byID: map[string]*domain.Member{"m-kwesi": {ID: "m-kwesi"}}}
	svc := NewSubscriptionsService(listings, subs, creatorPlans(), members, &fakePaystack{verifyOK: true}, "http://localhost:5173", "http://localhost:5175")

	_, _, ref, err := svc.StartCreatorSubscription(ctx, "m-kwesi", "kwesi@oguaa.test", "creator-supporter")
	if err != nil {
		t.Fatalf("StartCreatorSubscription failed: %v", err)
	}
	if subs.rows[0].Scope != domain.SubscriptionScopeCreator || subs.rows[0].AmountPesewas != 3_000 {
		t.Errorf("sub scope/amount = %q/%d, want creator/3000", subs.rows[0].Scope, subs.rows[0].AmountPesewas)
	}
	if _, err := svc.ConfirmSubscription(ctx, ref); err != nil {
		t.Fatalf("ConfirmSubscription failed: %v", err)
	}
	m := members.byID["m-kwesi"]
	if m.CreatorPlan != "creator-supporter" {
		t.Errorf("member plan = %q, want creator-supporter", m.CreatorPlan)
	}
	if !CreatorSubscriptionActive(m, time.Now().UTC()) {
		t.Errorf("member should have an active creator subscription after confirm")
	}
}

// A first campaign enters moderation; once the member is vetted, subsequent
// campaigns auto-publish. Creating a campaign requires an active creator plan.
func TestCreateCampaign_gateAndApprovalLifecycle(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{}
	svc := New(Deps{Listings: listings})

	in := CampaignInput{Title: "Studio for the youth choir", Description: "Help us build a small recording studio for the youth choir at Bakaano.", GoalPesewas: 500_000}

	// No subscription → forbidden.
	unpaid := &domain.Member{ID: "m-kwesi"}
	if _, err := svc.CreateCampaign(ctx, unpaid, in); err == nil {
		t.Fatal("expected forbidden for a member without an active creator plan")
	}

	// Subscribed but not yet vetted → first campaign is pending.
	paid := &domain.Member{ID: "m-kwesi", CreatorPlan: "creator-supporter", CreatorSubscribedUntil: futureRFC3339()}
	first, err := svc.CreateCampaign(ctx, paid, in)
	if err != nil {
		t.Fatalf("CreateCampaign (first) failed: %v", err)
	}
	if first.Status != domain.StatusPending {
		t.Errorf("first campaign status = %q, want pending", first.Status)
	}
	if c, _ := first.Details["campaign"].(bool); !c {
		t.Errorf("campaign flag not set on details")
	}

	// Vetted → subsequent campaign auto-publishes.
	paid.CampaignerVetted = true
	in.Title = "Second campaign"
	second, err := svc.CreateCampaign(ctx, paid, in)
	if err != nil {
		t.Fatalf("CreateCampaign (second) failed: %v", err)
	}
	if second.Status != domain.StatusApproved {
		t.Errorf("vetted member's campaign status = %q, want approved", second.Status)
	}
}

// A business may publish at most its plan's MaxProducts; exceeding it is refused.
func TestSetStorefront_capsProductsByPlan(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "b-1", Slug: "aunties-kitchen", Type: domain.TypeBusiness, OwnerID: "m-owner", Status: domain.StatusApproved, Title: "Auntie's Kitchen",
			Details: map[string]any{"plan": "supporter", "subscribedUntil": futureRFC3339()}},
	}}
	svc := New(Deps{Listings: listings, Plans: creatorPlans()})
	owner := &domain.Member{ID: "m-owner"}

	// The supporter plan allows 2 products; three must be rejected.
	three := []domain.StoreItem{{Name: "Jollof"}, {Name: "Waakye"}, {Name: "Banku"}}
	if _, err := svc.SetListingStorefront(ctx, owner, "b-1", StorefrontInput{Products: three}); err == nil {
		t.Fatal("expected a cap error when publishing more products than the plan allows")
	}

	// Two is fine.
	two := []domain.StoreItem{{Name: "Jollof", PricePesewas: 3_000}, {Name: "Waakye", PricePesewas: 2_500}}
	got, err := svc.SetListingStorefront(ctx, owner, "b-1", StorefrontInput{Products: two})
	if err != nil {
		t.Fatalf("SetListingStorefront (within cap) failed: %v", err)
	}
	if len(got.Products) != 2 {
		t.Errorf("saved products = %d, want 2", len(got.Products))
	}
}

// asForbidden is a tiny errors.As helper kept local to avoid importing errors in
// several tests.
func asForbidden(err error, target **domain.ForbiddenError) bool {
	fb, ok := err.(*domain.ForbiddenError)
	if ok {
		*target = fb
	}
	return ok
}
