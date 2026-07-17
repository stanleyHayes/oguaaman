package domain

import "context"

// StripeIntent lifecycle.
const (
	StripeIntentPending   = "pending"
	StripeIntentSucceeded = "succeeded"
	StripeIntentFailed    = "failed"
)

// StripeIntent records a PaymentIntent created for a mobile Stripe PaymentSheet
// checkout. The reference links back to the pending domain record (pledge,
// ticket, subscription or promotion) that was created by the existing start
// endpoint.
type StripeIntent struct {
	ID              string            `json:"id" bson:"_id"`
	Reference       string            `json:"reference" bson:"reference"` // our internal reference, shared with the domain record
	PaymentIntentID string            `json:"paymentIntentId" bson:"paymentIntentId"`
	ClientSecret    string            `json:"clientSecret" bson:"clientSecret"`
	Flow            string            `json:"flow" bson:"flow"` // pledge|ticket|subscription|promotion
	AmountPesewas   int64             `json:"amountPesewas" bson:"amountPesewas"`
	Currency        string            `json:"currency" bson:"currency"`
	MemberID        string            `json:"memberId,omitempty" bson:"memberId,omitempty"`
	Email           string            `json:"-" bson:"email,omitempty"`
	Metadata        map[string]string `json:"metadata,omitempty" bson:"metadata,omitempty"`
	Status          string            `json:"status" bson:"status"`
	Simulated       bool              `json:"simulated,omitempty" bson:"simulated,omitempty"`
	CreatedAt       string            `json:"createdAt" bson:"createdAt"`
	ConfirmedAt     string            `json:"confirmedAt,omitempty" bson:"confirmedAt,omitempty"`
}

// StripeIntentRepository persists PaymentIntent records so confirmations can be
// idempotent and audited.
type StripeIntentRepository interface {
	Insert(ctx context.Context, i StripeIntent) error
	ByReference(ctx context.Context, reference string) (*StripeIntent, error)
	Confirm(ctx context.Context, reference, at string) error
}
