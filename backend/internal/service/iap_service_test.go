package service

import (
	"context"
	"errors"
	"sync"
	"testing"

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

func (f *fakeAppleTxRepo) ByTransactionID(_ context.Context, id string) (*domain.AppleTransactionRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if r, ok := f.rows[id]; ok {
		return &r, nil
	}
	return nil, nil
}

func (f *fakeAppleTxRepo) DeleteByMember(_ context.Context, memberID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	for k, v := range f.rows {
		if v.MemberID == memberID {
			delete(f.rows, k)
		}
	}
	return nil
}

func (f *fakeAppleTxRepo) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.rows)
}

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

func TestForgetAppleTransactionsClearsTheMember(t *testing.T) {
	repo := newFakeAppleTxRepo()
	ctx := context.Background()
	_, _ = repo.Claim(ctx, domain.AppleTransactionRecord{TransactionID: "a", MemberID: "m-1"})
	_, _ = repo.Claim(ctx, domain.AppleTransactionRecord{TransactionID: "b", MemberID: "m-2"})

	s := NewIAPService(nil, repo, nil, nil)
	if err := s.ForgetAppleTransactions(ctx, "m-1"); err != nil {
		t.Fatalf("ForgetAppleTransactions: %v", err)
	}
	if got, _ := repo.ByTransactionID(ctx, "a"); got != nil {
		t.Error("erased member's transaction survived")
	}
	if got, _ := repo.ByTransactionID(ctx, "b"); got == nil {
		t.Error("another member's transaction was deleted")
	}
}
