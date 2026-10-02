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

// ── paying for an approved campaign (spec §3.7) ─────────────────────────────
//
// Copied from the promotions flow and the shared-Paystack rules: an
// oguaa-adv-… reference, metadata.app="oguaa" (set by the client), an explicit
// callback to the portal, server-side verification on every confirm path
// (redirect, webhook, reconciliation sweep), and one conditional write that
// settles the payment exactly once. A payment that lands after the campaign
// closed (expired, cancelled, rejected) is recorded and refunded in full.

// AdCheckout is the POST /api/me/ads/{id}/checkout answer.
type AdCheckout struct {
	AuthorizationURL string `json:"authorizationUrl"`
	AccessCode       string `json:"accessCode"`
	Reference        string `json:"reference"`
	Simulated        bool   `json:"simulated"`
}

// adFailureReasonUnpaid is recorded when Paystack reports the charge failed.
const adFailureReasonUnpaid = "payment_failed"

// Checkout starts a Paystack payment for an approved campaign the member
// owns. Payments being switched off is checked first.
func (s *AdsService) Checkout(ctx context.Context, memberID, id, email string) (*AdCheckout, error) {
	if paymentsOff(s.paystack) {
		return nil, ErrPaymentsUnavailable
	}
	c, err := s.ownCampaign(ctx, memberID, id)
	if err != nil {
		return nil, err
	}
	if err := s.checkPayable(ctx, c); err != nil {
		return nil, err
	}
	if err := s.settleEarlierCheckout(ctx, c); err != nil {
		return nil, err
	}
	if err := s.recheckInventory(ctx, c); err != nil {
		return nil, err
	}
	email = strings.TrimSpace(email)
	if email == "" {
		email = c.Email
	}
	ref := newReference(RefPrefixAd, c.ID, strconv.FormatInt(time.Now().UnixNano(), 10))
	won, err := s.campaigns.SetCheckout(ctx, c.ID, ref, email, s.nowRFC())
	if err != nil {
		return nil, err
	}
	if !won {
		return nil, adErr(AdErrNotApproved, "This ad isn't waiting for payment any more. Reload to see its status.")
	}
	callback := fmt.Sprintf("%s/me/ads?ad_ref=%s", s.portal, url.QueryEscape(ref))
	authURL, accessCode, err := s.paystack.Initialize(ctx, email, c.Price.TotalPesewas, paymentCurrency, ref, callback)
	if errors.Is(err, ErrPaymentsUnavailable) {
		return nil, err
	}
	if err != nil {
		s.log.Error("ads: paystack initialize failed", logKeyCampaign, c.ID, logKeyErr, err)
		return nil, adErr(AdErrPaymentStartFailed, msgAdPaymentStartFailed)
	}
	return &AdCheckout{AuthorizationURL: authURL, AccessCode: accessCode, Reference: ref, Simulated: s.paystack.Simulated()}, nil
}

const msgAdPaymentStartFailed = "We couldn't start the payment. Please try again."

// checkPayable: approved, approval still valid, not yet paid, ads (and
// political ads) still on sale, and the ad still able to run, so nobody pays
// for an ad that would only be refunded.
func (s *AdsService) checkPayable(ctx context.Context, c *domain.AdCampaign) error {
	if c.PaymentStatus == domain.AdPaymentSuccess {
		return adErr(AdErrAlreadyPaid, "This ad is already paid for.")
	}
	if c.Status != domain.AdStatusApproved {
		return adErr(AdErrNotApproved, "This ad can be paid for once it is approved.")
	}
	if c.ApprovalExpiresAt != "" && c.ApprovalExpiresAt < s.nowRFC() {
		return adErr(AdErrApprovalExpired, "The approval for this ad has expired. Submit it again for review.")
	}
	set := s.Settings(ctx)
	if err := checkAdSwitches(set, c.Political); err != nil {
		return err
	}
	if err := s.checkRunnable(ctx, set, c); err != nil {
		return err
	}
	sp, err := s.sponsors.Get(ctx, c.SponsorID)
	if err != nil || sp == nil || sp.Status != domain.AdSponsorVerified {
		return adErr(AdErrSponsorNotVerified, "This ad's sponsor is no longer verified, so it can't be paid for. Contact Oguaa.")
	}
	return nil
}

// checkRunnable refuses a campaign that could not run if it were booked now:
// its end date has passed, its placement is off sale, or it is a political
// ad during an election blackout. Approval and checkout both use it.
func (s *AdsService) checkRunnable(ctx context.Context, set domain.AdSettings, c *domain.AdCampaign) error {
	if c.EndDate < s.today() {
		return adFieldErr(AdErrInvalidDates, "endDate", "This ad's dates have passed. Submit it again with new dates.")
	}
	if !placementOnSale(set, c.Placement) {
		return adErr(AdErrInventoryUnavailable, "This placement is no longer on sale.")
	}
	if c.Political && s.elections != nil {
		if blackout, _ := s.elections.InBlackout(ctx, s.now()); blackout {
			return adErr(AdErrPoliticalDisabled, "Political ads can't be booked during the election blackout.")
		}
	}
	return nil
}

// placementOnSale: the placement is active (and, for the app card, app
// delivery is on). The ads master switch is checked separately.
func placementOnSale(set domain.AdSettings, slug string) bool {
	p, ok := set.Price(slug)
	if !ok || !p.Active {
		return false
	}
	return slug != domain.AdPlacementAppCard || set.AppDeliveryEnabled
}

// settleEarlierCheckout asks Paystack about a checkout already started: if it
// was paid, the campaign is settled and a new checkout refused; if it is
// still in progress the payer must wait; a failed one is replaced.
func (s *AdsService) settleEarlierCheckout(ctx context.Context, c *domain.AdCampaign) error {
	if c.PaymentStatus != domain.AdPaymentPending || c.Reference == "" {
		return nil
	}
	_, err := s.ConfirmPayment(ctx, c.Reference)
	switch {
	case err == nil:
		return adErr(AdErrAlreadyPaid, "This ad is already paid for.")
	case errors.Is(err, ErrPaymentNotCompleted):
		return nil
	default:
		return err // still processing, or Paystack unreachable
	}
}

// ConfirmPayment verifies a charge with Paystack and settles the campaign it
// paid for. Idempotent: the redirect, the webhook and the sweep all call it.
func (s *AdsService) ConfirmPayment(ctx context.Context, ref string) (*domain.AdCampaign, error) {
	c, err := s.campaigns.ByReference(ctx, ref)
	if err != nil {
		return nil, err
	}
	if c.PaymentStatus == domain.AdPaymentSuccess && c.Reference == ref {
		return c, nil
	}
	markFailed := func(ctx context.Context, r string) error {
		return s.campaigns.MarkPaymentFailed(ctx, r, adFailureReasonUnpaid)
	}
	if err := verifyCharge(ctx, s.paystack, ref, c.Price.TotalPesewas, markFailed); err != nil {
		return nil, err
	}
	if c.PaymentStatus == domain.AdPaymentSuccess {
		return s.duplicatePayment(ctx, c, ref)
	}
	return s.settlePaid(ctx, c, ref)
}

// ConfirmForMember is ConfirmPayment for the payer's own redirect: the
// campaign must be theirs.
func (s *AdsService) ConfirmForMember(ctx context.Context, memberID, ref string) (*AdCampaignView, error) {
	c, err := s.campaigns.ByReference(ctx, ref)
	if err != nil {
		return nil, err
	}
	if memberID == "" || c.MemberID != memberID {
		return nil, errAdNotFound()
	}
	paid, err := s.ConfirmPayment(ctx, ref)
	if err != nil {
		return nil, err
	}
	v := advertiserView(*paid)
	return &v, nil
}

// settlePaid applies a verified payment: an approved campaign is booked
// (active from today, or scheduled); a closed one keeps its status and is
// refunded in full; a campaign already paid through another checkout has
// this charge refunded as a duplicate.
func (s *AdsService) settlePaid(ctx context.Context, c *domain.AdCampaign, ref string) (*domain.AdCampaign, error) {
	at := s.nowRFC()
	simulated := s.paystack.Simulated()
	if c.Status == domain.AdStatusApproved {
		next := domain.AdStatusScheduled
		if c.StartDate <= s.today() {
			next = domain.AdStatusActive
		}
		won, err := s.campaigns.MarkPaid(ctx, ref, at, simulated, next)
		if err != nil {
			return nil, err
		}
		fresh, err := s.getCampaign(ctx, c.ID)
		if err != nil {
			return nil, err
		}
		if won {
			s.notifyTransition(ctx, fresh)
			return fresh, nil
		}
		c = fresh // lost a race: settled by another confirm, or closed meanwhile
	}
	if c.PaymentStatus == domain.AdPaymentSuccess {
		return s.paidAlready(ctx, c, ref)
	}
	if !closedStatus(c.Status) {
		return nil, &domain.ValidationError{Message: "this ad is not waiting for a payment"}
	}
	won, err := s.campaigns.MarkPaidClosed(ctx, ref, at, simulated)
	if err != nil {
		return nil, err
	}
	fresh, err := s.getCampaign(ctx, c.ID)
	if err != nil {
		return nil, err
	}
	if won {
		s.log.Warn("ads: payment landed on a closed campaign; a full refund is owed", logKeyCampaign, c.ID, "status", c.Status, "ref", ref)
		return fresh, nil
	}
	if fresh.PaymentStatus == domain.AdPaymentSuccess {
		return s.paidAlready(ctx, fresh, ref)
	}
	return fresh, nil
}

// paidAlready handles a verified charge on a campaign that was already paid:
// the same reference means another confirm got there first; a different one
// is a second charge, refunded as a duplicate.
func (s *AdsService) paidAlready(ctx context.Context, c *domain.AdCampaign, ref string) (*domain.AdCampaign, error) {
	if c.Reference == ref {
		return c, nil
	}
	return s.duplicatePayment(ctx, c, ref)
}

// closedStatus: statuses a late payment is refunded from.
func closedStatus(status string) bool {
	return status == domain.AdStatusExpired || status == domain.AdStatusCancelled || status == domain.AdStatusRejected
}

// duplicatePayment refunds a second successful charge on a campaign already
// paid through another checkout. The refund goes back to that charge's own
// reference, in full, and has its own budget (it never reduces what the
// campaign's real payment can still be refunded). Its row id names the
// charge, so a second confirm of the same charge refunds nothing more.
func (s *AdsService) duplicatePayment(ctx context.Context, c *domain.AdCampaign, ref string) (*domain.AdCampaign, error) {
	now := s.nowRFC()
	r := domain.AdRefund{
		ID: c.ID + "-duplicate-" + ref, AmountPesewas: c.Price.TotalPesewas, Reason: domain.AdRefundDuplicateCharge,
		Status: domain.AdRefundRequesting, Reference: ref, CreatedAt: now, UpdatedAt: now,
	}
	pushed, err := s.campaigns.PushRefund(ctx, c.ID, r)
	if err != nil {
		return nil, err
	}
	if pushed {
		s.log.Warn("ads: campaign paid twice; refunding the second charge", logKeyCampaign, c.ID, "ref", ref, "paidRef", c.Reference)
		switch {
		case s.paystack.Simulated():
			s.updateRefund(ctx, c.ID, r, domain.AdRefundProcessed, "", now)
		case paymentsOff(s.paystack):
			s.updateRefund(ctx, c.ID, r, domain.AdRefundManualCheck, "", now)
		default:
			s.callRefund(ctx, c, r, fmt.Sprintf("oguaa ad %s: duplicate charge", c.ID))
		}
	}
	return s.getCampaign(ctx, c.ID)
}

// ── refunds (spec §3.8 step 3) ──────────────────────────────────────────────

const (
	// minAdRefundPesewas: refunds under GH₵1 are not worth a Paystack call.
	minAdRefundPesewas = 100
	// adRefundRequestingTimeout: a refund row still "requesting" this long
	// after it was written means we crashed mid-call; a person checks it.
	adRefundRequestingTimeout = 10 * time.Minute
)

// owedAmount is what a campaign owes for its refundOwed reason: everything
// for a cancellation before start or a payment after close, otherwise the
// undelivered share, never more than what is left unrefunded.
func owedAmount(c domain.AdCampaign) int64 {
	total := c.Price.TotalPesewas
	var due int64
	switch c.RefundOwed {
	case domain.AdRefundCancelledBeforeStart, domain.AdRefundPaidAfterClose:
		due = total
	default:
		if c.BookedImpressions > 0 {
			undelivered := max(0, c.BookedImpressions-c.Delivered)
			due = total * undelivered / c.BookedImpressions
		}
	}
	return max(0, min(due, total-c.RefundCommittedPesewas()))
}

// payOwedRefund turns an owed-refund marker into a refund: it records the
// refund row (clearing the marker in the same write) and then asks Paystack.
// Simulated payments and amounts under GH₵1 just clear the marker.
func (s *AdsService) payOwedRefund(ctx context.Context, c domain.AdCampaign) error {
	due := owedAmount(c)
	if c.Simulated || due < minAdRefundPesewas || c.PaymentStatus != domain.AdPaymentSuccess {
		return s.campaigns.ClearRefundOwed(ctx, c.ID, c.RefundOwed)
	}
	now := s.nowRFC()
	r := domain.AdRefund{
		ID: c.ID + "-" + c.RefundOwed, AmountPesewas: due, Reason: c.RefundOwed,
		Status: domain.AdRefundRequesting, CreatedAt: now, UpdatedAt: now,
	}
	pushed, err := s.campaigns.SettleOwedRefund(ctx, c.ID, r)
	if err != nil || !pushed {
		return err
	}
	s.callRefund(ctx, &c, r, fmt.Sprintf("oguaa ad %s: %s", c.ID, r.Reason))
	return nil
}

// sendRefund records a manual refund row and asks Paystack. The row is only
// written while it fits what is left to refund (checked in the write), so
// two refunds at once can't go past the amount paid.
func (s *AdsService) sendRefund(ctx context.Context, c *domain.AdCampaign, r domain.AdRefund, note string) error {
	pushed, err := s.campaigns.PushRefund(ctx, c.ID, r)
	if err != nil {
		return err
	}
	if !pushed {
		return adFieldErr(AdErrInvalidAmount, adFieldAmount, "The amount is more than is left to refund. Reload to see the latest refunds.")
	}
	if c.Simulated { // no real money moved, so none moves back
		return s.campaigns.UpdateRefund(ctx, c.ID, r.ID, domain.AdRefundProcessed, "", s.nowRFC(), r.AmountPesewas)
	}
	s.callRefund(ctx, c, r, fmt.Sprintf("oguaa ad %s: %s", c.ID, note))
	return nil
}

// callRefund makes the Paystack refund call for a recorded "requesting" row
// and stores the outcome. An error leaves us unsure whether Paystack made the
// refund, so the row goes to manual_check (never retried automatically).
func (s *AdsService) callRefund(ctx context.Context, c *domain.AdCampaign, r domain.AdRefund, note string) {
	ref := r.Reference // a duplicate charge is refunded on its own reference
	if ref == "" {
		ref = c.Reference
	}
	res, err := s.paystack.Refund(ctx, ref, r.AmountPesewas, note)
	at := s.nowRFC()
	if err != nil {
		s.log.Error("ads: refund call failed; check Paystack before refunding by hand", logKeyCampaign, c.ID, logKeyRefund, r.ID, logKeyErr, err)
		s.updateRefund(ctx, c.ID, r, domain.AdRefundManualCheck, "", at)
		return
	}
	s.updateRefund(ctx, c.ID, r, adRefundStatus(res.Status), res.RefundID, at)
}

// updateRefund stores a refund's new status (logging a failed write: the
// requesting/pending guards pick it up next run).
func (s *AdsService) updateRefund(ctx context.Context, campaignID string, r domain.AdRefund, status, paystackID, at string) {
	processed := refundedShare(r, status)
	if status == domain.AdRefundFailed || status == domain.AdRefundManualCheck {
		s.log.Error("ads: refund needs attention", logKeyCampaign, campaignID, logKeyRefund, r.ID, "status", status)
	}
	if err := s.campaigns.UpdateRefund(ctx, campaignID, r.ID, status, paystackID, at, processed); err != nil {
		s.log.Error("ads: storing a refund status failed", logKeyCampaign, campaignID, logKeyRefund, r.ID, logKeyErr, err)
	}
}

// refundedShare is what a refund adds to the campaign's refundedPesewas when
// it reaches status: its amount once processed, except for a duplicate
// charge, which was never part of the campaign's revenue.
func refundedShare(r domain.AdRefund, status string) int64 {
	if status != domain.AdRefundProcessed || r.DuplicateCharge() {
		return 0
	}
	return r.AmountPesewas
}

// adRefundStatus maps Paystack's refund status onto ours.
func adRefundStatus(paystack string) string {
	switch paystack {
	case RefundProcessed:
		return domain.AdRefundProcessed
	case RefundFailed:
		return domain.AdRefundFailed
	case RefundNeedsAttention:
		return domain.AdRefundManualCheck
	default:
		return domain.AdRefundPending
	}
}
