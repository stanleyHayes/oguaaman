package service

import (
	"context"
	"fmt"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── quotes: price, dates and inventory (spec §3.6) ──────────────────────────
//
// A quote is the same arithmetic for every advertiser (equal rates): CPM per
// 1,000 viewable impressions, net rounded up to the pesewa, tax rounded half
// up, total = net + tax. Inventory is forecast per placement and Accra day so
// we never sell more than a share of the opportunities we expect to have.

const (
	// adQuoteValidFor is how long a quoted price holds before a submit must
	// re-price it.
	adQuoteValidFor = 30 * time.Minute
	// adForecastWindowDays and adForecastMinDays: the forecast is the mean of
	// the last 28 days of observed opportunities once 7 days exist.
	adForecastWindowDays = 28
	adForecastMinDays    = 7

	forecastObserved = "observed"
	forecastFallback = "fallback"

	adFieldStartDate   = "startDate"
	adFieldEndDate     = "endDate"
	adFieldElectionID  = "electionId"
	adFieldImpressions = "impressions"
	adFieldPlacement   = "placement"
	adKeyLatestEndDate = "latestEndDate"
)

// AdQuoteInput is the POST /api/ads/quote body (and the pricing half of a
// campaign submission).
type AdQuoteInput struct {
	Placement     string `json:"placement"`
	Political     bool   `json:"political"`
	ElectionID    string `json:"electionId"`
	PoliticalType string `json:"politicalType"`
	StartDate     string `json:"startDate"`
	EndDate       string `json:"endDate"`
	Impressions   int64  `json:"impressions"`
}

// AdQuote is the price and availability of one booking.
type AdQuote struct {
	Placement     string                 `json:"placement"`
	Impressions   int64                  `json:"impressions"`
	Days          int                    `json:"days"`
	Price         domain.AdPriceSnapshot `json:"price"`
	Available     int64                  `json:"available"`
	LatestEndDate string                 `json:"latestEndDate"`
	ExpiresAt     string                 `json:"expiresAt"`

	election *domain.Election // the election an election ad runs up to
	format   string
}

// quoteOptions are the extras a submission, approval or checkout adds to a
// public quote.
type quoteOptions struct {
	sponsor   *domain.AdSponsor // district assembly ads check the sponsor
	excludeID string            // a booked campaign rechecking its own inventory
}

// Quote prices a booking for the public quote endpoint.
func (s *AdsService) Quote(ctx context.Context, in AdQuoteInput) (*AdQuote, error) {
	return s.quote(ctx, s.Settings(ctx), in, quoteOptions{})
}

// quote runs every quote rule in order: switches, placement, impressions,
// dates, the political window, price and inventory.
func (s *AdsService) quote(ctx context.Context, set domain.AdSettings, in AdQuoteInput, opt quoteOptions) (*AdQuote, error) {
	if err := checkAdSwitches(set, in.Political); err != nil {
		return nil, err
	}
	placement, ok := domain.AdPlacementBySlug(in.Placement)
	if !ok || !set.Servable(in.Placement) {
		return nil, adFieldErr(AdErrInvalidPlacement, adFieldPlacement, "Choose a placement that is on sale.")
	}
	if err := checkImpressions(set, in.Impressions); err != nil {
		return nil, err
	}
	start, end, days, err := s.checkAdDates(set, in.StartDate, in.EndDate)
	if err != nil {
		return nil, err
	}
	q := &AdQuote{Placement: placement.Slug, Impressions: in.Impressions, Days: days, format: placement.Format}
	if in.Political {
		if err := s.checkPoliticalWindow(ctx, set, in, start, end, opt.sponsor, q); err != nil {
			return nil, err
		}
	}
	price, _ := set.Price(placement.Slug)
	cpm := price.CpmPesewas
	if in.Political {
		cpm = price.PoliticalCpmPesewas
	}
	q.Price = PriceAd(in.Impressions, cpm, set.TaxRateBps, set.Version)
	if q.Price.TotalPesewas < set.MinOrderPesewas {
		e := adFieldErr(AdErrBelowMinimumOrder, adFieldImpressions, fmt.Sprintf("The minimum order is %s including tax.", adCedis(set.MinOrderPesewas)))
		e.Extra = map[string]any{"minOrderPesewas": set.MinOrderPesewas}
		return nil, e
	}
	if q.Available, err = s.available(ctx, set, price, start, end, opt.excludeID); err != nil {
		return nil, err
	}
	if in.Impressions > q.Available {
		maxAvail := q.Available / set.ImpressionStep * set.ImpressionStep
		e := adFieldErr(AdErrInventoryUnavailable, adFieldImpressions, fmt.Sprintf("Only %d impressions are available on those dates.", maxAvail))
		e.Extra = map[string]any{"maxAvailable": maxAvail}
		return nil, e
	}
	q.ExpiresAt = s.now().UTC().Add(adQuoteValidFor).Format(time.RFC3339)
	return q, nil
}

// checkAdSwitches applies the kill switches to new quotes.
func checkAdSwitches(set domain.AdSettings, political bool) error {
	if !set.AdsEnabled {
		return adErr(AdErrAdsDisabled, "Oguaa isn't selling ads right now.")
	}
	if political && !set.PoliticalEnabled {
		return adErr(AdErrPoliticalDisabled, "Oguaa isn't accepting political ads right now.")
	}
	return nil
}

// checkImpressions: a multiple of the step, within the order limits.
func checkImpressions(set domain.AdSettings, n int64) error {
	step := max(set.ImpressionStep, 1)
	if n < set.MinImpressions || n > set.MaxImpressionsPerOrder || n%step != 0 {
		return adFieldErr(AdErrInvalidImpressions, adFieldImpressions,
			fmt.Sprintf("Book between %d and %d impressions, in steps of %d.", set.MinImpressions, set.MaxImpressionsPerOrder, step))
	}
	return nil
}

// PriceAd is the rate-card arithmetic: net = ceil(impressions × cpm / 1000),
// tax = round_half_up(net × bps / 10000), total = net + tax.
func PriceAd(impressions, cpmPesewas int64, taxRateBps, settingsVersion int) domain.AdPriceSnapshot {
	net := (impressions*cpmPesewas + 999) / 1000
	tax := (net*int64(taxRateBps) + 5000) / 10000
	return domain.AdPriceSnapshot{
		SettingsVersion: settingsVersion, CpmPesewas: cpmPesewas, NetPesewas: net,
		TaxRateBps: taxRateBps, TaxPesewas: tax, TotalPesewas: net + tax,
	}
}

// adCedis formats pesewas as "GH₵150" or "GH₵150.50".
func adCedis(pesewas int64) string {
	if pesewas%100 == 0 {
		return fmt.Sprintf("GH₵%d", pesewas/100)
	}
	return fmt.Sprintf("GH₵%d.%02d", pesewas/100, pesewas%100)
}

// ── dates ───────────────────────────────────────────────────────────────────

// parseAdDay parses a YYYY-MM-DD Accra date.
func parseAdDay(s string) (time.Time, error) {
	return time.ParseInLocation(electionDateLayout, s, calendarZone)
}

func adDay(t time.Time) string { return t.In(calendarZone).Format(electionDateLayout) }

// adDaysBetween counts the days from a to b inclusive (both Accra dates).
func adDaysBetween(a, b time.Time) int { return int(b.Sub(a).Hours()/24) + 1 }

// today is the Accra date now.
func (s *AdsService) today() string { return adDay(s.now()) }

// checkAdDates: starts after the review lead time, ends on or after it
// starts, and lasts at most maxCampaignDays.
func (s *AdsService) checkAdDates(set domain.AdSettings, startStr, endStr string) (start, end time.Time, days int, err error) {
	start, e1 := parseAdDay(startStr)
	end, e2 := parseAdDay(endStr)
	switch {
	case e1 != nil:
		return start, end, 0, adFieldErr(AdErrInvalidDates, adFieldStartDate, "Give the start date as YYYY-MM-DD.")
	case e2 != nil:
		return start, end, 0, adFieldErr(AdErrInvalidDates, adFieldEndDate, "Give the end date as YYYY-MM-DD.")
	}
	today, _ := parseAdDay(s.today())
	earliest := today.AddDate(0, 0, set.MinLeadDays)
	if start.Before(earliest) {
		return start, end, 0, adFieldErr(AdErrInvalidDates, adFieldStartDate,
			fmt.Sprintf("Start on %s or later: every ad is reviewed first.", adDay(earliest)))
	}
	if end.Before(start) {
		return start, end, 0, adFieldErr(AdErrInvalidDates, adFieldEndDate, "End on or after the start date.")
	}
	days = adDaysBetween(start, end)
	if days > set.MaxCampaignDays {
		return start, end, 0, adFieldErr(AdErrInvalidDates, adFieldEndDate, fmt.Sprintf("Campaigns can run for up to %d days.", set.MaxCampaignDays))
	}
	return start, end, days, nil
}

// ── political windows ───────────────────────────────────────────────────────

// checkPoliticalWindow applies the election rules: an election ad runs inside
// its election's political-ads window and ends before the blackout; an issue
// ad never overlaps any blackout.
func (s *AdsService) checkPoliticalWindow(ctx context.Context, set domain.AdSettings, in AdQuoteInput, start, end time.Time, sponsor *domain.AdSponsor, q *AdQuote) error {
	switch in.PoliticalType {
	case domain.AdPoliticalElection:
		return s.checkElectionAd(ctx, set, in.ElectionID, start, end, sponsor, q)
	case domain.AdPoliticalIssue:
		return s.checkIssueAd(ctx, start, end, q)
	}
	return adFieldErr(AdErrInvalidDates, "politicalType", "Say whether this is an election ad or an issue ad.")
}

func (s *AdsService) checkElectionAd(ctx context.Context, set domain.AdSettings, electionID string, start, end time.Time, sponsor *domain.AdSponsor, q *AdQuote) error {
	notFound := adFieldErr(AdErrElectionNotFound, adFieldElectionID, "Choose an upcoming election.")
	if s.elections == nil || electionID == "" {
		return notFound
	}
	e, err := s.elections.Get(ctx, electionID)
	if err != nil || e == nil {
		return notFound
	}
	if e.PollDate < s.today() {
		return notFound
	}
	blackout, err := time.Parse(time.RFC3339, e.BlackoutStart)
	if err != nil {
		return notFound
	}
	latest := blackout.In(calendarZone)
	latest = time.Date(latest.Year(), latest.Month(), latest.Day(), 0, 0, 0, 0, calendarZone).AddDate(0, 0, -1)
	q.LatestEndDate = adDay(latest)
	if adDay(start) < e.PoliticalAdsFrom || end.After(latest) {
		ee := adFieldErr(AdErrPoliticalOutsideWindow, adFieldEndDate,
			fmt.Sprintf("Ads for %s can run from %s to %s.", e.Name, e.PoliticalAdsFrom, q.LatestEndDate))
		ee.Extra = map[string]any{adKeyLatestEndDate: q.LatestEndDate}
		return ee
	}
	if e.Kind == domain.ElectionDistrictAssembly && !districtAssemblyAllowed(set, sponsor) {
		return adErr(AdErrDistrictAssembly, "District Assembly candidate ads aren't accepted (Article 248).")
	}
	q.election = e
	return nil
}

// districtAssemblyAllowed: switched on, and (when the sponsor is known) a
// candidate with an EC authorisation on file.
func districtAssemblyAllowed(set domain.AdSettings, sponsor *domain.AdSponsor) bool {
	if !set.AllowDistrictAssembly {
		return false
	}
	return sponsor == nil || (sponsor.EntityType == domain.AdEntityCandidate && sponsor.ECAuthorisationUploadID != "")
}

// checkIssueAd refuses any overlap of [start, end] with a blackout.
func (s *AdsService) checkIssueAd(ctx context.Context, start, end time.Time, q *AdQuote) error {
	if s.elections == nil {
		return nil
	}
	all, err := s.elections.All(ctx)
	if err != nil {
		return err
	}
	from, to := start, end.AddDate(0, 0, 1) // [start 00:00, end+1 00:00)
	for _, e := range all {
		bs, err1 := time.Parse(time.RFC3339, e.BlackoutStart)
		be, err2 := time.Parse(time.RFC3339, e.BlackoutEnd)
		if err1 != nil || err2 != nil || !from.Before(be) || !bs.Before(to) {
			continue
		}
		dayBefore := bs.In(calendarZone)
		dayBefore = time.Date(dayBefore.Year(), dayBefore.Month(), dayBefore.Day(), 0, 0, 0, 0, calendarZone).AddDate(0, 0, -1)
		q.LatestEndDate = adDay(dayBefore)
		ee := adFieldErr(AdErrPoliticalOutsideWindow, adFieldEndDate, fmt.Sprintf("Political ads pause for the %s blackout.", e.Name))
		ee.Extra = map[string]any{adKeyLatestEndDate: q.LatestEndDate}
		return ee
	}
	return nil
}

// ── inventory ───────────────────────────────────────────────────────────────

// forecast is a placement's expected daily opportunities: the mean of the
// last 28 observed days once at least 7 exist, else the fallback.
func (s *AdsService) forecast(ctx context.Context, price domain.AdPlacementPrice, today string) (int64, bool) {
	fallback := int64(price.FallbackDailyViews)
	if s.stats == nil {
		return fallback, false
	}
	t, err := parseAdDay(today)
	if err != nil {
		return fallback, false
	}
	rows, err := s.stats.PlacementDays(ctx, price.Slug, adDay(t.AddDate(0, 0, -adForecastWindowDays)), adDay(t.AddDate(0, 0, -1)))
	if err != nil {
		s.log.Warn("ads: placement history unavailable, using the fallback forecast", adFieldPlacement, price.Slug, logKeyErr, err)
		return fallback, false
	}
	if len(rows) < adForecastMinDays {
		return fallback, false
	}
	var sum int64
	for _, r := range rows {
		sum += r.Opportunities
	}
	return sum / int64(len(rows)), true
}

// available sums, over each day of the window, the sellable share of the
// forecast minus what booked campaigns have already committed that day.
func (s *AdsService) available(ctx context.Context, set domain.AdSettings, price domain.AdPlacementPrice, start, end time.Time, excludeID string) (int64, error) {
	daily, _ := s.forecast(ctx, price, s.today())
	capacity := daily * int64(set.SellThroughPercent) / 100
	booked, err := s.campaigns.Overlapping(ctx, price.Slug, adDay(start), adDay(end))
	if err != nil {
		return 0, err
	}
	commitments := s.commitments(booked, excludeID)
	var total int64
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		day := adDay(d)
		var committed int64
		for _, c := range commitments {
			if c.from <= day && day <= c.to {
				committed += c.perDay
			}
		}
		total += max(0, capacity-committed)
	}
	return total, nil
}

// adCommitment is one booked campaign's daily share of inventory.
type adCommitment struct {
	from, to string
	perDay   int64
}

// commitments turns the overlapping campaigns into daily shares, leaving out
// the campaign being rechecked and approvals that have lapsed unpaid.
func (s *AdsService) commitments(booked []domain.AdCampaign, excludeID string) []adCommitment {
	now := s.now()
	out := make([]adCommitment, 0, len(booked))
	for _, c := range booked {
		if c.ID == excludeID {
			continue
		}
		if c.Status == domain.AdStatusApproved && !c.ApprovalHeld(now) {
			continue
		}
		from, e1 := parseAdDay(c.StartDate)
		to, e2 := parseAdDay(c.EndDate)
		if e1 != nil || e2 != nil || to.Before(from) {
			continue
		}
		days := int64(adDaysBetween(from, to))
		out = append(out, adCommitment{from: c.StartDate, to: c.EndDate, perDay: (c.BookedImpressions + days - 1) / days})
	}
	return out
}
