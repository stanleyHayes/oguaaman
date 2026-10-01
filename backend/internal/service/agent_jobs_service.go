package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strconv"
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

	jobNoticeKind = "agent-job"
	jobsLink      = "/outside/jobs"
)

// ErrJobCancelledRefundDue is returned when a payment for a job's escrow
// arrives after the job was cancelled: the payment is recorded on the job
// (escrow refund_due) for staff to refund, and the job stays cancelled.
var ErrJobCancelledRefundDue = errors.New("this job was cancelled before your payment was confirmed, so it was not funded; your payment will be refunded")

// ErrJobAlreadyPaid is returned when cancelling a job whose escrow checkout
// Paystack reports as paid: the job is funded instead of cancelled.
var ErrJobAlreadyPaid = errors.New("the client has already paid for this job, so it is now funded — raise a dispute if it must not go ahead")

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
	s.notify(agent.MemberID, jobNoticeKind, "New job request", fmt.Sprintf("%s asked you to: %s", client.DisplayName, title), jobsLink)
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
	// Once the client has opened the escrow checkout the quote is agreed: a
	// new price would leave that checkout charging the old one.
	if j.Escrow.Status == domain.EscrowPending {
		return domain.AgentJob{}, fmt.Errorf("the client has started paying this quote — they can cancel the job if the price must change")
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
	s.notify(j.ClientMemberID, jobNoticeKind, "Your quote is ready", fmt.Sprintf("%s quoted %s for \"%s\"", j.AgentName, cedis(amountPesewas), j.Title), jobsLink)
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
	// Pressing "Accept & fund" again resumes the open checkout rather than
	// replacing its reference (a payment on the first one would be orphaned).
	if j.Escrow.Status == domain.EscrowPending && j.Reference != "" && j.CheckoutURL != "" && j.Escrow.QuotedPesewas == j.QuotePesewas {
		return j.CheckoutURL, j.CheckoutAccessCode, j.Reference, nil
	}
	now := time.Now().UTC()
	// The random suffix keeps two checkouts started on the same clock tick
	// apart (some platforms only advance the clock every microsecond).
	suffix, err := randomHex(4)
	if err != nil {
		return "", "", "", err
	}
	reference = newReference(RefPrefixAgentJob, j.ID, strconv.FormatInt(now.UnixNano(), 10), suffix)
	if j.Reference != "" {
		// Keep earlier checkouts findable: a late payment on one must still
		// reach this job (and is then checked against the agreed quote).
		j.PastReferences = append(j.PastReferences, j.Reference)
	}
	j.Reference = reference
	j.ClientEmail = email
	j.CheckoutURL, j.CheckoutAccessCode = "", ""
	j.Escrow = domain.AgentJobEscrow{Status: domain.EscrowPending, Simulated: s.paystack.Simulated(), QuotedPesewas: j.QuotePesewas}
	j.UpdatedAt = now.Format(time.RFC3339)
	if _, err := s.jobs.Update(ctx, j); err != nil {
		return "", "", "", err
	}
	callback := fmt.Sprintf("%s/outside/jobs?job_ref=%s", s.portal, url.QueryEscape(reference))
	authURL, accessCode, err := s.paystack.Initialize(ctx, email, j.QuotePesewas, "GHS", reference, callback)
	if err != nil {
		return "", "", "", err
	}
	j.CheckoutURL, j.CheckoutAccessCode = authURL, accessCode
	_, _ = s.jobs.Update(ctx, j) // best effort: only used to resume this checkout
	return authURL, accessCode, reference, nil
}

// escrowQuote is the amount the job's open escrow checkout was opened for.
// It must still be the job's quote, or no payment can fund the job.
func escrowQuote(j domain.AgentJob) (int64, bool) {
	quoted := j.Escrow.QuotedPesewas
	if quoted == 0 {
		quoted = j.QuotePesewas // checkouts opened before quotes were recorded
	}
	return quoted, quoted == j.QuotePesewas && quoted >= minJobPesewas
}

// msgJobPaymentMismatch answers a verified charge that is not the agreed quote.
const msgJobPaymentMismatch = "that payment does not match the agreed quote — contact support"

// ConfirmFunding verifies the escrow charge and marks the job funded. It only
// ever moves a job that is still quoted with its escrow checkout open; a job
// that is funded, delivered, completed, disputed or refunded is returned
// unchanged, so replaying the (public) confirm URL can never put a finished
// job back into escrow. The payment must equal the agreed quote. A payment
// on a job cancelled while its checkout was open is never dropped: it is
// recorded for a staff refund (recordCancelledPayment), and so is a second
// payment on another checkout of a job that is already funded
// (recordExtraPayment).
func (s *AgentJobsService) ConfirmFunding(ctx context.Context, reference string) (domain.AgentJob, error) {
	j, err := s.jobs.ByReference(ctx, reference)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if j.Status == domain.JobStatusCancelled {
		return s.recordCancelledPayment(ctx, j, reference)
	}
	if j.Status != domain.JobStatusQuoted || j.Escrow.Status != domain.EscrowPending {
		return s.recordExtraPayment(ctx, j, reference)
	}
	quoted, quoteOK := escrowQuote(j)
	if err := verifyCharge(ctx, s.paystack, reference, quoted, nil); err != nil {
		if errors.Is(err, ErrPaymentMismatch) {
			return domain.AgentJob{}, &domain.ValidationError{Message: msgJobPaymentMismatch}
		}
		return domain.AgentJob{}, err
	}
	if !quoteOK {
		return domain.AgentJob{}, &domain.ValidationError{Message: msgJobPaymentMismatch}
	}
	held := j.QuotePesewas
	fee := held * int64(s.feePercent) / 100
	escrow := domain.AgentJobEscrow{
		HeldPesewas:        held,
		PlatformFeePesewas: fee,
		PayoutPesewas:      held - fee,
		Status:             domain.EscrowHeld,
		Simulated:          s.paystack.Simulated(),
		QuotedPesewas:      held,
		PaymentReference:   reference,
	}
	now := time.Now().UTC().Format(time.RFC3339)
	won, err := s.jobs.MarkFunded(ctx, j.ID, escrow, now)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if !won { // a concurrent confirmation (webhook + redirect) got there first
		return s.jobs.ByID(ctx, j.ID)
	}
	j.Status, j.Escrow, j.UpdatedAt = domain.JobStatusFunded, escrow, now
	s.notify(j.AgentMemberID, jobNoticeKind, "Job funded — safe to begin", fmt.Sprintf("Escrow is held for \"%s\". You can start.", j.Title), jobsLink)
	return j, nil
}

// paidAmount verifies a charge that is owed back whatever it was for and
// returns how much was taken: an error while Paystack still processes it
// (ErrPaymentPending), when it failed (ErrPaymentNotCompleted) or when
// Paystack can't be asked.
func (s *AgentJobsService) paidAmount(ctx context.Context, reference string, fallback int64) (int64, error) {
	check, err := s.paystack.Verify(ctx, reference)
	if err != nil {
		return 0, err
	}
	switch check.Outcome {
	case PaymentInProgress:
		return 0, ErrPaymentPending
	case PaymentFailed:
		return 0, ErrPaymentNotCompleted
	}
	if check.AmountPesewas == 0 && s.paystack.Simulated() {
		return fallback, nil // the labelled simulation reports no amount
	}
	return check.AmountPesewas, nil
}

// recordExtraPayment handles a confirm for a job that is no longer awaiting
// funding. The reference that funded it (and any job funded before funding
// references were kept) is returned unchanged. A reference to ANOTHER of the
// job's checkouts that Paystack reports paid is a second payment: it is
// recorded once on the job for a staff refund and the client is told. An
// unpaid one leaves the job as it is.
func (s *AgentJobsService) recordExtraPayment(ctx context.Context, j domain.AgentJob, reference string) (domain.AgentJob, error) {
	funded := j.Escrow.PaymentReference
	if funded == "" || funded == reference || j.Escrow.Status == domain.EscrowPending {
		return j, nil
	}
	for _, p := range j.ExtraPayments {
		if p.Reference == reference {
			return j, nil // already recorded
		}
	}
	amount, err := s.paidAmount(ctx, reference, j.Escrow.QuotedPesewas)
	if errors.Is(err, ErrPaymentNotCompleted) {
		return j, nil // nothing was taken on that checkout
	}
	if err != nil {
		return domain.AgentJob{}, err
	}
	extra := domain.AgentJobExtraPayment{Reference: reference, AmountPesewas: amount, Simulated: s.paystack.Simulated(), RecordedAt: time.Now().UTC().Format(time.RFC3339)}
	won, err := s.jobs.AddExtraPayment(ctx, j.ID, extra)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if won {
		s.notify(j.ClientMemberID, jobNoticeKind, "Second payment received — refund due",
			fmt.Sprintf("\"%s\" was already funded, so your extra %s payment (reference %s) will be refunded.", j.Title, cedis(amount), reference), jobsLink)
	}
	return s.jobs.ByID(ctx, j.ID)
}

// recordCancelledPayment handles a charge on a cancelled job. While the
// escrow checkout is still pending it verifies the charge and, if Paystack
// took the money, records it as refund_due (listed for staff with the
// disputes) and tells the client. The distinct ErrJobCancelledRefundDue is a
// settled outcome, so the webhook acknowledges it. A cancelled job with no
// open checkout is returned unchanged.
func (s *AgentJobsService) recordCancelledPayment(ctx context.Context, j domain.AgentJob, reference string) (domain.AgentJob, error) {
	switch j.Escrow.Status {
	case domain.EscrowRefundDue:
		return j, ErrJobCancelledRefundDue // already recorded
	case domain.EscrowPending:
	default:
		return j, nil
	}
	amount, err := s.paidAmount(ctx, reference, j.Escrow.QuotedPesewas)
	if err != nil {
		return domain.AgentJob{}, err
	}
	escrow := domain.AgentJobEscrow{
		HeldPesewas:      amount,
		Status:           domain.EscrowRefundDue,
		Simulated:        s.paystack.Simulated(),
		QuotedPesewas:    j.Escrow.QuotedPesewas,
		PaymentReference: reference,
	}
	reason := fmt.Sprintf("Paid %s after the job was cancelled — refund the client (Paystack reference %s).", cedis(amount), reference)
	now := time.Now().UTC().Format(time.RFC3339)
	won, err := s.jobs.MarkRefundDue(ctx, j.ID, escrow, reason, now)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if !won { // a concurrent confirmation recorded it first
		cur, err := s.jobs.ByID(ctx, j.ID)
		if err != nil {
			return domain.AgentJob{}, err
		}
		return cur, ErrJobCancelledRefundDue
	}
	j.Escrow, j.DisputeReason, j.UpdatedAt = escrow, reason, now
	s.notify(j.ClientMemberID, jobNoticeKind, "Payment received after cancellation — refund due",
		fmt.Sprintf("\"%s\" was cancelled before your %s payment was confirmed, so the job was not funded. Oguaa will refund you.", j.Title, cedis(amount)), jobsLink)
	return j, ErrJobCancelledRefundDue
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
	s.notify(j.ClientMemberID, jobNoticeKind, "Work delivered", fmt.Sprintf("%s marked \"%s\" delivered. Confirm to release payment.", j.AgentName, j.Title), jobsLink)
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
	s.notify(j.AgentMemberID, jobNoticeKind, "Payment released", fmt.Sprintf("\"%s\" is complete. %s will be paid out to you.", j.Title, cedis(j.Escrow.PayoutPesewas)), jobsLink)
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
	if s.checkoutPaid(ctx, j) {
		if _, err := s.ConfirmFunding(ctx, j.Reference); err != nil {
			return domain.AgentJob{}, err
		}
		return domain.AgentJob{}, ErrJobAlreadyPaid
	}
	j.Status = domain.JobStatusCancelled
	j.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return s.jobs.Update(ctx, j)
}

// checkoutPaid reports whether Paystack already took the payment on the
// job's open escrow checkout, so a cancel does not strand it. The labelled
// simulation reports every checkout paid and is skipped; a failed lookup
// lets the cancel go ahead (a payment arriving later is still recorded for a
// refund by ConfirmFunding).
func (s *AgentJobsService) checkoutPaid(ctx context.Context, j domain.AgentJob) bool {
	if j.Status != domain.JobStatusQuoted || j.Escrow.Status != domain.EscrowPending || j.CheckoutURL == "" || s.paystack.Simulated() {
		return false
	}
	check, err := s.paystack.Verify(ctx, j.Reference)
	return err == nil && check.Outcome == PaymentPaid
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
	// Claim the job's single review slot atomically: of several concurrent
	// submissions exactly one gets past here.
	claimed, err := s.jobs.SetReviewed(ctx, j.ID, true)
	if err != nil {
		return domain.AgentReview{}, err
	}
	if !claimed {
		return domain.AgentReview{}, fmt.Errorf("you have already reviewed this job")
	}
	now := time.Now().UTC()
	rv := domain.AgentReview{
		ID:    "rev-" + j.ID, // one review per job, also enforced by the _id
		JobID: j.ID, AgentID: j.AgentID, AgentSlug: j.AgentSlug,
		ClientMemberID: clientMemberID, ClientName: j.ClientName,
		Rating: rating, Body: strings.TrimSpace(body),
		CreatedAt: now.Format(time.RFC3339),
	}
	created, err := s.reviews.Create(ctx, rv)
	if err != nil {
		_, _ = s.jobs.SetReviewed(ctx, j.ID, false) // release the slot for a retry
		return domain.AgentReview{}, err
	}
	s.recomputeAgentRating(ctx, j.AgentID)
	return created, nil
}

// recomputeAgentRating averages an agent's reviews onto its profile.
func (s *AgentJobsService) recomputeAgentRating(ctx context.Context, agentID string) {
	_ = recomputeAgentRating(ctx, s.reviews, s.agents, agentID)
}

// recomputeAgentRating averages an agent's visible reviews onto its profile,
// so hidden and removed reviews stop counting.
func recomputeAgentRating(ctx context.Context, reviews domain.AgentReviewRepository, agents domain.AgentRepository, agentID string) error {
	all, err := reviews.ByAgent(ctx, agentID)
	if err != nil {
		return err
	}
	visible := domain.VisibleAgentReviews(all)
	agent, err := agents.ByID(ctx, agentID)
	if err != nil {
		return err
	}
	sum := 0
	for _, r := range visible {
		sum += r.Rating
	}
	agent.RatingCount, agent.RatingAvg = len(visible), 0
	if len(visible) > 0 {
		agent.RatingAvg = float64(sum) / float64(len(visible))
	}
	agent.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	_, err = agents.Update(ctx, agent)
	return err
}

// AgentReviews lists the public reviews for an agent (by slug): hidden and
// removed reviews are left out.
func (s *AgentJobsService) AgentReviews(ctx context.Context, agentSlug string) ([]domain.AgentReview, error) {
	agent, err := s.agents.BySlug(ctx, agentSlug)
	if err != nil {
		return nil, err
	}
	all, err := s.reviews.ByAgent(ctx, agent.ID)
	if err != nil {
		return nil, err
	}
	return domain.VisibleAgentReviews(all), nil
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
	if j.Status != domain.JobStatusDisputed && j.Escrow.Status != domain.EscrowRefundDue && j.HasUnrefundedExtraPayment() {
		return s.resolveExtraPayments(ctx, j, resolution, note)
	}
	if err := resolvable(j, resolution); err != nil {
		return domain.AgentJob{}, err
	}
	// A payment after cancellation is no fault of the agent's: no bond
	// forfeit and no notice to them.
	latePayment := j.Escrow.Status == domain.EscrowRefundDue
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
		if forfeitBond && !latePayment {
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
	s.notify(j.ClientMemberID, jobNoticeKind, "Dispute resolved", fmt.Sprintf("%q: escrow %s.", j.Title, verdict), jobsLink)
	if !latePayment {
		s.notify(j.AgentMemberID, jobNoticeKind, "Dispute resolved", fmt.Sprintf("%q: escrow %s.", j.Title, verdict), jobsLink)
	}
	return updated, nil
}

// resolvable checks a ruling applies to the job: a disputed job takes
// either ruling; a cancelled job holding a late payment (escrow refund_due)
// can only be refunded, since no work was agreed.
// resolveExtraPayments records that staff refunded the extra payments on a
// job that is otherwise not in dispute; the job and its escrow are untouched.
func (s *AgentJobsService) resolveExtraPayments(ctx context.Context, j domain.AgentJob, resolution, note string) (domain.AgentJob, error) {
	if resolution != "refund" {
		return domain.AgentJob{}, fmt.Errorf("this job has an extra payment to refund — it can only be refunded")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	var refunded int64
	for i := range j.ExtraPayments {
		if j.ExtraPayments[i].RefundedAt == "" {
			j.ExtraPayments[i].RefundedAt = now
			refunded += j.ExtraPayments[i].AmountPesewas
		}
	}
	if strings.TrimSpace(note) != "" {
		j.DisputeReason = strings.TrimSpace(j.DisputeReason + " · Extra payment: " + strings.TrimSpace(note))
	}
	j.UpdatedAt = now
	updated, err := s.jobs.Update(ctx, j)
	if err != nil {
		return domain.AgentJob{}, err
	}
	s.notify(j.ClientMemberID, jobNoticeKind, "Extra payment refunded", fmt.Sprintf("%q: your extra %s payment was refunded.", j.Title, cedis(refunded)), jobsLink)
	return updated, nil
}

func resolvable(j domain.AgentJob, resolution string) error {
	if j.Escrow.Status == domain.EscrowRefundDue {
		if resolution != "refund" {
			return fmt.Errorf("this payment arrived after the job was cancelled — it can only be refunded")
		}
		return nil
	}
	if j.Status != domain.JobStatusDisputed {
		return fmt.Errorf("this job is not in dispute")
	}
	return nil
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
