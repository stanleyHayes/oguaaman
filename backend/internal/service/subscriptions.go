package service

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── business subscriptions via Paystack (Phase 7) ────────────────────────────
//
// Same money flow as pledges/tickets: StartSubscription records a pending
// Subscription and returns a Paystack authorization URL; the owner returns to
// the portal with a reference; ConfirmSubscription verifies server-side before
// extending the business's paid-until date. The "Supporter" plan is the only
// plan in v1: GH₵ 50/month for a Supporter badge + priority placement in the
// business directory. Renewal is manual — re-subscribing stacks another month
// onto the current period.

const (
	// supporterAmountPesewas is the fixed monthly Supporter price (GH₵ 50).
	supporterAmountPesewas = int64(5_000)
	// supporterPeriod is one subscription month.
	supporterPeriod = 30 * 24 * time.Hour
)

// SupporterActive reports whether a listing's supporter subscription is
// current (details.subscribedUntil is an RFC3339 time in the future).
func SupporterActive(l domain.Listing, now time.Time) bool {
	raw, _ := l.Details["subscribedUntil"].(string)
	until, err := time.Parse(time.RFC3339, raw)
	return err == nil && until.After(now)
}

// SubscriptionsService runs the subscription flow. Standalone (like
// TicketsService) so the core Service stays read/moderation-focused.
type SubscriptionsService struct {
	listings domain.ListingRepository
	subs     domain.SubscriptionRepository
	plans    domain.PlanRepository
	paystack PaystackClient
	portal   string // public portal origin for callback URLs
}

func NewSubscriptionsService(l domain.ListingRepository, s domain.SubscriptionRepository, plans domain.PlanRepository, ps PaystackClient, portalURL string) *SubscriptionsService {
	return &SubscriptionsService{listings: l, subs: s, plans: plans, paystack: ps, portal: strings.TrimRight(portalURL, "/")}
}

// Simulated reports whether subscriptions run against the labelled simulation.
func (s *SubscriptionsService) Simulated() bool { return s.paystack.Simulated() }

// resolvePlan looks up the plan being bought and its business price. An empty
// slug means the default Supporter plan; when the catalog has no such plan
// (unmigrated install) the legacy constant price keeps the flow working. An
// explicit slug is strict: it must exist and be active — staff control what's
// for sale.
func (s *SubscriptionsService) resolvePlan(ctx context.Context, slug string) (planSlug string, amount int64, err error) {
	if slug == "" {
		slug = domain.DefaultSupporterPlanSlug
		p, lerr := s.plans.BySlug(ctx, slug)
		if lerr != nil {
			return domain.PlanBusinessSupporter, supporterAmountPesewas, nil // legacy fallback
		}
		if !p.Active {
			return "", 0, fmt.Errorf("that plan isn't on sale right now")
		}
		return p.Slug, p.PriceFor("business"), nil
	}
	p, err := s.plans.BySlug(ctx, slug)
	if err != nil {
		return "", 0, err
	}
	if !p.Active {
		return "", 0, fmt.Errorf("that plan isn't on sale right now")
	}
	return p.Slug, p.PriceFor("business"), nil
}

// StartSubscription records a pending subscription against an approved business
// owned by the member and returns the Paystack authorization URL to redirect
// the owner to. Only the business's owner may subscribe it. planSlug selects
// the catalog plan ("" = the default Supporter plan).
func (s *SubscriptionsService) StartSubscription(ctx context.Context, listingSlug, memberID, email, planSlug string) (authorizationURL, accessCode, reference string, err error) {
	email = strings.TrimSpace(email)
	if email == "" {
		return "", "", "", fmt.Errorf("an email is required for the payment receipt")
	}
	listing, err := s.listings.GetBySlug(ctx, domain.TypeBusiness, listingSlug)
	if err != nil {
		return "", "", "", err
	}
	if listing.Status != domain.StatusApproved || listing.OwnerID == "" || listing.OwnerID != memberID {
		return "", "", "", &domain.ForbiddenError{Reason: "only the owner of an approved business can subscribe it"}
	}
	plan, amount, err := s.resolvePlan(ctx, planSlug)
	if err != nil {
		return "", "", "", err
	}
	if amount <= 0 {
		return "", "", "", fmt.Errorf("that plan has no paid monthly price for businesses")
	}
	now := time.Now().UTC()
	reference = fmt.Sprintf("sub-%s-%d", listing.Slug, now.UnixNano())
	sub := domain.Subscription{
		ID:            "s" + reference,
		Reference:     reference,
		MemberID:      memberID,
		ListingID:     listing.ID,
		ListingSlug:   listing.Slug,
		ListingTitle:  listing.Title,
		Plan:          plan,
		AmountPesewas: amount,
		Status:        domain.PledgePending,
		Simulated:     s.paystack.Simulated(),
		CreatedAt:     now.Format(time.RFC3339),
	}
	if err := s.subs.Insert(ctx, sub); err != nil {
		return "", "", "", err
	}
	callback := fmt.Sprintf("%s/business/%s?sub_ref=%s", s.portal, listing.Slug, url.QueryEscape(reference))
	authURL, accessCode, err := s.paystack.Initialize(ctx, email, sub.AmountPesewas, "GHS", reference, callback)
	if err != nil {
		return "", "", "", err
	}
	return authURL, accessCode, reference, nil
}

// ConfirmSubscription verifies a transaction with Paystack and, on first
// success, marks the subscription and extends the business's paid-until date
// by one month. Renewal stacks: when the business is still in a paid period,
// the new month extends from the current end date rather than from now.
// Idempotent: an already-confirmed subscription is returned as-is.
func (s *SubscriptionsService) ConfirmSubscription(ctx context.Context, reference string) (*domain.Subscription, error) {
	sub, err := s.subs.ByReference(ctx, reference)
	if err != nil {
		return nil, err
	}
	if sub.Status == domain.PledgeSuccess {
		return sub, nil // already settled
	}
	success, amount, err := s.paystack.Verify(ctx, reference)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339)
	if !success || (amount > 0 && amount < sub.AmountPesewas) {
		_ = s.subs.UpdateStatus(ctx, reference, domain.PledgeFailed, nowStr)
		return nil, fmt.Errorf("payment was not completed")
	}
	listing, err := s.listings.GetByID(ctx, sub.ListingID)
	if err != nil {
		return nil, err
	}
	base := now
	if raw, _ := listing.Details["subscribedUntil"].(string); raw != "" {
		if until, perr := time.Parse(time.RFC3339, raw); perr == nil && until.After(base) {
			base = until // stack onto the current paid period
		}
	}
	periodEnd := base.Add(supporterPeriod).Format(time.RFC3339)
	if err := s.subs.UpdateStatus(ctx, reference, domain.PledgeSuccess, nowStr); err != nil {
		return nil, err
	}
	if err := s.subs.SetPeriodEnd(ctx, reference, periodEnd); err != nil {
		return nil, err
	}
	if err := s.listings.SetSubscribedUntil(ctx, sub.ListingID, periodEnd); err != nil {
		return nil, err
	}
	// Bundled promotion days (Featured plan) auto-apply on every confirmed
	// payment: the listing's featured window stacks from its current end,
	// same as the paid period. Resolved at confirm time so staff price/perk
	// edits between start and confirm take effect immediately.
	if p, perr := s.plans.BySlug(ctx, sub.Plan); perr == nil && p.IncludedPromoDays > 0 {
		fbase := now
		if until, terr := time.Parse(time.RFC3339, listing.FeaturedUntil); terr == nil && until.After(fbase) {
			fbase = until
		}
		featuredUntil := fbase.Add(time.Duration(p.IncludedPromoDays) * 24 * time.Hour).Format(time.RFC3339)
		if err := s.listings.SetFeatured(ctx, sub.ListingID, true, featuredUntil); err != nil {
			return nil, err
		}
	}
	sub.Status = domain.PledgeSuccess
	sub.PeriodEnd = periodEnd
	sub.ConfirmedAt = nowStr
	return sub, nil
}

// MemberSubscriptions lists a member's own subscriptions, newest first.
func (s *SubscriptionsService) MemberSubscriptions(ctx context.Context, memberID string) ([]domain.Subscription, error) {
	subs, err := s.subs.ByMember(ctx, memberID)
	if err != nil {
		return nil, err
	}
	// Newest first.
	for i, j := 0, len(subs)-1; i < j; i, j = i+1, j-1 {
		subs[i], subs[j] = subs[j], subs[i]
	}
	return subs, nil
}

// AllSubscriptions is the admin ledger of every subscription, newest first.
func (s *SubscriptionsService) AllSubscriptions(ctx context.Context) ([]domain.Subscription, error) {
	subs, err := s.subs.All(ctx)
	if err != nil {
		return nil, err
	}
	for i, j := 0, len(subs)-1; i < j; i, j = i+1, j-1 {
		subs[i], subs[j] = subs[j], subs[i]
	}
	return subs, nil
}
