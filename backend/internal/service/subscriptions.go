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
	members  domain.MemberRepository
	paystack PaystackClient
	portal   string // public portal origin for business callback URLs
	creator  string // creator-app origin for creator subscription callback URLs
}

func NewSubscriptionsService(l domain.ListingRepository, s domain.SubscriptionRepository, plans domain.PlanRepository, members domain.MemberRepository, ps PaystackClient, portalURL, creatorURL string) *SubscriptionsService {
	return &SubscriptionsService{
		listings: l, subs: s, plans: plans, members: members, paystack: ps,
		portal:  strings.TrimRight(portalURL, "/"),
		creator: strings.TrimRight(creatorURL, "/"),
	}
}

// Simulated reports whether subscriptions run against the labelled simulation.
func (s *SubscriptionsService) Simulated() bool { return s.paystack.Simulated() }

// Subscription audiences: who a plan is sold to on each subscribe path.
const (
	audienceBusiness = "business"
	audienceCreator  = "creator"
)

// planServes reports whether a plan may be sold on an audience's subscribe
// path. "any" plans (and legacy plans saved before audiences existed) serve
// both; otherwise the audiences must match — a creator-priced plan must never
// be sold to a business or vice versa, since take-rate and storefront caps
// follow the plan.
func planServes(p *domain.Plan, audience string) bool {
	return p.Audience == "" || p.Audience == "any" || p.Audience == audience
}

// resolvePlan looks up the plan being bought and its price for the given
// audience ("business" | "creator"). An empty slug means the default Supporter
// plan; when the catalog has no such plan (unmigrated install) the legacy
// constant price keeps the business flow working. An explicit slug is strict:
// it must exist, be active and serve the audience — staff control what's for
// sale, and to whom.
func (s *SubscriptionsService) resolvePlan(ctx context.Context, slug, audience string) (planSlug string, amount int64, err error) {
	explicit := slug != ""
	if !explicit {
		slug = domain.DefaultSupporterPlanSlug
		if audience == audienceCreator {
			slug = domain.DefaultCreatorPlanSlug
		}
	}
	p, err := s.plans.BySlug(ctx, slug)
	var nf *domain.NotFoundError
	switch {
	case err == nil:
	case !explicit && audience == audienceBusiness && errors.As(err, &nf):
		return domain.PlanBusinessSupporter, supporterAmountPesewas, nil // legacy fallback
	case !explicit && errors.As(err, &nf):
		return "", 0, &domain.ValidationError{Message: "No subscription plan is configured yet."}
	default:
		return "", 0, err
	}
	if !p.Active {
		return "", 0, &domain.ValidationError{Message: "That plan isn't on sale right now."}
	}
	if !planServes(p, audience) {
		who := map[string]string{audienceBusiness: "businesses", audienceCreator: "creators"}[audience]
		return "", 0, &domain.ValidationError{Message: "That plan isn't available for " + who + "."}
	}
	return p.Slug, p.PriceFor(audience), nil
}

// StartSubscription records a pending subscription against an approved business
// owned by the member and returns the Paystack authorization URL to redirect
// the owner to. Only the business's owner may subscribe it. planSlug selects
// the catalog plan ("" = the default Supporter plan).
func (s *SubscriptionsService) StartSubscription(ctx context.Context, listingSlug, memberID, email, planSlug string) (authorizationURL, accessCode, reference string, err error) {
	return s.StartSubscriptionFrom(ctx, listingSlug, memberID, email, planSlug, "")
}

// businessSubCallback is where Paystack returns a business-plan payer: the
// creator studio's /grow when the checkout started there (C3), otherwise the
// business page on the portal.
func (s *SubscriptionsService) businessSubCallback(returnTo, listingSlug, reference string) string {
	if returnTo == ReturnToCreator && s.creator != "" {
		return fmt.Sprintf("%s/grow?sub_ref=%s", s.creator, url.QueryEscape(reference))
	}
	return fmt.Sprintf("%s/business/%s?sub_ref=%s", s.portal, listingSlug, url.QueryEscape(reference))
}

// StartSubscriptionFrom is StartSubscription with the app the checkout
// started in (returnTo: "creator", or "" for the portal).
func (s *SubscriptionsService) StartSubscriptionFrom(ctx context.Context, listingSlug, memberID, email, planSlug, returnTo string) (authorizationURL, accessCode, reference string, err error) {
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
	plan, amount, err := s.resolvePlan(ctx, planSlug, audienceBusiness)
	if err != nil {
		return "", "", "", err
	}
	if amount <= 0 {
		return "", "", "", &domain.ValidationError{Message: "That plan has no paid monthly price for businesses."}
	}
	if err := planSwitchBlocked(asString(listing.Details, "plan"), asString(listing.Details, "subscribedUntil"), plan, time.Now().UTC()); err != nil {
		return "", "", "", err
	}
	now := time.Now().UTC()
	reference = newReference(RefPrefixSubscription, listing.Slug, strconv.FormatInt(now.UnixNano(), 10))
	sub := domain.Subscription{
		ID:            "s" + reference,
		Reference:     reference,
		MemberID:      memberID,
		Scope:         domain.SubscriptionScopeBusiness,
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
	callback := s.businessSubCallback(returnTo, listing.Slug, reference)
	authURL, accessCode, err := s.paystack.Initialize(ctx, email, sub.AmountPesewas, "GHS", reference, callback)
	if err != nil {
		return "", "", "", err
	}
	return authURL, accessCode, reference, nil
}

// StartCreatorSubscription records a pending member-level creator subscription
// and returns the Paystack authorization URL. Unlike the business flow it is not
// tied to a listing: it unlocks artist donations and fundraising campaigns for
// the member and sets the platform take-rate from the chosen plan. planSlug
// selects the catalog plan ("" = the default Supporter plan, creator price).
func (s *SubscriptionsService) StartCreatorSubscription(ctx context.Context, memberID, email, planSlug string) (authorizationURL, accessCode, reference string, err error) {
	email = strings.TrimSpace(email)
	if email == "" {
		return "", "", "", fmt.Errorf("an email is required for the payment receipt")
	}
	if strings.TrimSpace(memberID) == "" {
		return "", "", "", &domain.ForbiddenError{Reason: "sign in to subscribe to a creator plan"}
	}
	plan, amount, err := s.resolvePlan(ctx, planSlug, audienceCreator)
	if err != nil {
		return "", "", "", err
	}
	if amount <= 0 {
		return "", "", "", &domain.ValidationError{Message: "That plan has no paid monthly price for creators."}
	}
	if m, err := s.members.ByID(ctx, memberID); err == nil && m != nil {
		if err := planSwitchBlocked(m.CreatorPlan, m.CreatorSubscribedUntil, plan, time.Now().UTC()); err != nil {
			return "", "", "", err
		}
	}
	now := time.Now().UTC()
	reference = newReference(RefPrefixCreatorSubscription, memberID, strconv.FormatInt(now.UnixNano(), 10))
	sub := domain.Subscription{
		ID:            "s" + reference,
		Reference:     reference,
		MemberID:      memberID,
		Scope:         domain.SubscriptionScopeCreator,
		Plan:          plan,
		AmountPesewas: amount,
		Status:        domain.PledgePending,
		Simulated:     s.paystack.Simulated(),
		CreatedAt:     now.Format(time.RFC3339),
	}
	if err := s.subs.Insert(ctx, sub); err != nil {
		return "", "", "", err
	}
	callback := fmt.Sprintf("%s/grow?sub_ref=%s", s.creator, url.QueryEscape(reference))
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
		return s.finishGrant(ctx, sub) // settled; apply a grant a failed earlier confirm left owed
	}
	if err := verifyCharge(ctx, s.paystack, reference, sub.AmountPesewas, s.subs.MarkFailed); err != nil {
		return nil, err
	}
	return s.fulfillSubscription(ctx, sub, true, sub.AmountPesewas)
}

// FulfillSubscription marks a subscription successful using an amount already
// verified by another gateway (e.g. Stripe). It is idempotent.
func (s *SubscriptionsService) FulfillSubscription(ctx context.Context, reference string, amountPesewas int64) (*domain.Subscription, error) {
	sub, err := s.subs.ByReference(ctx, reference)
	if err != nil {
		return nil, err
	}
	if sub.Status == domain.PledgeSuccess {
		return s.finishGrant(ctx, sub)
	}
	return s.fulfillSubscription(ctx, sub, true, amountPesewas)
}

func (s *SubscriptionsService) fulfillSubscription(ctx context.Context, sub *domain.Subscription, success bool, amount int64) (*domain.Subscription, error) {
	now := time.Now().UTC()
	if !success || (amount > 0 && amount < sub.AmountPesewas) {
		_ = s.subs.MarkFailed(ctx, sub.Reference)
		return nil, ErrPaymentNotCompleted
	}
	if sub.Scope == domain.SubscriptionScopeCreator {
		return s.fulfillCreatorSubscription(ctx, sub, now)
	}
	return s.fulfillBusinessSubscription(ctx, sub, now)
}

// stackFrom is where a renewal's new period starts: the end of the current
// paid window (RFC3339) when that is still in the future, otherwise now.
func stackFrom(now time.Time, currentEnd string) time.Time {
	if until, err := time.Parse(time.RFC3339, currentEnd); err == nil && until.After(now) {
		return until
	}
	return now
}

// planSwitchBlocked refuses a purchase of a DIFFERENT plan while another one is
// still paid for. The paid-until date and the plan slug are stored once per
// business/member, so stacking a new plan onto the current window would
// re-stamp the new plan over time already paid at another price and with other
// caps (a cheap stack topped by one Pro month would get Pro's take-rate for the
// whole year; a Supporter month bought mid-Featured would cut the storefront
// cap for months already paid). Renewing the same plan stacks as before, and a
// legacy window with no recorded plan never blocks.
func planSwitchBlocked(activePlan, activeUntil, plan string, now time.Time) error {
	if samePlan(activePlan, plan) {
		return nil
	}
	until, err := time.Parse(time.RFC3339, activeUntil)
	if err != nil || !until.After(now) {
		return nil
	}
	return &domain.ValidationError{Message: fmt.Sprintf(
		"Your %s plan is paid until %s. Renew it now, or switch to another plan once it ends.",
		activePlan, until.Format("2 Jan 2006"))}
}

// samePlan reports whether buying plan continues the active one. No recorded
// plan (a window paid before plans existed) continues anything, and the legacy
// business Supporter slug is the catalog's default Supporter plan.
func samePlan(activePlan, plan string) bool {
	canon := func(slug string) string {
		if slug == domain.PlanBusinessSupporter {
			return domain.DefaultSupporterPlanSlug
		}
		return slug
	}
	return activePlan == "" || canon(activePlan) == canon(plan)
}

// periodBase is where a paid period for plan starts: stacked onto the current
// window when it is the same plan (a renewal), otherwise now. A different plan
// reaching here (two checkouts for different plans settling together) replaces
// the current one from now rather than re-stamping already-paid time.
func periodBase(now time.Time, activePlan, activeUntil, plan string) time.Time {
	if !samePlan(activePlan, plan) {
		return now
	}
	return stackFrom(now, activeUntil)
}

// claim settles sub (pending → success, stamping its paid-until and any
// bundled featured window) in one conditional write. Every confirm of the
// reference races here and exactly one wins; only the winner computes the
// period. When this call lost, settled is the record as the winning confirm
// left it. The claimed record owes its grant (grantPending) until grant runs.
func (s *SubscriptionsService) claim(ctx context.Context, sub *domain.Subscription, now time.Time, periodEnd, featuredUntil string) (settled *domain.Subscription, claimed bool, err error) {
	nowStr := now.Format(time.RFC3339)
	claimed, err = s.subs.MarkSuccess(ctx, sub.Reference, nowStr, periodEnd, featuredUntil)
	if err != nil {
		return nil, false, err
	}
	if !claimed {
		settled, err = s.subs.ByReference(ctx, sub.Reference)
		return settled, false, err
	}
	sub.Status = domain.PledgeSuccess
	sub.PeriodEnd = periodEnd
	sub.FeaturedUntil = featuredUntil
	sub.ConfirmedAt = nowStr
	sub.GrantPending = true
	return sub, true, nil
}

// finishGrant applies the grant a settled subscription still owes (a confirm
// whose grant write failed after the claim) and returns the record. A record
// that owes nothing is returned as-is.
func (s *SubscriptionsService) finishGrant(ctx context.Context, sub *domain.Subscription) (*domain.Subscription, error) {
	if !sub.GrantPending {
		return sub, nil
	}
	if err := s.grant(ctx, sub); err != nil {
		return nil, err
	}
	return sub, nil
}

// grant applies what a settled subscription bought from the values stored at
// settlement, then clears grantPending. Each write sets an absolute date and
// is skipped when the same plan already runs that far, so a re-run is
// harmless and never shortens a renewal applied since.
func (s *SubscriptionsService) grant(ctx context.Context, sub *domain.Subscription) error {
	var err error
	if sub.Scope == domain.SubscriptionScopeCreator {
		err = s.grantCreator(ctx, sub)
	} else {
		err = s.grantBusiness(ctx, sub)
	}
	if err != nil {
		return err
	}
	if err := s.subs.MarkGranted(ctx, sub.Reference); err != nil {
		return err
	}
	sub.GrantPending = false
	return nil
}

func (s *SubscriptionsService) grantCreator(ctx context.Context, sub *domain.Subscription) error {
	m, err := s.members.ByID(ctx, sub.MemberID)
	if err != nil {
		return err
	}
	if m != nil && !periodOwed(m.CreatorPlan, m.CreatorSubscribedUntil, sub) {
		return nil
	}
	return s.members.SetCreatorSubscription(ctx, sub.MemberID, sub.Plan, sub.PeriodEnd)
}

func (s *SubscriptionsService) grantBusiness(ctx context.Context, sub *domain.Subscription) error {
	listing, err := s.listings.GetByID(ctx, sub.ListingID)
	if err != nil {
		return err
	}
	if periodOwed(asString(listing.Details, "plan"), asString(listing.Details, "subscribedUntil"), sub) {
		if err := s.listings.SetSubscribedUntil(ctx, sub.ListingID, sub.Plan, sub.PeriodEnd); err != nil {
			return err
		}
	}
	return applyFeaturedWindow(ctx, s.listings, listing, sub.FeaturedUntil)
}

// periodOwed reports whether sub's paid period still has to be written over
// the current plan and paid-until: a different plan is replaced (periodBase
// started it from now), the same plan only when sub reaches further.
func periodOwed(activePlan, activeUntil string, sub *domain.Subscription) bool {
	return !samePlan(activePlan, sub.Plan) || extends(sub.PeriodEnd, activeUntil)
}

// applyFeaturedWindow features the listing to until and labels it
// "Sponsored" (paid placement) to the same date, skipping each write the
// listing already covers. until "" applies nothing.
func applyFeaturedWindow(ctx context.Context, listings domain.ListingRepository, listing *domain.Listing, until string) error {
	if until == "" {
		return nil
	}
	if !listing.Featured || extends(until, listing.FeaturedUntil) {
		if err := listings.SetFeatured(ctx, listing.ID, true, until); err != nil {
			return err
		}
	}
	if extends(until, listing.PromotedUntil) {
		return listings.SetPromotedUntil(ctx, listing.ID, until)
	}
	return nil
}

// extends reports whether the RFC3339 date until is later than current (an
// empty or unreadable current is always extended).
func extends(until, current string) bool {
	u, err := time.Parse(time.RFC3339, until)
	if err != nil {
		return false
	}
	c, err := time.Parse(time.RFC3339, current)
	return err != nil || u.After(c)
}

// fulfillCreatorSubscription settles a member-level creator subscription: it
// extends the member's paid-until (stacking onto the current period) and stamps
// the active plan slug — the entitlement gate for donations & campaigns.
func (s *SubscriptionsService) fulfillCreatorSubscription(ctx context.Context, sub *domain.Subscription, now time.Time) (*domain.Subscription, error) {
	m, err := s.members.ByID(ctx, sub.MemberID)
	if err != nil {
		return nil, err // never guess the current period: a wrong base shortens a paid one
	}
	currentPlan, currentEnd := "", ""
	if m != nil {
		currentPlan, currentEnd = m.CreatorPlan, m.CreatorSubscribedUntil
	}
	periodEnd := periodBase(now, currentPlan, currentEnd, sub.Plan).Add(supporterPeriod).Format(time.RFC3339)
	settled, claimed, err := s.claim(ctx, sub, now, periodEnd, "")
	if err != nil || !claimed {
		return settled, err
	}
	return s.finishGrant(ctx, settled)
}

// fulfillBusinessSubscription settles a business subscription: it extends the
// listing's paid-until, stamps its active plan (so storefront product/service
// caps resolve), and applies any bundled promotion days.
func (s *SubscriptionsService) fulfillBusinessSubscription(ctx context.Context, sub *domain.Subscription, now time.Time) (*domain.Subscription, error) {
	listing, err := s.listings.GetByID(ctx, sub.ListingID)
	if err != nil {
		return nil, err
	}
	periodEnd := periodBase(now, asString(listing.Details, "plan"), asString(listing.Details, "subscribedUntil"), sub.Plan).
		Add(supporterPeriod).Format(time.RFC3339)
	// Plan-bundled promotion days are paid placement too ("Sponsored").
	featuredUntil := s.bundledPromoUntil(ctx, sub.Plan, listing, now)
	settled, claimed, err := s.claim(ctx, sub, now, periodEnd, featuredUntil)
	if err != nil || !claimed {
		return settled, err
	}
	return s.finishGrant(ctx, settled)
}

// bundledPromoUntil is the featured-until date a plan's bundled promotion days
// (Featured plan) give the listing on this payment, stacking from its current
// featured end like the paid period — or "" when the plan bundles none.
// Resolved at confirm time so staff price/perk edits between start and
// confirm take effect immediately.
func (s *SubscriptionsService) bundledPromoUntil(ctx context.Context, planSlug string, listing *domain.Listing, now time.Time) string {
	p, err := s.plans.BySlug(ctx, planSlug)
	if err != nil || p.IncludedPromoDays <= 0 {
		return ""
	}
	days := time.Duration(p.IncludedPromoDays) * 24 * time.Hour
	return stackFrom(now, listing.FeaturedUntil).Add(days).Format(time.RFC3339)
}

// CreatorSubscriptionActive reports whether a member's creator subscription is
// current (creatorSubscribedUntil is an RFC3339 time in the future) — the gate
// for artist donations and fundraising campaigns.
func CreatorSubscriptionActive(m *domain.Member, now time.Time) bool {
	if m == nil || m.CreatorSubscribedUntil == "" {
		return false
	}
	until, err := time.Parse(time.RFC3339, m.CreatorSubscribedUntil)
	return err == nil && until.After(now)
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
