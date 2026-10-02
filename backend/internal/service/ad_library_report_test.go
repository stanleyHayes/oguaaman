package service

import (
	"context"
	"io"
	"log/slog"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── ad library ──────────────────────────────────────────────────────────────

func (f *serveFix) library() *AdLibraryService {
	l := NewAdLibraryService(f.ads, f.sponsors, slog.New(slog.NewTextHandler(io.Discard, nil)))
	l.now = func() time.Time { return f.clock }
	return l
}

// withHistory sets a campaign's status and the statuses it passed through.
func withHistory(status string, through ...string) func(*domain.AdCampaign) {
	return func(c *domain.AdCampaign) {
		c.Status, c.StatusHistory = status, nil
		from := ""
		for _, to := range append(through, status) {
			c.StatusHistory = append(c.StatusHistory, domain.AdStatusChange{From: from, To: to, At: "2026-09-30T10:00:00Z"})
			from = to
		}
	}
}

func libIDs(p *AdLibraryPage) []string {
	out := []string{}
	for _, it := range p.Items {
		out = append(out, it.ID)
	}
	return out
}

func TestAdLibraryPoliticalTab(t *testing.T) {
	f := newServeFix(t)
	f.addSponsor("asp-pol", domain.AdSponsorPolitical, domain.AdSponsorVerified)
	pol := func(id string, mutate ...func(*domain.AdCampaign)) {
		f.activeAd(id, append([]func(*domain.AdCampaign){political, func(c *domain.AdCampaign) { c.SponsorID = "asp-pol" }}, mutate...)...)
	}
	pol("ad-running")
	pol("ad-removed", withHistory(domain.AdStatusRemoved, domain.AdStatusPendingReview, domain.AdStatusApproved, domain.AdStatusActive),
		func(c *domain.AdCampaign) { c.RemovalReason = "Claimed results before the EC declared them." })
	pol("ad-completed", withHistory(domain.AdStatusCompleted, domain.AdStatusPendingReview, domain.AdStatusApproved, domain.AdStatusScheduled, domain.AdStatusActive),
		func(c *domain.AdCampaign) { c.RetainUntil = "2033-10-10T00:00:00Z"; c.RefundedPesewas = 1200 })
	pol("ad-past-retention", withHistory(domain.AdStatusCompleted, domain.AdStatusApproved, domain.AdStatusActive),
		func(c *domain.AdCampaign) { c.RetainUntil = "2026-01-01T00:00:00Z" })
	pol("ad-pending", withHistory(domain.AdStatusPendingReview))
	pol("ad-approved", withHistory(domain.AdStatusApproved, domain.AdStatusPendingReview), func(c *domain.AdCampaign) { c.PaymentStatus = domain.AdPaymentNone })
	pol("ad-rejected", withHistory(domain.AdStatusRejected, domain.AdStatusPendingReview))
	pol("ad-expired", withHistory(domain.AdStatusExpired, domain.AdStatusPendingReview, domain.AdStatusApproved))
	f.activeAd("ad-commercial")

	page, err := f.library().Library(context.Background(), AdLibraryQuery{Tab: "political"})
	if err != nil {
		t.Fatal(err)
	}
	got := strings.Join(libIDs(page), ",")
	for _, want := range []string{"ad-running", "ad-removed", "ad-completed"} {
		if !strings.Contains(got, want) {
			t.Errorf("political tab lacks %s: %s", want, got)
		}
	}
	for _, not := range []string{"ad-pending", "ad-approved", "ad-rejected", "ad-expired", "ad-commercial", "ad-past-retention"} {
		if strings.Contains(got, not+",") || strings.HasSuffix(got, not) {
			t.Errorf("political tab shows %s: %s", not, got)
		}
	}
	if page.Total != 3 || page.Page != 1 || page.PerPage != AdLibraryPerPage {
		t.Errorf("paging = %d/%d/%d", page.Total, page.Page, page.PerPage)
	}
	for _, it := range page.Items {
		if it.Chip != AdChipPolitical || it.SponsorLine != "Paid for by Ama Mensah" || it.LegalName != "Ama Mensah" ||
			it.CandidateName != "Ama Mensah" || it.Constituency != "Cape Coast North" || it.ElectionName == "" {
			t.Errorf("entry %s = %+v", it.ID, it)
		}
		if it.AmountPaidPesewas != 50_000 {
			t.Errorf("%s amount paid = %d", it.ID, it.AmountPaidPesewas)
		}
		switch it.ID {
		case "ad-removed":
			if it.Status != domain.AdStatusRemoved || it.RemovalReason == "" {
				t.Errorf("removed entry = %+v", it)
			}
		case "ad-completed":
			if it.RefundedPesewas != 1200 {
				t.Errorf("refunded = %d", it.RefundedPesewas)
			}
		}
	}
}

func TestAdLibraryRunningTabAndSearch(t *testing.T) {
	f := newServeFix(t)
	f.addSponsor("asp-pol", domain.AdSponsorPolitical, domain.AdSponsorVerified)
	f.activeAd("ad-com")
	f.activeAd("ad-pol", political, func(c *domain.AdCampaign) { c.SponsorID = "asp-pol" })
	f.activeAd("ad-done", withHistory(domain.AdStatusCompleted, domain.AdStatusApproved, domain.AdStatusActive))
	lib := f.library()
	page, err := lib.Library(context.Background(), AdLibraryQuery{Tab: "running"})
	if err != nil || page.Total != 2 {
		t.Fatalf("running = %v %v", libIDs(page), err)
	}
	for _, it := range page.Items {
		// A commercial entry shows only what readers saw: no legal name, no spend.
		if it.ID == "ad-com" && (it.LegalName != "" || it.AmountPaidPesewas != 0 || it.CandidateName != "" || it.Chip != AdChipCommercial || it.SponsorLine == "") {
			t.Errorf("commercial entry = %+v", it)
		}
		if it.ID == "ad-pol" && it.LegalName == "" {
			t.Errorf("political entry = %+v", it)
		}
	}
	page, _ = lib.Library(context.Background(), AdLibraryQuery{Tab: "running", Q: "  kotokuraba "})
	if ids := libIDs(page); len(ids) != 1 || ids[0] != "ad-com" {
		t.Fatalf("search = %v", ids)
	}
	// An unknown tab is the political tab; pages are clamped.
	page, _ = lib.Library(context.Background(), AdLibraryQuery{Tab: "everything", Page: -3})
	if page.Page != 1 || page.Total != 1 {
		t.Fatalf("defaults = page %d total %d", page.Page, page.Total)
	}
}

func TestAdLibraryPaginates(t *testing.T) {
	f := newServeFix(t)
	for i := range 25 {
		f.activeAd("ad-" + strconv.Itoa(100+i))
	}
	page, _ := f.library().Library(context.Background(), AdLibraryQuery{Tab: "running", Page: 2})
	if page.Total != 25 || len(page.Items) != 5 || page.Page != 2 {
		t.Fatalf("page 2 = %d items of %d", len(page.Items), page.Total)
	}
	if q := (AdLibraryQuery{Q: strings.Repeat("é", 300), Page: 5000}).normalise(); len([]rune(q.Q)) != adLibraryMaxQ || q.Page != adLibraryMaxPage {
		t.Fatalf("normalise = %d runes, page %d", len([]rune(q.Q)), q.Page)
	}
}

func TestAdLibraryUnpaidEntryShowsNoAmount(t *testing.T) {
	item := libraryItem(domain.AdCampaign{ID: "x", PaymentStatus: domain.AdPaymentPending, Price: domain.AdPriceSnapshot{TotalPesewas: 900}}, nil)
	if item.AmountPaidPesewas != 0 || item.LegalName != "" {
		t.Fatalf("item = %+v", item)
	}
}

// ── report ──────────────────────────────────────────────────────────────────

func (f *serveFix) report() *AdReportService {
	r := NewAdReportService(f.ads, f.delivery, slog.New(slog.NewTextHandler(io.Discard, nil)))
	r.now = func() time.Time { return f.clock }
	return r
}

func TestAdReportFigures(t *testing.T) {
	f := newServeFix(t)
	ctx := context.Background()
	// Commercial feed card: 5,000 CPM, paid in the window, 1,000 delivered.
	f.activeAd("ad-feed", func(c *domain.AdCampaign) { c.Delivered = 1000 })
	// Political banner: 9,000 CPM, 12 % tax, 400 delivered, a processed refund.
	f.activeAd("ad-pol", political, func(c *domain.AdCampaign) {
		c.Placement, c.Price, c.Delivered = domain.AdPlacementPortalHomeBanner, PriceAd(4000, 9000, 1200, 1), 400
		c.Status = domain.AdStatusCompleted
		c.Refunds = []domain.AdRefund{
			{ID: "r1", AmountPesewas: 2000, Status: domain.AdRefundProcessed, UpdatedAt: "2026-10-01T12:00:00Z"},
			{ID: "r2", AmountPesewas: 999, Status: domain.AdRefundPending, UpdatedAt: "2026-10-01T12:00:00Z"},
		}
	})
	// Simulated payment: delivery counts, money doesn't.
	f.activeAd("ad-sim", func(c *domain.AdCampaign) { c.Simulated, c.Delivered = true, 100 })
	// Paid before the window: no cash in the window, but still owes impressions.
	f.activeAd("ad-old", func(c *domain.AdCampaign) { c.PaidAt, c.Status = "2026-08-01T10:00:00Z", domain.AdStatusScheduled })

	_ = f.delivery.AddCounts(ctx,
		[]domain.AdCampaignDayDelta{
			{CampaignID: "ad-feed", Day: "2026-09-30", Views: 600, Unbilled: 30, Clicks: 12},
			{CampaignID: "ad-feed", Day: "2026-10-01", Views: 400, Unbilled: 10, Clicks: 3},
			{CampaignID: "ad-feed", Day: "2026-08-15", Views: 999, Clicks: 999}, // outside the window
			{CampaignID: "ad-pol", Day: "2026-10-01", Views: 400, Clicks: 4},
			{CampaignID: "ad-sim", Day: "2026-10-01", Views: 100, Unbilled: 1},
		},
		[]domain.AdPlacementDayDelta{
			{Placement: domain.AdPlacementPortalFeedCard, Day: "2026-09-30", Opportunities: 3000},
			{Placement: domain.AdPlacementPortalFeedCard, Day: "2026-10-01", Opportunities: 2000},
			{Placement: domain.AdPlacementPortalHomeBanner, Day: "2026-10-01", Opportunities: 800},
			{Placement: domain.AdPlacementPortalHomeBanner, Day: "2026-08-01", Opportunities: 9999},
		})

	r, err := f.report().Report(ctx, "2026-09-15", "2026-10-02")
	if err != nil {
		t.Fatal(err)
	}
	if r.From != "2026-09-15" || r.To != "2026-10-02" || len(r.Placements) != len(domain.AdPlacements) {
		t.Fatalf("window/placements = %s..%s %d", r.From, r.To, len(r.Placements))
	}
	rows := map[string]AdReportPlacement{}
	for _, p := range r.Placements {
		rows[p.Slug] = p
	}
	feed := rows[domain.AdPlacementPortalFeedCard]
	// 1,000 + 100 (simulated) billable; 5,000 CPM on the 1,000 paid views only.
	if feed.Opportunities != 5000 || feed.BillableImpressions != 1100 || feed.UnbilledImpressions != 41 || feed.Clicks != 15 ||
		feed.RecognizedNetPesewas != 5000 || feed.RPMPesewas != 1000 {
		t.Errorf("feed = %+v", feed)
	}
	if feed.FillRate != 0.22 || feed.CTR != 15.0/1100 {
		t.Errorf("feed ratios = fill %v ctr %v", feed.FillRate, feed.CTR)
	}
	banner := rows[domain.AdPlacementPortalHomeBanner]
	if banner.Opportunities != 800 || banner.BillableImpressions != 400 || banner.RecognizedNetPesewas != 3600 || banner.RPMPesewas != 4500 {
		t.Errorf("banner = %+v", banner)
	}
	if empty := rows[domain.AdPlacementAppCard]; empty.Opportunities != 0 || empty.CTR != 0 || empty.FillRate != 0 {
		t.Errorf("app card = %+v", empty)
	}
	tot := r.Totals
	polPrice := PriceAd(4000, 9000, 1200, 1)
	wantCash := int64(50_000) + polPrice.TotalPesewas
	if tot.Opportunities != 5800 || tot.BillableImpressions != 1500 || tot.RecognizedNetPesewas != 8600 ||
		tot.PoliticalNetPesewas != 3600 || tot.CashCollectedPesewas != wantCash || tot.TaxCollectedPesewas != polPrice.TaxPesewas ||
		tot.RefundedPesewas != 2000 {
		t.Errorf("totals = %+v (want cash %d tax %d)", tot, wantCash, polPrice.TaxPesewas)
	}
	// Owed now: ad-feed 9,000 + ad-sim 9,900 + ad-old 10,000 (ad-pol is completed).
	if tot.BookedRemaining != 9000+9900+10_000 {
		t.Errorf("booked remaining = %d", tot.BookedRemaining)
	}
	if tot.RPMPesewas != 8600*1000/5800 || tot.FillRate != 1500.0/5800 {
		t.Errorf("total ratios = rpm %d fill %v", tot.RPMPesewas, tot.FillRate)
	}
}

func TestAdReportWindow(t *testing.T) {
	f := newServeFix(t)
	r := f.report()
	from, to, err := r.reportWindow("", "")
	if err != nil || to != adServeToday || from != "2026-09-03" {
		t.Fatalf("default window = %s..%s %v", from, to, err)
	}
	if from, _, _ = r.reportWindow("", "2026-01-31"); from != "2026-01-02" {
		t.Errorf("default start = %s", from)
	}
	for _, tc := range [][2]string{{"2026-10-05", "2026-10-01"}, {"02/10/2026", ""}, {"", "tomorrow"}, {"2024-01-01", "2026-01-01"}} {
		if _, err := r.Report(context.Background(), tc[0], tc[1]); adCode(err) != AdErrInvalidDates {
			t.Errorf("%v: err = %v", tc, err)
		}
	}
	if _, _, err := r.reportWindow("2025-10-02", "2026-10-02"); err != nil {
		t.Errorf("366 days refused: %v", err)
	}
}

func TestAdReportWithoutDeliveryStore(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	r := NewAdReportService(f.ads, nil, nil)
	r.now = func() time.Time { return f.clock }
	out, err := r.Report(context.Background(), "", "")
	if err != nil || out.Totals.Opportunities != 0 || out.Totals.CashCollectedPesewas != 50_000 || out.Totals.BookedRemaining != 10_000 {
		t.Fatalf("report = %+v %v", out, err)
	}
}
