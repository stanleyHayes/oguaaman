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
	// RefundDue marks a PAID ticket that could not be issued (the tier sold
	// out while the buyer was paying): status is failed, no code exists, and
	// staff owe the buyer a refund. FailureReason says why (RefundReason*).
	RefundDue     bool   `json:"refundDue,omitempty" bson:"refundDue,omitempty"`
	FailureReason string `json:"failureReason,omitempty" bson:"failureReason,omitempty"`
}

// RefundReasonSoldOut: the tier filled up between checkout and confirmation.
const RefundReasonSoldOut = "sold_out"

// TicketRepository persists tickets and answers by-reference (the Paystack
// callback only carries the reference) and by-code (gate check-in) lookups.
type TicketRepository interface {
	Insert(ctx context.Context, t Ticket) error
	ByReference(ctx context.Context, reference string) (*Ticket, error)
	// MarkSuccess issues a ticket that has not yet succeeded — status,
	// confirmedAt and its check-in code — in ONE conditional write, clearing
	// any earlier refund flag. It reports whether this call made the
	// transition: concurrent confirms race here and only the winner's code
	// exists.
	MarkSuccess(ctx context.Context, reference, at, code string) (bool, error)
	// MarkFailed records a payment that did not complete. It never overwrites
	// a success.
	MarkFailed(ctx context.Context, reference string) error
	// PendingBetween lists records still pending whose createdAt is in
	// [from, to) (from "" = no lower bound), oldest first, at most limit —
	// the payment reconciliation sweep's work list (C5).
	PendingBetween(ctx context.Context, from, to string, limit int) ([]Ticket, error)
	// ExpirePending closes a record that is STILL pending (status failed, or
	// cancelled for an order) with reason; it reports whether it did.
	ExpirePending(ctx context.Context, reference, reason, at string) (bool, error)
	// MarkRefundDue records a paid ticket that cannot be issued (status
	// failed, refundDue, reason). It never overwrites a success.
	MarkRefundDue(ctx context.Context, reference, reason string) error
	// RevokeForRefund withdraws an issued ticket whose seat turned out not to
	// exist (a concurrent buyer took it): status failed, code removed,
	// refundDue with the reason. Only a success ticket is affected.
	RevokeForRefund(ctx context.Context, reference, reason string) error
	ByEvent(ctx context.Context, eventID string) ([]Ticket, error)
	ByMember(ctx context.Context, memberID string) ([]Ticket, error)
	ByEvents(ctx context.Context, eventIDs []string) ([]Ticket, error)
	ByCode(ctx context.Context, code string) (*Ticket, error)
	SetCheckedIn(ctx context.Context, code, at string) error
	All(ctx context.Context) ([]Ticket, error) // revenue reporting
}
