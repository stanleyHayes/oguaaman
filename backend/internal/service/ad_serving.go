package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"log/slog"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── paid advertising: serving (spec §3.9, §4.4) ─────────────────────────────
//
// A page asks for a slate of ads for one placement. Every ad is shown to
// everyone who views that placement: nothing about the reader (account,
// location, history) is used to choose, and the slate never reads the
// caller's session. The client picks one ad by weight, reports a viewable
// impression with a signed beacon and sends clicks through a counting
// redirect. Counters live in memory and the ads scheduler flushes them every
// five minutes (SetDeliveryFlush). One API instance is assumed [A1].

const (
	adSlateCacheTTL = 30 * time.Second
	adSlateMaxAds   = 10
	adTokenTTL      = 15 * time.Minute
	adTokenVersion  = "v1"
	adTokenSep      = "|"

	// AdChipCommercial and AdChipPolitical are the exact ad labels.
	AdChipCommercial = "Ad"
	AdChipPolitical  = "Political ad"

	// adClickPath is the counting redirect, joined to the public API URL.
	adClickPath = "/api/ads/c/"

	// Opportunities one client may add per placement per minute, so a
	// script can't inflate the forecast that inventory is sold against.
	adOpportunitiesPerMinute = 30
	// The same per network (no user agent in the key; see the network caps
	// in ad_serving_events.go): a page view every two seconds on one
	// placement from one shared address. Past it the slate is still served;
	// it just adds nothing to the forecast, which errs towards selling less.
	adNetworkOpportunitiesPerMinute = 30
	adKeyOpportunity                = "opp"
	adKeyNetOpportunity             = "netopp"

	logKeyPlacement = "placement"
	logKeySponsor   = "sponsor"
)

// AdServingDeps are what serving needs. Campaigns is required; without
// Delivery nothing is stored (views still bill), without Elections political
// ads are never served, without Sponsors no ad is served (no sponsor can be
// checked), and without TokenSecret every slate is empty.
type AdServingDeps struct {
	Campaigns domain.AdRepository
	Sponsors  domain.AdSponsorRepository
	Delivery  domain.AdDeliveryRepository
	Settings  *SettingsService
	Elections *ElectionsService
	// TokenSecret is ADS_TOKEN_SECRET: the HMAC key of slate tokens.
	TokenSecret string
	// APIURL is PUBLIC_API_URL; click URLs are absolute. When empty the
	// handler's request-derived origin is used.
	APIURL string
	Log    *slog.Logger
}

// AdServingService builds slates and counts views and clicks.
type AdServingService struct {
	campaigns domain.AdRepository
	sponsors  domain.AdSponsorRepository
	delivery  domain.AdDeliveryRepository
	settings  *SettingsService
	elections *ElectionsService
	secret    []byte
	apiURL    string
	log       *slog.Logger
	now       func() time.Time

	counters *adCounters
	// limiter keys on the visitor (address + user agent); netLimiter on the
	// network alone. See adLimiter for what each does when full.
	limiter    *adLimiter
	netLimiter *adLimiter
	salt       *adDailySalt

	cacheMu sync.Mutex
	cache   map[adSlateKey]adSlateCached
	// sponsorStatus caches each sponsor's status for as long as a slate
	// (adSlateCacheTTL), keyed by sponsor id.
	sponsorStatus map[string]adSponsorStatus
}

// NewAdServingService builds the serving service.
func NewAdServingService(d AdServingDeps) *AdServingService {
	log := d.Log
	if log == nil {
		log = slog.Default()
	}
	secret := strings.TrimSpace(d.TokenSecret)
	switch {
	case secret == "":
		log.Warn("ads: ADS_TOKEN_SECRET is not set, so ad slates are empty")
	case len(secret) < 32:
		log.Warn("ads: ADS_TOKEN_SECRET is shorter than 32 characters; use 32 random bytes, base64")
	}
	return &AdServingService{
		campaigns: d.Campaigns, sponsors: d.Sponsors, delivery: d.Delivery, settings: d.Settings, elections: d.Elections,
		secret: []byte(secret), apiURL: strings.TrimRight(d.APIURL, "/"), log: log, now: time.Now,
		counters: newAdCounters(), salt: &adDailySalt{},
		limiter:    newAdLimiter(adVisitorLimiterMax, true),
		netLimiter: newAdLimiter(adNetworkLimiterMax, false),
		cache:      map[adSlateKey]adSlateCached{}, sponsorStatus: map[string]adSponsorStatus{},
	}
}

// TokenSecretConfigured reports whether ADS_TOKEN_SECRET is set.
func (s *AdServingService) TokenSecretConfigured() bool { return len(s.secret) > 0 }

// ── shapes ──────────────────────────────────────────────────────────────────

// AdDisplay is an ad as readers see it: the creative and its labels. The
// slate and the ad library share it.
type AdDisplay struct {
	ID              string `json:"id"`
	Format          string `json:"format"`
	ImageURL        string `json:"imageUrl"`
	ImageURLDesktop string `json:"imageUrlDesktop"`
	ImageURLMobile  string `json:"imageUrlMobile"`
	Headline        string `json:"headline"`
	Body            string `json:"body"`
	Alt             string `json:"alt"`
	Chip            string `json:"chip"`        // "Ad" | "Political ad"
	SponsorLine     string `json:"sponsorLine"` // "Sponsored · X" | "Paid for by X"
	Political       bool   `json:"political"`
	ElectionName    string `json:"electionName"`
	SyntheticMedia  bool   `json:"syntheticMedia"`
}

// adDisplay renders a campaign's creative and labels.
func adDisplay(c domain.AdCampaign) AdDisplay {
	format := c.Creative.Format
	if format == "" {
		if p, ok := domain.AdPlacementBySlug(c.Placement); ok {
			format = p.Format
		}
	}
	chip := AdChipCommercial
	if c.Political {
		chip = AdChipPolitical
	}
	return AdDisplay{
		ID: c.ID, Format: format, ImageURL: c.Creative.ImageURL, ImageURLDesktop: c.Creative.ImageURLDesktop,
		ImageURLMobile: c.Creative.ImageURLMobile, Headline: c.Creative.Headline, Body: c.Creative.Body, Alt: c.Creative.Alt,
		Chip: chip, SponsorLine: c.SponsorLine, Political: c.Political, ElectionName: c.ElectionName,
		SyntheticMedia: c.Creative.ContainsSyntheticMedia,
	}
}

// AdSlateItem is one ad on a slate, with its signed token and click URL.
type AdSlateItem struct {
	AdDisplay
	ClickURL string `json:"clickUrl"`
	Token    string `json:"token"`
	Exp      int64  `json:"exp"` // unix seconds
	Weight   int64  `json:"weight"`
}

// AdSlate is GET /api/ads/slate. Why completes "This ad is shown to everyone
// who views …".
type AdSlate struct {
	Placement string        `json:"placement"`
	Why       string        `json:"why"`
	Ads       []AdSlateItem `json:"ads"`
}

// AdVisitor is what serving may know about a reader: enough to filter bots
// and rate-limit, never who they are. ClientKey (the network address) is
// only ever hashed with a salt that lives in memory for one day.
type AdVisitor struct {
	ClientKey string
	UserAgent string
	Prefetch  bool // Sec-Purpose or Purpose says prefetch / prerender
}

// ── slate ───────────────────────────────────────────────────────────────────

// adSlateKey is a slate cache entry: the placement and whether the page
// asked for no political ads.
type adSlateKey struct {
	placement   string
	noPolitical bool
}

// adSlateCached is the eligible campaigns of a placement, each with today's
// target fixed when the entry was filled. Weights are worked out per request
// from the views billed since, so a cached slate never over-serves.
type adSlateCached struct {
	at   time.Time
	day  string
	rows []adPaced
}

// adPaced is a campaign's pacing snapshot: today's target, the views it had
// today when the snapshot was taken, and this process's billed-view count
// for it at that moment.
type adPaced struct {
	c       domain.AdCampaign
	target  int64
	views0  int64
	billed0 int64
}

// Slate returns the ads a placement may show now, highest pacing weight
// first. political asks to leave political ads out (a political news page).
// apiBase is the request's own origin, used when PUBLIC_API_URL is unset.
// An unknown placement is an AdError; anything else degrades to no ads.
func (s *AdServingService) Slate(ctx context.Context, placement string, political bool, v AdVisitor, apiBase string) (*AdSlate, error) {
	p, ok := domain.AdPlacementBySlug(placement)
	if !ok {
		return nil, adFieldErr(AdErrInvalidPlacement, adFieldPlacement, "Choose one of the listed placements.")
	}
	now := s.now()
	today := adDay(now)
	s.countOpportunity(placement, today, v, now)
	out := &AdSlate{Placement: p.Slug, Why: p.Why, Ads: []AdSlateItem{}}
	set := LoadAdSettings(ctx, s.settings)
	if !set.Servable(placement) || !s.TokenSecretConfigured() {
		return out, nil
	}
	cached, err := s.eligible(ctx, set, adSlateKey{placement: placement, noPolitical: political}, now)
	if err != nil {
		s.log.Error("ads: building a slate failed", logKeyPlacement, placement, logKeyErr, err)
		return out, nil
	}
	exp := now.Add(adTokenTTL).Unix()
	base := s.clickBase(apiBase)
	for _, w := range s.rank(cached) {
		token := s.sign(w.c.ID, placement, exp)
		out.Ads = append(out.Ads, AdSlateItem{
			AdDisplay: adDisplay(w.c), Token: token, Exp: exp, Weight: w.weight,
			ClickURL: clickURL(base, w.c.ID, placement, token, exp),
		})
	}
	return out, nil
}

// countOpportunity adds one opportunity for the placement today, unless the
// caller is a bot or it (or its network) has already added its share this
// minute.
func (s *AdServingService) countOpportunity(placement, today string, v AdVisitor, now time.Time) {
	if v.isBot() {
		return
	}
	if s.limiter.allow(adKey(adKeyOpportunity, s.visitorHash(v, now), placement), adOpportunitiesPerMinute, time.Minute, now) &&
		s.netLimiter.allow(adKey(adKeyNetOpportunity, s.networkHash(v, now), placement), adNetworkOpportunitiesPerMinute, time.Minute, now) {
		s.counters.addOpportunity(placement, today)
	}
}

// eligible returns the cached eligible campaigns, refilling a stale entry.
func (s *AdServingService) eligible(ctx context.Context, set domain.AdSettings, key adSlateKey, now time.Time) (adSlateCached, error) {
	today := adDay(now)
	s.cacheMu.Lock()
	hit, ok := s.cache[key]
	s.cacheMu.Unlock()
	if ok && hit.day == today && now.Sub(hit.at) < adSlateCacheTTL && !now.Before(hit.at) {
		return hit, nil
	}
	rows, err := s.campaigns.Serving(ctx, key.placement, today)
	if err != nil {
		return adSlateCached{}, err
	}
	noPolitical := key.noPolitical || !set.PoliticalEnabled || s.inBlackout(ctx, now)
	keep := make([]domain.AdCampaign, 0, len(rows))
	ids := make([]string, 0, len(rows))
	for _, c := range rows {
		if servableCampaign(c, today, noPolitical) && s.sponsorVerified(ctx, c.SponsorID, now) {
			keep = append(keep, c)
			ids = append(ids, c.ID)
		}
	}
	fresh := adSlateCached{at: now, day: today, rows: s.paceSnapshot(ctx, today, keep, ids)}
	s.cacheMu.Lock()
	s.cache[key] = fresh
	s.cacheMu.Unlock()
	return fresh, nil
}

// adSponsorStatus is a sponsor's status as last read.
type adSponsorStatus struct {
	status string
	at     time.Time
}

// sponsorVerified reports whether a campaign's sponsor is verified now. A
// sponsor suspended or rejected after its campaign was approved (or one
// that is missing) takes its ads off every slate within one slate cache
// lifetime, whatever state the campaign itself is in. A sponsor that can't
// be read is treated as unverified and not cached, so the next refill
// tries again.
func (s *AdServingService) sponsorVerified(ctx context.Context, id string, now time.Time) bool {
	if s.sponsors == nil || id == "" {
		return false
	}
	s.cacheMu.Lock()
	hit, ok := s.sponsorStatus[id]
	s.cacheMu.Unlock()
	if ok && now.Sub(hit.at) < adSlateCacheTTL && !now.Before(hit.at) {
		return hit.status == domain.AdSponsorVerified
	}
	sp, err := s.sponsors.Get(ctx, id)
	var nf *domain.NotFoundError
	switch {
	case errors.As(err, &nf) || (err == nil && sp == nil):
		hit = adSponsorStatus{at: now}
	case err != nil:
		s.log.Warn("ads: reading a sponsor failed; its ads are skipped", logKeySponsor, id, logKeyErr, err)
		return false
	default:
		hit = adSponsorStatus{status: sp.Status, at: now}
	}
	s.cacheMu.Lock()
	s.sponsorStatus[id] = hit
	s.cacheMu.Unlock()
	return hit.status == domain.AdSponsorVerified
}

// inBlackout reports whether political ads must stay out now: an election
// blackout, or no way to tell — the calendar is not wired or cannot be read
// — so political ads are never served unchecked. (The ads scheduler reads a
// failed calendar the other way: it must not end and refund every political
// campaign because the database is briefly unreachable.)
func (s *AdServingService) inBlackout(ctx context.Context, now time.Time) bool {
	if s.elections == nil {
		return true
	}
	return s.elections.BlackoutOrUnknown(ctx, now)
}

// paceSnapshot fixes each campaign's target for today. Today's views so far
// are the flushed ones plus those still in the buffer.
func (s *AdServingService) paceSnapshot(ctx context.Context, today string, rows []domain.AdCampaign, ids []string) []adPaced {
	stored := s.storedViews(ctx, today, ids)
	out := make([]adPaced, 0, len(rows))
	for _, c := range rows {
		billed0 := s.counters.billedTotal(c.ID)
		views0 := stored[c.ID] + s.counters.pendingViews(c.ID, today)
		out = append(out, adPaced{c: c, target: paceTarget(c, today, views0), views0: views0, billed0: billed0})
	}
	return out
}

// storedViews reads today's flushed views; on failure pacing treats them as
// zero (the cap in IncrDelivered still stops over-delivery).
func (s *AdServingService) storedViews(ctx context.Context, today string, ids []string) map[string]int64 {
	if s.delivery == nil || len(ids) == 0 {
		return map[string]int64{}
	}
	views, err := s.delivery.ViewsOn(ctx, today, ids)
	if err != nil {
		s.log.Warn("ads: reading today's views failed; pacing from zero", logKeyErr, err)
		return map[string]int64{}
	}
	return views
}

// servableCampaign applies the per-campaign exclusions of spec §3.9.
func servableCampaign(c domain.AdCampaign, today string, noPolitical bool) bool {
	if c.Status != domain.AdStatusActive || c.Delivered >= c.BookedImpressions {
		return false
	}
	if c.Political && noPolitical {
		return false
	}
	if exp := c.Compliance.FDAApprovalExpiresOn; exp != "" && exp < today {
		return false
	}
	return true
}

// weightedAd is a campaign with its pacing weight.
type weightedAd struct {
	c      domain.AdCampaign
	weight int64
}

// rank weighs the cached campaigns with today's views, drops those that have
// met today's target, and keeps the ten furthest behind.
func (s *AdServingService) rank(cached adSlateCached) []weightedAd {
	out := make([]weightedAd, 0, len(cached.rows))
	for _, p := range cached.rows {
		todayViews := p.views0 + s.counters.billedTotal(p.c.ID) - p.billed0
		if w := p.target - todayViews; w > 0 {
			out = append(out, weightedAd{c: p.c, weight: w})
		}
	}
	slices.SortStableFunc(out, func(a, b weightedAd) int {
		if a.weight != b.weight {
			if a.weight > b.weight {
				return -1
			}
			return 1
		}
		return strings.Compare(a.c.ID, b.c.ID)
	})
	if len(out) > adSlateMaxAds {
		out = out[:adSlateMaxAds]
	}
	return out
}

// paceTarget is a campaign's views for today: an even share of what was
// left at the start of the day over the days left (today included).
// "What was left" adds today's views back to the undelivered impressions, so
// the target holds steady through the day instead of shrinking with every
// view (spec §3.9 says booked − delivered; read literally, that halves the
// last day's delivery).
func paceTarget(c domain.AdCampaign, today string, todayViews int64) int64 {
	t, err1 := parseAdDay(today)
	end, err2 := parseAdDay(c.EndDate)
	if err1 != nil || err2 != nil || end.Before(t) {
		return 0
	}
	daysLeft := int64(adDaysBetween(t, end))
	remaining := max(0, c.BookedImpressions-c.Delivered+todayViews)
	return (remaining + daysLeft - 1) / daysLeft
}

// paceWeight is how many more views a campaign should get today.
func paceWeight(c domain.AdCampaign, today string, todayViews int64) int64 {
	return max(0, paceTarget(c, today, todayViews)-todayViews)
}

// ── tokens ──────────────────────────────────────────────────────────────────

// sign is base64url(HMAC-SHA256(secret, "v1|id|placement|exp")).
func (s *AdServingService) sign(id, placement string, exp int64) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(adTokenVersion + adTokenSep + id + adTokenSep + placement + adTokenSep + strconv.FormatInt(exp, 10)))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// tokenValid checks a token in constant time. It does not check expiry.
func (s *AdServingService) tokenValid(id, placement, token string, exp int64) bool {
	if !s.TokenSecretConfigured() || id == "" || placement == "" || token == "" {
		return false
	}
	want := s.sign(id, placement, exp)
	return subtle.ConstantTimeCompare([]byte(want), []byte(token)) == 1
}

// clickBase is the absolute API origin click URLs start with.
func (s *AdServingService) clickBase(requestBase string) string {
	if s.apiURL != "" {
		return s.apiURL
	}
	return strings.TrimRight(requestBase, "/")
}

// clickURL is {API}/api/ads/c/{id}?e=&p=&t=.
func clickURL(base, id, placement, token string, exp int64) string {
	q := url.Values{}
	q.Set("p", placement)
	q.Set("t", token)
	q.Set("e", strconv.FormatInt(exp, 10))
	return base + adClickPath + url.PathEscape(id) + "?" + q.Encode()
}
