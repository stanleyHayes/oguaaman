package service

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── Oguaa Outside — jobs + managed escrow (slice 2) ──────────────────────────
//
// A job runs: requested -> quoted -> funded (escrow) -> delivered -> completed.
// The client's money is collected and HELD via Paystack (real charge); on
// completion the escrow is released (a ledger state — the agent's payout, minus
// the platform fee, is settled by the platform). Disputes are resolved by an
// admin. Standalone service, like PaymentsService.

const (
	minJobPesewas int64 = 100         // GHS 1
	maxJobPesewas int64 = 100_000_000 // GHS 1,000,000
)

// AgentJobsService runs the job + escrow flow.
type AgentJobsService struct {
	jobs       domain.AgentJobRepository
	agents     domain.AgentRepository
	reviews    domain.AgentReviewRepository
	notifs     domain.NotificationRepository
	paystack   PaystackClient
	portal     string
	feePercent int
}

func NewAgentJobsService(jobs domain.AgentJobRepository, agents domain.AgentRepository, reviews domain.AgentReviewRepository, notifs domain.NotificationRepository, ps PaystackClient, portalURL string, feePercent int) *AgentJobsService {
	return &AgentJobsService{jobs: jobs, agents: agents, reviews: reviews, notifs: notifs, paystack: ps, portal: strings.TrimRight(portalURL, "/"), feePercent: feePercent}
}

// Simulated reports whether the escrow runs against the labelled simulation.
func (s *AgentJobsService) Simulated() bool { return s.paystack.Simulated() }

// JobInput is the client's request payload.
type JobInput struct {
	Service       string `json:"service"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Deadline      string `json:"deadline"`
	BudgetPesewas int64  `json:"budgetPesewas"`
}

// RequestJob opens a job request to a verified agent (status: requested).
func (s *AgentJobsService) RequestJob(ctx context.Context, agentSlug string, client domain.Member, in JobInput) (domain.AgentJob, error) {
	agent, err := s.agents.BySlug(ctx, agentSlug)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if agent.Status != domain.AgentStatusVerified {
		return domain.AgentJob{}, &domain.NotFoundError{Entity: "agent"}
	}
	if agent.MemberID == client.ID {
		return domain.AgentJob{}, &domain.ForbiddenError{Reason: "you cannot hire yourself"}
	}
	title := strings.TrimSpace(in.Title)
	if len(title) < 3 || len(title) > 160 {
		return domain.AgentJob{}, fmt.Errorf("give the task a title (3–160 characters)")
	}
	if strings.TrimSpace(in.Description) == "" {
		return domain.AgentJob{}, fmt.Errorf("describe what you need done")
	}
	now := time.Now().UTC()
	j := domain.AgentJob{
		ID:             "job-" + fmt.Sprintf("%d", now.UnixNano()),
		AgentID:        agent.ID,
		AgentSlug:      agent.Slug,
		AgentName:      agent.DisplayName,
		AgentMemberID:  agent.MemberID,
		ClientMemberID: client.ID,
		ClientName:     client.DisplayName,
		Service:        strings.TrimSpace(in.Service),
		Title:          title,
		Description:    strings.TrimSpace(in.Description),
		Deadline:       strings.TrimSpace(in.Deadline),
		BudgetPesewas:  in.BudgetPesewas,
		Status:         domain.JobStatusRequested,
		Escrow:         domain.AgentJobEscrow{Status: domain.EscrowNone},
		CreatedAt:      now.Format(time.RFC3339),
	}
	created, err := s.jobs.Create(ctx, j)
	if err != nil {
		return domain.AgentJob{}, err
	}
	s.notify(agent.MemberID, "agent-job", "New job request", fmt.Sprintf("%s asked you to: %s", client.DisplayName, title), "/outside/jobs")
	return created, nil
}

// QuoteJob lets the agent set a firm price (status: quoted).
func (s *AgentJobsService) QuoteJob(ctx context.Context, jobID, agentMemberID string, amountPesewas int64, note string) (domain.AgentJob, error) {
	j, err := s.jobs.ByID(ctx, jobID)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if j.AgentMemberID != agentMemberID {
		return domain.AgentJob{}, &domain.ForbiddenError{Reason: "only the agent on this job can quote it"}
	}
	if j.Status != domain.JobStatusRequested && j.Status != domain.JobStatusQuoted {
		return domain.AgentJob{}, fmt.Errorf("this job can no longer be quoted")
	}
	if amountPesewas < minJobPesewas || amountPesewas > maxJobPesewas {
		return domain.AgentJob{}, fmt.Errorf("quote an amount between GHS 1 and GHS 1,000,000")
	}
	j.QuotePesewas = amountPesewas
	j.QuoteNote = strings.TrimSpace(note)
	j.Status = domain.JobStatusQuoted
	j.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	updated, err := s.jobs.Update(ctx, j)
	if err != nil {
		return domain.AgentJob{}, err
	}
	s.notify(j.ClientMemberID, "agent-job", "Your quote is ready", fmt.Sprintf("%s quoted %s for \"%s\"", j.AgentName, cedis(amountPesewas), j.Title), "/outside/jobs")
	return updated, nil
}

// AcceptAndFund accepts the quote and starts the Paystack charge into escrow.
// Returns the authorization URL to send the client to; the job is marked funded
// once the payment confirms (ConfirmFunding, via webhook/redirect).
func (s *AgentJobsService) AcceptAndFund(ctx context.Context, jobID, clientMemberID, email string) (authorizationURL, accessCode, reference string, err error) {
	j, err := s.jobs.ByID(ctx, jobID)
	if err != nil {
		return "", "", "", err
	}
	if j.ClientMemberID != clientMemberID {
		return "", "", "", &domain.ForbiddenError{Reason: "only the client can fund this job"}
	}
	if j.Status != domain.JobStatusQuoted {
		return "", "", "", fmt.Errorf("this job is not awaiting funding")
	}
	if j.QuotePesewas < minJobPesewas {
		return "", "", "", fmt.Errorf("the agent has not set a valid quote yet")
	}
	email = strings.TrimSpace(email)
	if email == "" {
		return "", "", "", fmt.Errorf("an email is required for the payment receipt")
	}
	now := time.Now().UTC()
	reference = fmt.Sprintf("job-%s-%d", j.ID, now.UnixNano())
	j.Reference = reference
	j.ClientEmail = email
	j.Escrow = domain.AgentJobEscrow{Status: domain.EscrowPending, Simulated: s.paystack.Simulated()}
	j.UpdatedAt = now.Format(time.RFC3339)
	if _, err := s.jobs.Update(ctx, j); err != nil {
		return "", "", "", err
	}
	callback := fmt.Sprintf("%s/outside/jobs?job_ref=%s", s.portal, url.QueryEscape(reference))
	authURL, accessCode, err := s.paystack.Initialize(ctx, email, j.QuotePesewas, "GHS", reference, callback)
	if err != nil {
		return "", "", "", err
	}
	return authURL, accessCode, reference, nil
}

// ConfirmFunding verifies the escrow charge and marks the job funded. Idempotent.
func (s *AgentJobsService) ConfirmFunding(ctx context.Context, reference string) (domain.AgentJob, error) {
	j, err := s.jobs.ByReference(ctx, reference)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if j.Status == domain.JobStatusFunded || j.Escrow.Status == domain.EscrowHeld {
		return j, nil // already confirmed
	}
	success, amount, err := s.paystack.Verify(ctx, reference)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if !success {
		return domain.AgentJob{}, fmt.Errorf("payment not confirmed")
	}
	if amount <= 0 {
		amount = j.QuotePesewas
	}
	fee := amount * int64(s.feePercent) / 100
	j.Escrow = domain.AgentJobEscrow{
		HeldPesewas:        amount,
		PlatformFeePesewas: fee,
		PayoutPesewas:      amount - fee,
		Status:             domain.EscrowHeld,
		Simulated:          s.paystack.Simulated(),
	}
	j.Status = domain.JobStatusFunded
	j.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	updated, err := s.jobs.Update(ctx, j)
	if err != nil {
		return domain.AgentJob{}, err
	}
	s.notify(j.AgentMemberID, "agent-job", "Job funded — safe to begin", fmt.Sprintf("Escrow is held for \"%s\". You can start.", j.Title), "/outside/jobs")
	return updated, nil
}

// DeliverJob lets the agent mark the work delivered (status: delivered).
func (s *AgentJobsService) DeliverJob(ctx context.Context, jobID, agentMemberID string) (domain.AgentJob, error) {
	j, err := s.jobs.ByID(ctx, jobID)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if j.AgentMemberID != agentMemberID {
		return domain.AgentJob{}, &domain.ForbiddenError{Reason: "only the agent can mark this delivered"}
	}
	if j.Status != domain.JobStatusFunded {
		return domain.AgentJob{}, fmt.Errorf("only a funded job can be delivered")
	}
	j.Status = domain.JobStatusDelivered
	j.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	updated, err := s.jobs.Update(ctx, j)
	if err != nil {
		return domain.AgentJob{}, err
	}
	s.notify(j.ClientMemberID, "agent-job", "Work delivered", fmt.Sprintf("%s marked \"%s\" delivered. Confirm to release payment.", j.AgentName, j.Title), "/outside/jobs")
	return updated, nil
}

// CompleteJob is the client confirming delivery: escrow is released to the agent
// (minus the platform fee) and the agent's completed-jobs count ticks up.
func (s *AgentJobsService) CompleteJob(ctx context.Context, jobID, clientMemberID string) (domain.AgentJob, error) {
	j, err := s.jobs.ByID(ctx, jobID)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if j.ClientMemberID != clientMemberID {
		return domain.AgentJob{}, &domain.ForbiddenError{Reason: "only the client can complete this job"}
	}
	if j.Status != domain.JobStatusDelivered && j.Status != domain.JobStatusFunded {
		return domain.AgentJob{}, fmt.Errorf("this job is not ready to complete")
	}
	j.Status = domain.JobStatusCompleted
	j.Escrow.Status = domain.EscrowReleased
	j.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	updated, err := s.jobs.Update(ctx, j)
	if err != nil {
		return domain.AgentJob{}, err
	}
	// Tick the agent's reputation counter.
	if agent, err := s.agents.ByID(ctx, j.AgentID); err == nil {
		agent.JobsCompleted++
		agent.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		_, _ = s.agents.Update(ctx, agent)
	}
	s.notify(j.AgentMemberID, "agent-job", "Payment released", fmt.Sprintf("\"%s\" is complete. %s will be paid out to you.", j.Title, cedis(j.Escrow.PayoutPesewas)), "/outside/jobs")
	return updated, nil
}

// DisputeJob raises a dispute for admin resolution (either party).
func (s *AgentJobsService) DisputeJob(ctx context.Context, jobID, memberID, reason string) (domain.AgentJob, error) {
	j, err := s.jobs.ByID(ctx, jobID)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if !s.isParty(j, memberID) {
		return domain.AgentJob{}, &domain.ForbiddenError{Reason: "only the client or agent can dispute this job"}
	}
	if j.Status != domain.JobStatusFunded && j.Status != domain.JobStatusDelivered {
		return domain.AgentJob{}, fmt.Errorf("only a funded or delivered job can be disputed")
	}
	j.Status = domain.JobStatusDisputed
	j.DisputeReason = strings.TrimSpace(reason)
	j.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return s.jobs.Update(ctx, j)
}

// CancelJob ends a job before it is funded (either party).
func (s *AgentJobsService) CancelJob(ctx context.Context, jobID, memberID string) (domain.AgentJob, error) {
	j, err := s.jobs.ByID(ctx, jobID)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if !s.isParty(j, memberID) {
		return domain.AgentJob{}, &domain.ForbiddenError{Reason: "only the client or agent can cancel this job"}
	}
	if j.Status != domain.JobStatusRequested && j.Status != domain.JobStatusQuoted {
		return domain.AgentJob{}, fmt.Errorf("a funded job can't be cancelled — raise a dispute instead")
	}
	j.Status = domain.JobStatusCancelled
	j.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return s.jobs.Update(ctx, j)
}

// Job returns a job to one of its parties.
func (s *AgentJobsService) Job(ctx context.Context, jobID, memberID string) (domain.AgentJob, error) {
	j, err := s.jobs.ByID(ctx, jobID)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if !s.isParty(j, memberID) {
		return domain.AgentJob{}, &domain.ForbiddenError{Reason: "this job isn't yours"}
	}
	return j, nil
}

// MyClientJobs / MyAgentJobs list a member's jobs on each side.
func (s *AgentJobsService) MyClientJobs(ctx context.Context, memberID string) ([]domain.AgentJob, error) {
	return s.jobs.ForClient(ctx, memberID)
}

func (s *AgentJobsService) MyAgentJobs(ctx context.Context, memberID string) ([]domain.AgentJob, error) {
	return s.jobs.ForAgentMember(ctx, memberID)
}

// ── reviews + reputation ─────────────────────────────────────────────────────

// ReviewJob records a client's rating of a completed job and recomputes the
// agent's reputation. One review per job.
func (s *AgentJobsService) ReviewJob(ctx context.Context, jobID, clientMemberID string, rating int, body string) (domain.AgentReview, error) {
	j, err := s.jobs.ByID(ctx, jobID)
	if err != nil {
		return domain.AgentReview{}, err
	}
	if j.ClientMemberID != clientMemberID {
		return domain.AgentReview{}, &domain.ForbiddenError{Reason: "only the client can review this job"}
	}
	if j.Status != domain.JobStatusCompleted {
		return domain.AgentReview{}, fmt.Errorf("you can review a job once it is completed")
	}
	if j.Reviewed {
		return domain.AgentReview{}, fmt.Errorf("you have already reviewed this job")
	}
	if rating < 1 || rating > 5 {
		return domain.AgentReview{}, fmt.Errorf("rating must be 1–5")
	}
	now := time.Now().UTC()
	rv := domain.AgentReview{
		ID:    "rev-" + fmt.Sprintf("%d", now.UnixNano()),
		JobID: j.ID, AgentID: j.AgentID, AgentSlug: j.AgentSlug,
		ClientMemberID: clientMemberID, ClientName: j.ClientName,
		Rating: rating, Body: strings.TrimSpace(body),
		CreatedAt: now.Format(time.RFC3339),
	}
	created, err := s.reviews.Create(ctx, rv)
	if err != nil {
		return domain.AgentReview{}, err
	}
	j.Reviewed = true
	j.UpdatedAt = now.Format(time.RFC3339)
	_, _ = s.jobs.Update(ctx, j)
	s.recomputeAgentRating(ctx, j.AgentID)
	return created, nil
}

// recomputeAgentRating averages an agent's reviews onto its profile.
func (s *AgentJobsService) recomputeAgentRating(ctx context.Context, agentID string) {
	all, err := s.reviews.ByAgent(ctx, agentID)
	if err != nil || len(all) == 0 {
		return
	}
	sum := 0
	for _, r := range all {
		sum += r.Rating
	}
	if agent, err := s.agents.ByID(ctx, agentID); err == nil {
		agent.RatingCount = len(all)
		agent.RatingAvg = float64(sum) / float64(len(all))
		agent.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		_, _ = s.agents.Update(ctx, agent)
	}
}

// AgentReviews lists the public reviews for an agent (by slug).
func (s *AgentJobsService) AgentReviews(ctx context.Context, agentSlug string) ([]domain.AgentReview, error) {
	agent, err := s.agents.BySlug(ctx, agentSlug)
	if err != nil {
		return nil, err
	}
	return s.reviews.ByAgent(ctx, agent.ID)
}

// ── disputes (admin resolution) ──────────────────────────────────────────────

// AdminDisputes lists disputed jobs for resolution.
func (s *AgentJobsService) AdminDisputes(ctx context.Context) ([]domain.AgentJob, error) {
	return s.jobs.Disputed(ctx)
}

// ResolveDispute settles a disputed job: "release" pays the agent (like a normal
// completion), "refund" returns the escrow to the client. On a refund the officer
// may also forfeit the agent's bond.
func (s *AgentJobsService) ResolveDispute(ctx context.Context, jobID, resolution, note string, forfeitBond bool, officer domain.Member) (domain.AgentJob, error) {
	j, err := s.jobs.ByID(ctx, jobID)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if j.Status != domain.JobStatusDisputed {
		return domain.AgentJob{}, fmt.Errorf("this job is not in dispute")
	}
	now := time.Now().UTC()
	switch resolution {
	case "release":
		j.Status = domain.JobStatusCompleted
		j.Escrow.Status = domain.EscrowReleased
		if agent, err := s.agents.ByID(ctx, j.AgentID); err == nil {
			agent.JobsCompleted++
			agent.UpdatedAt = now.Format(time.RFC3339)
			_, _ = s.agents.Update(ctx, agent)
		}
	case "refund":
		j.Status = domain.JobStatusRefunded
		j.Escrow.Status = domain.EscrowRefunded
		if forfeitBond {
			if agent, err := s.agents.ByID(ctx, j.AgentID); err == nil {
				agent.Bond.Status = domain.BondStatusForfeited
				agent.UpdatedAt = now.Format(time.RFC3339)
				_, _ = s.agents.Update(ctx, agent)
			}
		}
	default:
		return domain.AgentJob{}, fmt.Errorf("resolution must be \"release\" or \"refund\"")
	}
	if strings.TrimSpace(note) != "" {
		j.DisputeReason = strings.TrimSpace(j.DisputeReason + " · Resolution: " + strings.TrimSpace(note))
	}
	j.UpdatedAt = now.Format(time.RFC3339)
	updated, err := s.jobs.Update(ctx, j)
	if err != nil {
		return domain.AgentJob{}, err
	}
	verdict := "released to the agent"
	if resolution == "refund" {
		verdict = "refunded to the client"
	}
	s.notify(j.ClientMemberID, "agent-job", "Dispute resolved", fmt.Sprintf("%q: escrow %s.", j.Title, verdict), "/outside/jobs")
	s.notify(j.AgentMemberID, "agent-job", "Dispute resolved", fmt.Sprintf("%q: escrow %s.", j.Title, verdict), "/outside/jobs")
	return updated, nil
}

func (s *AgentJobsService) isParty(j domain.AgentJob, memberID string) bool {
	return memberID != "" && (j.ClientMemberID == memberID || j.AgentMemberID == memberID)
}

func (s *AgentJobsService) notify(memberID, kind, title, body, link string) {
	if s.notifs == nil || memberID == "" {
		return
	}
	_ = s.notifs.Insert(context.Background(), domain.Notification{
		ID:        "ntf-" + fmt.Sprintf("%d-%s", time.Now().UnixNano(), memberID),
		MemberID:  memberID,
		Kind:      kind,
		Title:     title,
		Body:      body,
		Link:      link,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

// cedis renders pesewas as a GHS string for notices.
func cedis(pesewas int64) string {
	return fmt.Sprintf("GHS %.2f", float64(pesewas)/100)
}
