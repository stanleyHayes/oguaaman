package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// fakeAppleTxRepo mirrors the Mongo repo's contract: Claim is atomic, and a
// repeat transaction id reports alreadyRedeemed rather than inserting twice.
type fakeAppleTxRepo struct {
	mu   sync.Mutex
	rows map[string]domain.AppleTransactionRecord
}

func newFakeAppleTxRepo() *fakeAppleTxRepo {
	return &fakeAppleTxRepo{rows: map[string]domain.AppleTransactionRecord{}}
}

func (f *fakeAppleTxRepo) Claim(_ context.Context, rec domain.AppleTransactionRecord) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, seen := f.rows[rec.TransactionID]; seen {
		return true, nil
	}
	f.rows[rec.TransactionID] = rec
	return false, nil
}

func (f *fakeAppleTxRepo) Unclaim(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if r, ok := f.rows[id]; ok && r.ErasedAt == "" {
		delete(f.rows, id)
	}
	return nil
}

func (f *fakeAppleTxRepo) ByTransactionID(_ context.Context, id string) (*domain.AppleTransactionRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if r, ok := f.rows[id]; ok {
		return &r, nil
	}
	return nil, nil
}

func (f *fakeAppleTxRepo) LatestByOriginalTransactionID(_ context.Context, id string) (*domain.AppleTransactionRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var latest *domain.AppleTransactionRecord
	for _, r := range f.rows {
		if id != "" && r.OriginalTransactionID == id && (latest == nil || r.RedeemedAt > latest.RedeemedAt) {
			row := r
			latest = &row
		}
	}
	return latest, nil
}

func (f *fakeAppleTxRepo) PseudonymiseMember(_ context.Context, memberID, pseudonym, erasedAt, retainUntil string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	for k, v := range f.rows {
		if v.MemberID == memberID {
			v.MemberID, v.Reference, v.ErasedAt, v.RetainUntil = pseudonym, "", erasedAt, retainUntil
			f.rows[k] = v
		}
	}
	return nil
}

func (f *fakeAppleTxRepo) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.rows)
}

// iapMembers is a stateful member store for creator-plan grants.
type iapMembers struct {
	stubMembers
	byID map[string]*domain.Member
}

func (m *iapMembers) ByID(_ context.Context, id string) (*domain.Member, error) {
	if v, ok := m.byID[id]; ok {
		return v, nil
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}
func (m *iapMembers) SetCreatorSubscription(_ context.Context, id, plan, until string) error {
	if v, ok := m.byID[id]; ok {
		v.CreatorPlan, v.CreatorSubscribedUntil = plan, until
	}
	return nil
}

const (
	iapCreatorProduct  = "gh.oguaa.app.creator.supporter.monthly"
	iapFeaturedProduct = "gh.oguaa.app.business.featured.monthly"
)

type iapFixture struct {
	svc      *IAPService
	ca       *fakeCA
	txs      *fakeAppleTxRepo
	subs     *fakeSubs
	listings *fakeRepo
	members  *iapMembers
}

func newIAPFixture(t *testing.T) *iapFixture {
	t.Helper()
	ca := newFakeCA(t)
	listings := &fakeRepo{listings: []domain.Listing{{ID: "b-1", Slug: "castle-view", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Title: "Castle View", Details: map[string]any{}}}}
	subs := &fakeSubs{}
	members := &iapMembers{byID: map[string]*domain.Member{"m-yaw": {ID: "m-yaw"}, "m-ama": {ID: "m-ama"}}}
	plans := &fakePlans{rows: []domain.Plan{
		{ID: "p1", Slug: "featured", Active: true, IncludedPromoDays: 7, Prices: map[string]int64{"default": 12_000}},
		{ID: "p2", Slug: "creator-supporter", Active: true, Prices: map[string]int64{"default": 3_000}},
	}}
	subsSvc := NewSubscriptionsService(listings, subs, plans, members, &fakePaystack{}, "", "")
	txs := newFakeAppleTxRepo()
	return &iapFixture{svc: NewIAPService(policyVerifier(t, ca, false), txs, subsSvc, nil), ca: ca, txs: txs, subs: subs, listings: listings, members: members}
}

func (f *iapFixture) receipt(t *testing.T, txID, original, product, env string, expires time.Time, token string) string {
	t.Helper()
	return f.ca.signJWS(t, AppleTransaction{
		TransactionID: txID, OriginalTransactionID: original, ProductID: product, BundleID: "gh.oguaa.app",
		Environment: env, Type: "Auto-Renewable Subscription", PurchaseDate: time.Now().UnixMilli(),
		ExpiresDate: expires.UnixMilli(), AppAccountToken: token,
	})
}

func (f *iapFixture) pendingSub(ref, member, scope, plan, listingID string) {
	f.subs.rows = append(f.subs.rows, domain.Subscription{ID: "s" + ref, Reference: ref, MemberID: member, Scope: scope, Plan: plan, ListingID: listingID, AmountPesewas: 12_000, Status: domain.PledgePending})
}

func monthAhead() time.Time { return time.Now().UTC().Add(30 * 24 * time.Hour).Truncate(time.Second) }

// The product map is the contract with App Store Connect. Both directions have
// to agree or a genuine purchase silently grants nothing.
func TestPlanProductMapRoundTrips(t *testing.T) {
	if len(domain.AppleProductForPlan) == 0 {
		t.Fatal("no Apple products configured")
	}
	for plan, product := range domain.AppleProductForPlan {
		got, ok := domain.PlanForAppleProduct(product)
		if !ok {
			t.Errorf("product %q maps to no plan", product)
			continue
		}
		if got != plan {
			t.Errorf("product %q maps back to plan %q, want %q", product, got, plan)
		}
		p, ok := domain.AppleProductByID(product)
		if !ok || (p.Scope != domain.SubscriptionScopeCreator && p.Scope != domain.SubscriptionScopeBusiness) {
			t.Errorf("product %q has no audience scope: %+v", product, p)
		}
	}
	if _, ok := domain.PlanForAppleProduct("com.someone.else.pro"); ok {
		t.Error("an unknown product id resolved to a plan — a receipt for anything would grant a subscription")
	}
}

func TestProductIDsAreUnique(t *testing.T) {
	seen := map[string]string{}
	for plan, product := range domain.AppleProductForPlan {
		if other, dup := seen[product]; dup {
			t.Errorf("product %q is mapped by both %q and %q — the reverse lookup is ambiguous", product, other, plan)
		}
		seen[product] = plan
	}
}

func TestAppAccountTokenIsAStablePerMemberUUID(t *testing.T) {
	a, b := AppAccountToken("m-yaw"), AppAccountToken("m-ama")
	if a != AppAccountToken("m-yaw") || a == b || len(a) != 36 || a[14] != '8' {
		t.Fatalf("tokens %q / %q", a, b)
	}
}

// Redemption without a configured verifier must refuse rather than grant.
func TestRedeemRefusesWhenNotConfigured(t *testing.T) {
	var s *IAPService
	if s.Enabled() {
		t.Fatal("a nil IAPService reports Enabled()")
	}
	s2 := NewIAPService(nil, newFakeAppleTxRepo(), nil, nil)
	if s2.Enabled() {
		t.Fatal("an IAPService with no verifier reports Enabled()")
	}
	if _, err := s2.Redeem(context.Background(), "m-1", "anything", ""); err == nil {
		t.Fatal("an unconfigured service granted a redemption")
	}
}

// A receipt that fails verification must never reach the claim store.
func TestRedeemRejectsUnverifiableReceipt(t *testing.T) {
	v, err := NewAppleVerifier("gh.oguaa.app", false)
	if err != nil {
		t.Fatalf("verifier: %v", err)
	}
	repo := newFakeAppleTxRepo()
	s := NewIAPService(v, repo, &SubscriptionsService{}, nil)

	_, err = s.Redeem(context.Background(), "m-1", "not.a.receipt", "")
	if !errors.Is(err, ErrAppleReceiptInvalid) {
		t.Fatalf("got %v, want ErrAppleReceiptInvalid", err)
	}
	if repo.count() != 0 {
		t.Errorf("an unverifiable receipt was recorded as claimed (%d rows)", repo.count())
	}
}

// F048/A008: the grant is the plan Apple sold. A cheap product can't settle a
// checkout for a dearer plan.
func TestRedeemGrantsOnlyThePlanAppleSold(t *testing.T) {
	f := newIAPFixture(t)
	f.pendingSub("sub-castle-view-1", "m-yaw", domain.SubscriptionScopeBusiness, "featured", "b-1")
	jws := f.receipt(t, "tx-1", "tx-1", iapCreatorProduct, "Production", monthAhead(), "")
	_, err := f.svc.Redeem(context.Background(), "m-yaw", jws, "sub-castle-view-1")
	if !errors.Is(err, ErrIAPPlanMismatch) {
		t.Fatalf("err=%v, want ErrIAPPlanMismatch", err)
	}
	if f.txs.count() != 0 || f.subs.rows[0].Status != domain.PledgePending {
		t.Fatal("a mismatched purchase was claimed or settled the checkout")
	}
	if _, set := f.listings.listings[0].Details["subscribedUntil"]; set {
		t.Fatal("the Featured plan was granted for a Creator Supporter purchase")
	}
}

// A008: the checkout must be the caller's own.
func TestRedeemRefusesAnotherMembersCheckout(t *testing.T) {
	f := newIAPFixture(t)
	f.pendingSub("csub-m-ama-1", "m-ama", domain.SubscriptionScopeCreator, "creator-supporter", "")
	jws := f.receipt(t, "tx-1", "tx-1", iapCreatorProduct, "Production", monthAhead(), "")
	_, err := f.svc.Redeem(context.Background(), "m-yaw", jws, "csub-m-ama-1")
	var fb *domain.ForbiddenError
	if !errors.As(err, &fb) || f.txs.count() != 0 {
		t.Fatalf("err=%v claims=%d, want forbidden and nothing claimed", err, f.txs.count())
	}
}

// A008: a purchase made for one Oguaa account can't be redeemed by another.
func TestRedeemRefusesAPurchaseMadeForAnotherAccount(t *testing.T) {
	f := newIAPFixture(t)
	jws := f.receipt(t, "tx-1", "tx-1", iapCreatorProduct, "Production", monthAhead(), AppAccountToken("m-ama"))
	if _, err := f.svc.Redeem(context.Background(), "m-yaw", jws, ""); !errors.Is(err, ErrIAPWrongAccount) {
		t.Fatalf("err=%v, want ErrIAPWrongAccount", err)
	}
	if _, err := f.svc.Redeem(context.Background(), "m-ama", jws, ""); err != nil {
		t.Fatalf("the buyer's own redemption: %v", err)
	}
}

// F055/A008: a creator plan needs no reference and runs to Apple's expiry;
// the ledger records the purchase.
func TestRedeemCreatorPlanWithoutReferenceGrantsUntilAppleExpiry(t *testing.T) {
	f := newIAPFixture(t)
	expires := monthAhead()
	res, err := f.svc.Redeem(context.Background(), "m-yaw", f.receipt(t, "tx-1", "tx-1", iapCreatorProduct, "Production", expires, AppAccountToken("m-yaw")), "")
	if err != nil {
		t.Fatal(err)
	}
	m := f.members.byID["m-yaw"]
	if m.CreatorPlan != "creator-supporter" || m.CreatorSubscribedUntil != expires.Format(time.RFC3339) || res.ExpiresAt != m.CreatorSubscribedUntil {
		t.Fatalf("member=%+v result=%+v", m, res)
	}
	if len(f.subs.rows) != 1 || f.subs.rows[0].Status != domain.PledgeSuccess || f.subs.rows[0].AmountPesewas != 3_000 {
		t.Fatalf("ledger=%+v", f.subs.rows)
	}
	// Replaying the same receipt grants nothing more.
	if _, err := f.svc.Redeem(context.Background(), "m-yaw", f.receipt(t, "tx-1", "tx-1", iapCreatorProduct, "Production", expires, ""), ""); !errors.Is(err, ErrIAPAlreadyRedeemed) {
		t.Fatalf("replay err=%v", err)
	}
}

// F055: a business purchase that can't be applied is never claimed; its
// renewals find the business from the earlier redemption.
func TestBusinessPlanNeedsItsBusinessAndRenewalsFollowIt(t *testing.T) {
	f := newIAPFixture(t)
	first := monthAhead()
	if _, err := f.svc.Redeem(context.Background(), "m-yaw", f.receipt(t, "tx-1", "tx-1", iapFeaturedProduct, "Production", first, ""), ""); !errors.Is(err, ErrIAPNeedsReference) {
		t.Fatalf("err=%v, want ErrIAPNeedsReference", err)
	}
	if f.txs.count() != 0 {
		t.Fatal("an unapplied purchase was claimed — it could never be redeemed again")
	}
	f.pendingSub("sub-castle-view-1", "m-yaw", domain.SubscriptionScopeBusiness, "featured", "b-1")
	if _, err := f.svc.Redeem(context.Background(), "m-yaw", f.receipt(t, "tx-1", "tx-1", iapFeaturedProduct, "Production", first, ""), "sub-castle-view-1"); err != nil {
		t.Fatal(err)
	}
	l := f.listings.listings[0]
	if l.Details["subscribedUntil"] != first.Format(time.RFC3339) || l.Details["plan"] != "featured" || !l.Featured {
		t.Fatalf("business not granted: %+v featured=%v", l.Details, l.Featured)
	}
	if f.subs.rows[0].Status != domain.PledgeSuccess || f.subs.rows[0].PeriodEnd != first.Format(time.RFC3339) {
		t.Fatalf("checkout not settled: %+v", f.subs.rows[0])
	}
	renewal := first.Add(30 * 24 * time.Hour)
	res, err := f.svc.Redeem(context.Background(), "m-yaw", f.receipt(t, "tx-2", "tx-1", iapFeaturedProduct, "Production", renewal, ""), "")
	if err != nil || res.ListingID != "b-1" {
		t.Fatalf("renewal: %+v %v", res, err)
	}
	if f.listings.listings[0].Details["subscribedUntil"] != renewal.Format(time.RFC3339) {
		t.Fatalf("renewal not applied: %+v", f.listings.listings[0].Details)
	}
	// Someone else can't ride on the renewal chain.
	if _, err := f.svc.Redeem(context.Background(), "m-ama", f.receipt(t, "tx-3", "tx-1", iapFeaturedProduct, "Production", renewal, ""), ""); !errors.Is(err, ErrIAPNeedsReference) {
		t.Fatalf("another member's renewal: %v", err)
	}
}

// A009/F058: a sandbox purchase is accepted, flagged, capped at 24 hours and
// kept off the revenue ledger.
func TestSandboxPurchaseIsFlaggedShortAndOffTheLedger(t *testing.T) {
	f := newIAPFixture(t)
	f.pendingSub("csub-m-yaw-1", "m-yaw", domain.SubscriptionScopeCreator, "creator-supporter", "")
	res, err := f.svc.Redeem(context.Background(), "m-yaw", f.receipt(t, "tx-sb", "tx-sb", iapCreatorProduct, AppleEnvironmentSandbox, monthAhead(), ""), "csub-m-yaw-1")
	if err != nil {
		t.Fatal(err)
	}
	until, _ := time.Parse(time.RFC3339, f.members.byID["m-yaw"].CreatorSubscribedUntil)
	if !res.Sandbox || until.After(time.Now().Add(24*time.Hour+time.Minute)) || until.Before(time.Now().Add(23*time.Hour)) {
		t.Fatalf("sandbox grant until %v (result %+v)", until, res)
	}
	rec, _ := f.txs.ByTransactionID(context.Background(), "tx-sb")
	if rec == nil || !rec.Sandbox || rec.Environment != AppleEnvironmentSandbox {
		t.Fatalf("claim not flagged: %+v", rec)
	}
	if len(f.subs.rows) != 1 || f.subs.rows[0].Status != domain.PledgePending {
		t.Fatalf("a sandbox purchase reached the revenue ledger: %+v", f.subs.rows)
	}
}

// A grant never shortens or replaces a longer paid period.
func TestAppleGrantNeverShortensALongerPeriod(t *testing.T) {
	f := newIAPFixture(t)
	long := time.Now().UTC().Add(300 * 24 * time.Hour).Format(time.RFC3339)
	f.members.byID["m-yaw"].CreatorPlan, f.members.byID["m-yaw"].CreatorSubscribedUntil = "creator-pro", long
	if _, err := f.svc.Redeem(context.Background(), "m-yaw", f.receipt(t, "tx-1", "tx-1", iapCreatorProduct, "Production", monthAhead(), ""), ""); err != nil {
		t.Fatal(err)
	}
	if m := f.members.byID["m-yaw"]; m.CreatorSubscribedUntil != long || m.CreatorPlan != "creator-pro" {
		t.Fatalf("existing period changed: %+v", m)
	}
}

// Replay protection is the property that matters most: one real purchase must
// grant exactly once, however many times it is posted.
func TestClaimIsIdempotentUnderReplay(t *testing.T) {
	repo := newFakeAppleTxRepo()
	rec := domain.AppleTransactionRecord{TransactionID: "tx-1", MemberID: "m-1", PlanSlug: "creator-pro"}

	first, err := repo.Claim(context.Background(), rec)
	if err != nil || first {
		t.Fatalf("first claim: already=%v err=%v, want already=false", first, err)
	}
	for i := 0; i < 5; i++ {
		again, err := repo.Claim(context.Background(), rec)
		if err != nil {
			t.Fatalf("replay %d: %v", i, err)
		}
		if !again {
			t.Fatalf("replay %d was accepted as new — one purchase could extend a subscription forever", i)
		}
	}
	if repo.count() != 1 {
		t.Errorf("claim store holds %d rows after 6 attempts, want 1", repo.count())
	}
}

// Two devices restoring at once must not both be told "new".
func TestConcurrentClaimsGrantOnce(t *testing.T) {
	repo := newFakeAppleTxRepo()
	rec := domain.AppleTransactionRecord{TransactionID: "tx-race", MemberID: "m-1"}

	const n = 16
	granted := make(chan bool, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			already, err := repo.Claim(context.Background(), rec)
			if err == nil {
				granted <- !already
			}
		}()
	}
	wg.Wait()
	close(granted)

	wins := 0
	for g := range granted {
		if g {
			wins++
		}
	}
	if wins != 1 {
		t.Errorf("%d of %d concurrent claims were treated as new, want exactly 1", wins, n)
	}
}

// F059/G115: erasure unlinks the member but keeps the claim, so the same
// receipt can never be redeemed again by a fresh account.
func TestErasureKeepsTheReplayProtection(t *testing.T) {
	f := newIAPFixture(t)
	jws := f.receipt(t, "tx-1", "tx-1", iapCreatorProduct, "Production", monthAhead(), "")
	if _, err := f.svc.Redeem(context.Background(), "m-yaw", jws, ""); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.ForgetAppleTransactions(context.Background(), "m-yaw"); err != nil {
		t.Fatalf("ForgetAppleTransactions: %v", err)
	}
	rec, _ := f.txs.ByTransactionID(context.Background(), "tx-1")
	if rec == nil {
		t.Fatal("the erased member's purchase record was deleted — the receipt is replayable")
	}
	if rec.MemberID == "m-yaw" || rec.Reference != "" || rec.ErasedAt == "" || rec.RetainUntil == "" {
		t.Fatalf("record not pseudonymised: %+v", rec)
	}
	if _, err := f.svc.Redeem(context.Background(), "m-ama", jws, ""); !errors.Is(err, ErrIAPAlreadyRedeemed) {
		t.Fatalf("a fresh account redeemed the erased member's receipt: %v", err)
	}
}
