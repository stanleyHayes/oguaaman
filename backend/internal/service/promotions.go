package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
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
	now := time.Now().UTC()
	reference = fmt.Sprintf("pro-%d", now.UnixNano())
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
	callback := fmt.Sprintf("%s/me?promo_ref=%s", s.portal, url.QueryEscape(reference))
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
		return promo, nil // already settled
	}
	success, amount, err := s.paystack.Verify(ctx, reference)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339)
	if !success || (amount > 0 && amount < promo.AmountPesewas) {
		_ = s.promotions.UpdateStatus(ctx, reference, domain.PledgeFailed, nowStr)
		return nil, fmt.Errorf("payment was not completed")
	}
	listing, err := s.listings.GetByID(ctx, promo.ListingID)
	if err != nil {
		return nil, err
	}
	base := now
	if until, perr := time.Parse(time.RFC3339, listing.FeaturedUntil); perr == nil && until.After(base) {
		base = until // stack onto the current featured period
	}
	featuredUntil := base.Add(time.Duration(promo.Days) * 24 * time.Hour).Format(time.RFC3339)
	if err := s.promotions.UpdateStatus(ctx, reference, domain.PledgeSuccess, nowStr); err != nil {
		return nil, err
	}
	if err := s.listings.SetFeatured(ctx, promo.ListingID, true, featuredUntil); err != nil {
		return nil, err
	}
	promo.Status = domain.PledgeSuccess
	promo.ConfirmedAt = nowStr
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
