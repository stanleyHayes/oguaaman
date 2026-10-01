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
	// FailureReason says why an unpaid record was closed (e.g. abandoned by
	// the reconciliation sweep after 48 hours).
	FailureReason string `json:"failureReason,omitempty" bson:"failureReason,omitempty"`
	CreatedAt     string `json:"createdAt" bson:"createdAt"`
	ConfirmedAt   string `json:"confirmedAt,omitempty" bson:"confirmedAt,omitempty"`
	// FeaturedUntil is the plan-bundled featured window this payment bought
	// (RFC3339), stored at settlement so a failed grant can be re-applied.
	FeaturedUntil string `json:"-" bson:"featuredUntil,omitempty"`
	// GrantPending is set when the payment settles and cleared once what it
	// bought has been applied, so a confirm retried after a failed grant
	// (webhook 500 → Paystack retry) applies it instead of stopping at the
	// settled status. Legacy rows without it count as granted.
	GrantPending bool `json:"-" bson:"grantPending,omitempty"`
}

// SubscriptionRepository persists subscriptions and answers by-reference (the
// Paystack callback only carries the reference) and by-listing activity checks.
type SubscriptionRepository interface {
	Insert(ctx context.Context, s Subscription) error
	ByReference(ctx context.Context, reference string) (*Subscription, error)
	// MarkSuccess moves a subscription that has not yet succeeded to success in
	// ONE conditional write, stamping confirmedAt and the paid-until date. It
	// reports whether this call made the transition: concurrent confirms race
	// here and only the winner extends the paid period.
	// The bundled featuredUntil ("" for none) is stored with it and the row
	// is flagged grantPending until MarkGranted.
	MarkSuccess(ctx context.Context, reference, at, periodEnd, featuredUntil string) (bool, error)
	// MarkGranted clears grantPending once the paid period (and any bundled
	// promotion) has been applied.
	MarkGranted(ctx context.Context, reference string) error
	// MarkFailed records a payment that did not complete. It never overwrites
	// a success.
	MarkFailed(ctx context.Context, reference string) error
	ByMember(ctx context.Context, memberID string) ([]Subscription, error)
	// PendingBetween lists records still pending whose createdAt is in
	// [from, to) (from "" = no lower bound), oldest first, at most limit —
	// the payment reconciliation sweep's work list (C5).
	PendingBetween(ctx context.Context, from, to string, limit int) ([]Subscription, error)
	// ExpirePending closes a record that is STILL pending (status failed, or
	// cancelled for an order) with reason; it reports whether it did.
	ExpirePending(ctx context.Context, reference, reason, at string) (bool, error)
	All(ctx context.Context) ([]Subscription, error) // steward ledger
	// ActiveByListing reports whether the listing has a success subscription
	// whose periodEnd is still in the future (now is RFC3339).
	ActiveByListing(ctx context.Context, listingID, now string) (bool, error)
}
