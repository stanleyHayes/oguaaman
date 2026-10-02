package service

import (
	"context"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── the ads scheduler (spec §3.8) ───────────────────────────────────────────
//
// Every five minutes cmd/server runs one pass. Each step is idempotent:
//  1. flush the serving code's in-memory counters (wired with SetDeliveryFlush);
//  2. move campaigns along: approved → expired, scheduled → active,
//     active/paused → completed (end date passed, fully delivered, or a
//     political ad meeting an election blackout);
//  3. turn owed refunds into Paystack refunds (record first, then call);
//  4. send stuck "requesting" refunds to manual_check, poll pending ones.
//
// Steps 1–2 run without a payment provider; refunds wait until there is one.

// AdsSchedulerInterval is how often cmd/server runs RunScheduler.
const AdsSchedulerInterval = 5 * time.Minute

// AdsSchedulerCounts summarises one pass (for the log line).
type AdsSchedulerCounts struct {
	Expired   int `json:"expired"`
	Activated int `json:"activated"`
	Completed int `json:"completed"`
	Refunds   int `json:"refunds"` // owed refunds handled (sent or cleared)
	Polled    int `json:"polled"`
	Stuck     int `json:"stuck"` // requesting rows sent to manual_check
	Errors    int `json:"errors"`
}

// SetDeliveryFlush wires the serving code's buffer flush (step 1).
func (s *AdsService) SetDeliveryFlush(flush func(context.Context) error) { s.flush = flush }

// RunScheduler runs one scheduler pass.
func (s *AdsService) RunScheduler(ctx context.Context) AdsSchedulerCounts {
	var counts AdsSchedulerCounts
	if s.flush != nil {
		if err := s.flush(ctx); err != nil {
			s.log.Error("ads scheduler: flushing delivery counters failed", logKeyErr, err)
			counts.Errors++
		}
	}
	now := s.now().UTC()
	due, err := s.campaigns.DueForScheduler(ctx, now.Format(time.RFC3339))
	if err != nil {
		s.log.Error("ads scheduler: reading due campaigns failed", logKeyErr, err)
		counts.Errors++
		return counts
	}
	blackout := false
	if s.elections != nil {
		blackout, _ = s.elections.InBlackout(ctx, now)
	}
	refunds := !paymentsOff(s.paystack)
	for i := range due {
		c := due[i]
		if err := s.advance(ctx, &c, blackout, &counts); err != nil {
			s.log.Error("ads scheduler: status step failed", logKeyCampaign, c.ID, logKeyErr, err)
			counts.Errors++
			continue
		}
		if refunds {
			s.settleRefunds(ctx, c, &counts)
		}
	}
	return counts
}

// advance makes the status step a campaign is due for; c is refreshed when
// it changes.
func (s *AdsService) advance(ctx context.Context, c *domain.AdCampaign, blackout bool, counts *AdsSchedulerCounts) error {
	var to, reason string
	set := map[string]any{}
	from := []string{c.Status}
	switch c.Status {
	case domain.AdStatusApproved:
		if c.ApprovalHeld(s.now()) { // includes a payment still in progress
			return nil
		}
		to, reason = domain.AdStatusExpired, "The approval expired before payment."
	case domain.AdStatusScheduled:
		if c.StartDate > s.today() {
			return nil
		}
		to, reason = s.startStep(ctx, c, set)
	case domain.AdStatusActive, domain.AdStatusPaused:
		owed, why := s.completion(c, blackout)
		if why == "" {
			return nil
		}
		to, reason, from = domain.AdStatusCompleted, why, []string{domain.AdStatusActive, domain.AdStatusPaused}
		if owed != "" && c.PaymentStatus == domain.AdPaymentSuccess {
			set[fieldRefundOwed] = owed
		}
		s.retainPolitical(c, set)
	default:
		return nil
	}
	fresh, err := s.transition(ctx, c, from, to, domain.AdActorSystem, reason, set)
	if err != nil {
		if ae, ok := err.(*AdError); ok && ae.Code == AdErrInvalidTransition {
			return nil // someone else moved it first
		}
		return err
	}
	*c = *fresh
	countAdvance(counts, to)
	return nil
}

// startStep is where a scheduled campaign goes on its start date: active,
// or paused (marked as paused by its sponsor) when the sponsor is no longer
// verified.
func (s *AdsService) startStep(ctx context.Context, c *domain.AdCampaign, set map[string]any) (to, reason string) {
	if s.sponsorVerified(ctx, c.SponsorID) {
		return domain.AdStatusActive, ""
	}
	set[fieldPausedBy] = domain.AdPausedBySponsor
	return domain.AdStatusPaused, "The sponsor is no longer verified."
}

// sponsorVerified reports whether a campaign's sponsor is (still) verified.
// A failed lookup counts as not verified: the campaign waits paused for a
// curator rather than running unchecked.
func (s *AdsService) sponsorVerified(ctx context.Context, id string) bool {
	sp, err := s.sponsors.Get(ctx, id)
	return err == nil && sp != nil && sp.Status == domain.AdSponsorVerified
}

func countAdvance(counts *AdsSchedulerCounts, to string) {
	switch to {
	case domain.AdStatusExpired:
		counts.Expired++
	case domain.AdStatusActive:
		counts.Activated++
	case domain.AdStatusCompleted:
		counts.Completed++
	}
}

// completion says whether a running campaign is finished and which refund
// that leaves owed: under-delivery when the flight ended short, the election
// blackout for a political ad cut short by it, nothing when fully delivered.
func (s *AdsService) completion(c *domain.AdCampaign, blackout bool) (owed, why string) {
	switch {
	case c.Delivered >= c.BookedImpressions:
		return "", "All booked impressions were delivered."
	case c.Political && blackout:
		return domain.AdRefundElectionBlackout, "Political ads stop for the election blackout."
	case s.today() > c.EndDate:
		return domain.AdRefundUnderDelivery, "The campaign's end date passed."
	}
	return "", ""
}

// settleRefunds handles a campaign's refund work: an owed refund, stuck
// requests and pending refunds.
func (s *AdsService) settleRefunds(ctx context.Context, c domain.AdCampaign, counts *AdsSchedulerCounts) {
	if c.RefundOwed != "" {
		if err := s.payOwedRefund(ctx, c); err != nil {
			s.log.Error("ads scheduler: owed refund failed", logKeyCampaign, c.ID, logKeyErr, err)
			counts.Errors++
		} else {
			counts.Refunds++
		}
	}
	stuckBefore := s.now().UTC().Add(-adRefundRequestingTimeout).Format(time.RFC3339)
	pollSince := s.now().UTC().Add(-adManualCheckPollWindow).Format(time.RFC3339)
	for _, r := range c.Refunds {
		switch {
		case r.Status == domain.AdRefundRequesting && r.CreatedAt < stuckBefore:
			s.updateRefund(ctx, c.ID, r, domain.AdRefundManualCheck, "", s.nowRFC())
			counts.Stuck++
		case r.Status == domain.AdRefundPending && r.PaystackRefundID != "",
			// Paystack flagged it for attention; it may still settle there.
			r.Status == domain.AdRefundManualCheck && r.PaystackRefundID != "" && r.CreatedAt >= pollSince:
			s.pollRefund(ctx, c.ID, r)
			counts.Polled++
		}
	}
}

// adManualCheckPollWindow: how long a manual_check refund with a Paystack id
// keeps being polled (the repository's DueForScheduler uses the same window).
const adManualCheckPollWindow = 30 * 24 * time.Hour

// pollRefund asks Paystack about a refund and stores any change of status.
func (s *AdsService) pollRefund(ctx context.Context, campaignID string, r domain.AdRefund) {
	res, err := s.paystack.RefundStatus(ctx, r.PaystackRefundID)
	if err != nil {
		s.log.Warn("ads scheduler: refund status unavailable; will poll again", logKeyCampaign, campaignID, logKeyRefund, r.ID, logKeyErr, err)
		return
	}
	if status := adRefundStatus(res.Status); status != r.Status {
		s.updateRefund(ctx, campaignID, r, status, r.PaystackRefundID, s.nowRFC())
	}
}
