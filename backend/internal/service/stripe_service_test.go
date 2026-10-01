package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// fakeStripeIntents mirrors StripeIntentRepo: ByReference returns the newest
// intent; Confirm and MarkFailed only touch pending intents.
type fakeStripeIntents struct{ rows []domain.StripeIntent }

func (f *fakeStripeIntents) Insert(_ context.Context, i domain.StripeIntent) error {
	f.rows = append(f.rows, i)
	return nil
}
func (f *fakeStripeIntents) ByReference(_ context.Context, ref string) (*domain.StripeIntent, error) {
	for i := len(f.rows) - 1; i >= 0; i-- {
		if f.rows[i].Reference == ref {
			row := f.rows[i]
			return &row, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "stripe_intent"}
}
func (f *fakeStripeIntents) setPending(ref, status, at string) {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status == domain.StripeIntentPending {
			f.rows[i].Status, f.rows[i].ConfirmedAt = status, at
		}
	}
}
func (f *fakeStripeIntents) Confirm(_ context.Context, ref, at string) error {
	f.setPending(ref, domain.StripeIntentSucceeded, at)
	return nil
}
func (f *fakeStripeIntents) MarkFailed(_ context.Context, ref, at string) error {
	f.setPending(ref, domain.StripeIntentFailed, at)
	return nil
}

// scriptedStripe records what was asked of Stripe and reports a scripted
// PaymentIntent back.
type scriptedStripe struct {
	simulated bool
	created   []StripeIntentParams
	paid      StripePaymentIntent
}

func (s *scriptedStripe) Simulated() bool { return s.simulated }
func (s *scriptedStripe) CreatePaymentIntent(_ context.Context, p StripeIntentParams) (string, string, error) {
	s.created = append(s.created, p)
	return "secret_" + p.Reference, "pi_" + p.Reference, nil
}
func (s *scriptedStripe) VerifyPaymentIntent(context.Context, string) (StripePaymentIntent, error) {
	return s.paid, nil
}

const stripeTestRef = "promo-b-1-1"

func stripeFixture(t *testing.T, client *scriptedStripe) (*StripeService, *fakeStripeIntents, *fakePromos, *fakeRepo) {
	t.Helper()
	listings := &fakeRepo{listings: []domain.Listing{{ID: "b-1", Slug: "castle-view", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Details: map[string]any{}}}}
	promos := &fakePromos{rows: []domain.Promotion{{ID: "p1", Reference: stripeTestRef, ListingID: "b-1", MemberID: "m-yaw", Email: "yaw@test", Days: 7, AmountPesewas: 50_000, Status: domain.PledgePending}}}
	intents := &fakeStripeIntents{}
	svc := NewStripeService(client, intents, nil, nil, nil, NewPromotionsService(listings, promos, &fakePaystack{}, ""))
	return svc, intents, promos, listings
}

// F045/G114: the amount and currency charged are the record's and GHS — the
// client has no say in either.
func TestStripeIntentChargesTheRecordAmountInCedis(t *testing.T) {
	client := &scriptedStripe{}
	svc, _, _, _ := stripeFixture(t, client)
	checkout, err := svc.CreateIntent(context.Background(), &domain.Member{ID: "m-yaw"}, StripeFlowPromotion, stripeTestRef)
	if err != nil {
		t.Fatal(err)
	}
	if len(client.created) != 1 || client.created[0].AmountPesewas != 50_000 || client.created[0].Currency != "ghs" {
		t.Fatalf("stripe was asked for %+v", client.created)
	}
	if client.created[0].Reference != stripeTestRef || checkout.AmountPesewas != 50_000 {
		t.Fatalf("checkout=%+v", checkout)
	}
	// Re-opening the sheet reuses the same PaymentIntent.
	if _, err = svc.CreateIntent(context.Background(), &domain.Member{ID: "m-yaw"}, StripeFlowPromotion, stripeTestRef); err != nil || len(client.created) != 1 {
		t.Fatalf("second open created another PaymentIntent (%d) err=%v", len(client.created), err)
	}
}

func TestStripeIntentIsOnlyForThePayersPendingRecord(t *testing.T) {
	client := &scriptedStripe{}
	svc, _, promos, _ := stripeFixture(t, client)
	if _, err := svc.CreateIntent(context.Background(), &domain.Member{ID: "m-other"}, StripeFlowPromotion, stripeTestRef); !isCommerceForbidden(err) {
		t.Fatalf("another member's checkout: err=%v", err)
	}
	if _, err := svc.CreateIntent(context.Background(), &domain.Member{ID: "m-yaw"}, "donation-to-self", stripeTestRef); !isCommerceValidation(err) {
		t.Fatalf("unknown flow: err=%v", err)
	}
	if _, err := svc.CreateIntent(context.Background(), &domain.Member{ID: "m-yaw"}, StripeFlowTicket, stripeTestRef); !isCommerceValidation(err) {
		t.Fatalf("a disabled flow: err=%v", err)
	}
	promos.rows[0].Status = domain.PledgeSuccess
	if _, err := svc.CreateIntent(context.Background(), &domain.Member{ID: "m-yaw"}, StripeFlowPromotion, stripeTestRef); !isCommerceValidation(err) {
		t.Fatalf("a settled checkout: err=%v", err)
	}
	if len(client.created) != 0 {
		t.Fatalf("a PaymentIntent was created for a refused checkout: %+v", client.created)
	}
}

// F045/G090: a payment in another currency, of another amount or for another
// reference never fulfils the record.
func TestStripeConfirmRejectsAPaymentOnOtherTerms(t *testing.T) {
	for name, paid := range map[string]StripePaymentIntent{
		"cheaper currency": {Status: "succeeded", AmountPesewas: 50_000, Currency: "vnd", Reference: stripeTestRef},
		"smaller amount":   {Status: "succeeded", AmountPesewas: 100, Currency: "ghs", Reference: stripeTestRef},
		"other reference":  {Status: "succeeded", AmountPesewas: 50_000, Currency: "ghs", Reference: "promo-b-1-2"},
		"unknown amount":   {Status: "succeeded"},
	} {
		t.Run(name, func(t *testing.T) {
			client := &scriptedStripe{}
			svc, intents, promos, listings := stripeFixture(t, client)
			if _, err := svc.CreateIntent(context.Background(), &domain.Member{ID: "m-yaw"}, StripeFlowPromotion, stripeTestRef); err != nil {
				t.Fatal(err)
			}
			client.paid = paid
			if err := svc.ConfirmIntent(context.Background(), stripeTestRef); !errors.Is(err, ErrStripePaymentMismatch) {
				t.Fatalf("err=%v, want ErrStripePaymentMismatch", err)
			}
			if promos.rows[0].Status != domain.PledgePending || listings.listings[0].Featured {
				t.Fatal("a mismatched payment was fulfilled")
			}
			if intents.rows[0].Status != domain.StripeIntentFailed {
				t.Fatalf("intent status=%s, want failed", intents.rows[0].Status)
			}
			// Retrying the confirmation stays refused.
			if err := svc.ConfirmIntent(context.Background(), stripeTestRef); err == nil {
				t.Fatal("a retired intent confirmed")
			}
		})
	}
}

func TestStripeConfirmFulfilsAMatchingPayment(t *testing.T) {
	client := &scriptedStripe{}
	svc, intents, promos, listings := stripeFixture(t, client)
	if _, err := svc.CreateIntent(context.Background(), &domain.Member{ID: "m-yaw"}, StripeFlowPromotion, stripeTestRef); err != nil {
		t.Fatal(err)
	}
	client.paid = StripePaymentIntent{Status: "succeeded", AmountPesewas: 50_000, Currency: "ghs", Reference: stripeTestRef}
	if err := svc.ConfirmIntent(context.Background(), stripeTestRef); err != nil {
		t.Fatal(err)
	}
	if promos.rows[0].Status != domain.PledgeSuccess || !listings.listings[0].Featured || intents.rows[0].Status != domain.StripeIntentSucceeded {
		t.Fatalf("not fulfilled: promo=%+v intent=%+v", promos.rows[0], intents.rows[0])
	}
}

// The labelled simulation reports no amount; that is accepted only when the
// client says it is simulated.
func TestStripeSimulationOnlyAcceptsUnknownAmountsWhenSimulated(t *testing.T) {
	client := &scriptedStripe{simulated: true, paid: StripePaymentIntent{Status: "succeeded"}}
	svc, _, promos, _ := stripeFixture(t, client)
	if _, err := svc.CreateIntent(context.Background(), &domain.Member{ID: "m-yaw"}, StripeFlowPromotion, stripeTestRef); err != nil {
		t.Fatal(err)
	}
	if err := svc.ConfirmIntent(context.Background(), stripeTestRef); err != nil {
		t.Fatalf("simulated confirm: %v", err)
	}
	if promos.rows[0].Status != domain.PledgeSuccess {
		t.Fatal("simulated payment not fulfilled")
	}
}
