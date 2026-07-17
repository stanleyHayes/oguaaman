package service

import (
	"context"
	"fmt"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// StripeService drives PaymentSheet-based mobile checkouts. It creates Stripe
// PaymentIntents, records them for audit, and routes successful confirmations
// to the existing money-flow services without duplicating their fulfillment
// logic.
type StripeService struct {
	stripe   StripeClient
	intents  domain.StripeIntentRepository
	payments *PaymentsService
	tickets  *TicketsService
	subs     *SubscriptionsService
	promos   *PromotionsService
}

// NewStripeService wires the service. Any of the money-flow services may be nil
// if that particular flow is not yet enabled for Stripe; the handler should
// reject unsupported flows before calling the service.
func NewStripeService(
	stripe StripeClient,
	intents domain.StripeIntentRepository,
	payments *PaymentsService,
	tickets *TicketsService,
	subs *SubscriptionsService,
	promos *PromotionsService,
) *StripeService {
	return &StripeService{
		stripe:   stripe,
		intents:  intents,
		payments: payments,
		tickets:  tickets,
		subs:     subs,
		promos:   promos,
	}
}

// Simulated reports whether the Stripe client moves real money.
func (s *StripeService) Simulated() bool { return s.stripe.Simulated() }

// CreateIntent creates a PaymentIntent for the mobile PaymentSheet and stores
// a local record so ConfirmIntent can verify it idempotently.
func (s *StripeService) CreateIntent(
	ctx context.Context,
	memberID, email string,
	amountPesewas int64,
	currency, flow, reference string,
	metadata map[string]string,
) (clientSecret, paymentIntentID string, err error) {
	if reference == "" {
		return "", "", fmt.Errorf("reference is required")
	}
	if amountPesewas <= 0 {
		return "", "", fmt.Errorf("amount must be greater than zero")
	}
	clientSecret, paymentIntentID, err = s.stripe.CreatePaymentIntent(ctx, StripeIntentParams{
		AmountPesewas: amountPesewas,
		Currency:      currency,
		Reference:     reference,
		Email:         email,
		Metadata:      metadata,
	})
	if err != nil {
		return "", "", err
	}
	intent := domain.StripeIntent{
		ID:              newID(domain.PrefixStripeIntent),
		Reference:       reference,
		PaymentIntentID: paymentIntentID,
		ClientSecret:    clientSecret,
		Flow:            flow,
		AmountPesewas:   amountPesewas,
		Currency:        currency,
		MemberID:        memberID,
		Email:           email,
		Metadata:        metadata,
		Status:          domain.StripeIntentPending,
		Simulated:       s.stripe.Simulated(),
		CreatedAt:       time.Now().UTC().Format(time.RFC3339),
	}
	if ierr := s.intents.Insert(ctx, intent); ierr != nil {
		return "", "", ierr
	}
	return clientSecret, paymentIntentID, nil
}

// ConfirmIntent retrieves the local PaymentIntent record, asks Stripe for the
// current status, and fulfills the matching money flow when successful.
func (s *StripeService) ConfirmIntent(ctx context.Context, reference string) error {
	intent, err := s.intents.ByReference(ctx, reference)
	if err != nil {
		return err
	}
	if intent.Status == domain.StripeIntentSucceeded {
		return nil
	}
	status, amount, err := s.stripe.VerifyPaymentIntent(ctx, intent.PaymentIntentID)
	if err != nil {
		return err
	}
	if status != "succeeded" {
		return fmt.Errorf("payment not completed")
	}
	charged := amount
	if charged <= 0 {
		charged = intent.AmountPesewas
	}
	var fulfillErr error
	switch intent.Flow {
	case "pledge":
		_, fulfillErr = s.payments.FulfillPledge(ctx, reference, charged)
	case "ticket":
		_, fulfillErr = s.tickets.FulfillTicket(ctx, reference, charged)
	case "subscription":
		_, fulfillErr = s.subs.FulfillSubscription(ctx, reference, charged)
	case "promotion":
		_, fulfillErr = s.promos.FulfillPromotion(ctx, reference, charged)
	default:
		fulfillErr = fmt.Errorf("unsupported Stripe flow: %s", intent.Flow)
	}
	if fulfillErr != nil {
		return fulfillErr
	}
	return s.intents.Confirm(ctx, reference, time.Now().UTC().Format(time.RFC3339))
}
