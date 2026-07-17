package service

import (
	"context"
	"fmt"

	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/paymentintent"
)

// StripeClient is the seam to Stripe for PaymentSheet-based mobile checkouts.
type StripeClient interface {
	// CreatePaymentIntent creates a PaymentIntent and returns its client secret
	// (for the mobile sheet) and its Stripe ID (for server-side verification).
	CreatePaymentIntent(ctx context.Context, params StripeIntentParams) (clientSecret, paymentIntentID string, err error)
	// VerifyPaymentIntent returns the Stripe status and captured amount (in the
	// currency's smallest unit, e.g. pesewas for GHS). Status should be compared
	// to "succeeded" by the caller.
	VerifyPaymentIntent(ctx context.Context, paymentIntentID string) (status string, amountPesewas int64, err error)
	// Simulated reports whether this client moves real money.
	Simulated() bool
}

// StripeIntentParams groups the inputs for creating a PaymentIntent.
type StripeIntentParams struct {
	AmountPesewas int64
	Currency      string
	Reference     string
	Email         string
	Metadata      map[string]string
}

// NewStripeClient talks to the live Stripe API with the given secret key.
func NewStripeClient(secretKey string) StripeClient {
	stripe.Key = secretKey
	return &stripeHTTP{}
}

type stripeHTTP struct{}

func (s *stripeHTTP) Simulated() bool { return false }

func (s *stripeHTTP) CreatePaymentIntent(ctx context.Context, p StripeIntentParams) (string, string, error) {
	params := &stripe.PaymentIntentParams{
		Amount:       stripe.Int64(p.AmountPesewas),
		Currency:     stripe.String(p.Currency),
		ReceiptEmail: stripe.String(p.Email),
		Metadata:     map[string]string{"reference": p.Reference},
	}
	for k, v := range p.Metadata {
		params.Metadata[k] = v
	}
	pi, err := paymentintent.New(params)
	if err != nil {
		return "", "", fmt.Errorf("stripe create intent failed: %w", err)
	}
	return pi.ClientSecret, pi.ID, nil
}

func (s *stripeHTTP) VerifyPaymentIntent(ctx context.Context, id string) (string, int64, error) {
	pi, err := paymentintent.Get(id, nil)
	if err != nil {
		return "", 0, fmt.Errorf("stripe retrieve intent failed: %w", err)
	}
	return string(pi.Status), pi.Amount, nil
}

// SimulatedStripe closes the Stripe loop without moving money.
type SimulatedStripe struct{}

func (SimulatedStripe) Simulated() bool { return true }

func (SimulatedStripe) CreatePaymentIntent(_ context.Context, p StripeIntentParams) (string, string, error) {
	return "sim_secret_" + p.Reference, "sim_pi_" + p.Reference, nil
}

func (SimulatedStripe) VerifyPaymentIntent(_ context.Context, _ string) (string, int64, error) {
	return "succeeded", 0, nil
}
