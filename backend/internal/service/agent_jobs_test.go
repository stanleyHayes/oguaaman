package service

import (
	"context"
	"fmt"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// ── minimal fakes ────────────────────────────────────────────────────────────

type stubPaystack struct {
	ok  bool
	amt int64
}

func (s stubPaystack) Initialize(context.Context, string, int64, string, string, string) (string, string, error) {
	return "https://pay.test/x", "acc_x", nil
}
func (s stubPaystack) Verify(context.Context, string) (bool, int64, error) { return s.ok, s.amt, nil }
func (s stubPaystack) Simulated() bool                                     { return true }

type stubJobs struct{ m map[string]domain.AgentJob }

func newStubJobs() *stubJobs { return &stubJobs{m: map[string]domain.AgentJob{}} }
func (s *stubJobs) ByID(_ context.Context, id string) (domain.AgentJob, error) {
	if j, ok := s.m[id]; ok {
		return j, nil
	}
	return domain.AgentJob{}, fmt.Errorf("not found")
}
func (s *stubJobs) ByReference(_ context.Context, ref string) (domain.AgentJob, error) {
	for _, j := range s.m {
		if j.Reference == ref {
			return j, nil
		}
	}
	return domain.AgentJob{}, fmt.Errorf("not found")
}
func (s *stubJobs) ForClient(context.Context, string) ([]domain.AgentJob, error) { return nil, nil }
func (s *stubJobs) ForAgentMember(context.Context, string) ([]domain.AgentJob, error) {
	return nil, nil
}
func (s *stubJobs) Disputed(context.Context) ([]domain.AgentJob, error) { return nil, nil }
func (s *stubJobs) Create(_ context.Context, j domain.AgentJob) (domain.AgentJob, error) {
	s.m[j.ID] = j
	return j, nil
}
func (s *stubJobs) Update(_ context.Context, j domain.AgentJob) (domain.AgentJob, error) {
	s.m[j.ID] = j
	return j, nil
}

type stubAgents struct{ m map[string]domain.Agent }

func (s *stubAgents) All(context.Context) ([]domain.Agent, error) { return nil, nil }
func (s *stubAgents) ByID(_ context.Context, id string) (domain.Agent, error) {
	if a, ok := s.m[id]; ok {
		return a, nil
	}
	return domain.Agent{}, fmt.Errorf("not found")
}
func (s *stubAgents) BySlug(_ context.Context, slug string) (domain.Agent, error) {
	for _, a := range s.m {
		if a.Slug == slug {
			return a, nil
		}
	}
	return domain.Agent{}, fmt.Errorf("not found")
}
func (s *stubAgents) ByMemberID(context.Context, string) (domain.Agent, error) {
	return domain.Agent{}, fmt.Errorf("not found")
}
func (s *stubAgents) Create(_ context.Context, a domain.Agent) (domain.Agent, error) { return a, nil }
func (s *stubAgents) Update(_ context.Context, a domain.Agent) (domain.Agent, error) {
	s.m[a.ID] = a
	return a, nil
}
func (s *stubAgents) Delete(context.Context, string) error             { return nil }
func (s *stubAgents) InsertMany(context.Context, []domain.Agent) error { return nil }

// ── the flow ─────────────────────────────────────────────────────────────────

func TestAgentJobEscrowFlow(t *testing.T) {
	agents := &stubAgents{m: map[string]domain.Agent{
		"agent-1": {ID: "agent-1", Slug: "kwame", MemberID: "m-agent", DisplayName: "Kwame", Status: domain.AgentStatusVerified, JobsCompleted: 4},
	}}
	jobs := newStubJobs()
	// 10% platform fee; Paystack verifies success for the quoted amount.
	svc := NewAgentJobsService(jobs, agents, nil, stubPaystack{ok: true, amt: 50000}, "https://portal", 10)
	ctx := context.Background()
	client := domain.Member{ID: "m-client", DisplayName: "Ama"}

	// 1 · request
	j, err := svc.RequestJob(ctx, "kwame", client, JobInput{Service: "errands", Title: "Buy fabric at Kejetia", Description: "6 yards, send photos first."})
	if err != nil {
		t.Fatalf("RequestJob: %v", err)
	}
	if j.Status != domain.JobStatusRequested {
		t.Fatalf("status = %q, want requested", j.Status)
	}

	// hiring yourself is refused
	if _, err := svc.RequestJob(ctx, "kwame", domain.Member{ID: "m-agent"}, JobInput{Title: "self", Description: "x"}); err == nil {
		t.Fatal("expected self-hire to be refused")
	}

	// 2 · a non-agent cannot quote; the agent can
	if _, err := svc.QuoteJob(ctx, j.ID, "m-someone", 50000, ""); err == nil {
		t.Fatal("expected non-agent quote to be forbidden")
	}
	j, err = svc.QuoteJob(ctx, j.ID, "m-agent", 50000, "flat rate")
	if err != nil {
		t.Fatalf("QuoteJob: %v", err)
	}
	if j.Status != domain.JobStatusQuoted || j.QuotePesewas != 50000 {
		t.Fatalf("after quote: %+v", j)
	}

	// 3 · only the client can fund
	if _, _, _, err := svc.AcceptAndFund(ctx, j.ID, "m-agent", "a@b.co"); err == nil {
		t.Fatal("expected non-client fund to be forbidden")
	}
	_, _, ref, err := svc.AcceptAndFund(ctx, j.ID, "m-client", "ama@example.com")
	if err != nil {
		t.Fatalf("AcceptAndFund: %v", err)
	}

	// 4 · confirm funding → escrow held with the right fee + payout
	j, err = svc.ConfirmFunding(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmFunding: %v", err)
	}
	if j.Status != domain.JobStatusFunded || j.Escrow.Status != domain.EscrowHeld {
		t.Fatalf("after funding: %+v", j)
	}
	if j.Escrow.HeldPesewas != 50000 || j.Escrow.PlatformFeePesewas != 5000 || j.Escrow.PayoutPesewas != 45000 {
		t.Fatalf("escrow math wrong: held=%d fee=%d payout=%d", j.Escrow.HeldPesewas, j.Escrow.PlatformFeePesewas, j.Escrow.PayoutPesewas)
	}
	// idempotent
	if j2, err := svc.ConfirmFunding(ctx, ref); err != nil || j2.Escrow.HeldPesewas != 50000 {
		t.Fatalf("ConfirmFunding not idempotent: %+v %v", j2, err)
	}

	// 5 · deliver (agent) then complete (client) → released + reputation ticks
	if _, err := svc.DeliverJob(ctx, j.ID, "m-agent"); err != nil {
		t.Fatalf("DeliverJob: %v", err)
	}
	j, err = svc.CompleteJob(ctx, j.ID, "m-client")
	if err != nil {
		t.Fatalf("CompleteJob: %v", err)
	}
	if j.Status != domain.JobStatusCompleted || j.Escrow.Status != domain.EscrowReleased {
		t.Fatalf("after complete: %+v", j)
	}
	if agents.m["agent-1"].JobsCompleted != 5 {
		t.Fatalf("JobsCompleted = %d, want 5", agents.m["agent-1"].JobsCompleted)
	}
}
