package domain

import (
	"context"
	"time"
)

// ── ad delivery: views, clicks and opportunities (spec §3.3, §3.9) ──────────
//
// Serving keeps its counters in memory and the ads scheduler flushes them
// every five minutes as $inc upserts into two daily collections:
//   - ad_campaign_days  {_id "<campaignId>|<day>", campaignId, day, views, unbilled, clicks}
//   - ad_placement_days {_id "<placement>|<day>", placement, day, opportunities}
//
// Every beacon's view id also goes into ad_views (TTL 48 h), so a replayed
// beacon is never billed twice. The billable count on the campaign itself
// (AdRepository.IncrDelivered) is the source of truth for billing; the daily
// rows feed pacing, the forecast and the revenue report.

// AdCampaignDayDelta is an increment to one campaign's row for one day.
type AdCampaignDayDelta struct {
	CampaignID string
	Day        string // YYYY-MM-DD, Accra
	Views      int64  // billable
	Unbilled   int64
	Clicks     int64
}

// AdPlacementDayDelta is an increment to one placement's opportunities on
// one day.
type AdPlacementDayDelta struct {
	Placement     string
	Day           string // YYYY-MM-DD, Accra
	Opportunities int64
}

// AdDeliveryRepository stores ad delivery (ad_views, ad_campaign_days,
// ad_placement_days). It also reads them for the ads core (AdStatsReader).
type AdDeliveryRepository interface {
	AdStatsReader
	// InsertView records a beacon's view id. It reports false, without an
	// error, when the id was already recorded (a duplicate beacon).
	InsertView(ctx context.Context, viewID, campaignID string, at time.Time) (bool, error)
	// AddCounts applies the increments as upserts. Rows with nothing to add
	// are skipped.
	AddCounts(ctx context.Context, campaigns []AdCampaignDayDelta, placements []AdPlacementDayDelta) error
	// ViewsOn returns each listed campaign's stored billable views on day
	// (campaigns without a row are absent).
	ViewsOn(ctx context.Context, day string, campaignIDs []string) (map[string]int64, error)
	// CampaignDaysBetween returns every campaign's rows for days in [from, to].
	CampaignDaysBetween(ctx context.Context, from, to string) ([]AdCampaignDay, error)
	// PlacementDaysBetween returns every placement's rows for days in [from, to].
	PlacementDaysBetween(ctx context.Context, from, to string) ([]AdPlacementDay, error)
	EnsureIndexes(ctx context.Context) error
}
