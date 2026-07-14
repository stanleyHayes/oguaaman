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
	CreatedAt     string `json:"createdAt" bson:"createdAt"`
	ConfirmedAt   string `json:"confirmedAt,omitempty" bson:"confirmedAt,omitempty"`
}

// PromotionRepository persists promotions and answers by-reference (the
// Paystack callback only carries the reference) and by-member history.
type PromotionRepository interface {
	Insert(ctx context.Context, p Promotion) error
	ByReference(ctx context.Context, reference string) (*Promotion, error)
	UpdateStatus(ctx context.Context, reference, status, at string) error
	All(ctx context.Context) ([]Promotion, error) // steward ledger
	ByMember(ctx context.Context, memberID string) ([]Promotion, error)
}
