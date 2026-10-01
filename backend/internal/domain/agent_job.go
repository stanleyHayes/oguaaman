package domain

import "context"

// AgentJob — an engagement between a client and an Oguaa Outside agent: a task
// requested, quoted, funded into escrow, delivered, and released on completion
// (or refunded on a dispute). The money is collected + held via Paystack; the
// release/refund are recorded as escrow-ledger states settled by the platform.
type AgentJob struct {
	ID        string `json:"id" bson:"_id"`
	Reference string `json:"reference" bson:"reference"` // Paystack transaction reference
	// PastReferences are earlier escrow checkouts for this job, kept so a
	// payment on any of them is still found (never serialised).
	PastReferences []string `json:"-" bson:"pastReferences,omitempty"`
	// CheckoutURL / CheckoutAccessCode resume the open escrow checkout, so
	// pressing "Accept & fund" again never opens a second one.
	CheckoutURL        string `json:"-" bson:"checkoutUrl,omitempty"`
	CheckoutAccessCode string `json:"-" bson:"checkoutAccessCode,omitempty"`

	AgentID       string `json:"agentId" bson:"agentId"`
	AgentSlug     string `json:"agentSlug" bson:"agentSlug"`
	AgentName     string `json:"agentName" bson:"agentName"`
	AgentMemberID string `json:"agentMemberId" bson:"agentMemberId"`

	ClientMemberID string `json:"clientMemberId" bson:"clientMemberId"`
	ClientName     string `json:"clientName,omitempty" bson:"clientName,omitempty"`
	ClientEmail    string `json:"-" bson:"clientEmail,omitempty"` // never serialised

	Service     string `json:"service" bson:"service"` // service-category slug
	Title       string `json:"title" bson:"title"`
	Description string `json:"description" bson:"description"`
	Deadline    string `json:"deadline,omitempty" bson:"deadline,omitempty"`

	BudgetPesewas int64  `json:"budgetPesewas" bson:"budgetPesewas"`
	QuotePesewas  int64  `json:"quotePesewas" bson:"quotePesewas"`
	QuoteNote     string `json:"quoteNote,omitempty" bson:"quoteNote,omitempty"`

	Status        string         `json:"status" bson:"status"`
	Escrow        AgentJobEscrow `json:"escrow" bson:"escrow"`
	DisputeReason string         `json:"disputeReason,omitempty" bson:"disputeReason,omitempty"`
	Reviewed      bool           `json:"reviewed" bson:"reviewed"` // client has left a review
	// ExtraPayments are charges on another of this job's escrow checkouts
	// that arrived after the job was already funded. Each is owed back to
	// the client; staff refund it in Paystack and resolve it.
	ExtraPayments []AgentJobExtraPayment `json:"extraPayments,omitempty" bson:"extraPayments,omitempty"`

	CreatedAt string `json:"createdAt" bson:"createdAt"`
	UpdatedAt string `json:"updatedAt,omitempty" bson:"updatedAt,omitempty"`
}

// AgentJobEscrow is the money ledger for a job.
type AgentJobEscrow struct {
	HeldPesewas        int64  `json:"heldPesewas" bson:"heldPesewas"`
	PlatformFeePesewas int64  `json:"platformFeePesewas" bson:"platformFeePesewas"`
	PayoutPesewas      int64  `json:"payoutPesewas" bson:"payoutPesewas"` // held - fee, owed the agent on release
	Status             string `json:"status" bson:"status"`               // none|pending|held|released|refunded|refund_due
	Simulated          bool   `json:"simulated" bson:"simulated"`
	// QuotedPesewas is the quote the escrow checkout was opened for; the
	// verified payment must equal it before the job is funded.
	QuotedPesewas int64 `json:"quotedPesewas,omitempty" bson:"quotedPesewas,omitempty"`
	// PaymentReference is the Paystack reference of the payment that funded
	// the escrow, or of a payment that arrived after the job was cancelled
	// (escrow refund_due), so staff can find or refund it.
	PaymentReference string `json:"paymentReference,omitempty" bson:"paymentReference,omitempty"`
}

// AgentJobExtraPayment is a second payment on an already-funded job.
type AgentJobExtraPayment struct {
	Reference     string `json:"reference" bson:"reference"`
	AmountPesewas int64  `json:"amountPesewas" bson:"amountPesewas"`
	Simulated     bool   `json:"simulated,omitempty" bson:"simulated,omitempty"`
	RecordedAt    string `json:"recordedAt" bson:"recordedAt"`
	// RefundedAt is set when staff resolve the refund; until then the job is
	// listed with the disputes.
	RefundedAt string `json:"refundedAt,omitempty" bson:"refundedAt,omitempty"`
}

// HasUnrefundedExtraPayment reports whether a stray payment on the job is
// still owed back to the client.
func (j AgentJob) HasUnrefundedExtraPayment() bool {
	for _, p := range j.ExtraPayments {
		if p.RefundedAt == "" {
			return true
		}
	}
	return false
}

// Job lifecycle statuses.
const (
	JobStatusRequested = "requested" // client asked; awaiting the agent's quote
	JobStatusQuoted    = "quoted"    // agent quoted a price; awaiting client funding
	JobStatusFunded    = "funded"    // client funded escrow; work can begin
	JobStatusDelivered = "delivered" // agent marked the work delivered
	JobStatusCompleted = "completed" // client confirmed; escrow released to the agent
	JobStatusDisputed  = "disputed"  // raised for admin resolution
	JobStatusCancelled = "cancelled" // ended before funding
	JobStatusRefunded  = "refunded"  // escrow returned to the client
)

// Escrow ledger statuses.
const (
	EscrowNone     = "none"
	EscrowPending  = "pending"
	EscrowHeld     = "held"
	EscrowReleased = "released"
	EscrowRefunded = "refunded"
	// EscrowRefundDue marks a payment that arrived after the job was
	// cancelled: the money is recorded as held and waits for a staff refund.
	EscrowRefundDue = "refund_due"
)

// AgentJobRepository persists agent jobs.
type AgentJobRepository interface {
	ByID(ctx context.Context, id string) (AgentJob, error)
	// ByReference finds a job by its current or any earlier escrow reference.
	ByReference(ctx context.Context, reference string) (AgentJob, error)
	ForClient(ctx context.Context, memberID string) ([]AgentJob, error)
	ForAgentMember(ctx context.Context, memberID string) ([]AgentJob, error)
	// Disputed lists jobs awaiting a staff ruling: disputed jobs, cancelled
	// jobs holding a late payment to refund (escrow refund_due), and funded
	// jobs holding an extra payment not yet refunded.
	Disputed(ctx context.Context) ([]AgentJob, error)
	Create(ctx context.Context, j AgentJob) (AgentJob, error)
	Update(ctx context.Context, j AgentJob) (AgentJob, error)
	// MarkFunded moves a job that is still quoted with escrow pending to
	// funded with the given escrow. It reports whether THIS call did it, so
	// a replayed or concurrent confirmation can never re-fund a job.
	MarkFunded(ctx context.Context, id string, escrow AgentJobEscrow, at string) (bool, error)
	// MarkRefundDue records a payment on a cancelled job whose escrow
	// checkout was still pending: the escrow becomes refund_due with the
	// given ledger and reason. It reports whether THIS call recorded it.
	MarkRefundDue(ctx context.Context, id string, escrow AgentJobEscrow, reason, at string) (bool, error)
	// AddExtraPayment records a payment on another escrow checkout of a job
	// that is already funded, once per reference. It reports whether THIS
	// call recorded it.
	AddExtraPayment(ctx context.Context, id string, p AgentJobExtraPayment) (bool, error)
	// PendingCheckouts lists quoted jobs whose escrow checkout is still
	// pending and was opened (updatedAt) in [from, to), oldest first, at most
	// limit — the reconciliation sweep's work list (C5).
	PendingCheckouts(ctx context.Context, from, to string, limit int) ([]AgentJob, error)
	// SetReviewed flips the job's reviewed flag, reporting whether it changed
	// (claiming the single review slot atomically).
	SetReviewed(ctx context.Context, id string, reviewed bool) (bool, error)
}
