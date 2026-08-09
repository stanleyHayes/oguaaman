package service

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// IAPService redeems Apple In-App Purchases into Oguaa entitlements.
//
// App Store Review Guideline 3.1.1 requires digital content sold inside the iOS
// app — creator and business plans — to be sold through In-App Purchase. Apple
// takes the money; this service is what turns Apple's proof of that into a
// subscription on our side.
//
// Three things have to be true before anything is granted, and each is a
// separate failure mode:
//
//  1. the receipt is genuinely Apple's, for THIS app        → AppleVerifier
//  2. the product it names is one we actually sell          → the plan map
//  3. this exact transaction has not been redeemed before   → the claim store
//
// Miss (3) and a single real purchase, replayed, buys a subscription forever.
type IAPService struct {
	verifier *AppleVerifier
	txs      domain.AppleTransactionRepository
	subs     *SubscriptionsService
	log      *slog.Logger
}

func NewIAPService(v *AppleVerifier, txs domain.AppleTransactionRepository, subs *SubscriptionsService, log *slog.Logger) *IAPService {
	if log == nil {
		log = slog.Default()
	}
	return &IAPService{verifier: v, txs: txs, subs: subs, log: log}
}

// Enabled reports whether IAP redemption is configured. When false the handler
// answers 503 rather than silently granting or silently refusing.
func (s *IAPService) Enabled() bool {
	return s != nil && s.verifier != nil && s.txs != nil && s.subs != nil
}

var (
	// ErrIAPUnknownProduct — a genuine receipt for something we do not sell.
	ErrIAPUnknownProduct = errors.New("that purchase does not match a plan on Oguaa")
	// ErrIAPAlreadyRedeemed — the transaction has already granted its entitlement.
	ErrIAPAlreadyRedeemed = errors.New("this purchase has already been applied")
	// ErrIAPExpired — a subscription whose period has already ended.
	ErrIAPExpired = errors.New("that subscription has expired")
)

// RedeemResult describes what a redemption granted.
type RedeemResult struct {
	PlanSlug  string `json:"planSlug"`
	ProductID string `json:"productId"`
	ExpiresAt string `json:"expiresAt,omitempty"`
	Reference string `json:"reference"`
}

// Redeem verifies an Apple signed transaction and grants the matching plan to
// memberID.
//
// `reference` ties the redemption back to a subscription record the app created
// before starting the purchase, so the money trail stays continuous with the
// Paystack flow. It is optional: a restore-purchases pass has no fresh
// reference, and must still re-establish entitlement.
func (s *IAPService) Redeem(ctx context.Context, memberID, signedTransaction, reference string) (*RedeemResult, error) {
	if !s.Enabled() {
		return nil, errors.New("in-app purchases are not configured on this server")
	}

	tx, err := s.verifier.Verify(signedTransaction)
	if err != nil {
		// Deliberately terse: a caller probing this endpoint learns only that the
		// receipt was refused, never which check refused it.
		s.log.Warn("apple receipt rejected", "memberId", memberID)
		return nil, ErrAppleReceiptInvalid
	}

	plan, ok := domain.PlanForAppleProduct(tx.ProductID)
	if !ok {
		s.log.Warn("apple receipt names an unknown product", "memberId", memberID, "productId", tx.ProductID)
		return nil, ErrIAPUnknownProduct
	}

	// An auto-renewable subscription that has already lapsed grants nothing. This
	// matters for restore-purchases, which replays every past transaction.
	expiry := tx.Expiry()
	if !expiry.IsZero() && expiry.Before(time.Now().UTC()) {
		return nil, ErrIAPExpired
	}

	now := time.Now().UTC().Format(time.RFC3339)
	rec := domain.AppleTransactionRecord{
		TransactionID:         tx.TransactionID,
		OriginalTransactionID: tx.OriginalTransactionID,
		MemberID:              memberID,
		ProductID:             tx.ProductID,
		PlanSlug:              plan,
		Reference:             reference,
		Environment:           tx.Environment,
		PurchasedAt:           time.UnixMilli(tx.PurchaseDate).UTC().Format(time.RFC3339),
		RedeemedAt:            now,
	}
	if !expiry.IsZero() {
		rec.ExpiresAt = expiry.Format(time.RFC3339)
	}

	// Claim BEFORE granting. If the grant fails we have a claimed-but-ungranted
	// transaction, which a support request can fix; the reverse — granted but
	// unclaimed — is a replayable entitlement, which nothing can fix.
	already, err := s.txs.Claim(ctx, rec)
	if err != nil {
		return nil, err
	}
	if already {
		return nil, ErrIAPAlreadyRedeemed
	}

	if reference != "" {
		if _, err := s.subs.FulfillSubscription(ctx, reference, 0); err != nil {
			// The purchase is real and claimed; losing the entitlement here would
			// be the worst outcome, so log loudly and let the caller retry with a
			// restore rather than pretending it succeeded.
			s.log.Error("apple purchase verified but subscription fulfilment failed",
				"memberId", memberID, "reference", reference, "transactionId", tx.TransactionID, "err", err)
			return nil, err
		}
	}

	s.log.Info("apple purchase redeemed",
		"memberId", memberID, "plan", plan, "productId", tx.ProductID,
		"environment", tx.Environment, "transactionId", tx.TransactionID)

	return &RedeemResult{PlanSlug: plan, ProductID: tx.ProductID, ExpiresAt: rec.ExpiresAt, Reference: reference}, nil
}

// ForgetAppleTransactions drops a member's redemption history on erasure.
func (s *IAPService) ForgetAppleTransactions(ctx context.Context, memberID string) error {
	if s == nil || s.txs == nil {
		return nil
	}
	return s.txs.DeleteByMember(ctx, memberID)
}
