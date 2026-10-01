package service

import (
	"context"
	"errors"
	"fmt"
	"slices"
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
func (s stubPaystack) Verify(_ context.Context, ref string) (PaymentCheck, error) {
	return scriptedCheck(s.ok, s.amt, ref), nil
}
func (s stubPaystack) Simulated() bool { return true }

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
		if j.Reference == ref || slices.Contains(j.PastReferences, ref) {
			return j, nil
		}
	}
	return domain.AgentJob{}, fmt.Errorf("not found")
}
func (s *stubJobs) MarkFunded(_ context.Context, id string, escrow domain.AgentJobEscrow, at string) (bool, error) {
	j, ok := s.m[id]
	if !ok || j.Status != domain.JobStatusQuoted || j.Escrow.Status != domain.EscrowPending {
		return false, nil
	}
	j.Status, j.Escrow, j.UpdatedAt = domain.JobStatusFunded, escrow, at
	s.m[id] = j
	return true, nil
}
func (s *stubJobs) MarkRefundDue(_ context.Context, id string, escrow domain.AgentJobEscrow, reason, at string) (bool, error) {
	j, ok := s.m[id]
	if !ok || j.Status != domain.JobStatusCancelled || j.Escrow.Status != domain.EscrowPending {
		return false, nil
	}
	j.Escrow, j.DisputeReason, j.UpdatedAt = escrow, reason, at
	s.m[id] = j
	return true, nil
}
func (s *stubJobs) AddExtraPayment(_ context.Context, id string, p domain.AgentJobExtraPayment) (bool, error) {
	j, ok := s.m[id]
	if !ok || slices.ContainsFunc(j.ExtraPayments, func(x domain.AgentJobExtraPayment) bool { return x.Reference == p.Reference }) {
		return false, nil
	}
	j.ExtraPayments = append(j.ExtraPayments, p)
	j.UpdatedAt = p.RecordedAt
	s.m[id] = j
	return true, nil
}
func (s *stubJobs) SetReviewed(_ context.Context, id string, reviewed bool) (bool, error) {
	j, ok := s.m[id]
	if !ok || j.Reviewed == reviewed {
		return false, nil
	}
	j.Reviewed = reviewed
	s.m[id] = j
	return true, nil
}
func (s *stubJobs) ForClient(context.Context, string) ([]domain.AgentJob, error) { return nil, nil }
func (s *stubJobs) ForAgentMember(context.Context, string) ([]domain.AgentJob, error) {
	return nil, nil
}
func (s *stubJobs) Disputed(context.Context) ([]domain.AgentJob, error) {
	out := []domain.AgentJob{}
	for _, j := range s.m {
		if j.Status == domain.JobStatusDisputed || j.Escrow.Status == domain.EscrowRefundDue || j.HasUnrefundedExtraPayment() {
			out = append(out, j)
		}
	}
	return out, nil
}
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

type stubReviews struct{ m map[string]domain.AgentReview } // keyed by jobID

func newStubReviews() *stubReviews { return &stubReviews{m: map[string]domain.AgentReview{}} }
func (s *stubReviews) ByAgent(_ context.Context, agentID string) ([]domain.AgentReview, error) {
	out := []domain.AgentReview{}
	for _, r := range s.m {
		if r.AgentID == agentID {
			out = append(out, r)
		}
	}
	return out, nil
}
func (s *stubReviews) ByJob(_ context.Context, jobID string) (domain.AgentReview, error) {
	if r, ok := s.m[jobID]; ok {
		return r, nil
	}
	return domain.AgentReview{}, fmt.Errorf("not found")
}
func (s *stubReviews) Create(_ context.Context, r domain.AgentReview) (domain.AgentReview, error) {
	s.m[r.JobID] = r
	return r, nil
}
func (s *stubReviews) Get(_ context.Context, id string) (domain.AgentReview, error) {
	for _, r := range s.m {
		if r.ID == id {
			return r, nil
		}
	}
	return domain.AgentReview{}, &domain.NotFoundError{Entity: "review"}
}
func (s *stubReviews) SetStatus(_ context.Context, id, status string) error {
	for k, r := range s.m {
		if r.ID == id {
			r.Status = status
			s.m[k] = r
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "review"}
}

// ── the flow ─────────────────────────────────────────────────────────────────

func TestAgentJobEscrowFlow(t *testing.T) {
	agents := &stubAgents{m: map[string]domain.Agent{
		"agent-1": {ID: "agent-1", Slug: "kwame", MemberID: "m-agent", DisplayName: "Kwame", Status: domain.AgentStatusVerified, JobsCompleted: 4},
	}}
	jobs := newStubJobs()
	// 10% platform fee; Paystack verifies success for the quoted amount.
	reviews := newStubReviews()
	svc := NewAgentJobsService(jobs, agents, reviews, nil, stubPaystack{ok: true, amt: 50000}, "https://portal", 10)
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

	// 6 · review → reputation recomputed; double-review refused
	if _, err := svc.ReviewJob(ctx, j.ID, "m-agent", 5, "x"); err == nil {
		t.Fatal("expected non-client review to be forbidden")
	}
	if _, err := svc.ReviewJob(ctx, j.ID, "m-client", 5, "Excellent — photos before paying, delivered early."); err != nil {
		t.Fatalf("ReviewJob: %v", err)
	}
	if a := agents.m["agent-1"]; a.RatingCount != 1 || a.RatingAvg != 5 {
		t.Fatalf("rating not recomputed: count=%d avg=%v", a.RatingCount, a.RatingAvg)
	}
	if _, err := svc.ReviewJob(ctx, j.ID, "m-client", 4, "again"); err == nil {
		t.Fatal("expected a second review to be refused")
	}
}

// countingPaystack scripts Verify and counts Initialize calls.
type countingPaystack struct {
	ok    bool
	amt   int64
	inits int
}

func (p *countingPaystack) Initialize(_ context.Context, _ string, _ int64, _, ref, _ string) (string, string, error) {
	p.inits++
	return "https://pay.test/" + ref, "acc_" + ref, nil
}
func (p *countingPaystack) Verify(_ context.Context, ref string) (PaymentCheck, error) {
	return scriptedCheck(p.ok, p.amt, ref), nil
}
func (p *countingPaystack) Simulated() bool { return false }

// quotedJob seeds a job the agent has quoted at 50,000 pesewas.
func quotedJob(t *testing.T, ps PaystackClient) (*AgentJobsService, *stubJobs, *stubAgents, domain.AgentJob) {
	t.Helper()
	agents := &stubAgents{m: map[string]domain.Agent{"agent-1": {ID: "agent-1", Slug: "kwame", MemberID: "m-agent", DisplayName: "Kwame", Status: domain.AgentStatusVerified}}}
	jobs := newStubJobs()
	svc := NewAgentJobsService(jobs, agents, newStubReviews(), nil, ps, "https://portal", 10)
	ctx := context.Background()
	j, err := svc.RequestJob(ctx, "kwame", domain.Member{ID: "m-client", DisplayName: "Ama"}, JobInput{Title: "Buy fabric", Description: "6 yards"})
	if err != nil {
		t.Fatal(err)
	}
	if j, err = svc.QuoteJob(ctx, j.ID, "m-agent", 50_000, ""); err != nil {
		t.Fatal(err)
	}
	return svc, jobs, agents, j
}

// F049: replaying the public confirm URL never puts a finished job back into
// escrow (so it can't be disputed and refunded after payout, or paid twice).
func TestConfirmFundingNeverReopensAFinishedJob(t *testing.T) {
	ctx := context.Background()
	svc, jobs, agents, j := quotedJob(t, &countingPaystack{ok: true, amt: 50_000})
	_, _, ref, err := svc.AcceptAndFund(ctx, j.ID, "m-client", "ama@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = svc.ConfirmFunding(ctx, ref); err != nil {
		t.Fatal(err)
	}
	if _, err = svc.CompleteJob(ctx, j.ID, "m-client"); err != nil {
		t.Fatal(err)
	}
	got, err := svc.ConfirmFunding(ctx, ref)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != domain.JobStatusCompleted || jobs.m[j.ID].Escrow.Status != domain.EscrowReleased {
		t.Fatalf("a completed job was re-funded: %+v", jobs.m[j.ID])
	}
	if agents.m["agent-1"].JobsCompleted != 1 {
		t.Fatalf("JobsCompleted=%d", agents.m["agent-1"].JobsCompleted)
	}
	refunded := jobs.m[j.ID]
	refunded.Status, refunded.Escrow.Status = domain.JobStatusRefunded, domain.EscrowRefunded
	jobs.m[j.ID] = refunded
	if got, _ = svc.ConfirmFunding(ctx, ref); got.Status != domain.JobStatusRefunded {
		t.Fatalf("a refunded job was re-funded: %+v", got)
	}
}

// F056: pressing "Accept & fund" again resumes the open checkout; an earlier
// reference still reaches the job.
func TestAcceptAndFundResumesTheOpenCheckout(t *testing.T) {
	ctx := context.Background()
	ps := &countingPaystack{ok: true, amt: 50_000}
	svc, jobs, _, j := quotedJob(t, ps)
	_, _, first, err := svc.AcceptAndFund(ctx, j.ID, "m-client", "ama@example.com")
	if err != nil {
		t.Fatal(err)
	}
	url, code, second, err := svc.AcceptAndFund(ctx, j.ID, "m-client", "ama@example.com")
	if err != nil || second != first || url == "" || code == "" || ps.inits != 1 {
		t.Fatalf("second accept: ref=%q (first %q) url=%q inits=%d err=%v", second, first, url, ps.inits, err)
	}
	// A job whose checkout was not recorded (older data) gets a new
	// reference, and the old one still confirms.
	legacy := jobs.m[j.ID]
	legacy.CheckoutURL = ""
	jobs.m[j.ID] = legacy
	if _, _, third, _ := svc.AcceptAndFund(ctx, j.ID, "m-client", "ama@example.com"); third == first {
		t.Fatal("expected a new checkout for a job without a stored one")
	}
	if got, err := svc.ConfirmFunding(ctx, first); err != nil || got.Status != domain.JobStatusFunded {
		t.Fatalf("payment on the first checkout was orphaned: %+v %v", got, err)
	}
}

// F064: a checkout pays the agreed quote or nothing; the quote is locked
// once the client starts paying.
func TestEscrowMustMatchTheAgreedQuote(t *testing.T) {
	ctx := context.Background()
	ps := &countingPaystack{ok: true, amt: 10_000}
	svc, jobs, _, j := quotedJob(t, ps)
	_, _, ref, err := svc.AcceptAndFund(ctx, j.ID, "m-client", "ama@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = svc.QuoteJob(ctx, j.ID, "m-agent", 100_000, "bigger scope"); err == nil {
		t.Fatal("the agent re-quoted while the client's checkout was open")
	}
	if _, err = svc.ConfirmFunding(ctx, ref); err == nil {
		t.Fatal("a payment below the quote funded the job")
	}
	if jobs.m[j.ID].Status != domain.JobStatusQuoted {
		t.Fatalf("status=%s", jobs.m[j.ID].Status)
	}
	ps.amt = 50_000
	got, err := svc.ConfirmFunding(ctx, ref)
	if err != nil || got.Escrow.HeldPesewas != 50_000 || got.Escrow.PayoutPesewas != 45_000 {
		t.Fatalf("matching payment: %+v %v", got.Escrow, err)
	}
}

// staleJobs models concurrent requests that all read the job before any of
// them marked it reviewed.
type staleJobs struct{ *stubJobs }

func (s staleJobs) ByID(ctx context.Context, id string) (domain.AgentJob, error) {
	j, err := s.stubJobs.ByID(ctx, id)
	j.Reviewed = false
	return j, err
}

// F063: one review per job even when submissions race.
func TestOnlyOneReviewPerJobEvenWhenRacing(t *testing.T) {
	ctx := context.Background()
	jobs := newStubJobs()
	jobs.m["job-1"] = domain.AgentJob{ID: "job-1", AgentID: "agent-1", ClientMemberID: "m-client", Status: domain.JobStatusCompleted}
	agents := &stubAgents{m: map[string]domain.Agent{"agent-1": {ID: "agent-1"}}}
	reviews := newStubReviews()
	svc := NewAgentJobsService(staleJobs{jobs}, agents, reviews, nil, stubPaystack{}, "", 10)
	if _, err := svc.ReviewJob(ctx, "job-1", "m-client", 1, "first"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ReviewJob(ctx, "job-1", "m-client", 1, "again"); err == nil {
		t.Fatal("a second, racing review was accepted")
	}
	if all, _ := reviews.ByAgent(ctx, "agent-1"); len(all) != 1 || agents.m["agent-1"].RatingCount != 1 {
		t.Fatalf("reviews=%d ratingCount=%d", len(all), agents.m["agent-1"].RatingCount)
	}
}

// R20: a payment that lands after the job was cancelled is recorded for a
// staff refund (once), never acknowledged and dropped.
func TestPaymentAfterCancelIsRecordedForRefund(t *testing.T) {
	ctx := context.Background()
	ps := &countingPaystack{ok: false, amt: 50_000}
	svc, jobs, agents, j := quotedJob(t, ps)
	_, _, ref, err := svc.AcceptAndFund(ctx, j.ID, "m-client", "ama@example.com")
	if err != nil {
		t.Fatal(err)
	}
	// The client is still paying (Paystack: not yet paid) when the agent cancels.
	if _, err := svc.CancelJob(ctx, j.ID, "m-agent"); err != nil {
		t.Fatalf("CancelJob: %v", err)
	}
	ps.ok = true // then the MoMo payment completes
	got, err := svc.ConfirmFunding(ctx, ref)
	if !errors.Is(err, ErrJobCancelledRefundDue) || !SettlementFinal(err) {
		t.Fatalf("err=%v, want the settled ErrJobCancelledRefundDue", err)
	}
	stored := jobs.m[j.ID]
	if got.Status != domain.JobStatusCancelled || stored.Status != domain.JobStatusCancelled ||
		stored.Escrow.Status != domain.EscrowRefundDue || stored.Escrow.HeldPesewas != 50_000 ||
		stored.Escrow.PaymentReference != ref || stored.DisputeReason == "" {
		t.Fatalf("late payment not recorded: %+v", stored)
	}
	// The webhook retry (or the redirect confirm) records nothing twice.
	if _, err := svc.ConfirmFunding(ctx, ref); !errors.Is(err, ErrJobCancelledRefundDue) {
		t.Fatalf("replay err=%v", err)
	}
	// Staff see it with the disputes and can only refund it.
	if queue, _ := svc.AdminDisputes(ctx); len(queue) != 1 || queue[0].ID != j.ID {
		t.Fatalf("staff queue=%+v", queue)
	}
	if _, err := svc.ResolveDispute(ctx, j.ID, "release", "no", false, domain.Member{}); err == nil {
		t.Fatal("a payment on a cancelled job was released to the agent")
	}
	res, err := svc.ResolveDispute(ctx, j.ID, "refund", "refunded on Paystack", true, domain.Member{})
	if err != nil || res.Status != domain.JobStatusRefunded || res.Escrow.Status != domain.EscrowRefunded {
		t.Fatalf("refund: %+v %v", res, err)
	}
	if agents.m["agent-1"].Bond.Status == domain.BondStatusForfeited {
		t.Fatal("the agent's bond was forfeited over a late payment")
	}
}

// R20: cancelling a job whose open checkout Paystack reports as paid funds
// the job instead of stranding the payment.
func TestCancelAfterThePaymentWentThroughFundsTheJob(t *testing.T) {
	ctx := context.Background()
	ps := &countingPaystack{ok: true, amt: 50_000}
	svc, jobs, _, j := quotedJob(t, ps)
	if _, _, _, err := svc.AcceptAndFund(ctx, j.ID, "m-client", "ama@example.com"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CancelJob(ctx, j.ID, "m-agent"); !errors.Is(err, ErrJobAlreadyPaid) {
		t.Fatalf("err=%v, want ErrJobAlreadyPaid", err)
	}
	if got := jobs.m[j.ID]; got.Status != domain.JobStatusFunded || got.Escrow.Status != domain.EscrowHeld {
		t.Fatalf("job=%+v", got)
	}
}
