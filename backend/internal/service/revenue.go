package service

import (
	"context"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── revenue dashboard (Phase 8) ───────────────────────────────────────────────
//
// RevenueService aggregates the platform's four income streams into one
// overview for the steward back-office: crowdfunding fees (kept from pledges),
// ticket sales, business subscriptions and paid promotions. Read-only — every
// figure derives from the confirmed ledgers.

// PledgeRevenue is the platform-fee split across successful pledges.
type PledgeRevenue struct {
	GrossPesewas int64 `json:"grossPesewas"`
	FeePesewas   int64 `json:"feePesewas"` // platform income
	NetPesewas   int64 `json:"netPesewas"` // credited to projects
}

// StreamRevenue is one money stream's confirmed gross and transaction count.
type StreamRevenue struct {
	GrossPesewas int64 `json:"grossPesewas"`
	Count        int   `json:"count"`
}

// SubscriptionRevenue adds the count of currently-active subscriptions.
type SubscriptionRevenue struct {
	GrossPesewas int64 `json:"grossPesewas"`
	Count        int   `json:"count"`
	Active       int   `json:"active"`
}

// RevenueOverview is the GET /api/admin/revenue payload.
type RevenueOverview struct {
	Pledges       PledgeRevenue       `json:"pledges"`
	Tickets       StreamRevenue       `json:"tickets"`
	Subscriptions SubscriptionRevenue `json:"subscriptions"`
	Promotions    StreamRevenue       `json:"promotions"`
	// TotalPesewas is platform income: pledge fees + the gross of every
	// direct-sale stream (tickets, subscriptions, promotions).
	TotalPesewas int64 `json:"totalPesewas"`
}

// RevenueService reads across the four money ledgers.
type RevenueService struct {
	pledges    domain.PledgeRepository
	tickets    domain.TicketRepository
	subs       domain.SubscriptionRepository
	promotions domain.PromotionRepository
}

func NewRevenueService(p domain.PledgeRepository, t domain.TicketRepository, s domain.SubscriptionRepository, pr domain.PromotionRepository) *RevenueService {
	return &RevenueService{pledges: p, tickets: t, subs: s, promotions: pr}
}

// Overview sums every confirmed stream into the revenue dashboard payload.
func (s *RevenueService) Overview(ctx context.Context) (*RevenueOverview, error) {
	out := &RevenueOverview{}
	if err := s.sumPledges(ctx, out); err != nil {
		return nil, err
	}
	if err := s.sumTickets(ctx, out); err != nil {
		return nil, err
	}
	if err := s.sumSubscriptions(ctx, out); err != nil {
		return nil, err
	}
	if err := s.sumPromotions(ctx, out); err != nil {
		return nil, err
	}
	out.TotalPesewas = out.Pledges.FeePesewas + out.Tickets.GrossPesewas + out.Subscriptions.GrossPesewas + out.Promotions.GrossPesewas
	return out, nil
}

// sumPledges aggregates the platform-fee split across successful pledges.
func (s *RevenueService) sumPledges(ctx context.Context, out *RevenueOverview) error {
	pledges, err := s.pledges.All(ctx)
	if err != nil {
		return err
	}
	for _, p := range pledges {
		if p.Status != domain.PledgeSuccess {
			continue
		}
		out.Pledges.GrossPesewas += p.AmountPesewas
		out.Pledges.FeePesewas += p.FeePesewas
		out.Pledges.NetPesewas += p.NetPesewas
	}
	return nil
}

// sumTickets aggregates confirmed ticket sales.
func (s *RevenueService) sumTickets(ctx context.Context, out *RevenueOverview) error {
	tickets, err := s.tickets.All(ctx)
	if err != nil {
		return err
	}
	for _, t := range tickets {
		if t.Status != domain.PledgeSuccess {
			continue
		}
		out.Tickets.GrossPesewas += t.AmountPesewas
		out.Tickets.Count++
	}
	return nil
}

// sumSubscriptions aggregates confirmed subscription payments and the count of
// currently-active subscriptions.
func (s *RevenueService) sumSubscriptions(ctx context.Context, out *RevenueOverview) error {
	subs, err := s.subs.All(ctx)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	for _, sub := range subs {
		if sub.Status != domain.PledgeSuccess {
			continue
		}
		out.Subscriptions.GrossPesewas += sub.AmountPesewas
		out.Subscriptions.Count++
		if sub.PeriodEnd > now {
			out.Subscriptions.Active++
		}
	}
	return nil
}

// sumPromotions aggregates confirmed paid promotions.
func (s *RevenueService) sumPromotions(ctx context.Context, out *RevenueOverview) error {
	promos, err := s.promotions.All(ctx)
	if err != nil {
		return err
	}
	for _, p := range promos {
		if p.Status != domain.PledgeSuccess {
			continue
		}
		out.Promotions.GrossPesewas += p.AmountPesewas
		out.Promotions.Count++
	}
	return nil
}
