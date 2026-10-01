package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── paid featured placements via Paystack (Phase 8) ───────────────────────────
//
// Same money flow as pledges/tickets/subscriptions: StartPromotion records a
// pending Promotion and returns a Paystack authorization URL; the owner returns
// to the portal with a reference; ConfirmPromotion verifies server-side before
// featuring the listing. Self-serve replacement for the old "labelled paid but
// free" featured stub — the curator's AdminFeature stays as the comp tool.
// Price: GH₵ 10/day, in fixed 7/14/30-day bundles. Renewals stack onto any
// existing future featuredUntil date, like subscription renewal.

// ErrPromotionDays is returned for promotion lengths outside the fixed bundles.
var ErrPromotionDays = errors.New("promotion must be 7, 14 or 30 days")

const (
	// promotionRatePesewas is GH₵ 10 per day.
	promotionRatePesewas = int64(1_000)
)

// PromotionsService runs the promotion flow. Standalone (like
// SubscriptionsService) so the core Service stays read/moderation-focused.
type PromotionsService struct {
	listings   domain.ListingRepository
	promotions domain.PromotionRepository
	paystack   PaystackClient
	portal     string // public portal origin for callback URLs
	creator    string // creator-studio origin, for checkouts started there (C3)
}

// ReturnToCreator is the returnTo value a creator-studio checkout sends so
// Paystack returns the payer to the studio instead of the portal (C3).
const ReturnToCreator = "creator"

// WithCreatorURL sets the creator-studio origin used for returnTo=creator
// callbacks; without it they fall back to the portal.
func (s *PromotionsService) WithCreatorURL(creatorURL string) *PromotionsService {
	s.creator = strings.TrimRight(creatorURL, "/")
	return s
}

func NewPromotionsService(l domain.ListingRepository, p domain.PromotionRepository, ps PaystackClient, portalURL string) *PromotionsService {
	return &PromotionsService{listings: l, promotions: p, paystack: ps, portal: strings.TrimRight(portalURL, "/")}
}

// Simulated reports whether promotions run against the labelled simulation.
func (s *PromotionsService) Simulated() bool { return s.paystack.Simulated() }

// StartPromotion records a pending promotion against an approved listing owned
// by the member and returns the Paystack authorization URL to redirect the
// owner to. Only the listing's owner may promote it.
func (s *PromotionsService) StartPromotion(ctx context.Context, listingID, memberID, email string, days int) (authorizationURL, accessCode, reference string, err error) {
	return s.StartPromotionFrom(ctx, listingID, memberID, email, days, "")
}

// promotionCallback is where Paystack returns the payer: the creator studio's
// /work when the checkout started there (C3), otherwise the portal's /me.
func (s *PromotionsService) promotionCallback(returnTo, reference string) string {
	if returnTo == ReturnToCreator && s.creator != "" {
		return fmt.Sprintf("%s/work?promo_ref=%s", s.creator, url.QueryEscape(reference))
	}
	return fmt.Sprintf("%s/me?promo_ref=%s", s.portal, url.QueryEscape(reference))
}

// StartPromotionFrom is StartPromotion with the app the checkout started in
// (returnTo: "creator", or "" for the portal).
func (s *PromotionsService) StartPromotionFrom(ctx context.Context, listingID, memberID, email string, days int, returnTo string) (authorizationURL, accessCode, reference string, err error) {
	if days != 7 && days != 14 && days != 30 {
		return "", "", "", ErrPromotionDays
	}
	email = strings.TrimSpace(email)
	if email == "" {
		return "", "", "", fmt.Errorf("an email is required for the payment receipt")
	}
	listing, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return "", "", "", err
	}
	if listing.Status != domain.StatusApproved || listing.OwnerID == "" || listing.OwnerID != memberID {
		return "", "", "", &domain.ForbiddenError{Reason: "only the owner of an approved listing can promote it"}
	}
	if !PromotableType(listing.Type) {
		return "", "", "", &domain.ForbiddenError{Reason: "This kind of listing can't be promoted."}
	}
	now := time.Now().UTC()
	reference = newReference(RefPrefixPromotion, strconv.FormatInt(now.UnixNano(), 10))
	promo := domain.Promotion{
		ID:            "p" + reference,
		Reference:     reference,
		ListingID:     listing.ID,
		ListingSlug:   listing.Slug,
		ListingTitle:  listing.Title,
		MemberID:      memberID,
		Email:         email,
		Days:          days,
		AmountPesewas: int64(days) * promotionRatePesewas,
		Status:        domain.PledgePending,
		Simulated:     s.paystack.Simulated(),
		CreatedAt:     now.Format(time.RFC3339),
	}
	if err := s.promotions.Insert(ctx, promo); err != nil {
		return "", "", "", err
	}
	callback := s.promotionCallback(returnTo, reference)
	authURL, accessCode, err := s.paystack.Initialize(ctx, email, promo.AmountPesewas, "GHS", reference, callback)
	if err != nil {
		return "", "", "", err
	}
	return authURL, accessCode, reference, nil
}

// ConfirmPromotion verifies a transaction with Paystack and, on first success,
// marks the promotion and features the listing for the paid number of days.
// When the listing is already featured into the future, the paid days extend
// from that date rather than restarting from now (like subscription stacking).
// Idempotent: an already-confirmed promotion is returned as-is.
func (s *PromotionsService) ConfirmPromotion(ctx context.Context, reference string) (*domain.Promotion, error) {
	promo, err := s.promotions.ByReference(ctx, reference)
	if err != nil {
		return nil, err
	}
	if promo.Status == domain.PledgeSuccess {
		return s.finishGrant(ctx, promo) // settled; apply a grant a failed earlier confirm left owed
	}
	if err := verifyCharge(ctx, s.paystack, reference, promo.AmountPesewas, s.promotions.MarkFailed); err != nil {
		return nil, err
	}
	return s.fulfillPromotion(ctx, promo, true, promo.AmountPesewas)
}

// FulfillPromotion marks a promotion successful using an amount already verified
// by another gateway (e.g. Stripe). It is idempotent.
func (s *PromotionsService) FulfillPromotion(ctx context.Context, reference string, amountPesewas int64) (*domain.Promotion, error) {
	promo, err := s.promotions.ByReference(ctx, reference)
	if err != nil {
		return nil, err
	}
	if promo.Status == domain.PledgeSuccess {
		return s.finishGrant(ctx, promo)
	}
	return s.fulfillPromotion(ctx, promo, true, amountPesewas)
}

func (s *PromotionsService) fulfillPromotion(ctx context.Context, promo *domain.Promotion, success bool, amount int64) (*domain.Promotion, error) {
	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339)
	if !success || (amount > 0 && amount < promo.AmountPesewas) {
		_ = s.promotions.MarkFailed(ctx, promo.Reference)
		return nil, ErrPaymentNotCompleted
	}
	listing, err := s.listings.GetByID(ctx, promo.ListingID)
	if err != nil {
		return nil, err
	}
	// Stack onto the current featured period.
	featuredUntil := stackFrom(now, listing.FeaturedUntil).Add(time.Duration(promo.Days) * 24 * time.Hour).Format(time.RFC3339)
	// One conditional write settles the promotion and stores the window it
	// bought; only the confirm that made the transition computed it, so
	// replays can't stack extra days.
	claimed, err := s.promotions.MarkSuccess(ctx, promo.Reference, nowStr, featuredUntil)
	if err != nil {
		return nil, err
	}
	if !claimed {
		return s.promotions.ByReference(ctx, promo.Reference) // settled by a concurrent confirm
	}
	promo.Status = domain.PledgeSuccess
	promo.ConfirmedAt = nowStr
	promo.FeaturedUntil = featuredUntil
	promo.GrantPending = true
	return s.finishGrant(ctx, promo)
}

// finishGrant applies the placement a settled promotion still owes (a
// confirm whose grant write failed after the claim): features the listing
// and labels it "Sponsored" to the stored window, skipping what the listing
// already covers, then clears grantPending. A record owing nothing is
// returned as-is.
func (s *PromotionsService) finishGrant(ctx context.Context, promo *domain.Promotion) (*domain.Promotion, error) {
	if !promo.GrantPending {
		return promo, nil
	}
	listing, err := s.listings.GetByID(ctx, promo.ListingID)
	if err != nil {
		return nil, err
	}
	if err := applyFeaturedWindow(ctx, s.listings, listing, promo.FeaturedUntil); err != nil {
		return nil, err
	}
	if err := s.promotions.MarkGranted(ctx, promo.Reference); err != nil {
		return nil, err
	}
	promo.GrantPending = false
	return promo, nil
}

// MemberPromotions lists a member's own promotions, newest first.
func (s *PromotionsService) MemberPromotions(ctx context.Context, memberID string) ([]domain.Promotion, error) {
	promos, err := s.promotions.ByMember(ctx, memberID)
	if err != nil {
		return nil, err
	}
	// Newest first.
	for i, j := 0, len(promos)-1; i < j; i, j = i+1, j-1 {
		promos[i], promos[j] = promos[j], promos[i]
	}
	return promos, nil
}

// AllPromotions is the admin ledger of every promotion, newest first.
func (s *PromotionsService) AllPromotions(ctx context.Context) ([]domain.Promotion, error) {
	promos, err := s.promotions.All(ctx)
	if err != nil {
		return nil, err
	}
	for i, j := 0, len(promos)-1; i < j; i, j = i+1, j-1 {
		promos[i], promos[j] = promos[j], promos[i]
	}
	return promos, nil
}

// PromotableType reports whether listings of a type may be promoted for money.
// Safety notices, lost & found (including missing people) and memorials are
// never sold visibility (Google Play UGC, P060).
func PromotableType(typ string) bool {
	return typ != domain.TypeIncident && typ != domain.TypeLostFound && typ != domain.TypeMemorial
}
