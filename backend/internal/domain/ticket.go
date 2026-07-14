package domain

import "context"

// Ticket — an event admission bought via Paystack (Phase 6). The lifecycle
// reuses the pledge status constants (PledgePending/Success/Failed): pending
// when the member starts payment, success only after Paystack verifies the
// charge. The event is denormalised so a buyer's ticket reads cleanly even if
// the event listing is later unpublished. Code is the short check-in code
// issued on confirmation; CheckedInAt is set once at the gate (one-time use).
type Ticket struct {
	ID            string `json:"id" bson:"_id"`
	Reference     string `json:"reference" bson:"reference"` // the Paystack transaction reference
	EventID       string `json:"eventId" bson:"eventId"`
	EventSlug     string `json:"eventSlug" bson:"eventSlug"`
	EventTitle    string `json:"eventTitle" bson:"eventTitle"`
	MemberID      string `json:"memberId,omitempty" bson:"memberId,omitempty"`
	Email         string `json:"-" bson:"email,omitempty"` // payer email (Paystack requires it); never public
	Tier          string `json:"tier" bson:"tier"`         // the tier name, as defined on the event
	Qty           int    `json:"qty" bson:"qty"`
	AmountPesewas int64  `json:"amountPesewas" bson:"amountPesewas"`
	Status        string `json:"status" bson:"status"`
	Code          string `json:"code,omitempty" bson:"code,omitempty"` // issued on confirmation; shown at the gate
	CheckedInAt   string `json:"checkedInAt,omitempty" bson:"checkedInAt,omitempty"`
	Simulated     bool   `json:"simulated,omitempty" bson:"simulated,omitempty"` // dev-mode ticket, not real money
	CreatedAt     string `json:"createdAt" bson:"createdAt"`
	ConfirmedAt   string `json:"confirmedAt,omitempty" bson:"confirmedAt,omitempty"`
}

// TicketRepository persists tickets and answers by-reference (the Paystack
// callback only carries the reference) and by-code (gate check-in) lookups.
type TicketRepository interface {
	Insert(ctx context.Context, t Ticket) error
	ByReference(ctx context.Context, reference string) (*Ticket, error)
	UpdateStatus(ctx context.Context, reference, status, at string) error
	SetCode(ctx context.Context, reference, code string) error // check-in code, set on confirmation
	ByEvent(ctx context.Context, eventID string) ([]Ticket, error)
	ByMember(ctx context.Context, memberID string) ([]Ticket, error)
	ByCode(ctx context.Context, code string) (*Ticket, error)
	SetCheckedIn(ctx context.Context, code, at string) error
	All(ctx context.Context) ([]Ticket, error) // revenue reporting
}
