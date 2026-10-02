package service

import (
	"context"
	"errors"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── paid advertising: views and clicks (spec §3.9) ──────────────────────────

const (
	// A visitor bills at most 3 views of one campaign per 5 minutes and
	// sends at most 60 beacons a minute in all.
	adBillableViewsPerVisitorCampaign = 3
	adBillableViewsWindow             = 5 * time.Minute
	adBeaconsPerVisitor               = 60

	// A click counts within 30 minutes of its token's expiry, at most once a
	// minute and 10 times a day per visitor and campaign.
	adClickGrace       = 30 * time.Minute
	adClicksPerMinute  = 1
	adClicksPerDay     = 10
	adClickDayDuration = 24 * time.Hour

	// Network caps. A "visitor" above is the address plus the user agent,
	// and the caller writes the user agent, so one machine can be any number
	// of visitors. These caps key on the network alone (adNetwork: the IPv4
	// address, or the IPv6 /64) per campaign.
	//
	// Many readers in Ghana share one public address (carrier NAT on mobile
	// data, a campus or office Wi-Fi), so the caps only decide what is
	// billed or counted: every reader still gets the ad, and a view past the
	// cap is free for the advertiser. A reader's client shows one campaign
	// at most 3 times a session, so 6 billed views an hour and 20 a day per
	// network and campaign covers a few readers behind one address at once,
	// while a script on one machine now bills at most 20 views a day per
	// campaign instead of everything it sends.
	adNetworkViewsPerHour = 6
	adNetworkViewsPerDay  = 20
	// Clicks are far rarer than views (well under one in a hundred), so 3
	// an hour and 10 a day per network and campaign leave room for a shared
	// address. A click past the cap still redirects; it just isn't counted.
	adNetworkClicksPerHour = 3
	adNetworkClicksPerDay  = 10

	adHourWindow = time.Hour
	adDayWindow  = 24 * time.Hour
)

// Limiter key kinds.
const (
	adKeyBeacon     = "beacon"
	adKeyView       = "view"
	adKeyClick      = "click"
	adKeyNetView    = "netview"
	adKeyNetClick   = "netclick"
	adKeyWindowMin  = "min"
	adKeyWindowHour = "hour"
	adKeyWindowDay  = "day"
)

// Beacon outcomes.
const (
	AdViewIgnored  = "ignored"  // malformed, forged or expired: not counted at all
	AdViewUnbilled = "unbilled" // a real view of a real ad that is not charged
	AdViewBilled   = "billed"
)

// Why a view was ignored or not billed (logs and tests).
const (
	adWhyMalformed   = "malformed"
	adWhyBadToken    = "bad_token"
	adWhyExpired     = "expired"
	adWhyBot         = "bot"
	adWhyRateLimited = "rate_limited"
	adWhyAdsDisabled = "ads_disabled"
	adWhyDuplicate   = "duplicate"
	adWhyNotBillable = "not_billable" // not active, or fully delivered
	adWhyStoreError  = "store_error"
)

// adViewIDPattern is the beacon's view id (a UUID or similar).
var adViewIDPattern = regexp.MustCompile(`^[A-Za-z0-9-]{16,64}$`)

// AdBeacon is the POST /api/ads/v body.
type AdBeacon struct {
	C string `json:"c"` // campaign id
	P string `json:"p"` // placement
	V string `json:"v"` // view id
	T string `json:"t"` // token
	E int64  `json:"e"` // token expiry, unix seconds
}

// AdViewResult says what became of a beacon. The HTTP answer is always 204.
type AdViewResult struct {
	Outcome string
	Reason  string
}

// RecordView handles a viewable-impression beacon: verify the token, filter
// bots and floods, drop duplicate view ids, then bill the campaign if it is
// still active and under its booked impressions.
func (s *AdServingService) RecordView(ctx context.Context, b AdBeacon, v AdVisitor) AdViewResult {
	now := s.now()
	if reason := s.checkBeacon(b, now); reason != "" {
		return AdViewResult{Outcome: AdViewIgnored, Reason: reason}
	}
	today := adDay(now)
	reason := s.billView(ctx, b, v, now)
	s.counters.addView(b.C, today, reason == "")
	if reason != "" {
		return AdViewResult{Outcome: AdViewUnbilled, Reason: reason}
	}
	return AdViewResult{Outcome: AdViewBilled}
}

// checkBeacon validates the beacon's shape and signature ("" when good).
func (s *AdServingService) checkBeacon(b AdBeacon, now time.Time) string {
	if !adViewIDPattern.MatchString(b.V) {
		return adWhyMalformed
	}
	if _, ok := domain.AdPlacementBySlug(b.P); !ok {
		return adWhyMalformed
	}
	if !s.tokenValid(b.C, b.P, b.T, b.E) {
		return adWhyBadToken
	}
	if now.Unix() > b.E {
		return adWhyExpired
	}
	return ""
}

// billView runs the billing gates after a valid token; "" means billed.
// Every gate before InsertView is in memory, so a bot, a flood or a view
// past a cap never writes to the database (its view id is not stored).
func (s *AdServingService) billView(ctx context.Context, b AdBeacon, v AdVisitor, now time.Time) string {
	if v.isBot() {
		return adWhyBot
	}
	hash := s.visitorHash(v, now)
	if !s.limiter.allow(adKey(adKeyBeacon, hash), adBeaconsPerVisitor, time.Minute, now) ||
		!s.limiter.allow(adKey(adKeyView, hash, b.C), adBillableViewsPerVisitorCampaign, adBillableViewsWindow, now) ||
		!s.networkAllows(adKeyNetView, v, b.C, adNetworkViewsPerHour, adNetworkViewsPerDay, now) {
		return adWhyRateLimited
	}
	if !LoadAdSettings(ctx, s.settings).AdsEnabled {
		return adWhyAdsDisabled
	}
	if s.delivery != nil {
		fresh, err := s.delivery.InsertView(ctx, b.V, b.C, now)
		if err != nil {
			s.log.Error("ads: recording a view id failed", logKeyCampaign, b.C, logKeyErr, err)
			return adWhyStoreError
		}
		if !fresh {
			return adWhyDuplicate
		}
	}
	billed, err := s.campaigns.IncrDelivered(ctx, b.C, now.UTC().Format(time.RFC3339))
	if err != nil {
		s.log.Error("ads: billing a view failed", logKeyCampaign, b.C, logKeyErr, err)
		return adWhyStoreError
	}
	if !billed {
		return adWhyNotBillable
	}
	return ""
}

// ErrAdNotFound is the click redirect's 404: no such campaign, one whose
// landing page no reviewer has stood behind, or one that is no longer live.
var ErrAdNotFound = errors.New("ad_not_found")

// adClickDaysAfterEnd is how long a finished campaign's link keeps working
// after its end date: a reader may click an ad on a page loaded days ago.
const adClickDaysAfterEnd = 7

// AdClick is GET /api/ads/c/{id}?p=&t=&e=.
type AdClick struct {
	CampaignID string
	Placement  string
	Token      string
	Exp        int64
}

// Click returns the campaign's stored landing URL and counts the click when
// its token is good (until 30 minutes after expiry), the caller is no bot
// and within the click limits. The landing URL always comes from the
// database, never the request.
func (s *AdServingService) Click(ctx context.Context, in AdClick, v AdVisitor) (landing string, counted bool, err error) {
	c, err := s.campaigns.Get(ctx, in.CampaignID)
	var nf *domain.NotFoundError
	if errors.As(err, &nf) {
		return "", false, ErrAdNotFound
	}
	if err != nil {
		return "", false, err
	}
	now := s.now()
	if c == nil || !redirectable(*c, adDay(now)) {
		return "", false, ErrAdNotFound
	}
	if !s.clickCounts(in, v, now) {
		return c.Creative.LandingURL, false, nil
	}
	if err := s.campaigns.IncrClicks(ctx, c.ID); err != nil {
		s.log.Error("ads: counting a click failed", logKeyCampaign, c.ID, logKeyErr, err)
		return c.Creative.LandingURL, false, nil
	}
	s.counters.addClick(c.ID, adDay(now))
	return c.Creative.LandingURL, true, nil
}

// clickCounts applies the click gates of spec §3.9 and the network caps.
func (s *AdServingService) clickCounts(in AdClick, v AdVisitor, now time.Time) bool {
	if !s.tokenValid(in.CampaignID, in.Placement, in.Token, in.Exp) {
		return false
	}
	if now.After(time.Unix(in.Exp, 0).Add(adClickGrace)) || v.isBot() {
		return false
	}
	hash := s.visitorHash(v, now)
	return s.limiter.allow(adKey(adKeyClick, hash, in.CampaignID, adKeyWindowMin), adClicksPerMinute, time.Minute, now) &&
		s.limiter.allow(adKey(adKeyClick, hash, in.CampaignID, adKeyWindowDay), adClicksPerDay, adClickDayDuration, now) &&
		s.networkAllows(adKeyNetClick, v, in.CampaignID, adNetworkClicksPerHour, adNetworkClicksPerDay, now)
}

// networkAllows counts one event of kind for the caller's network and id (a
// campaign) against an hourly and a daily cap.
func (s *AdServingService) networkAllows(kind string, v AdVisitor, id string, perHour, perDay int, now time.Time) bool {
	network := s.networkHash(v, now)
	return s.netLimiter.allow(adKey(kind, network, id, adKeyWindowHour), perHour, adHourWindow, now) &&
		s.netLimiter.allow(adKey(kind, network, id, adKeyWindowDay), perDay, adDayWindow, now)
}

// adKey joins limiter key parts.
func adKey(parts ...string) string { return strings.Join(parts, adTokenSep) }

// redirectable reports whether the click redirect may send readers to a
// campaign's landing page on today (an Accra date): a reviewer approved it,
// the landing page is still an https URL, and the campaign is booked and
// live (scheduled, active or paused) or completed no more than
// adClickDaysAfterEnd days after its end date. Anything else — removed,
// rejected, cancelled, expired, never paid, long finished — is a 404, so the
// API never stays an open redirect for links nobody answers for any more.
func redirectable(c domain.AdCampaign, today string) bool {
	if !strings.HasPrefix(strings.ToLower(c.Creative.LandingURL), "https://") ||
		!slices.ContainsFunc(c.StatusHistory, func(h domain.AdStatusChange) bool { return h.To == domain.AdStatusApproved }) {
		return false
	}
	switch c.Status {
	case domain.AdStatusScheduled, domain.AdStatusActive, domain.AdStatusPaused:
		return true
	case domain.AdStatusCompleted:
		end, err := parseAdDay(c.EndDate)
		return err == nil && today <= end.AddDate(0, 0, adClickDaysAfterEnd).Format(electionDateLayout)
	}
	return false
}
