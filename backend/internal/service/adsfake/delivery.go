package adsfake

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// Delivery is an in-memory domain.AdDeliveryRepository.
type Delivery struct {
	mu         sync.Mutex
	ViewIDs    map[string]string // view id → campaign id
	Campaigns  map[string]*domain.AdCampaignDay
	Placements map[string]*domain.AdPlacementDay
	// FailAdd makes AddCounts fail (flush tests).
	FailAdd error
	// FailViews makes ViewsOn fail.
	FailViews error
	// ViewsOnCalls counts ViewsOn reads (slate cache tests).
	ViewsOnCalls int
}

// NewDelivery returns an empty store.
func NewDelivery() *Delivery {
	return &Delivery{
		ViewIDs: map[string]string{}, Campaigns: map[string]*domain.AdCampaignDay{}, Placements: map[string]*domain.AdPlacementDay{},
	}
}

func dayKey(id, day string) string { return id + "|" + day }

func (d *Delivery) InsertView(_ context.Context, viewID, campaignID string, _ time.Time) (bool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if _, dup := d.ViewIDs[viewID]; dup {
		return false, nil
	}
	d.ViewIDs[viewID] = campaignID
	return true, nil
}

func (d *Delivery) AddCounts(_ context.Context, campaigns []domain.AdCampaignDayDelta, placements []domain.AdPlacementDayDelta) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.FailAdd != nil {
		return d.FailAdd
	}
	for _, c := range campaigns {
		row := d.Campaigns[dayKey(c.CampaignID, c.Day)]
		if row == nil {
			row = &domain.AdCampaignDay{CampaignID: c.CampaignID, Day: c.Day}
			d.Campaigns[dayKey(c.CampaignID, c.Day)] = row
		}
		row.Views += c.Views
		row.Unbilled += c.Unbilled
		row.Clicks += c.Clicks
	}
	for _, p := range placements {
		row := d.Placements[dayKey(p.Placement, p.Day)]
		if row == nil {
			row = &domain.AdPlacementDay{Placement: p.Placement, Day: p.Day}
			d.Placements[dayKey(p.Placement, p.Day)] = row
		}
		row.Opportunities += p.Opportunities
	}
	return nil
}

func (d *Delivery) ViewsOn(_ context.Context, day string, ids []string) (map[string]int64, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.ViewsOnCalls++
	if d.FailViews != nil {
		return nil, d.FailViews
	}
	out := map[string]int64{}
	for _, id := range ids {
		if row := d.Campaigns[dayKey(id, day)]; row != nil {
			out[id] = row.Views
		}
	}
	return out, nil
}

// CampaignDay returns a copy of one campaign-day row (zero when absent).
func (d *Delivery) CampaignDay(id, day string) domain.AdCampaignDay {
	d.mu.Lock()
	defer d.mu.Unlock()
	if row := d.Campaigns[dayKey(id, day)]; row != nil {
		return *row
	}
	return domain.AdCampaignDay{CampaignID: id, Day: day}
}

// PlacementDay returns one placement-day's opportunities.
func (d *Delivery) PlacementDay(placement, day string) int64 {
	d.mu.Lock()
	defer d.mu.Unlock()
	if row := d.Placements[dayKey(placement, day)]; row != nil {
		return row.Opportunities
	}
	return 0
}

func (d *Delivery) CampaignDays(_ context.Context, id string) ([]domain.AdCampaignDay, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	out := []domain.AdCampaignDay{}
	for _, row := range d.Campaigns {
		if row.CampaignID == id {
			out = append(out, *row)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Day < out[j].Day })
	return out, nil
}

func (d *Delivery) PlacementDays(_ context.Context, placement, from, to string) ([]domain.AdPlacementDay, error) {
	rows, _ := d.PlacementDaysBetween(context.Background(), from, to)
	out := []domain.AdPlacementDay{}
	for _, row := range rows {
		if row.Placement == placement {
			out = append(out, row)
		}
	}
	return out, nil
}

func (d *Delivery) CampaignDaysBetween(_ context.Context, from, to string) ([]domain.AdCampaignDay, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	out := []domain.AdCampaignDay{}
	for _, row := range d.Campaigns {
		if row.Day >= from && row.Day <= to {
			out = append(out, *row)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Day < out[j].Day })
	return out, nil
}

func (d *Delivery) PlacementDaysBetween(_ context.Context, from, to string) ([]domain.AdPlacementDay, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	out := []domain.AdPlacementDay{}
	for _, row := range d.Placements {
		if row.Day >= from && row.Day <= to {
			out = append(out, *row)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Day < out[j].Day })
	return out, nil
}

func (d *Delivery) EnsureIndexes(context.Context) error { return nil }

var _ domain.AdDeliveryRepository = (*Delivery)(nil)
