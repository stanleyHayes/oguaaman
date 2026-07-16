package service

import (
	"context"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── creator dashboard (Creator Platform plan §4) ─────────────────────────────
//
// CreatorService aggregates one signed-in creator's KPIs: their listings by
// status, live promotions/subscription, and what their events and projects
// have earned. Read-only — every figure derives from the same ledgers the
// steward revenue dashboard reads.

// CreatorOverview is the GET /api/creator/overview payload.
type CreatorOverview struct {
	Listings             int    `json:"listings"` // all listings the creator owns
	Live                 int    `json:"live"`     // approved
	Pending              int    `json:"pending"`  // in the moderation queue
	ActivePromotions     int    `json:"activePromotions"`
	PromotionDaysLeft    int    `json:"promotionDaysLeft"` // summed remaining days across placements
	ActiveSubscription   bool   `json:"activeSubscription"`
	Plan                 string `json:"plan,omitempty"`
	TicketsSold          int    `json:"ticketsSold"`
	TicketsGrossPesewas  int64  `json:"ticketsGrossPesewas"`
	PledgesRaisedPesewas int64  `json:"pledgesRaisedPesewas"` // net credited to their projects
	ViewsThisMonth       int    `json:"viewsThisMonth"`
}

// CreatorService reads across listings + the money ledgers, scoped to one owner.
type CreatorService struct {
	listings   domain.ListingRepository
	pledges    domain.PledgeRepository
	tickets    domain.TicketRepository
	subs       domain.SubscriptionRepository
	promotions domain.PromotionRepository
}

func NewCreatorService(l domain.ListingRepository, p domain.PledgeRepository, t domain.TicketRepository, s domain.SubscriptionRepository, pr domain.PromotionRepository) *CreatorService {
	return &CreatorService{listings: l, pledges: p, tickets: t, subs: s, promotions: pr}
}

// Overview aggregates the signed-in creator's dashboard KPIs.
func (c *CreatorService) Overview(ctx context.Context, memberID string) (CreatorOverview, error) {
	var ov CreatorOverview
	owned, err := c.listings.Find(ctx, domain.ListingFilter{OwnerID: memberID})
	if err != nil {
		return ov, err
	}
	eventIDs, projectIDs := []string{}, []string{}
	for _, l := range owned {
		ov.Listings++
		switch l.Status {
		case domain.StatusApproved:
			ov.Live++
		case domain.StatusPending:
			ov.Pending++
		}
		switch l.Type {
		case domain.TypeEvent:
			eventIDs = append(eventIDs, l.ID)
		case domain.TypeProject:
			projectIDs = append(projectIDs, l.ID)
		}
	}
	now := time.Now().UTC()
	nowISO := now.Format(time.RFC3339)

	promos, err := c.promotions.ByMember(ctx, memberID)
	if err != nil {
		return ov, err
	}
	for _, p := range promos {
		if p.Status != domain.PledgeSuccess {
			continue
		}
		at := p.ConfirmedAt
		if at == "" {
			at = p.CreatedAt
		}
		t, err := time.Parse(time.RFC3339, at)
		if err != nil {
			continue
		}
		if until := t.AddDate(0, 0, p.Days); until.After(now) {
			ov.ActivePromotions++
			ov.PromotionDaysLeft += int(until.Sub(now).Hours()/24) + 1
		}
	}

	subs, err := c.subs.ByMember(ctx, memberID)
	if err != nil {
		return ov, err
	}
	for _, s := range subs {
		if s.Status == domain.PledgeSuccess && s.PeriodEnd > nowISO {
			ov.ActiveSubscription = true
			ov.Plan = s.Plan
		}
	}

	for _, id := range eventIDs {
		ts, err := c.tickets.ByEvent(ctx, id)
		if err != nil {
			return ov, err
		}
		for _, t := range ts {
			if t.Status == domain.PledgeSuccess {
				ov.TicketsSold += t.Qty
				ov.TicketsGrossPesewas += t.AmountPesewas
			}
		}
	}

	if len(projectIDs) > 0 {
		mine := map[string]bool{}
		for _, id := range projectIDs {
			mine[id] = true
		}
		pledges, err := c.pledges.All(ctx)
		if err != nil {
			return ov, err
		}
		for _, p := range pledges {
			if p.Status == domain.PledgeSuccess && mine[p.ProjectID] {
				ov.PledgesRaisedPesewas += p.NetPesewas
			}
		}
	}
	listingIDs := make([]string, len(owned))
	for i, l := range owned {
		listingIDs[i] = l.ID
	}
	if views, err := c.listings.ViewsThisMonth(ctx, listingIDs); err == nil {
		ov.ViewsThisMonth = views
	}
	return ov, nil
}
