package service

import (
	"context"
	"errors"
	"fmt"
)

// ── Paystack verdicts (C1): paid, failed, or still in progress ───────────────

// paymentCurrency is the only currency Oguaa charges in.
const paymentCurrency = "GHS"

// PaymentOutcome is the provider's verdict on one transaction.
type PaymentOutcome int

const (
	// PaymentInProgress: not final yet (pending, ongoing, processing, queued).
	// The record stays pending; the webhook or a later confirm settles it.
	PaymentInProgress PaymentOutcome = iota
	// PaymentPaid: the charge succeeded.
	PaymentPaid
	// PaymentFailed: failed, abandoned, reversed, or a reference the provider
	// never saw. Final.
	PaymentFailed
)

// PaymentCheck is what the provider reported for a reference.
type PaymentCheck struct {
	Outcome PaymentOutcome
	// AmountPesewas is the amount charged. 0 means "unknown", which only the
	// labelled simulation may report.
	AmountPesewas int64
	Currency      string
	Reference     string
	// FeesPesewas is Paystack's processing fee on the charge (0 = not
	// reported).
	FeesPesewas int64
}

// ErrPaymentPending is returned by every confirm path while the provider
// still reports the charge in progress (a Mobile Money approval prompt still
// open, a card still in 3-D Secure). The record stays pending. The HTTP layer
// answers 409 payment_pending; the webhook asks Paystack to retry.
var ErrPaymentPending = errors.New("payment is still processing")

// ErrPaymentCheckUnavailable wraps a transient failure to ask the provider
// about a payment (network error, HTTP 429/5xx, an error reply). It says
// nothing about the payment itself. The HTTP layer answers 503
// payment_check_unavailable; the webhook asks Paystack to retry.
var ErrPaymentCheckUnavailable = errors.New("payment check unavailable")

// ErrPaymentMismatch is a successful charge that does not match the record:
// another amount, currency or reference. It is a settled outcome (it wraps
// ErrPaymentNotCompleted) and is never granted.
var ErrPaymentMismatch = fmt.Errorf("the payment does not match what was due: %w", ErrPaymentNotCompleted)

// chargeVerdict decides whether a verified charge pays for a record that
// expects exactly expectedPesewas in GHS on reference. An unknown amount,
// currency or reference is accepted only from the labelled simulation.
func chargeVerdict(c PaymentCheck, reference string, expectedPesewas int64, simulated bool) error {
	switch c.Outcome {
	case PaymentInProgress:
		return ErrPaymentPending
	case PaymentFailed:
		return ErrPaymentNotCompleted
	}
	if !chargeMatches(c, reference, expectedPesewas, simulated) {
		return ErrPaymentMismatch
	}
	return nil
}

// chargeMatches compares a successful charge with what the record expects.
func chargeMatches(c PaymentCheck, reference string, expectedPesewas int64, simulated bool) bool {
	amountOK := c.AmountPesewas == expectedPesewas || (c.AmountPesewas == 0 && simulated)
	currencyOK := c.Currency == paymentCurrency || (c.Currency == "" && simulated)
	referenceOK := c.Reference == reference || (c.Reference == "" && simulated)
	return amountOK && currencyOK && referenceOK
}

// verifyCharge asks the provider about reference and checks the verdict
// against the expected amount. A final failure (failed, abandoned, reversed,
// unknown reference, or a mismatched charge) is recorded with markFailed when
// given; an in-progress charge leaves the record untouched.
func verifyCharge(ctx context.Context, ps PaystackClient, reference string, expectedPesewas int64, markFailed func(context.Context, string) error) error {
	_, err := verifiedCharge(ctx, ps, reference, expectedPesewas, markFailed)
	return err
}

// verifiedCharge is verifyCharge that also returns what Paystack reported.
func verifiedCharge(ctx context.Context, ps PaystackClient, reference string, expectedPesewas int64, markFailed func(context.Context, string) error) (PaymentCheck, error) {
	check, err := ps.Verify(ctx, reference)
	if err != nil {
		return PaymentCheck{}, err
	}
	err = chargeVerdict(check, reference, expectedPesewas, ps.Simulated())
	if errors.Is(err, ErrPaymentNotCompleted) && markFailed != nil {
		_ = markFailed(ctx, reference)
	}
	return check, err
}
