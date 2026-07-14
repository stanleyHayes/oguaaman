package domain

import "context"

// PlanBusinessSupporter is the only plan shipped in v1: a business owner pays
// GH₵ 50/month to support the platform and earn the Supporter badge + priority
// placement in the business directory.
const PlanBusinessSupporter = "business-supporter"

// Subscription — a business owner's paid support of the platform (Phase 7).
// The lifecycle reuses the pledge status constants (PledgePending/Success/
// Failed): pending when the owner starts payment, success only after Paystack
// verifies the charge. PeriodEnd (RFC3339) is set on success; v1 renewal is
// manual — a new subscription stacks another month onto the current period.
// The business is denormalised so the ledger reads cleanly even if the listing
// is later unpublished.
type Subscription struct {
	ID            string `json:"id" bson:"_id"`
	Reference     string `json:"reference" bson:"reference"` // the Paystack transaction reference
	MemberID      string `json:"memberId,omitempty" bson:"memberId,omitempty"`
	ListingID     string `json:"listingId" bson:"listingId"`
	ListingSlug   string `json:"listingSlug" bson:"listingSlug"`
	ListingTitle  string `json:"listingTitle" bson:"listingTitle"`
	Plan          string `json:"plan" bson:"plan"` // PlanBusinessSupporter
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
