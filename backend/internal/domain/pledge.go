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
	// FeePercent is the platform fee rate the payer was quoted when the pledge
	// started; confirmation charges exactly this rate. nil on pledges recorded
	// before rates were locked (they use the rate at confirmation).
	FeePercent *int   `json:"feePercent,omitempty" bson:"feePercent,omitempty"`
	NetPesewas int64  `json:"netPesewas,omitempty" bson:"netPesewas,omitempty"` // credited to the project
	Currency   string `json:"currency" bson:"currency"`                         // "GHS"
	Status     string `json:"status" bson:"status"`
	Simulated  bool   `json:"simulated,omitempty" bson:"simulated,omitempty"` // dev-mode pledge, not real money
	// FailureReason says why an unpaid record was closed (e.g. abandoned by
	// the reconciliation sweep after 48 hours).
	FailureReason string `json:"failureReason,omitempty" bson:"failureReason,omitempty"`
	CreatedAt     string `json:"createdAt" bson:"createdAt"`
	ConfirmedAt   string `json:"confirmedAt,omitempty" bson:"confirmedAt,omitempty"`
	// GrantPending is set when the payment settles and cleared once what it
	// bought has been applied, so a confirm retried after a failed grant
	// (webhook 500 → Paystack retry) applies it instead of stopping at the
	// settled status. Legacy rows without it count as granted.
	GrantPending bool `json:"-" bson:"grantPending,omitempty"`
}

// PledgeRepository persists pledges and answers by-reference lookups (the
// Paystack callback/webhook only carries the reference).
type PledgeRepository interface {
	Insert(ctx context.Context, p Pledge) error
	ByReference(ctx context.Context, reference string) (*Pledge, error)
	// MarkSuccess moves a pledge that has not yet succeeded to success in ONE
	// conditional write, stamping confirmedAt and the platform-fee split. It
	// reports whether this call made the transition: concurrent confirms of the
	// same reference (redirect + webhook, replays) race here and exactly one
	// wins, so only the winner credits the target.
	// The row is flagged grantPending until MarkGranted.
	MarkSuccess(ctx context.Context, reference, at string, fee, net int64) (bool, error)
	// MarkGranted clears grantPending once the target has been credited.
	MarkGranted(ctx context.Context, reference string) error
	// MarkFailed records a payment that did not complete. It never overwrites
	// a success.
	MarkFailed(ctx context.Context, reference string) error
	ByMember(ctx context.Context, memberID string) ([]Pledge, error)
	// PendingBetween lists records still pending whose createdAt is in
	// [from, to) (from "" = no lower bound), oldest first, at most limit —
	// the payment reconciliation sweep's work list (C5).
	PendingBetween(ctx context.Context, from, to string, limit int) ([]Pledge, error)
	// ExpirePending closes a record that is STILL pending (status failed, or
	// cancelled for an order) with reason; it reports whether it did.
	ExpirePending(ctx context.Context, reference, reason, at string) (bool, error)
	ByProject(ctx context.Context, projectID string) ([]Pledge, error)
	All(ctx context.Context) ([]Pledge, error) // steward ledger
}
