package service

import (
	"context"
	"fmt"
	"maps"

	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/paymentintent"
)

// StripeClient is the seam to Stripe for PaymentSheet-based mobile checkouts.
type StripeClient interface {
	// CreatePaymentIntent creates a PaymentIntent and returns its client secret
	// (for the mobile sheet) and its Stripe ID (for server-side verification).
	CreatePaymentIntent(ctx context.Context, params StripeIntentParams) (clientSecret, paymentIntentID string, err error)
	// VerifyPaymentIntent returns what Stripe actually recorded for the
	// PaymentIntent: its status, the captured amount (in the currency's
	// smallest unit, e.g. pesewas for GHS), the currency, and the reference we
	// stamped into its metadata. The caller compares all of them with the
	// pending record before fulfilling anything.
	VerifyPaymentIntent(ctx context.Context, paymentIntentID string) (StripePaymentIntent, error)
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

// StripePaymentIntent is the server-side view of a PaymentIntent.
type StripePaymentIntent struct {
	Status        string // compare to "succeeded"
	AmountPesewas int64  // 0 = unknown (simulation only)
	Currency      string // lowercase ISO 4217, e.g. "ghs"
	Reference     string // metadata["reference"]
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
		Metadata:     map[string]string{},
	}
	maps.Copy(params.Metadata, p.Metadata)
	// Set last so no metadata entry can replace the reference we verify.
	params.Metadata["reference"] = p.Reference
	pi, err := paymentintent.New(params)
	if err != nil {
		return "", "", fmt.Errorf("stripe create intent failed: %w", err)
	}
	return pi.ClientSecret, pi.ID, nil
}

func (s *stripeHTTP) VerifyPaymentIntent(ctx context.Context, id string) (StripePaymentIntent, error) {
	pi, err := paymentintent.Get(id, nil)
	if err != nil {
		return StripePaymentIntent{}, fmt.Errorf("stripe retrieve intent failed: %w", err)
	}
	return StripePaymentIntent{
		Status:        string(pi.Status),
		AmountPesewas: pi.Amount,
		Currency:      string(pi.Currency),
		Reference:     pi.Metadata["reference"],
	}, nil
}

// SimulatedStripe closes the Stripe loop without moving money.
type SimulatedStripe struct{}

func (SimulatedStripe) Simulated() bool { return true }

func (SimulatedStripe) CreatePaymentIntent(_ context.Context, p StripeIntentParams) (string, string, error) {
	return "sim_secret_" + p.Reference, "sim_pi_" + p.Reference, nil
}

func (SimulatedStripe) VerifyPaymentIntent(_ context.Context, _ string) (StripePaymentIntent, error) {
	return StripePaymentIntent{Status: "succeeded"}, nil
}
