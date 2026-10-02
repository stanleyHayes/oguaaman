package service

import (
	"context"
	"errors"
)

// ErrPaymentsUnavailable is returned by every call on DisabledPaystack: the
// server runs in production without PAYSTACK_SECRET_KEY, and production never
// simulates a payment (D4/K16). The HTTP layer maps it to 503
// {"error":"payments_unavailable"}.
var ErrPaymentsUnavailable = errors.New("payments are temporarily unavailable")

// DisabledPaystack is the payment client production uses when no Paystack key
// is configured. Unlike SimulatedPaystack it never reports success, so no
// ticket, plan, promotion, order or escrow can be granted without real money.
type DisabledPaystack struct{}

// Simulated is false: nothing here pretends a payment happened.
func (DisabledPaystack) Simulated() bool { return false }

func (DisabledPaystack) Initialize(context.Context, string, int64, string, string, string) (string, string, error) {
	return "", "", ErrPaymentsUnavailable
}

func (DisabledPaystack) Verify(context.Context, string) (PaymentCheck, error) {
	return PaymentCheck{}, ErrPaymentsUnavailable
}

func (DisabledPaystack) CreateSubaccount(context.Context, string, string, string) (string, error) {
	return "", ErrPaymentsUnavailable
}

func (DisabledPaystack) InitializeSplit(context.Context, string, int64, string, string, string, string, int64) (string, string, error) {
	return "", "", ErrPaymentsUnavailable
}

func (DisabledPaystack) Refund(context.Context, string, int64, string) (RefundResult, error) {
	return RefundResult{}, ErrPaymentsUnavailable
}

func (DisabledPaystack) RefundStatus(context.Context, string) (RefundResult, error) {
	return RefundResult{}, ErrPaymentsUnavailable
}

// PaystackFor picks the payment client for the environment: live Paystack
// with a secret key; otherwise a labelled simulation in development and the
// disabled client in production.
func PaystackFor(secretKey string, production bool, sim SimulatedPaystack) PlatformPaystack {
	switch {
	case secretKey != "":
		return NewPaystackClient(secretKey)
	case production:
		return DisabledPaystack{}
	default:
		return sim
	}
}
