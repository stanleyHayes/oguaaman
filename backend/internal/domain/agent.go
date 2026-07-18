package domain

import "context"

// Agent — "Oguaa Outside": a vetted, background-checked member (an individual or
// a registered office) who, for a fee, handles business and errands on behalf of
// Cape Coast people beyond the town — procurement (China/Accra), forwarding,
// official errands, inspection-before-you-buy, travel coordination, and the like.
// The platform supplies the TRUST LAYER (identity + guarantor + refundable bond +
// ratings) and a safe request flow; it does not guarantee any transaction — the
// client engages at their own risk. Vetting is done by a dedicated Vetting
// officer (RoleVettingOfficer), separate from the curators.
type Agent struct {
	ID       string `json:"id" bson:"_id"`
	Slug     string `json:"slug" bson:"slug"`
	MemberID string `json:"memberId" bson:"memberId"`

	Type        string `json:"type" bson:"type"` // individual | office
	DisplayName string `json:"displayName" bson:"displayName"`
	Headline    string `json:"headline,omitempty" bson:"headline,omitempty"` // one-line tagline
	Bio         string `json:"bio,omitempty" bson:"bio,omitempty"`

	// What they do + where they operate (slugs from AgentServices / free-form areas).
	Services      []string `json:"services" bson:"services"`
	CoverageAreas []string `json:"coverageAreas" bson:"coverageAreas"`
	Rates         string   `json:"rates,omitempty" bson:"rates,omitempty"` // free-text fee guide

	// ── trust / vetting ──
	Status          string         `json:"status" bson:"status"` // pending | verified | suspended | rejected
	IDDocURL        string         `json:"idDocUrl,omitempty" bson:"idDocUrl,omitempty"`
	Guarantor       AgentGuarantor `json:"guarantor" bson:"guarantor"`
	Bond            AgentBond      `json:"bond" bson:"bond"`
	VerifiedByID    string         `json:"verifiedById,omitempty" bson:"verifiedById,omitempty"`
	VerifiedByName  string         `json:"verifiedByName,omitempty" bson:"verifiedByName,omitempty"`
	VerifiedAt      string         `json:"verifiedAt,omitempty" bson:"verifiedAt,omitempty"`
	RejectionReason string         `json:"rejectionReason,omitempty" bson:"rejectionReason,omitempty"`

	// ── reputation (maintained by jobs + reviews, later slices) ──
	RatingAvg     float64 `json:"ratingAvg" bson:"ratingAvg"`
	RatingCount   int     `json:"ratingCount" bson:"ratingCount"`
	JobsCompleted int     `json:"jobsCompleted" bson:"jobsCompleted"`

	// ── payout (for escrow release, later slice) ──
	PayoutMethod string `json:"payoutMethod,omitempty" bson:"payoutMethod,omitempty"` // momo | bank
	PayoutDetail string `json:"payoutDetail,omitempty" bson:"payoutDetail,omitempty"`

	CreatedAt string `json:"createdAt" bson:"createdAt"`
	UpdatedAt string `json:"updatedAt,omitempty" bson:"updatedAt,omitempty"`
}

// AgentGuarantor — a Cape Coast referee who vouches for the agent, on record.
type AgentGuarantor struct {
	Name     string `json:"name" bson:"name"`
	Phone    string `json:"phone" bson:"phone"`
	Relation string `json:"relation,omitempty" bson:"relation,omitempty"`
	Note     string `json:"note,omitempty" bson:"note,omitempty"` // their Cape Coast link
}

// AgentBond — the refundable deposit that gives an agent real skin in the game;
// forfeitable on proven misconduct. The Paystack charge/refund is wired in the
// payments slice; here it carries the amount + lifecycle status.
type AgentBond struct {
	AmountPesewas int64  `json:"amountPesewas" bson:"amountPesewas"`
	Status        string `json:"status" bson:"status"` // pending | held | refunded | forfeited
	Reference     string `json:"reference,omitempty" bson:"reference,omitempty"`
}

// Agent types.
const (
	AgentTypeIndividual = "individual"
	AgentTypeOffice     = "office"
)

// Agent lifecycle statuses.
const (
	AgentStatusPending   = "pending"
	AgentStatusVerified  = "verified"
	AgentStatusSuspended = "suspended"
	AgentStatusRejected  = "rejected"
)

// Bond statuses.
const (
	BondStatusPending   = "pending"
	BondStatusHeld      = "held"
	BondStatusRefunded  = "refunded"
	BondStatusForfeited = "forfeited"
)

// AgentService is a service category an agent can offer.
type AgentService struct {
	Slug  string `json:"slug"`
	Label string `json:"label"`
}

// AgentServices is the fixed catalogue of what an agent can do, surfaced to
// clients as filters and to agents as options.
var AgentServices = []AgentService{
	{Slug: "import", Label: "Procurement — import (China/Alibaba)"},
	{Slug: "local-procurement", Label: "Procurement — local (Accra/Kumasi)"},
	{Slug: "shipping", Label: "Shipping & forwarding"},
	{Slug: "errands", Label: "General errands"},
	{Slug: "official", Label: "Official / document errands"},
	{Slug: "inspection", Label: "Inspection & verification"},
	{Slug: "travel", Label: "Travel companion / coordination"},
}

// AgentRepository persists Oguaa Outside agents.
type AgentRepository interface {
	All(ctx context.Context) ([]Agent, error)
	ByID(ctx context.Context, id string) (Agent, error)
	BySlug(ctx context.Context, slug string) (Agent, error)
	ByMemberID(ctx context.Context, memberID string) (Agent, error)
	Create(ctx context.Context, a Agent) (Agent, error)
	Update(ctx context.Context, a Agent) (Agent, error)
	Delete(ctx context.Context, id string) error
	InsertMany(ctx context.Context, agents []Agent) error
}
