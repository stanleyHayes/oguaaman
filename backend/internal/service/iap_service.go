package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
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
// Four things have to be true before anything is granted, and each is a
// separate failure mode:
//
//  1. the receipt is genuinely Apple's, for THIS app          → AppleVerifier
//  2. the product it names is one we sell, and it decides the
//     plan and audience granted — never the client's reference → the plan map
//  3. the purchase belongs to the caller (appAccountToken, and
//     the referenced checkout / business are theirs)            → resolveGrant
//  4. this exact transaction has not been redeemed before       → the claim store
//
// Miss (4) and a single real purchase, replayed, buys a subscription forever.
//
// Grants run to Apple's own expiresDate and never stack, so applying the same
// period twice is harmless. Sandbox purchases (App Review, TestFlight) are
// accepted, flagged, limited to a 24-hour window and kept out of the revenue
// ledger.
type IAPService struct {
	verifier *AppleVerifier
	txs      domain.AppleTransactionRepository
	subs     *SubscriptionsService
	log      *slog.Logger
}

const (
	// sandboxGrantWindow caps an App Store sandbox grant (App Review).
	sandboxGrantWindow = 24 * time.Hour
	// appleFallbackPeriod covers a production purchase that carries no
	// expiry (never true of our auto-renewable plans): one plan month.
	appleFallbackPeriod = supporterPeriod
	// appleRecordRetentionYears is how long a pseudonymised purchase record
	// is kept after the member is erased (tax retention).
	appleRecordRetentionYears = 6
)

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
	// ErrIAPWrongAccount — the purchase was made for another Oguaa account
	// (its appAccountToken names someone else).
	ErrIAPWrongAccount = errors.New("this purchase was made from another Oguaa account")
	// ErrIAPPlanMismatch — the checkout the reference names is for another
	// plan or audience than the product Apple sold.
	ErrIAPPlanMismatch = errors.New("that purchase is for a different plan than this checkout")
	// ErrIAPNeedsReference — a first business-plan purchase has to say which
	// business it is for.
	ErrIAPNeedsReference = errors.New("open your business's plan page to apply this purchase")
)

// RedeemResult describes what a redemption granted.
type RedeemResult struct {
	PlanSlug  string `json:"planSlug"`
	ProductID string `json:"productId"`
	Scope     string `json:"scope"`
	ListingID string `json:"listingId,omitempty"`
	ExpiresAt string `json:"expiresAt,omitempty"` // the entitlement end granted
	Reference string `json:"reference"`
	Sandbox   bool   `json:"sandbox,omitempty"`
}

// AppAccountToken is the UUID the app passes to StoreKit as appAccountToken
// when this member buys, so Apple signs which Oguaa account a purchase is
// for. It is derived from the member id (nothing to store), and a purchase
// carrying another member's token is refused.
func AppAccountToken(memberID string) string {
	sum := sha256.Sum256([]byte("oguaa-iap-account:" + memberID))
	b := sum[:16]
	b[6] = (b[6] & 0x0f) | 0x80 // RFC 9562 version 8 (custom, name-derived)
	b[8] = (b[8] & 0x3f) | 0x80 // RFC 4122 variant
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// appleGrant is what a verified purchase will be applied to.
type appleGrant struct {
	product  domain.AppleProduct
	memberID string
	listing  *domain.Listing      // business plans: the business granted
	sub      *domain.Subscription // the checkout the reference names, if any
	until    time.Time
	sandbox  bool
}

// Redeem verifies an Apple signed transaction and grants the plan Apple sold
// to memberID.
//
// `reference` names the subscription checkout the app created before the
// purchase (StartSubscription / StartCreatorSubscription). It must belong to
// the caller and be for the plan and audience of the product Apple sold. It
// is optional for creator plans and for renewals/restores of a business plan
// already redeemed by this member (the business comes from that earlier
// redemption); a first business-plan purchase needs it. Nothing is claimed
// unless it is also granted.
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
	product, ok := domain.AppleProductByID(tx.ProductID)
	if !ok {
		s.log.Warn("apple receipt names an unknown product", "memberId", memberID, "productId", tx.ProductID)
		return nil, ErrIAPUnknownProduct
	}
	if tx.AppAccountToken != "" && !strings.EqualFold(tx.AppAccountToken, AppAccountToken(memberID)) {
		s.log.Warn("security: apple purchase redeemed by another account", "memberId", memberID, "transactionId", tx.TransactionID)
		return nil, ErrIAPWrongAccount
	}
	now := time.Now().UTC()
	// An auto-renewable subscription that has already lapsed grants nothing. This
	// matters for restore-purchases, which replays every past transaction.
	if expiry := tx.Expiry(); !expiry.IsZero() && expiry.Before(now) {
		return nil, ErrIAPExpired
	}
	reference = strings.TrimSpace(reference)
	g, err := s.resolveGrant(ctx, memberID, reference, product, tx)
	if err != nil {
		return nil, err
	}
	g.sandbox = tx.Environment == AppleEnvironmentSandbox
	g.until = s.grantUntil(tx, now)

	// Claim BEFORE granting, so two concurrent redemptions can't both grant. If
	// the grant then fails the claim is released for a retry — grants are
	// idempotent (they never stack), so a retry can't double-grant.
	already, err := s.txs.Claim(ctx, claimRecord(tx, g, reference, now))
	if err != nil {
		return nil, err
	}
	if already {
		return nil, ErrIAPAlreadyRedeemed
	}
	if err := s.applyEntitlement(ctx, g, now); err != nil {
		_ = s.txs.Unclaim(ctx, tx.TransactionID)
		s.log.Error("apple purchase verified but the entitlement could not be applied",
			"memberId", memberID, "reference", reference, "transactionId", tx.TransactionID, "err", err)
		return nil, err
	}
	if !g.sandbox {
		if err := s.recordLedger(ctx, g, tx, now); err != nil {
			s.log.Error("apple purchase granted but not recorded in the subscription ledger",
				"memberId", memberID, "transactionId", tx.TransactionID, "err", err)
		}
	}
	s.log.Info("apple purchase redeemed",
		"memberId", memberID, "plan", product.Plan, "productId", tx.ProductID,
		"environment", tx.Environment, "transactionId", tx.TransactionID, "until", g.until.Format(time.RFC3339))

	res := &RedeemResult{PlanSlug: product.Plan, ProductID: tx.ProductID, Scope: product.Scope, ExpiresAt: g.until.Format(time.RFC3339), Reference: reference, Sandbox: g.sandbox}
	if g.listing != nil {
		res.ListingID = g.listing.ID
	}
	return res, nil
}

// resolveGrant works out, before anything is claimed, which account and
// business a purchase applies to — and refuses one that isn't the caller's.
func (s *IAPService) resolveGrant(ctx context.Context, memberID, reference string, product domain.AppleProduct, tx *AppleTransaction) (appleGrant, error) {
	g := appleGrant{product: product, memberID: memberID}
	listingID := ""
	switch {
	case reference != "":
		sub, err := s.subs.subs.ByReference(ctx, reference)
		if err != nil {
			return g, err
		}
		if err := checkReferencedCheckout(sub, memberID, product); err != nil {
			return g, err
		}
		g.sub, listingID = sub, sub.ListingID
	case product.Scope == domain.SubscriptionScopeBusiness:
		prev, err := s.txs.LatestByOriginalTransactionID(ctx, tx.OriginalTransactionID)
		if err != nil {
			return g, err
		}
		if prev == nil || prev.MemberID != memberID || prev.ListingID == "" {
			return g, ErrIAPNeedsReference
		}
		listingID = prev.ListingID
	}
	if product.Scope != domain.SubscriptionScopeBusiness {
		return g, nil
	}
	l, err := s.subs.listings.GetByID(ctx, listingID)
	if err != nil {
		return g, err
	}
	if l.Type != domain.TypeBusiness || l.OwnerID != memberID {
		return g, &domain.ForbiddenError{Reason: "only the owner of this business can apply its plan"}
	}
	g.listing = l
	return g, nil
}

// checkReferencedCheckout binds the named checkout to the caller and to the
// product Apple actually sold.
func checkReferencedCheckout(sub *domain.Subscription, memberID string, product domain.AppleProduct) error {
	if sub.MemberID == "" || sub.MemberID != memberID {
		return &domain.ForbiddenError{Reason: "that checkout belongs to another account"}
	}
	scope := sub.Scope
	if scope == "" {
		scope = domain.SubscriptionScopeBusiness
	}
	if sub.Plan != product.Plan || scope != product.Scope {
		return ErrIAPPlanMismatch
	}
	return nil
}

// grantUntil is the entitlement end: Apple's expiresDate for a real purchase;
// for a sandbox purchase a 24-hour window (App Review), or — on a staging
// server that opts in — Apple's accelerated sandbox expiry, never beyond 24 h.
func (s *IAPService) grantUntil(tx *AppleTransaction, now time.Time) time.Time {
	expiry := tx.Expiry()
	if tx.Environment == AppleEnvironmentSandbox {
		limit := now.Add(sandboxGrantWindow)
		if s.verifier.sandboxAppleExpiry && !expiry.IsZero() && expiry.Before(limit) {
			return expiry
		}
		return limit
	}
	if expiry.IsZero() {
		return now.Add(appleFallbackPeriod)
	}
	return expiry
}

func claimRecord(tx *AppleTransaction, g appleGrant, reference string, now time.Time) domain.AppleTransactionRecord {
	rec := domain.AppleTransactionRecord{
		TransactionID:         tx.TransactionID,
		OriginalTransactionID: tx.OriginalTransactionID,
		MemberID:              g.memberID,
		ProductID:             tx.ProductID,
		PlanSlug:              g.product.Plan,
		Scope:                 g.product.Scope,
		Reference:             reference,
		Environment:           tx.Environment,
		Sandbox:               g.sandbox,
		PurchasedAt:           time.UnixMilli(tx.PurchaseDate).UTC().Format(time.RFC3339),
		GrantedUntil:          g.until.Format(time.RFC3339),
		RedeemedAt:            now.Format(time.RFC3339),
	}
	if g.listing != nil {
		rec.ListingID = g.listing.ID
	}
	if expiry := tx.Expiry(); !expiry.IsZero() {
		rec.ExpiresAt = expiry.Format(time.RFC3339)
	}
	return rec
}

// coversUntil reports whether an existing paid-until (RFC3339) already
// reaches t. A grant never shortens or replaces a longer period.
func coversUntil(raw string, t time.Time) bool {
	until, err := time.Parse(time.RFC3339, raw)
	return err == nil && !until.Before(t)
}

// applyEntitlement sets the member's or business's paid-until to the grant's
// end (no stacking) and applies a business plan's bundled promotion days.
func (s *IAPService) applyEntitlement(ctx context.Context, g appleGrant, now time.Time) error {
	until := g.until.Format(time.RFC3339)
	if g.product.Scope == domain.SubscriptionScopeCreator {
		m, err := s.subs.members.ByID(ctx, g.memberID)
		if err != nil {
			return err
		}
		if coversUntil(m.CreatorSubscribedUntil, g.until) {
			return nil
		}
		return s.subs.members.SetCreatorSubscription(ctx, g.memberID, g.product.Plan, until)
	}
	if current, _ := g.listing.Details["subscribedUntil"].(string); !coversUntil(current, g.until) {
		if err := s.subs.listings.SetSubscribedUntil(ctx, g.listing.ID, g.product.Plan, until); err != nil {
			return err
		}
	}
	if g.sandbox {
		return nil // a sandbox purchase never buys public paid placement
	}
	return s.applyIncludedPromotion(ctx, g, now)
}

// applyIncludedPromotion features the business for the plan's bundled
// promotion days (Featured plan), without stacking.
func (s *IAPService) applyIncludedPromotion(ctx context.Context, g appleGrant, now time.Time) error {
	if s.subs.plans == nil {
		return nil
	}
	p, err := s.subs.plans.BySlug(ctx, g.product.Plan)
	if err != nil || p.IncludedPromoDays <= 0 {
		return nil
	}
	featuredUntil := now.Add(time.Duration(p.IncludedPromoDays) * 24 * time.Hour)
	if coversUntil(g.listing.FeaturedUntil, featuredUntil) {
		return nil
	}
	return s.subs.listings.SetFeatured(ctx, g.listing.ID, true, featuredUntil.Format(time.RFC3339))
}

// recordLedger keeps the subscription ledger (and so the revenue dashboard)
// in step with real App Store purchases: the checkout the reference names is
// settled, and a renewal or restore without one gets its own row. Sandbox
// purchases never reach it — no money moved.
func (s *IAPService) recordLedger(ctx context.Context, g appleGrant, tx *AppleTransaction, now time.Time) error {
	nowStr, until := now.Format(time.RFC3339), g.until.Format(time.RFC3339)
	if g.sub != nil && g.sub.Status == domain.PledgePending {
		// One conditional write settles it; if a concurrent confirm already
		// did, there is nothing left to record.
		// The entitlement was granted above, so the row owes nothing.
		won, err := s.subs.subs.MarkSuccess(ctx, g.sub.Reference, nowStr, until, "")
		if err != nil || !won {
			return err
		}
		return s.subs.subs.MarkGranted(ctx, g.sub.Reference)
	}
	row := domain.Subscription{
		ID: "siap-" + tx.TransactionID, Reference: "iap-" + tx.TransactionID,
		MemberID: g.memberID, Scope: g.product.Scope, Plan: g.product.Plan,
		AmountPesewas: s.planPrice(ctx, g.product), Status: domain.PledgeSuccess,
		PeriodEnd: until, CreatedAt: nowStr, ConfirmedAt: nowStr,
	}
	if g.listing != nil {
		row.ListingID, row.ListingSlug, row.ListingTitle = g.listing.ID, g.listing.Slug, g.listing.Title
	}
	return s.subs.subs.Insert(ctx, row)
}

// planPrice is the catalogue price of an Apple-sold plan for its audience.
func (s *IAPService) planPrice(ctx context.Context, product domain.AppleProduct) int64 {
	if s.subs.plans == nil {
		return 0
	}
	p, err := s.subs.plans.BySlug(ctx, product.Plan)
	if err != nil {
		return 0
	}
	return p.PriceFor(product.Scope)
}

// ForgetAppleTransactions is called when a member is erased. The redemption
// records are the only replay protection for Apple receipts, so they are NOT
// deleted — deleting them would let the same receipt be redeemed again by a
// new account. Instead the member link is replaced by a random pseudonym, the
// checkout reference is dropped, and the purchase facts are kept for the
// tax-retention period.
func (s *IAPService) ForgetAppleTransactions(ctx context.Context, memberID string) error {
	if s == nil || s.txs == nil || memberID == "" {
		return nil
	}
	suffix := make([]byte, 8)
	if _, err := rand.Read(suffix); err != nil {
		return err
	}
	now := time.Now().UTC()
	return s.txs.PseudonymiseMember(ctx, memberID, "erased-"+hex.EncodeToString(suffix),
		now.Format(time.RFC3339), now.AddDate(appleRecordRetentionYears, 0, 0).Format(time.RFC3339))
}
