package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// StripeService drives PaymentSheet-based mobile checkouts. It creates Stripe
// PaymentIntents, records them for audit, and routes successful confirmations
// to the existing money-flow services without duplicating their fulfillment
// logic.
//
// The amount and currency of every PaymentIntent come from the server: the
// pending record the reference names (its stored amount) and Oguaa's charge
// currency. A client only says WHICH pending record it is paying for, and on
// confirmation Stripe's own record of the payment (amount, currency and the
// reference stamped into its metadata) must match before anything is granted.
type StripeService struct {
	stripe   StripeClient
	intents  domain.StripeIntentRepository
	payments *PaymentsService
	tickets  *TicketsService
	subs     *SubscriptionsService
	promos   *PromotionsService
}

// Stripe checkout flows: which pending record a PaymentIntent pays for.
const (
	StripeFlowPledge       = "pledge"
	StripeFlowTicket       = "ticket"
	StripeFlowSubscription = "subscription"
	StripeFlowPromotion    = "promotion"

	// stripeChargeCurrency is the only currency Oguaa charges in. Prices are
	// set in Ghana cedis and there is no non-resident / foreign-exchange flow
	// (which would need a Bank of Ghana reference rate and an FX settlement
	// account), so the currency is never taken from the client.
	stripeChargeCurrency = "ghs"
	stripeSucceeded      = "succeeded"
)

// ErrStripePaymentMismatch — Stripe's record of a payment does not match the
// checkout it claims to pay for (another amount, currency or reference).
// Nothing is fulfilled; callers should log it as a security event.
var ErrStripePaymentMismatch = errors.New("the payment did not match this checkout — contact support if you were charged")

// NewStripeService wires the service. Any of the money-flow services may be nil
// if that particular flow is not yet enabled for Stripe; such a flow is then
// refused.
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

// StripeCheckout is what the mobile PaymentSheet needs, plus what it charges.
type StripeCheckout struct {
	ClientSecret    string
	PaymentIntentID string
	AmountPesewas   int64
	Currency        string
}

// stripeCharge is the pending money record a PaymentIntent pays for.
type stripeCharge struct {
	memberID string
	email    string
	amount   int64
	status   string
}

var errStripeFlowUnsupported = &domain.ValidationError{Message: "flow must be pledge, ticket, subscription or promotion"}

func (s *StripeService) pledgeCharge(ctx context.Context, ref string) (stripeCharge, error) {
	if s.payments == nil {
		return stripeCharge{}, errStripeFlowUnsupported
	}
	p, err := s.payments.pledges.ByReference(ctx, ref)
	if err != nil {
		return stripeCharge{}, err
	}
	return stripeCharge{memberID: p.MemberID, email: p.Email, amount: p.AmountPesewas, status: p.Status}, nil
}

func (s *StripeService) ticketCharge(ctx context.Context, ref string) (stripeCharge, error) {
	if s.tickets == nil {
		return stripeCharge{}, errStripeFlowUnsupported
	}
	t, err := s.tickets.tickets.ByReference(ctx, ref)
	if err != nil {
		return stripeCharge{}, err
	}
	return stripeCharge{memberID: t.MemberID, email: t.Email, amount: t.AmountPesewas, status: t.Status}, nil
}

func (s *StripeService) subscriptionCharge(ctx context.Context, ref string) (stripeCharge, error) {
	if s.subs == nil {
		return stripeCharge{}, errStripeFlowUnsupported
	}
	sub, err := s.subs.subs.ByReference(ctx, ref)
	if err != nil {
		return stripeCharge{}, err
	}
	return stripeCharge{memberID: sub.MemberID, amount: sub.AmountPesewas, status: sub.Status}, nil
}

func (s *StripeService) promotionCharge(ctx context.Context, ref string) (stripeCharge, error) {
	if s.promos == nil {
		return stripeCharge{}, errStripeFlowUnsupported
	}
	p, err := s.promos.promotions.ByReference(ctx, ref)
	if err != nil {
		return stripeCharge{}, err
	}
	return stripeCharge{memberID: p.MemberID, email: p.Email, amount: p.AmountPesewas, status: p.Status}, nil
}

// pendingCharge loads the money record a reference names, by flow.
func (s *StripeService) pendingCharge(ctx context.Context, flow, reference string) (stripeCharge, error) {
	switch flow {
	case StripeFlowPledge:
		return s.pledgeCharge(ctx, reference)
	case StripeFlowTicket:
		return s.ticketCharge(ctx, reference)
	case StripeFlowSubscription:
		return s.subscriptionCharge(ctx, reference)
	case StripeFlowPromotion:
		return s.promotionCharge(ctx, reference)
	default:
		return stripeCharge{}, errStripeFlowUnsupported
	}
}

// CreateIntent creates (or reuses) the PaymentIntent for one of the payer's
// own pending records. The amount is the record's stored amount and the
// currency is always GHS; nothing about the charge comes from the client.
func (s *StripeService) CreateIntent(ctx context.Context, payer *domain.Member, flow, reference string) (*StripeCheckout, error) {
	if payer == nil || payer.ID == "" {
		return nil, &domain.ForbiddenError{Reason: "sign in to pay"}
	}
	reference = strings.TrimSpace(reference)
	if reference == "" {
		return nil, &domain.ValidationError{Message: "reference is required"}
	}
	charge, err := s.pendingCharge(ctx, flow, reference)
	if err != nil {
		return nil, err
	}
	if charge.memberID == "" || charge.memberID != payer.ID {
		return nil, &domain.ForbiddenError{Reason: "this payment belongs to another account"}
	}
	if charge.status != domain.PledgePending {
		return nil, &domain.ValidationError{Message: "this payment is no longer awaiting payment"}
	}
	if charge.amount <= 0 {
		return nil, &domain.ValidationError{Message: "there is nothing to pay on this checkout"}
	}
	if reused, err := s.reuseIntent(ctx, payer, flow, reference, charge); reused != nil || err != nil {
		return reused, err
	}
	email := charge.email
	if email == "" {
		email = payer.Email
	}
	clientSecret, paymentIntentID, err := s.stripe.CreatePaymentIntent(ctx, StripeIntentParams{
		AmountPesewas: charge.amount,
		Currency:      stripeChargeCurrency,
		Reference:     reference,
		Email:         email,
		Metadata:      map[string]string{"flow": flow, "memberId": payer.ID},
	})
	if err != nil {
		return nil, err
	}
	intent := domain.StripeIntent{
		ID:              newID(domain.PrefixStripeIntent),
		Reference:       reference,
		PaymentIntentID: paymentIntentID,
		ClientSecret:    clientSecret,
		Flow:            flow,
		AmountPesewas:   charge.amount,
		Currency:        stripeChargeCurrency,
		MemberID:        payer.ID,
		Email:           email,
		Status:          domain.StripeIntentPending,
		Simulated:       s.stripe.Simulated(),
		CreatedAt:       time.Now().UTC().Format(time.RFC3339),
	}
	if ierr := s.intents.Insert(ctx, intent); ierr != nil {
		return nil, ierr
	}
	return &StripeCheckout{ClientSecret: clientSecret, PaymentIntentID: paymentIntentID, AmountPesewas: charge.amount, Currency: stripeChargeCurrency}, nil
}

// reuseIntent returns the reference's existing pending PaymentIntent when it
// charges exactly what the record says, so a retried sheet never opens a
// second PaymentIntent for one checkout. An older intent on other terms is
// retired (failed) so it can never fulfil the record.
func (s *StripeService) reuseIntent(ctx context.Context, payer *domain.Member, flow, reference string, charge stripeCharge) (*StripeCheckout, error) {
	existing, err := s.intents.ByReference(ctx, reference)
	if err != nil {
		if isCommerceNotFound(err) {
			return nil, nil
		}
		return nil, err
	}
	switch {
	case existing.MemberID != "" && existing.MemberID != payer.ID:
		return nil, &domain.ForbiddenError{Reason: "this payment belongs to another account"}
	case existing.Status == domain.StripeIntentSucceeded:
		return nil, &domain.ValidationError{Message: "this payment has already been completed"}
	case existing.Status == domain.StripeIntentPending && existing.Flow == flow && existing.AmountPesewas == charge.amount && strings.EqualFold(existing.Currency, stripeChargeCurrency):
		return &StripeCheckout{ClientSecret: existing.ClientSecret, PaymentIntentID: existing.PaymentIntentID, AmountPesewas: existing.AmountPesewas, Currency: stripeChargeCurrency}, nil
	case existing.Status == domain.StripeIntentPending:
		if err := s.intents.MarkFailed(ctx, reference, time.Now().UTC().Format(time.RFC3339)); err != nil {
			return nil, err
		}
	}
	return nil, nil
}

// paymentMatches checks Stripe's record of a payment against the checkout:
// same reference, same currency, same amount. The labelled simulation, which
// reports none of them, is the only exception.
func (s *StripeService) paymentMatches(pi StripePaymentIntent, reference string, charge stripeCharge) bool {
	if s.stripe.Simulated() && pi.AmountPesewas == 0 && pi.Currency == "" && pi.Reference == "" {
		return true
	}
	return pi.Reference == reference && strings.EqualFold(pi.Currency, stripeChargeCurrency) && pi.AmountPesewas == charge.amount
}

// ConfirmIntent retrieves the local PaymentIntent record, asks Stripe what was
// actually paid, and fulfils the matching money flow only when Stripe's
// amount, currency and reference all match the pending record.
func (s *StripeService) ConfirmIntent(ctx context.Context, reference string) error {
	intent, err := s.intents.ByReference(ctx, reference)
	if err != nil {
		return err
	}
	switch intent.Status {
	case domain.StripeIntentSucceeded:
		return nil
	case domain.StripeIntentFailed:
		return ErrStripePaymentMismatch
	}
	pi, err := s.stripe.VerifyPaymentIntent(ctx, intent.PaymentIntentID)
	if err != nil {
		return err
	}
	if pi.Status != stripeSucceeded {
		return &domain.ValidationError{Message: "payment not completed"}
	}
	charge, err := s.pendingCharge(ctx, intent.Flow, reference)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if !s.paymentMatches(pi, reference, charge) {
		_ = s.intents.MarkFailed(ctx, reference, now)
		return ErrStripePaymentMismatch
	}
	if err := s.fulfil(ctx, intent.Flow, reference, charge.amount); err != nil {
		return err
	}
	return s.intents.Confirm(ctx, reference, now)
}

// fulfil hands a verified payment to the money flow that owns the record.
func (s *StripeService) fulfil(ctx context.Context, flow, reference string, amount int64) error {
	var err error
	switch flow {
	case StripeFlowPledge:
		_, err = s.payments.FulfillPledge(ctx, reference, amount)
	case StripeFlowTicket:
		_, err = s.tickets.FulfillTicket(ctx, reference, amount)
	case StripeFlowSubscription:
		_, err = s.subs.FulfillSubscription(ctx, reference, amount)
	case StripeFlowPromotion:
		_, err = s.promos.FulfillPromotion(ctx, reference, amount)
	default:
		err = errStripeFlowUnsupported
	}
	return err
}
