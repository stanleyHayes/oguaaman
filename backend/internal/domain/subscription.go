package domain

import "context"

// PlanBusinessSupporter is the legacy default business plan: a business owner
// pays GH₵ 50/month to support the platform and earn the Supporter badge +
// priority placement in the business directory.
const PlanBusinessSupporter = "business-supporter"

// Subscription scopes. A business subscription attaches to a business listing
// (paid-until lands on the listing); a creator subscription attaches to the
// member account (paid-until lands on the member) and unlocks donations &
// campaigns platform-wide (Creator Monetization).
const (
	SubscriptionScopeBusiness = "business"
	SubscriptionScopeCreator  = "creator"
)

// Subscription — a business owner's paid support of the platform (Phase 7).
// The lifecycle reuses the pledge status constants (PledgePending/Success/
// Failed): pending when the owner starts payment, success only after Paystack
// verifies the charge. PeriodEnd (RFC3339) is set on success; v1 renewal is
// manual — a new subscription stacks another month onto the current period.
// The business is denormalised so the ledger reads cleanly even if the listing
// is later unpublished.
type Subscription struct {
	ID        string `json:"id" bson:"_id"`
	Reference string `json:"reference" bson:"reference"` // the Paystack transaction reference
	MemberID  string `json:"memberId,omitempty" bson:"memberId,omitempty"`
	// Scope is "business" (attaches to ListingID) or "creator" (attaches to the
	// member account). Empty is treated as "business" for legacy rows.
	Scope string `json:"scope,omitempty" bson:"scope,omitempty"`
	// ListingID/Slug/Title are set for business subscriptions; empty for
	// creator (member-level) subscriptions.
	ListingID     string `json:"listingId,omitempty" bson:"listingId,omitempty"`
	ListingSlug   string `json:"listingSlug,omitempty" bson:"listingSlug,omitempty"`
	ListingTitle  string `json:"listingTitle,omitempty" bson:"listingTitle,omitempty"`
	Plan          string `json:"plan" bson:"plan"` // plan slug
	AmountPesewas int64  `json:"amountPesewas" bson:"amountPesewas"`
	Status        string `json:"status" bson:"status"`
	PeriodEnd     string `json:"periodEnd,omitempty" bson:"periodEnd,omitempty"` // RFC3339; set on success
	Simulated     bool   `json:"simulated,omitempty" bson:"simulated,omitempty"` // dev-mode payment, not real money
	CreatedAt     string `json:"createdAt" bson:"createdAt"`
	ConfirmedAt   string `json:"confirmedAt,omitempty" bson:"confirmedAt,omitempty"`
}

// SubscriptionRepository persists subscriptions and answers by-reference (the
// Paystack callback only carries the reference) and by-listing activity checks.
type SubscriptionRepository interface {
	Insert(ctx context.Context, s Subscription) error
	ByReference(ctx context.Context, reference string) (*Subscription, error)
	UpdateStatus(ctx context.Context, reference, status, at string) error
	SetPeriodEnd(ctx context.Context, reference, until string) error // paid-until date, set on confirmation
	ByMember(ctx context.Context, memberID string) ([]Subscription, error)
	All(ctx context.Context) ([]Subscription, error) // steward ledger
	// ActiveByListing reports whether the listing has a success subscription
	// whose periodEnd is still in the future (now is RFC3339).
	ActiveByListing(ctx context.Context, listingID, now string) (bool, error)
}
