package service

import (
	"context"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// Spec §3.6: net rounds up to the pesewa, tax rounds half up, total = net + tax.
func TestPriceAdRounding(t *testing.T) {
	cases := []struct {
		impressions, cpm      int64
		bps                   int
		net, tax, totalWanted int64
	}{
		{10_000, 5000, 0, 50_000, 0, 50_000},
		{1001, 4999, 1750, 5004, 876, 5880}, // 5,003.999 → 5,004; 875.7 → 876
		{1000, 1000, 25, 1000, 3, 1003},     // 2.5 rounds half up
		{1000, 1000, 24, 1000, 2, 1002},     // 2.4 rounds down
		{3000, 6000, 2000, 18_000, 3600, 21_600},
	}
	for _, c := range cases {
		p := PriceAd(c.impressions, c.cpm, c.bps, 7)
		if p.NetPesewas != c.net || p.TaxPesewas != c.tax || p.TotalPesewas != c.totalWanted || p.SettingsVersion != 7 || p.CpmPesewas != c.cpm {
			t.Errorf("PriceAd(%d, %d, %d) = %+v", c.impressions, c.cpm, c.bps, p)
		}
	}
}

func quoteIn() AdQuoteInput {
	return AdQuoteInput{Placement: domain.AdPlacementPortalFeedCard, StartDate: "2026-10-05", EndDate: "2026-10-18", Impressions: 3000}
}

func TestQuotePricesTheRateCardForEveryone(t *testing.T) {
	f := newAdFix(t, func(s *domain.AdSettings) { s.TaxRateBps = 2000 })
	q, err := f.svc.Quote(context.Background(), quoteIn())
	if err != nil {
		t.Fatal(err)
	}
	if q.Days != 14 || q.Price.NetPesewas != 15_000 || q.Price.TaxPesewas != 3000 || q.Price.TotalPesewas != 18_000 || q.Available != 7000 {
		t.Fatalf("quote = %+v", q)
	}
	if q.ExpiresAt != adNow.Add(30*time.Minute).Format(time.RFC3339) || q.LatestEndDate != "" {
		t.Fatalf("expiry/latest = %q %q", q.ExpiresAt, q.LatestEndDate)
	}
	// Equal rates: a submission by anyone prices exactly like the public quote.
	f.addSponsor("asp-2", domain.AdSponsorCommercial, domain.AdSponsorVerified)
	c := f.submit()
	if c.Price != q.Price {
		t.Fatalf("submitted price %+v differs from the quote %+v", c.Price, q.Price)
	}
}

func TestQuotePoliticalCPMAndMinimumOrder(t *testing.T) {
	f := newAdFix(t)
	f.addElection("elc-1", domain.ElectionParliamentaryBy, "2026-12-10")
	in := quoteIn()
	in.Political, in.PoliticalType, in.ElectionID = true, domain.AdPoliticalElection, "elc-1"
	q, err := f.svc.Quote(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	if q.Price.CpmPesewas != 7500 || q.Price.NetPesewas != 22_500 || q.LatestEndDate != "2026-12-08" {
		t.Fatalf("political quote = %+v", q)
	}

	f2 := newAdFix(t, func(s *domain.AdSettings) { s.MinOrderPesewas = 20_000 })
	_, err = f2.svc.Quote(context.Background(), quoteIn())
	ae, _ := err.(*AdError)
	if adCode(err) != AdErrBelowMinimumOrder || ae.Extra["minOrderPesewas"] != int64(20_000) {
		t.Fatalf("below minimum: %v %+v", err, ae)
	}
}

func TestQuoteRefusals(t *testing.T) {
	f := newAdFix(t)
	cases := map[string]struct {
		mutate func(*AdQuoteInput)
		code   string
		field  string
	}{
		"off-step":          {func(q *AdQuoteInput) { q.Impressions = 3500 }, AdErrInvalidImpressions, adFieldImpressions},
		"too few":           {func(q *AdQuoteInput) { q.Impressions = 2000 }, AdErrInvalidImpressions, adFieldImpressions},
		"too many":          {func(q *AdQuoteInput) { q.Impressions = 501_000 }, AdErrInvalidImpressions, adFieldImpressions},
		"unknown placement": {func(q *AdQuoteInput) { q.Placement = "sidebar" }, AdErrInvalidPlacement, adFieldPlacement},
		"app card is off":   {func(q *AdQuoteInput) { q.Placement = domain.AdPlacementAppCard }, AdErrInvalidPlacement, adFieldPlacement},
		"inside lead time":  {func(q *AdQuoteInput) { q.StartDate = "2026-10-03" }, AdErrInvalidDates, adFieldStartDate},
		"bad date":          {func(q *AdQuoteInput) { q.StartDate = "5 Oct" }, AdErrInvalidDates, adFieldStartDate},
		"ends before start": {func(q *AdQuoteInput) { q.EndDate = "2026-10-04" }, AdErrInvalidDates, adFieldEndDate},
		"too long":          {func(q *AdQuoteInput) { q.EndDate = "2026-12-04" }, AdErrInvalidDates, adFieldEndDate},
		"no political type": {func(q *AdQuoteInput) { q.Political = true }, AdErrInvalidDates, "politicalType"},
		"unknown election": {func(q *AdQuoteInput) {
			q.Political, q.PoliticalType, q.ElectionID = true, domain.AdPoliticalElection, "elc-none"
		}, AdErrElectionNotFound, adFieldElectionID},
	}
	for name, c := range cases {
		in := quoteIn()
		c.mutate(&in)
		_, err := f.svc.Quote(context.Background(), in)
		ae, _ := err.(*AdError)
		if ae == nil || ae.Code != c.code || ae.Field != c.field {
			t.Errorf("%s: err = %v (%+v), want %s on %s", name, err, ae, c.code, c.field)
		}
	}
}

func TestQuoteKillSwitches(t *testing.T) {
	off := newAdFix(t, func(s *domain.AdSettings) { s.AdsEnabled = false })
	if _, err := off.svc.Quote(context.Background(), quoteIn()); adCode(err) != AdErrAdsDisabled {
		t.Fatalf("ads off: %v", err)
	}
	noPol := newAdFix(t, func(s *domain.AdSettings) { s.PoliticalEnabled = false })
	in := quoteIn()
	in.Political, in.PoliticalType = true, domain.AdPoliticalIssue
	if _, err := noPol.svc.Quote(context.Background(), in); adCode(err) != AdErrPoliticalDisabled {
		t.Fatalf("political off: %v", err)
	}
	app := newAdFix(t, func(s *domain.AdSettings) {
		s.AppDeliveryEnabled = true
		for i := range s.Placements {
			if s.Placements[i].Slug == domain.AdPlacementAppCard {
				s.Placements[i].Active, s.Placements[i].FallbackDailyViews = true, 1000
			}
		}
	})
	in = quoteIn()
	in.Placement, in.Impressions = domain.AdPlacementAppCard, 4000
	if _, err := app.svc.Quote(context.Background(), in); err != nil {
		t.Fatalf("app card with delivery on: %v", err)
	}
}

// Election ads run inside politicalAdsFrom .. the day before the blackout;
// issue ads never overlap a blackout; District Assembly ads need the switch.
func TestQuotePoliticalWindows(t *testing.T) {
	f := newAdFix(t)
	f.addElection("elc-1", domain.ElectionParliamentaryBy, "2026-10-20") // blackout from 19 Oct 00:00
	in := quoteIn()
	in.Political, in.PoliticalType, in.ElectionID = true, domain.AdPoliticalElection, "elc-1"
	in.EndDate = "2026-10-19"
	_, err := f.svc.Quote(context.Background(), in)
	ae, _ := err.(*AdError)
	if adCode(err) != AdErrPoliticalOutsideWindow || ae.Extra["latestEndDate"] != "2026-10-18" {
		t.Fatalf("into the blackout: %v %+v", err, ae)
	}
	in.EndDate = "2026-10-18"
	if _, err := f.svc.Quote(context.Background(), in); err != nil {
		t.Fatalf("up to the day before: %v", err)
	}

	f.addElection("elc-later", domain.ElectionGeneral, "2027-06-01") // ads open 2027-03-03
	in.ElectionID = "elc-later"
	if _, err := f.svc.Quote(context.Background(), in); adCode(err) != AdErrPoliticalOutsideWindow {
		t.Fatalf("before politicalAdsFrom: %v", err)
	}

	f.addElection("elc-da", domain.ElectionDistrictAssembly, "2026-12-01")
	in.ElectionID = "elc-da"
	if _, err := f.svc.Quote(context.Background(), in); adCode(err) != AdErrDistrictAssembly {
		t.Fatalf("district assembly: %v", err)
	}
	da := newAdFix(t, func(s *domain.AdSettings) { s.AllowDistrictAssembly = true })
	da.addElection("elc-da", domain.ElectionDistrictAssembly, "2026-12-01")
	if _, err := da.svc.Quote(context.Background(), in); err != nil {
		t.Fatalf("district assembly allowed: %v", err)
	}

	issue := quoteIn()
	issue.Political, issue.PoliticalType = true, domain.AdPoliticalIssue
	issue.EndDate = "2026-10-19"
	_, err = f.svc.Quote(context.Background(), issue)
	ae, _ = err.(*AdError)
	if adCode(err) != AdErrPoliticalOutsideWindow || ae.Extra["latestEndDate"] != "2026-10-18" {
		t.Fatalf("issue ad over a blackout: %v", err)
	}
	issue.EndDate = "2026-10-18"
	if _, err := f.svc.Quote(context.Background(), issue); err != nil {
		t.Fatalf("issue ad before the blackout: %v", err)
	}
}

// Spec §3.6: forecast = fallback until 7 days of data, then the 28-day mean;
// booked campaigns commit ceil(booked/days) a day; maxAvailable rounds down.
func TestQuoteInventory(t *testing.T) {
	f := newAdFix(t, func(s *domain.AdSettings) {
		for i := range s.Placements {
			if s.Placements[i].Slug == domain.AdPlacementPortalFeedCard {
				s.Placements[i].FallbackDailyViews = 400 // 200 sellable a day
			}
		}
	})
	_, err := f.svc.Quote(context.Background(), quoteIn())
	ae, _ := err.(*AdError)
	if adCode(err) != AdErrInventoryUnavailable || ae.Extra["maxAvailable"] != int64(2000) {
		t.Fatalf("fallback forecast: %v %+v", err, ae)
	}

	// Six observed days are not enough; seven are: mean 1,000 → 500 a day.
	days := []domain.AdPlacementDay{}
	for i := 1; i <= 6; i++ {
		days = append(days, domain.AdPlacementDay{Placement: domain.AdPlacementPortalFeedCard, Day: adNow.AddDate(0, 0, -i).Format(time.DateOnly), Opportunities: 1000})
	}
	f.stats.Placement[domain.AdPlacementPortalFeedCard] = days
	if _, err := f.svc.Quote(context.Background(), quoteIn()); adCode(err) != AdErrInventoryUnavailable {
		t.Fatalf("six days still use the fallback: %v", err)
	}
	f.stats.Placement[domain.AdPlacementPortalFeedCard] = append(days,
		domain.AdPlacementDay{Placement: domain.AdPlacementPortalFeedCard, Day: "2026-09-25", Opportunities: 1000},
		domain.AdPlacementDay{Placement: domain.AdPlacementPortalFeedCard, Day: "2026-08-01", Opportunities: 99_999}) // outside 28 days
	q, err := f.svc.Quote(context.Background(), quoteIn())
	if err != nil || q.Available != 7000 {
		t.Fatalf("observed forecast: %+v %v", q, err)
	}
	view := f.svc.AdminSettings(context.Background())
	for _, fc := range view.Forecast {
		if fc.Slug == domain.AdPlacementPortalFeedCard && (fc.Source != forecastObserved || fc.DailyOpportunities != 1000) {
			t.Fatalf("admin forecast = %+v", fc)
		}
	}

	// A scheduled campaign of 1,400 over the same 14 days commits 100 a day;
	// an approval that lapsed unpaid commits nothing.
	f.ads.Put(domain.AdCampaign{ID: "ad-x", Placement: domain.AdPlacementPortalFeedCard, Status: domain.AdStatusScheduled, StartDate: "2026-10-05", EndDate: "2026-10-18", BookedImpressions: 1400})
	f.ads.Put(domain.AdCampaign{ID: "ad-y", Placement: domain.AdPlacementPortalFeedCard, Status: domain.AdStatusApproved, StartDate: "2026-10-05", EndDate: "2026-10-18", BookedImpressions: 7000, ApprovalExpiresAt: "2026-10-01T00:00:00Z"})
	q, err = f.svc.Quote(context.Background(), quoteIn())
	if err != nil || q.Available != 14*(500-100) {
		t.Fatalf("with a booked campaign: %+v %v", q, err)
	}
}
