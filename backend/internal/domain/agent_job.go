package domain

import "context"

// AgentJob — an engagement between a client and an Oguaa Outside agent: a task
// requested, quoted, funded into escrow, delivered, and released on completion
// (or refunded on a dispute). The money is collected + held via Paystack; the
// release/refund are recorded as escrow-ledger states settled by the platform.
type AgentJob struct {
	ID        string `json:"id" bson:"_id"`
	Reference string `json:"reference" bson:"reference"` // Paystack transaction reference

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

	CreatedAt string `json:"createdAt" bson:"createdAt"`
	UpdatedAt string `json:"updatedAt,omitempty" bson:"updatedAt,omitempty"`
}

// AgentJobEscrow is the money ledger for a job.
type AgentJobEscrow struct {
	HeldPesewas        int64  `json:"heldPesewas" bson:"heldPesewas"`
	PlatformFeePesewas int64  `json:"platformFeePesewas" bson:"platformFeePesewas"`
	PayoutPesewas      int64  `json:"payoutPesewas" bson:"payoutPesewas"` // held - fee, owed the agent on release
	Status             string `json:"status" bson:"status"`               // none|pending|held|released|refunded
	Simulated          bool   `json:"simulated" bson:"simulated"`
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
)

// AgentJobRepository persists agent jobs.
type AgentJobRepository interface {
	ByID(ctx context.Context, id string) (AgentJob, error)
	ByReference(ctx context.Context, reference string) (AgentJob, error)
	ForClient(ctx context.Context, memberID string) ([]AgentJob, error)
	ForAgentMember(ctx context.Context, memberID string) ([]AgentJob, error)
	Disputed(ctx context.Context) ([]AgentJob, error)
	Create(ctx context.Context, j AgentJob) (AgentJob, error)
	Update(ctx context.Context, j AgentJob) (AgentJob, error)
}
