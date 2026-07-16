package service

import (
	"context"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// fakePaystack scripts Initialize/Verify outcomes.
type fakePaystack struct {
	verifyOK     bool
	verifyAmount int64
	initCalls    int
}

func (f *fakePaystack) Simulated() bool { return false }
func (f *fakePaystack) Initialize(_ context.Context, _ string, _ int64, _, reference, callbackURL string) (string, error) {
	f.initCalls++
	return "https://pay.example/" + reference + "?cb=" + callbackURL, nil
}
func (f *fakePaystack) Verify(context.Context, string) (bool, int64, error) {
	return f.verifyOK, f.verifyAmount, nil
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
func (f *fakePledges) UpdateStatus(_ context.Context, ref, status, at string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			f.rows[i].Status = status
			if status == domain.PledgeSuccess {
				f.rows[i].ConfirmedAt = at
			}
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "pledge"}
}
func (f *fakePledges) SetFeeNet(_ context.Context, ref string, fee, net int64) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			f.rows[i].FeePesewas = fee
			f.rows[i].NetPesewas = net
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "pledge"}
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
	svc := NewPaymentsService(listings, pledges, stubNotifs{}, ps, "http://localhost:5173", feePercent)
	return svc, listings, pledges, ps
}

func TestStartPledge_validation(t *testing.T) {
	svc, _, _, _ := paymentsFixture(true, 0)
	ctx := context.Background()

	if _, _, err := svc.StartPledge(ctx, "library-corner", "m-1", "a@b.c", 50); err == nil {
		t.Error("expected amount-too-small to be rejected")
	}
	if _, _, err := svc.StartPledge(ctx, "library-corner", "m-1", "a@b.c", 100_000_01); err == nil {
		t.Error("expected amount-too-large to be rejected")
	}
	if _, _, err := svc.StartPledge(ctx, "library-corner", "m-1", "", 5_00); err == nil {
		t.Error("expected missing email to be rejected")
	}
	if _, _, err := svc.StartPledge(ctx, "pending-project", "m-1", "a@b.c", 5_00); err == nil {
		t.Error("expected pledging to an unapproved project to be rejected")
	}
}

func TestPledgeFlow_successIncrementsRaisedOnce(t *testing.T) {
	svc, listings, pledges, ps := paymentsFixture(true, 5_00)
	ctx := context.Background()

	authURL, ref, err := svc.StartPledge(ctx, "library-corner", "m-1", "ama@oguaa.test", 5_00)
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
	_, ref, err := svc.StartPledge(ctx, "library-corner", "m-1", "ama@oguaa.test", 100_00)
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
	_, ref, err := svc.StartPledge(ctx, "library-corner", "m-1", "ama@oguaa.test", 5_00)
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
	_, ref, _ := svc.StartPledge(ctx, "library-corner", "m-1", "ama@oguaa.test", 5_00)
	if _, err := svc.ConfirmPledge(ctx, ref); err == nil {
		t.Error("expected confirm to fail when the charged amount is short")
	}
	if pledges.rows[0].Status != domain.PledgeFailed {
		t.Errorf("pledge status = %q, want failed", pledges.rows[0].Status)
	}
}
