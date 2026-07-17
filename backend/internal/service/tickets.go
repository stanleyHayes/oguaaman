package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── event ticketing via Paystack (Phase 6) ────────────────────────────────────
//
// Same money flow as pledges: StartTicketPurchase records a pending Ticket and
// returns a Paystack authorization URL; the payer returns to the portal with a
// reference; ConfirmTicket verifies server-side before issuing the check-in
// code. Capacity is enforced against SUCCESS tickets only — pending payments
// may expire, so they don't hold seats (keep it simple).

var (
	// ErrTicketQty is returned for quantities below 1.
	ErrTicketQty = errors.New("ticket quantity must be at least 1")
	// ErrTierNotFound is returned when the event has no such tier.
	ErrTierNotFound = errors.New("ticket tier not found")
	// ErrSoldOut is returned when the tier has no capacity left.
	ErrSoldOut = errors.New("this tier is sold out")
)

// AlreadyCheckedInError carries the original gate time, so staff can tell the
// holder when their ticket was first admitted.
type AlreadyCheckedInError struct{ At string }

func (e *AlreadyCheckedInError) Error() string { return "ticket already checked in at " + e.At }

// TicketTier is one purchasable tier defined on an event (details.tiers).
// Capacity 0 (or omitted) means unlimited.
type TicketTier struct {
	Name         string `json:"name"`
	PricePesewas int64  `json:"pricePesewas"`
	Capacity     int    `json:"capacity"`
}

// TicketTierView adds live sales numbers for the public event page.
type TicketTierView struct {
	TicketTier
	Sold      int  `json:"sold"`
	Remaining *int `json:"remaining"` // nil when unlimited
}

// EventView is the event detail page payload: the approved event plus its
// tiers with sold/remaining counts.
type EventView struct {
	Event domain.Listing   `json:"event"`
	Tiers []TicketTierView `json:"tiers"`
}

// eventTiers parses details.tiers (seed []map[string]any or BSON-decoded []any)
// into typed tiers. Empty/absent means the event is free.
func eventTiers(l *domain.Listing) []TicketTier {
	raw, ok := l.Details["tiers"]
	if !ok {
		return nil
	}
	out := []TicketTier{}
	parse := func(m map[string]any) {
		name, _ := m["name"].(string)
		if name == "" {
			return
		}
		out = append(out, TicketTier{Name: name, PricePesewas: asInt64(m["pricePesewas"]), Capacity: asInt(m["capacity"])})
	}
	switch rows := raw.(type) {
	case []map[string]any:
		for _, m := range rows {
			parse(m)
		}
	case []any:
		for _, v := range rows {
			if m, ok := v.(map[string]any); ok {
				parse(m)
			}
		}
	}
	return out
}

// asInt64 / asInt coerce JSON- or BSON-decoded numbers (seed literals, mongo
// int32/int64, JSON float64) like the mongo package's toInt.
func asInt64(v any) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int32:
		return int64(n)
	case float64:
		return int64(n)
	case int:
		return int64(n)
	default:
		return 0
	}
}

func asInt(v any) int { return int(asInt64(v)) }

// TicketsService runs the ticket flow. Standalone (like PaymentsService) so the
// core Service stays read/moderation-focused.
type TicketsService struct {
	listings domain.ListingRepository
	tickets  domain.TicketRepository
	notifs   domain.NotificationRepository
	paystack PaystackClient
	portal   string // public portal origin for callback URLs
}

func NewTicketsService(l domain.ListingRepository, t domain.TicketRepository, n domain.NotificationRepository, ps PaystackClient, portalURL string) *TicketsService {
	return &TicketsService{listings: l, tickets: t, notifs: n, paystack: ps, portal: strings.TrimRight(portalURL, "/")}
}

// Simulated reports whether tickets run against the labelled simulation.
func (s *TicketsService) Simulated() bool { return s.paystack.Simulated() }

// approvedEvent loads an event only if it's public; anything else is a 404.
func (s *TicketsService) approvedEvent(ctx context.Context, slug string) (*domain.Listing, error) {
	event, err := s.listings.GetBySlug(ctx, domain.TypeEvent, slug)
	if err != nil {
		return nil, err
	}
	if event.Status != domain.StatusApproved {
		return nil, &domain.NotFoundError{Entity: "event"}
	}
	return event, nil
}

// tierSold sums confirmed quantities for one tier (pending tickets don't hold
// seats — they may never complete).
func (s *TicketsService) tierSold(ctx context.Context, eventID string) (map[string]int, error) {
	tickets, err := s.tickets.ByEvent(ctx, eventID)
	if err != nil {
		return nil, err
	}
	sold := map[string]int{}
	for _, t := range tickets {
		if t.Status == domain.PledgeSuccess {
			sold[t.Tier] += t.Qty
		}
	}
	return sold, nil
}

// EventView is the public event detail: the approved event plus tiers each
// with a sold count and remaining seats (nil when unlimited).
func (s *TicketsService) EventView(ctx context.Context, slug string) (*EventView, error) {
	event, err := s.approvedEvent(ctx, slug)
	if err != nil {
		return nil, err
	}
	sold, err := s.tierSold(ctx, event.ID)
	if err != nil {
		return nil, err
	}
	views := []TicketTierView{}
	for _, tier := range eventTiers(event) {
		v := TicketTierView{TicketTier: tier, Sold: sold[tier.Name]}
		if tier.Capacity > 0 {
			rem := tier.Capacity - v.Sold
			v.Remaining = &rem
		}
		views = append(views, v)
	}
	return &EventView{Event: *event, Tiers: views}, nil
}

// StartTicketPurchase records a pending ticket against an approved event tier
// and returns the Paystack authorization URL to redirect the buyer to.
func (s *TicketsService) StartTicketPurchase(ctx context.Context, slug, memberID, email, tierName string, qty int) (authorizationURL, accessCode, reference string, err error) {
	if qty < 1 {
		return "", "", "", ErrTicketQty
	}
	email = strings.TrimSpace(email)
	if email == "" {
		return "", "", "", fmt.Errorf("an email is required for the ticket receipt")
	}
	event, err := s.approvedEvent(ctx, slug)
	if err != nil {
		return "", "", "", err
	}
	tiers := eventTiers(event)
	var tier *TicketTier
	for i := range tiers {
		if tiers[i].Name == tierName {
			tier = &tiers[i]
			break
		}
	}
	if tier == nil {
		return "", "", "", ErrTierNotFound
	}
	if tier.Capacity > 0 {
		sold, err := s.tierSold(ctx, event.ID)
		if err != nil {
			return "", "", "", err
		}
		if sold[tier.Name]+qty > tier.Capacity {
			return "", "", "", ErrSoldOut
		}
	}
	now := time.Now().UTC()
	reference = fmt.Sprintf("tkt-%s-%d", event.Slug, now.UnixNano())
	ticket := domain.Ticket{
		ID:            "t" + reference,
		Reference:     reference,
		EventID:       event.ID,
		EventSlug:     event.Slug,
		EventTitle:    event.Title,
		MemberID:      memberID,
		Email:         email,
		Tier:          tier.Name,
		Qty:           qty,
		AmountPesewas: tier.PricePesewas * int64(qty),
		Status:        domain.PledgePending,
		Simulated:     s.paystack.Simulated(),
		CreatedAt:     now.Format(time.RFC3339),
	}
	if err := s.tickets.Insert(ctx, ticket); err != nil {
		return "", "", "", err
	}
	callback := fmt.Sprintf("%s/events/%s?ticket_ref=%s", s.portal, event.Slug, url.QueryEscape(reference))
	authURL, accessCode, err := s.paystack.Initialize(ctx, email, ticket.AmountPesewas, "GHS", reference, callback)
	if err != nil {
		return "", "", "", err
	}
	return authURL, accessCode, reference, nil
}

// ConfirmTicket verifies a transaction with Paystack and, on first success,
// marks the ticket and issues its check-in code. Idempotent: a ticket already
// confirmed (e.g. webhook then redirect) is returned as-is, code unchanged.
func (s *TicketsService) ConfirmTicket(ctx context.Context, reference string) (*domain.Ticket, error) {
	ticket, err := s.tickets.ByReference(ctx, reference)
	if err != nil {
		return nil, err
	}
	if ticket.Status == domain.PledgeSuccess {
		return ticket, nil // already settled
	}
	success, amount, err := s.paystack.Verify(ctx, reference)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if !success || (amount > 0 && amount < ticket.AmountPesewas) {
		_ = s.tickets.UpdateStatus(ctx, reference, domain.PledgeFailed, now)
		return nil, fmt.Errorf("payment was not completed")
	}
	code, err := s.uniqueCode(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.tickets.UpdateStatus(ctx, reference, domain.PledgeSuccess, now); err != nil {
		return nil, err
	}
	if err := s.tickets.SetCode(ctx, reference, code); err != nil {
		return nil, err
	}
	ticket.Status = domain.PledgeSuccess
	ticket.Code = code
	ticket.ConfirmedAt = now
	s.notifyEventOwner(ctx, ticket)
	return ticket, nil
}

// uniqueCode mints an 8-char check-in code, retrying on the (astronomically
// unlikely) collision with an existing ticket.
func (s *TicketsService) uniqueCode(ctx context.Context) (string, error) {
	for range 3 {
		code, err := newTicketCode()
		if err != nil {
			return "", err
		}
		if _, err := s.tickets.ByCode(ctx, code); err != nil {
			var nf *domain.NotFoundError
			if errors.As(err, &nf) {
				return code, nil // free
			}
			return "", err
		}
	}
	return "", fmt.Errorf("could not mint a unique ticket code")
}

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no ambiguous 0/O or 1/I

func newTicketCode() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = codeAlphabet[b[i]%byte(len(codeAlphabet))]
	}
	return string(b), nil
}

// notifyEventOwner tells the event's organiser a ticket sold.
func (s *TicketsService) notifyEventOwner(ctx context.Context, t *domain.Ticket) {
	if s.notifs == nil {
		return
	}
	event, err := s.listings.GetByID(ctx, t.EventID)
	if err != nil || event.OwnerID == "" {
		return
	}
	cedis := float64(t.AmountPesewas) / 100
	_ = s.notifs.Insert(ctx, domain.Notification{
		ID: "ntf-" + fmt.Sprintf("%d", time.Now().UnixNano()), MemberID: event.OwnerID,
		Kind:  "ticket",
		Title: "A ticket sold 🎟️",
		Body:  fmt.Sprintf("%d × %s for “%s” (GH₵ %.2f).%s", t.Qty, t.Tier, t.EventTitle, cedis, map[bool]string{true: " (Simulated — dev mode.)", false: ""}[t.Simulated]),
		Link:  "/events/" + t.EventSlug, CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

// MemberTickets lists a member's own tickets, newest first.
func (s *TicketsService) MemberTickets(ctx context.Context, memberID string) ([]domain.Ticket, error) {
	tickets, err := s.tickets.ByMember(ctx, memberID)
	if err != nil {
		return nil, err
	}
	// Newest first.
	for i, j := 0, len(tickets)-1; i < j; i, j = i+1, j-1 {
		tickets[i], tickets[j] = tickets[j], tickets[i]
	}
	return tickets, nil
}

// EventTickets is the admin sales ledger for one event, newest first.
func (s *TicketsService) EventTickets(ctx context.Context, slug string) ([]domain.Ticket, error) {
	event, err := s.listings.GetBySlug(ctx, domain.TypeEvent, slug)
	if err != nil {
		return nil, err
	}
	tickets, err := s.tickets.ByEvent(ctx, event.ID)
	if err != nil {
		return nil, err
	}
	for i, j := 0, len(tickets)-1; i < j; i, j = i+1, j-1 {
		tickets[i], tickets[j] = tickets[j], tickets[i]
	}
	return tickets, nil
}

// CheckIn admits one confirmed ticket by its code — once only. actorRole must
// be curator or steward; a second scan returns an AlreadyCheckedInError
// carrying the original gate time.
func (s *TicketsService) CheckIn(ctx context.Context, code, actorRole string) (*domain.Ticket, error) {
	if actorRole != "curator" && actorRole != "steward" {
		return nil, &domain.ForbiddenError{Reason: "only curators and stewards can check tickets in"}
	}
	ticket, err := s.tickets.ByCode(ctx, strings.ToUpper(strings.TrimSpace(code)))
	if err != nil {
		return nil, err
	}
	if ticket.Status != domain.PledgeSuccess {
		return nil, fmt.Errorf("this ticket is not confirmed")
	}
	if ticket.CheckedInAt != "" {
		return nil, &AlreadyCheckedInError{At: ticket.CheckedInAt}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := s.tickets.SetCheckedIn(ctx, ticket.Code, now); err != nil {
		return nil, err
	}
	ticket.CheckedInAt = now
	return ticket, nil
}
