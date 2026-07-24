package domain

import "context"

// Pledge lifecycle. A pledge is created pending when the member starts payment,
// and confirmed (success) only after Paystack verifies the charge — never on the
// client's word alone.
const (
	PledgePending = "pending"
	PledgeSuccess = "success"
	PledgeFailed  = "failed"
)

// Pledge kinds distinguish a goal-based project/campaign contribution from an
// artist "tip jar" donation (Creator Monetization). Empty is treated as
// "campaign" for legacy rows. Both share this record + the same money flow;
// donations denormalise the ARTIST listing into the Project* target fields.
const (
	PledgeKindCampaign = "campaign"
	PledgeKindDonation = "donation"
)

// Pledge — a contribution toward an adopt-a-project campaign (spec §4/§6/§15).
// Amounts are integer pesewas (GHS subunits) to keep money math exact. The
// project is denormalised so giving history reads cleanly even if the project
// listing is later unpublished.
type Pledge struct {
	ID        string `json:"id" bson:"_id"`
	Reference string `json:"reference" bson:"reference"` // the Paystack transaction reference
	// Kind is "campaign" (goal-based project/campaign pledge) or "donation"
	// (artist tip). Empty = "campaign" for legacy rows.
	Kind string `json:"kind,omitempty" bson:"kind,omitempty"`
	// Project* fields denormalise the TARGET listing: a project/campaign for a
	// campaign pledge, the artist listing for a donation.
	ProjectID    string `json:"projectId" bson:"projectId"`
	ProjectSlug  string `json:"projectSlug" bson:"projectSlug"`
	ProjectTitle string `json:"projectTitle" bson:"projectTitle"`
	// Message is an optional donor note (donations only); Anonymous hides the
	// donor's identity on public displays.
	Message       string `json:"message,omitempty" bson:"message,omitempty"`
	Anonymous     bool   `json:"anonymous,omitempty" bson:"anonymous,omitempty"`
	MemberID      string `json:"memberId,omitempty" bson:"memberId,omitempty"`
	Email         string `json:"-" bson:"email,omitempty"` // payer email (Paystack requires it); never public
	AmountPesewas int64  `json:"amountPesewas" bson:"amountPesewas"`
	FeePesewas    int64  `json:"feePesewas,omitempty" bson:"feePesewas,omitempty"` // platform fee kept on confirmation
	NetPesewas    int64  `json:"netPesewas,omitempty" bson:"netPesewas,omitempty"` // credited to the project
	Currency      string `json:"currency" bson:"currency"`                         // "GHS"
	Status        string `json:"status" bson:"status"`
	Simulated     bool   `json:"simulated,omitempty" bson:"simulated,omitempty"` // dev-mode pledge, not real money
	CreatedAt     string `json:"createdAt" bson:"createdAt"`
	ConfirmedAt   string `json:"confirmedAt,omitempty" bson:"confirmedAt,omitempty"`
}

// PledgeRepository persists pledges and answers by-reference lookups (the
// Paystack callback/webhook only carries the reference).
type PledgeRepository interface {
	Insert(ctx context.Context, p Pledge) error
	ByReference(ctx context.Context, reference string) (*Pledge, error)
	UpdateStatus(ctx context.Context, reference, status, at string) error
	SetFeeNet(ctx context.Context, reference string, fee, net int64) error // platform-fee split, set on confirmation
	ByMember(ctx context.Context, memberID string) ([]Pledge, error)
	ByProject(ctx context.Context, projectID string) ([]Pledge, error)
	All(ctx context.Context) ([]Pledge, error) // steward ledger
}
