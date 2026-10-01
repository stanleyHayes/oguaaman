package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
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

// CreatorEarnings is the GET /api/creator/earnings payload. Rows are
// organiser-safe projections: never a buyer's check-in code (a gate
// credential), payment reference (which would let anyone read the ticket back
// through the confirm endpoint) or member id.
type CreatorEarnings struct {
	TicketSales []CreatorTicketSale `json:"ticketSales"`
	Pledges     []CreatorPledge     `json:"pledges"`
}

// CreatorTicketSale is one ticket sale as its organiser sees it.
type CreatorTicketSale struct {
	ID            string `json:"id"` // opaque row key, not derived reversibly from the reference
	EventID       string `json:"eventId"`
	EventSlug     string `json:"eventSlug"`
	EventTitle    string `json:"eventTitle"`
	Tier          string `json:"tier"`
	Qty           int    `json:"qty"`
	AmountPesewas int64  `json:"amountPesewas"`
	Status        string `json:"status"`
	CheckedIn     bool   `json:"checkedIn"`
	Simulated     bool   `json:"simulated,omitempty"`
	CreatedAt     string `json:"createdAt"`
	ConfirmedAt   string `json:"confirmedAt,omitempty"`
}

// CreatorPledge is one pledge or donation as its recipient sees it.
type CreatorPledge struct {
	ID            string `json:"id"` // opaque row key
	Kind          string `json:"kind,omitempty"`
	ProjectID     string `json:"projectId"`
	ProjectSlug   string `json:"projectSlug"`
	ProjectTitle  string `json:"projectTitle"`
	Message       string `json:"message,omitempty"`
	Anonymous     bool   `json:"anonymous,omitempty"`
	AmountPesewas int64  `json:"amountPesewas"`
	FeePesewas    int64  `json:"feePesewas,omitempty"`
	NetPesewas    int64  `json:"netPesewas,omitempty"`
	Currency      string `json:"currency"`
	Status        string `json:"status"`
	Simulated     bool   `json:"simulated,omitempty"`
	CreatedAt     string `json:"createdAt"`
	ConfirmedAt   string `json:"confirmedAt,omitempty"`
}

// opaqueRowID is a stable list key for a ledger row that reveals nothing
// about its payment reference.
func opaqueRowID(id string) string {
	sum := sha256.Sum256([]byte("creator-earnings:" + id))
	return hex.EncodeToString(sum[:8])
}

func toCreatorTicketSale(t domain.Ticket) CreatorTicketSale {
	return CreatorTicketSale{
		ID: opaqueRowID(t.ID), EventID: t.EventID, EventSlug: t.EventSlug, EventTitle: t.EventTitle,
		Tier: t.Tier, Qty: t.Qty, AmountPesewas: t.AmountPesewas, Status: t.Status,
		CheckedIn: t.CheckedInAt != "", Simulated: t.Simulated, CreatedAt: t.CreatedAt, ConfirmedAt: t.ConfirmedAt,
	}
}

func toCreatorPledge(p domain.Pledge) CreatorPledge {
	return CreatorPledge{
		ID: opaqueRowID(p.ID), Kind: p.Kind, ProjectID: p.ProjectID, ProjectSlug: p.ProjectSlug, ProjectTitle: p.ProjectTitle,
		Message: p.Message, Anonymous: p.Anonymous, AmountPesewas: p.AmountPesewas, FeePesewas: p.FeePesewas,
		NetPesewas: p.NetPesewas, Currency: p.Currency, Status: p.Status, Simulated: p.Simulated,
		CreatedAt: p.CreatedAt, ConfirmedAt: p.ConfirmedAt,
	}
}

// Earnings returns all tickets sold to the creator's events and all pledges
// to the creator's projects, for the ledger view.
func (c *CreatorService) Earnings(ctx context.Context, memberID string) (CreatorEarnings, error) {
	var out CreatorEarnings
	owned, err := c.listings.Find(ctx, domain.ListingFilter{OwnerID: memberID})
	if err != nil {
		return out, err
	}
	eventIDs, projectIDs := []string{}, []string{}
	for _, l := range owned {
		switch l.Type {
		case domain.TypeEvent:
			eventIDs = append(eventIDs, l.ID)
		case domain.TypeProject:
			projectIDs = append(projectIDs, l.ID)
		}
	}
	out.TicketSales = []CreatorTicketSale{}
	out.Pledges = []CreatorPledge{}
	if len(eventIDs) > 0 {
		tickets, err := c.tickets.ByEvents(ctx, eventIDs)
		if err != nil {
			return out, err
		}
		for _, t := range tickets {
			out.TicketSales = append(out.TicketSales, toCreatorTicketSale(t))
		}
	}
	for _, pid := range projectIDs {
		pledges, err := c.pledges.ByProject(ctx, pid)
		if err != nil {
			return out, err
		}
		for _, p := range pledges {
			out.Pledges = append(out.Pledges, toCreatorPledge(p))
		}
	}
	return out, nil
}

// activePlacements counts the owner's listings whose PAID placement is still
// running and sums the days left. Promotions stack onto a listing's current
// window, so each listing's real end is read from the listing itself
// (promotedUntil, or featuredUntil for placements paid before promotedUntil
// existed) — never recomputed per purchase from its confirm date, which
// under-counts stacked purchases.
func activePlacements(owned []domain.Listing, promos []domain.Promotion, now time.Time) (active, daysLeft int) {
	paid := map[string]bool{}
	for _, p := range promos {
		if p.Status == domain.PledgeSuccess {
			paid[p.ListingID] = true
		}
	}
	for _, l := range owned {
		end := l.PromotedUntil
		if end == "" && paid[l.ID] {
			end = l.FeaturedUntil
		}
		until, err := time.Parse(time.RFC3339, end)
		if err != nil || !until.After(now) {
			continue
		}
		active++
		daysLeft += int(until.Sub(now).Hours()/24) + 1
	}
	return active, daysLeft
}

// Overview is the GET /api/creator/overview payload for one owner.
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
	ov.ActivePromotions, ov.PromotionDaysLeft = activePlacements(owned, promos, now)

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
