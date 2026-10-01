package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// fakePaystack scripts Initialize/Verify outcomes.
type fakePaystack struct {
	verifyOK     bool
	verifyAmount int64
	initCalls    int
}

func (f *fakePaystack) Simulated() bool { return false }
func (f *fakePaystack) Initialize(_ context.Context, _ string, _ int64, _, reference, callbackURL string) (string, string, error) {
	f.initCalls++
	return "https://pay.example/" + reference + "?cb=" + callbackURL, "ACCESS_" + reference, nil
}
func (f *fakePaystack) Verify(_ context.Context, ref string) (PaymentCheck, error) {
	return scriptedCheck(f.verifyOK, f.verifyAmount, ref), nil
}

// scriptedCheck is the PaymentCheck a scripted fake reports: a GHS charge of
// amount on ref when ok, a failed one otherwise.
func scriptedCheck(ok bool, amount int64, ref string) PaymentCheck {
	if !ok {
		return PaymentCheck{Outcome: PaymentFailed, Reference: ref}
	}
	return PaymentCheck{Outcome: PaymentPaid, AmountPesewas: amount, Currency: paymentCurrency, Reference: ref}
}

// racingPaystack verifies like fakePaystack, but its first Verify first runs
// `meanwhile`: a second confirm of the same reference landing during the first
// confirm's Paystack round trip — the window every check-then-act confirm race
// lives in (redirect + webhook, or a burst of replayed confirms).
type racingPaystack struct {
	fakePaystack
	meanwhile func()
}

func (p *racingPaystack) Verify(ctx context.Context, ref string) (PaymentCheck, error) {
	if f := p.meanwhile; f != nil {
		p.meanwhile = nil
		f()
	}
	return p.fakePaystack.Verify(ctx, ref)
}

// countingNotifs records in-app notifications so tests can assert how many
// times a settlement announced itself.
type countingNotifs struct {
	stubNotifs
	sent []domain.Notification
}

func (n *countingNotifs) Insert(_ context.Context, x domain.Notification) error {
	n.sent = append(n.sent, x)
	return nil
}

// fakePledges is an in-memory PledgeRepository.
type fakePledges struct{ rows []domain.Pledge }

func (f *fakePledges) Insert(_ context.Context, p domain.Pledge) error {
	f.rows = append(f.rows, p)
	return nil
}
func (f *fakePledges) ByReference(_ context.Context, ref string) (*domain.Pledge, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			return &f.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "pledge"}
}

// MarkSuccess mirrors the repository's conditional write: only a pledge that
// has not already succeeded transitions, and the result says whether it did.
func (f *fakePledges) MarkSuccess(_ context.Context, ref, at string, fee, net int64) (bool, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status != domain.PledgeSuccess {
			f.rows[i].Status = domain.PledgeSuccess
			f.rows[i].ConfirmedAt = at
			f.rows[i].FeePesewas = fee
			f.rows[i].NetPesewas = net
			f.rows[i].GrantPending = true
			return true, nil
		}
	}
	return false, nil
}
func (f *fakePledges) MarkGranted(_ context.Context, ref string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			f.rows[i].GrantPending = false
		}
	}
	return nil
}
func (f *fakePledges) MarkFailed(_ context.Context, ref string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status != domain.PledgeSuccess {
			f.rows[i].Status = domain.PledgeFailed
		}
	}
	return nil
}
func (f *fakePledges) All(context.Context) ([]domain.Pledge, error) { return f.rows, nil }
func (f *fakePledges) ByProject(_ context.Context, projectID string) ([]domain.Pledge, error) {
	var out []domain.Pledge
	for _, p := range f.rows {
		if p.ProjectID == projectID {
			out = append(out, p)
		}
	}
	return out, nil
}
func (f *fakePledges) ByMember(_ context.Context, memberID string) ([]domain.Pledge, error) {
	out := []domain.Pledge{}
	for _, p := range f.rows {
		if p.MemberID == memberID {
			out = append(out, p)
		}
	}
	return out, nil
}

func paymentsFixture(verifyOK bool, verifyAmount int64) (*PaymentsService, *fakeRepo, *fakePledges, *fakePaystack) {
	return paymentsFixtureFee(verifyOK, verifyAmount, 5)
}

func paymentsFixtureFee(verifyOK bool, verifyAmount int64, feePercent int) (*PaymentsService, *fakeRepo, *fakePledges, *fakePaystack) {
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "pr-1", Slug: "library-corner", Type: domain.TypeProject, OwnerID: "m-aidoo", Status: domain.StatusApproved, Title: "Library corner", Details: map[string]any{"goalPesewas": int64(100_000)}},
		{ID: "pr-2", Slug: "pending-project", Type: domain.TypeProject, Status: domain.StatusPending, Title: "Not yet approved"},
	}}
	pledges := &fakePledges{}
	ps := &fakePaystack{verifyOK: verifyOK, verifyAmount: verifyAmount}
	svc := NewPaymentsService(listings, pledges, stubNotifs{}, stubMembers{}, &fakePlans{}, ps, "http://localhost:5173", feePercent)
	return svc, listings, pledges, ps
}

func TestStartPledge_validation(t *testing.T) {
	svc, _, _, _ := paymentsFixture(true, 0)
	ctx := context.Background()

	if _, _, _, err := svc.StartPledge(ctx, "library-corner", "m-1", "a@b.c", 50); err == nil {
		t.Error("expected amount-too-small to be rejected")
	}
	if _, _, _, err := svc.StartPledge(ctx, "library-corner", "m-1", "a@b.c", 100_000_01); err == nil {
		t.Error("expected amount-too-large to be rejected")
	}
	if _, _, _, err := svc.StartPledge(ctx, "library-corner", "m-1", "", 5_00); err == nil {
		t.Error("expected missing email to be rejected")
	}
	if _, _, _, err := svc.StartPledge(ctx, "pending-project", "m-1", "a@b.c", 5_00); err == nil {
		t.Error("expected pledging to an unapproved project to be rejected")
	}
}

func TestPledgeFlow_successIncrementsRaisedOnce(t *testing.T) {
	svc, listings, pledges, ps := paymentsFixture(true, 5_00)
	ctx := context.Background()

	authURL, _, ref, err := svc.StartPledge(ctx, "library-corner", "m-1", "ama@oguaa.test", 5_00)
	if err != nil {
		t.Fatalf("StartPledge failed: %v", err)
	}
	if !strings.Contains(authURL, ref) || ps.initCalls != 1 {
		t.Errorf("expected an authorization URL carrying the reference; got %q", authURL)
	}
	if pledges.rows[0].Status != domain.PledgePending {
		t.Errorf("new pledge status = %q, want pending", pledges.rows[0].Status)
	}

	p, err := svc.ConfirmPledge(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmPledge failed: %v", err)
	}
	if p.Status != domain.PledgeSuccess {
		t.Errorf("confirmed status = %q, want success", p.Status)
	}
	raised, _ := listings.listings[0].Details["raisedPesewas"].(int64)
	if raised != 475 { // 5% fee on 500 pesewas = 25; net credited
		t.Errorf("raised = %d, want 475 (net of 5%% fee)", raised)
	}

	// Idempotent: webhook + redirect both confirming must not double-count.
	if _, err := svc.ConfirmPledge(ctx, ref); err != nil {
		t.Fatalf("second confirm errored: %v", err)
	}
	raised, _ = listings.listings[0].Details["raisedPesewas"].(int64)
	if raised != 475 {
		t.Errorf("raised after double-confirm = %d, want 475 (no double count)", raised)
	}
}

// TestConfirmPledge_platformFeeSplit: 5% on a GH₵100 pledge → 500 pesewas fee
// kept by the platform, 9500 net credited to the project.
func TestConfirmPledge_platformFeeSplit(t *testing.T) {
	svc, listings, pledges, _ := paymentsFixtureFee(true, 100_00, 5)
	ctx := context.Background()
	_, _, ref, err := svc.StartPledge(ctx, "library-corner", "m-1", "ama@oguaa.test", 100_00)
	if err != nil {
		t.Fatalf("StartPledge failed: %v", err)
	}
	p, err := svc.ConfirmPledge(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmPledge failed: %v", err)
	}
	if p.FeePesewas != 500 || p.NetPesewas != 9500 {
		t.Errorf("fee/net = %d/%d, want 500/9500", p.FeePesewas, p.NetPesewas)
	}
	if pledges.rows[0].FeePesewas != 500 || pledges.rows[0].NetPesewas != 9500 {
		t.Errorf("persisted fee/net = %d/%d, want 500/9500", pledges.rows[0].FeePesewas, pledges.rows[0].NetPesewas)
	}
	raised, _ := listings.listings[0].Details["raisedPesewas"].(int64)
	if raised != 9500 {
		t.Errorf("raised = %d, want 9500 (net)", raised)
	}
	gross, fee, net, err := svc.FeeTotals(ctx)
	if err != nil {
		t.Fatalf("FeeTotals failed: %v", err)
	}
	if gross != 100_00 || fee != 500 || net != 9500 {
		t.Errorf("FeeTotals = %d/%d/%d, want 10000/500/9500", gross, fee, net)
	}
}

func TestConfirmPledge_failedVerification(t *testing.T) {
	svc, listings, pledges, _ := paymentsFixture(false, 0)
	ctx := context.Background()
	_, _, ref, err := svc.StartPledge(ctx, "library-corner", "m-1", "ama@oguaa.test", 5_00)
	if err != nil {
		t.Fatalf("StartPledge failed: %v", err)
	}
	if _, err := svc.ConfirmPledge(ctx, ref); err == nil {
		t.Error("expected confirm to fail when verification fails")
	}
	if pledges.rows[0].Status != domain.PledgeFailed {
		t.Errorf("pledge status = %q, want failed", pledges.rows[0].Status)
	}
	if raised, _ := listings.listings[0].Details["raisedPesewas"].(int64); raised != 0 {
		t.Errorf("raised should stay 0 on failure, got %d", raised)
	}
}

func TestConfirmPledge_amountMismatchFails(t *testing.T) {
	svc, _, pledges, _ := paymentsFixture(true, 1_00) // verified amount < pledged 5_00
	ctx := context.Background()
	_, _, ref, _ := svc.StartPledge(ctx, "library-corner", "m-1", "ama@oguaa.test", 5_00)
	if _, err := svc.ConfirmPledge(ctx, ref); err == nil {
		t.Error("expected confirm to fail when the charged amount is short")
	}
	if pledges.rows[0].Status != domain.PledgeFailed {
		t.Errorf("pledge status = %q, want failed", pledges.rows[0].Status)
	}
}

// A confirm that lands while another confirm of the same pledge is waiting on
// Paystack must not credit the project a second time (F137/F140).
func TestConfirmPledge_concurrentConfirmsCreditOnce(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "pr-1", Slug: "library-corner", Type: domain.TypeProject, OwnerID: "m-aidoo", Status: domain.StatusApproved, Title: "Library corner", Details: map[string]any{}},
	}}
	pledges := &fakePledges{}
	notifs := &countingNotifs{}
	ps := &racingPaystack{fakePaystack: fakePaystack{verifyOK: true, verifyAmount: 100_00}}
	svc := NewPaymentsService(listings, pledges, notifs, stubMembers{}, &fakePlans{}, ps, "http://portal.test", 5)

	_, _, ref, err := svc.StartPledge(ctx, "library-corner", "m-1", "ama@example.com", 100_00)
	if err != nil {
		t.Fatalf("StartPledge: %v", err)
	}
	ps.meanwhile = func() { // e.g. the webhook, mid-way through the redirect confirm
		if _, err := svc.ConfirmPledge(ctx, ref); err != nil {
			t.Errorf("inner confirm: %v", err)
		}
	}
	got, err := svc.ConfirmPledge(ctx, ref)
	if err != nil {
		t.Fatalf("outer confirm: %v", err)
	}
	if got.Status != domain.PledgeSuccess || got.NetPesewas != 9_500 {
		t.Errorf("outer confirm returned %+v, want the settled pledge", got)
	}
	if raised, _ := listings.listings[0].Details["raisedPesewas"].(int64); raised != 9_500 {
		t.Errorf("raised = %d, want 9500 — one payment credited exactly once", raised)
	}
	if len(notifs.sent) != 1 {
		t.Errorf("owner notified %d times, want once", len(notifs.sent))
	}
}

// A late failed verification can never knock a settled pledge back to failed.
func TestConfirmPledge_lateFailureNeverOverwritesSuccess(t *testing.T) {
	ctx := context.Background()
	svc, _, pledges, _ := paymentsFixture(true, 5_00)
	_, _, ref, _ := svc.StartPledge(ctx, "library-corner", "m-1", "ama@example.com", 5_00)
	if _, err := svc.ConfirmPledge(ctx, ref); err != nil {
		t.Fatalf("ConfirmPledge: %v", err)
	}
	stale := pledges.rows[0]
	stale.Status = domain.PledgePending // a confirm that read the record before it settled
	if _, err := svc.fulfillPledge(ctx, &stale, false, 0); !errors.Is(err, ErrPaymentNotCompleted) {
		t.Fatalf("want ErrPaymentNotCompleted, got %v", err)
	}
	if pledges.rows[0].Status != domain.PledgeSuccess {
		t.Errorf("status = %q, want success to stand", pledges.rows[0].Status)
	}
}

// A campaign past its funding deadline takes no more pledges (F147).
func TestStartPledge_refusesAfterDeadline(t *testing.T) {
	svc, listings, pledges, _ := paymentsFixture(true, 0)
	ctx := context.Background()
	for _, deadline := range []string{"2020-08-20T23:59:59Z", "2020-08-20"} {
		listings.listings[0].Details["deadline"] = deadline
		if _, _, _, err := svc.StartPledge(ctx, "library-corner", "m-1", "a@b.c", 5_000); !errors.Is(err, ErrFundingClosed) {
			t.Errorf("deadline %s: want ErrFundingClosed, got %v", deadline, err)
		}
	}
	if len(pledges.rows) != 0 {
		t.Fatalf("closed campaigns must not record pledges, got %d", len(pledges.rows))
	}
	listings.listings[0].Details["deadline"] = time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339)
	if _, _, _, err := svc.StartPledge(ctx, "library-corner", "m-1", "a@b.c", 5_000); err != nil {
		t.Errorf("open campaign: %v", err)
	}
}
