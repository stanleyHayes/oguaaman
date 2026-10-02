package service

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── paid advertising: the delivery and revenue report (spec §3.11, §4.6) ────
//
// GET /api/admin/ads/report?from=&to= (curator). Delivery figures come from
// the daily counters (up to one scheduler pass, five minutes, behind). Money
// figures leave out simulated payments, like the revenue streams:
//   - recognizedNetPesewas: views delivered in the window × the campaign's
//     locked CPM / 1000 (net of tax), per campaign rounded down;
//   - rpmPesewas: recognized net per 1,000 opportunities;
//   - cash and tax collected: campaigns paid in the window;
//   - refunded: refunds processed in the window;
//   - bookedRemaining: impressions still owed by scheduled, active and paused
//     campaigns now, whatever the window.

const (
	adReportDefaultDays = 30
	adReportMaxDays     = 366
	adReportFieldFrom   = "from"
	adReportFieldTo     = "to"
)

// AdReportMetrics are the delivery figures of one placement or of all.
type AdReportMetrics struct {
	Opportunities        int64   `json:"opportunities"`
	BillableImpressions  int64   `json:"billableImpressions"`
	UnbilledImpressions  int64   `json:"unbilledImpressions"`
	Clicks               int64   `json:"clicks"`
	CTR                  float64 `json:"ctr"`      // clicks / billable
	FillRate             float64 `json:"fillRate"` // billable / opportunities
	RecognizedNetPesewas int64   `json:"recognizedNetPesewas"`
	RPMPesewas           int64   `json:"rpmPesewas"`
}

// AdReportPlacement is one placement's row.
type AdReportPlacement struct {
	Slug string `json:"slug"`
	AdReportMetrics
}

// AdReportTotals is every placement together, with the money figures.
type AdReportTotals struct {
	AdReportMetrics
	CashCollectedPesewas int64 `json:"cashCollectedPesewas"`
	RefundedPesewas      int64 `json:"refundedPesewas"`
	TaxCollectedPesewas  int64 `json:"taxCollectedPesewas"`
	BookedRemaining      int64 `json:"bookedRemaining"`
	PoliticalNetPesewas  int64 `json:"politicalNetPesewas"`
}

// AdDeliveryReport is the report payload. From and To echo the window used.
type AdDeliveryReport struct {
	From       string              `json:"from"`
	To         string              `json:"to"`
	Placements []AdReportPlacement `json:"placements"`
	Totals     AdReportTotals      `json:"totals"`
}

// AdReportService builds the report.
type AdReportService struct {
	campaigns domain.AdRepository
	delivery  domain.AdDeliveryRepository
	log       *slog.Logger
	now       func() time.Time
}

// NewAdReportService builds the report service. Without a delivery store
// the delivery figures are zero.
func NewAdReportService(campaigns domain.AdRepository, delivery domain.AdDeliveryRepository, log *slog.Logger) *AdReportService {
	if log == nil {
		log = slog.Default()
	}
	return &AdReportService{campaigns: campaigns, delivery: delivery, log: log, now: time.Now}
}

// reportWindow resolves from/to (YYYY-MM-DD, inclusive). Missing ends
// default to the 30 days up to today.
func (s *AdReportService) reportWindow(from, to string) (string, string, error) {
	end := s.now().In(calendarZone)
	if to != "" {
		t, err := parseAdDay(to)
		if err != nil {
			return "", "", adFieldErr(AdErrInvalidDates, adReportFieldTo, "Give the end date as YYYY-MM-DD.")
		}
		end = t
	}
	start := end.AddDate(0, 0, 1-adReportDefaultDays)
	if from != "" {
		t, err := parseAdDay(from)
		if err != nil {
			return "", "", adFieldErr(AdErrInvalidDates, adReportFieldFrom, "Give the start date as YYYY-MM-DD.")
		}
		start = t
	}
	if adDay(start) > adDay(end) {
		return "", "", adFieldErr(AdErrInvalidDates, adReportFieldFrom, "The start date must be on or before the end date.")
	}
	if adDaysBetween(start, end) > adReportMaxDays {
		return "", "", adFieldErr(AdErrInvalidDates, adReportFieldFrom, "Report on at most 366 days at a time.")
	}
	return adDay(start), adDay(end), nil
}

// adCampaignWindow is one campaign's delivery inside the window.
type adCampaignWindow struct{ views, unbilled, clicks int64 }

// Report builds the report for [from, to].
func (s *AdReportService) Report(ctx context.Context, from, to string) (*AdDeliveryReport, error) {
	from, to, err := s.reportWindow(from, to)
	if err != nil {
		return nil, err
	}
	opportunities, delivered, err := s.deliveryIn(ctx, from, to)
	if err != nil {
		return nil, err
	}
	paid, _, err := s.campaigns.List(ctx, domain.AdFilter{PaymentStatus: domain.AdPaymentSuccess})
	if err != nil {
		return nil, err
	}
	byID := make(map[string]domain.AdCampaign, len(paid))
	for _, c := range paid {
		byID[c.ID] = c
	}
	s.loadMissing(ctx, byID, delivered)

	rows := map[string]*AdReportMetrics{}
	for _, p := range domain.AdPlacements {
		rows[p.Slug] = &AdReportMetrics{Opportunities: opportunities[p.Slug]}
	}
	out := &AdDeliveryReport{From: from, To: to, Placements: make([]AdReportPlacement, 0, len(domain.AdPlacements))}
	for id, d := range delivered {
		c, ok := byID[id]
		if row := rows[c.Placement]; ok && row != nil {
			net := addDelivery(row, c, d)
			if c.Political {
				out.Totals.PoliticalNetPesewas += net
			}
		}
	}
	for _, p := range domain.AdPlacements {
		m := *rows[p.Slug]
		m.derive()
		out.Placements = append(out.Placements, AdReportPlacement{Slug: p.Slug, AdReportMetrics: m})
		out.Totals.add(m)
	}
	out.Totals.derive()
	for _, c := range byID {
		out.Totals.addMoney(c, from, to)
	}
	return out, nil
}

// deliveryIn sums the window's daily counters: opportunities per placement
// and delivery per campaign.
func (s *AdReportService) deliveryIn(ctx context.Context, from, to string) (map[string]int64, map[string]adCampaignWindow, error) {
	opportunities := map[string]int64{}
	delivered := map[string]adCampaignWindow{}
	if s.delivery == nil {
		return opportunities, delivered, nil
	}
	placementDays, err := s.delivery.PlacementDaysBetween(ctx, from, to)
	if err != nil {
		return nil, nil, err
	}
	for _, d := range placementDays {
		opportunities[d.Placement] += d.Opportunities
	}
	campaignDays, err := s.delivery.CampaignDaysBetween(ctx, from, to)
	if err != nil {
		return nil, nil, err
	}
	for _, d := range campaignDays {
		w := delivered[d.CampaignID]
		w.views += d.Views
		w.unbilled += d.Unbilled
		w.clicks += d.Clicks
		delivered[d.CampaignID] = w
	}
	return opportunities, delivered, nil
}

// loadMissing fetches campaigns that delivered in the window but are not in
// the paid list (their unbilled views and clicks still belong to a
// placement). Campaigns that no longer exist are skipped.
func (s *AdReportService) loadMissing(ctx context.Context, byID map[string]domain.AdCampaign, delivered map[string]adCampaignWindow) {
	for id := range delivered {
		if _, ok := byID[id]; ok {
			continue
		}
		c, err := s.campaigns.Get(ctx, id)
		var nf *domain.NotFoundError
		switch {
		case err == nil && c != nil:
			byID[id] = *c
		case err != nil && !errors.As(err, &nf):
			s.log.Warn("ads report: campaign lookup failed", logKeyCampaign, id, logKeyErr, err)
		}
	}
}

// addDelivery adds a campaign's window delivery to its placement's row and
// returns the net recognised for it.
func addDelivery(row *AdReportMetrics, c domain.AdCampaign, d adCampaignWindow) int64 {
	row.BillableImpressions += d.views
	row.UnbilledImpressions += d.unbilled
	row.Clicks += d.clicks
	if c.Simulated || c.PaymentStatus != domain.AdPaymentSuccess {
		return 0
	}
	net := d.views * c.Price.CpmPesewas / 1000
	row.RecognizedNetPesewas += net
	return net
}

// derive fills the ratios from the counts.
func (m *AdReportMetrics) derive() {
	m.CTR, m.FillRate, m.RPMPesewas = 0, 0, 0
	if m.BillableImpressions > 0 {
		m.CTR = float64(m.Clicks) / float64(m.BillableImpressions)
	}
	if m.Opportunities > 0 {
		m.FillRate = float64(m.BillableImpressions) / float64(m.Opportunities)
		m.RPMPesewas = m.RecognizedNetPesewas * 1000 / m.Opportunities
	}
}

// add sums one placement's counts into the totals.
func (t *AdReportTotals) add(m AdReportMetrics) {
	t.Opportunities += m.Opportunities
	t.BillableImpressions += m.BillableImpressions
	t.UnbilledImpressions += m.UnbilledImpressions
	t.Clicks += m.Clicks
	t.RecognizedNetPesewas += m.RecognizedNetPesewas
}

// addMoney adds a campaign's cash, tax and refunds in the window, and what
// it still owes in impressions now.
func (t *AdReportTotals) addMoney(c domain.AdCampaign, from, to string) {
	switch c.Status {
	case domain.AdStatusScheduled, domain.AdStatusActive, domain.AdStatusPaused:
		t.BookedRemaining += max(0, c.BookedImpressions-c.Delivered)
	}
	if c.Simulated || c.PaymentStatus != domain.AdPaymentSuccess {
		return
	}
	if instantInWindow(c.PaidAt, from, to) {
		t.CashCollectedPesewas += c.Price.TotalPesewas
		t.TaxCollectedPesewas += c.Price.TaxPesewas
	}
	for _, r := range c.Refunds {
		if r.Status == domain.AdRefundProcessed && instantInWindow(r.UpdatedAt, from, to) {
			t.RefundedPesewas += r.AmountPesewas
		}
	}
}

// instantInWindow reports whether an RFC3339 instant falls on an Accra day in
// [from, to].
func instantInWindow(at, from, to string) bool {
	t, err := time.Parse(time.RFC3339, at)
	if err != nil {
		return false
	}
	day := adDay(t)
	return from <= day && day <= to
}
