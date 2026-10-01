package domain

import "context"

// Promotion — a listing owner's paid featured placement (Phase 8). The
// lifecycle reuses the pledge status constants (PledgePending/Success/Failed):
// pending when the owner starts payment, success only after Paystack verifies
// the charge — at which point the listing's featuredUntil date is set (stacking
// onto any existing future expiry, like subscription renewal). GH₵ 10/day;
// the listing is denormalised so the ledger reads cleanly even if the listing
// is later unpublished.
type Promotion struct {
	ID            string `json:"id" bson:"_id"`
	Reference     string `json:"reference" bson:"reference"` // the Paystack transaction reference
	ListingID     string `json:"listingId" bson:"listingId"`
	ListingSlug   string `json:"listingSlug" bson:"listingSlug"`
	ListingTitle  string `json:"listingTitle" bson:"listingTitle"`
	MemberID      string `json:"memberId,omitempty" bson:"memberId,omitempty"`
	Email         string `json:"-" bson:"email,omitempty"` // payer email (Paystack requires it); never public
	Days          int    `json:"days" bson:"days"`
	AmountPesewas int64  `json:"amountPesewas" bson:"amountPesewas"`
	Status        string `json:"status" bson:"status"`
	Simulated     bool   `json:"simulated,omitempty" bson:"simulated,omitempty"` // dev-mode payment, not real money
	// FailureReason says why an unpaid record was closed (e.g. abandoned by
	// the reconciliation sweep after 48 hours).
	FailureReason string `json:"failureReason,omitempty" bson:"failureReason,omitempty"`
	CreatedAt     string `json:"createdAt" bson:"createdAt"`
	ConfirmedAt   string `json:"confirmedAt,omitempty" bson:"confirmedAt,omitempty"`
	// FeaturedUntil is the featured window this payment bought (RFC3339),
	// stored at settlement so a failed grant can be re-applied.
	FeaturedUntil string `json:"-" bson:"featuredUntil,omitempty"`
	// GrantPending is set when the payment settles and cleared once what it
	// bought has been applied, so a confirm retried after a failed grant
	// (webhook 500 → Paystack retry) applies it instead of stopping at the
	// settled status. Legacy rows without it count as granted.
	GrantPending bool `json:"-" bson:"grantPending,omitempty"`
}

// PromotionRepository persists promotions and answers by-reference (the
// Paystack callback only carries the reference) and by-member history.
type PromotionRepository interface {
	Insert(ctx context.Context, p Promotion) error
	ByReference(ctx context.Context, reference string) (*Promotion, error)
	// MarkSuccess moves a promotion that has not yet succeeded to success in
	// ONE conditional write and reports whether this call made the transition:
	// concurrent confirms race here and only the winner extends the placement.
	// The featuredUntil it bought is stored with it and the row is flagged
	// grantPending until MarkGranted.
	MarkSuccess(ctx context.Context, reference, at, featuredUntil string) (bool, error)
	// MarkGranted clears grantPending once the listing has been featured.
	MarkGranted(ctx context.Context, reference string) error
	// MarkFailed records a payment that did not complete. It never overwrites
	// a success.
	MarkFailed(ctx context.Context, reference string) error
	All(ctx context.Context) ([]Promotion, error) // steward ledger
	ByMember(ctx context.Context, memberID string) ([]Promotion, error)
	// PendingBetween lists records still pending whose createdAt is in
	// [from, to) (from "" = no lower bound), oldest first, at most limit —
	// the payment reconciliation sweep's work list (C5).
	PendingBetween(ctx context.Context, from, to string, limit int) ([]Promotion, error)
	// ExpirePending closes a record that is STILL pending (status failed, or
	// cancelled for an order) with reason; it reports whether it did.
	ExpirePending(ctx context.Context, reference, reason, at string) (bool, error)
}
