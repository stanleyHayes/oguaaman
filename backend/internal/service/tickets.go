package service

import (
	"cmp"
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math"
	"net/url"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── event ticketing via Paystack (Phase 6) ────────────────────────────────────
//
// Same money flow as pledges: StartTicketPurchase records a pending Ticket and
// returns a Paystack authorization URL; the payer returns to the portal with a
// reference; ConfirmTicket verifies server-side before issuing the check-in
// code. Capacity counts SUCCESS tickets only — pending payments may expire, so
// they don't hold seats — which is why it is checked again when a payment
// confirms, not just when checkout starts: a tier never issues more seats than
// it has, and a buyer whose seat went to someone faster is flagged for refund.

// maxTicketsPerPurchase bounds one checkout (the clients offer 1–10).
const maxTicketsPerPurchase = 10

var (
	// ErrTicketQty is returned for quantities outside 1–maxTicketsPerPurchase.
	ErrTicketQty = errors.New("ticket quantity must be between 1 and 10")
	// ErrTierNotFound is returned when the event has no such tier.
	ErrTierNotFound = errors.New("ticket tier not found")
	// ErrSoldOut is returned when the tier has no capacity left.
	ErrSoldOut = errors.New("this tier is sold out")
	// ErrTicketWrongEvent is returned when a gate scans a code issued for a
	// different event.
	ErrTicketWrongEvent = errors.New("this ticket is for a different event — do not admit")
	// ErrCheckInEventRequired is returned when a check-in names no event.
	ErrCheckInEventRequired = errors.New("choose the event you are admitting guests to")
	// ErrSoldOutAfterPayment is returned when the tier filled up between the
	// buyer starting checkout and their payment confirming: no ticket is
	// issued and the paid ticket is flagged RefundDue for staff to refund.
	ErrSoldOutAfterPayment = errors.New("this tier sold out before your payment was confirmed, so no ticket was issued; your payment will be refunded")
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

// eventTiers parses details.tiers into typed tiers. Empty/absent means the
// event is free. The list arrives in whichever shape its source produced: seed
// literals ([]map[string]any), JSON ([]any of map[string]any) or — for every
// event read back from MongoDB — the driver's defaults (bson.A of bson.D).
func eventTiers(l *domain.Listing) []TicketTier {
	raw, ok := l.Details["tiers"]
	if !ok {
		return nil
	}
	out := []TicketTier{}
	for _, m := range documentList(raw) {
		name, _ := m["name"].(string)
		if name == "" {
			continue
		}
		out = append(out, TicketTier{Name: name, PricePesewas: asInt64(m["pricePesewas"]), Capacity: asInt(m["capacity"])})
	}
	return out
}

// documentList normalises a list of sub-documents to maps. It accepts any
// slice type (so the driver's named bson.A too) whose elements are string-keyed
// maps (map[string]any, bson.M) or ordered key/value documents (bson.D).
// Reflection keeps the service layer free of the Mongo driver.
func documentList(raw any) []map[string]any {
	rv := indirectPropertyValue(reflect.ValueOf(raw))
	if !rv.IsValid() || rv.Kind() != reflect.Slice {
		return nil
	}
	out := make([]map[string]any, 0, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		if m, ok := documentFields(rv.Index(i)); ok {
			out = append(out, m)
		}
	}
	return out
}

// documentFields reads one sub-document: a string-keyed map, or a slice of
// {Key, Value} structs (bson.D). Anything else is not a document.
func documentFields(v reflect.Value) (map[string]any, bool) {
	v = indirectPropertyValue(v)
	if !v.IsValid() {
		return nil, false
	}
	switch v.Kind() {
	case reflect.Map:
		if v.Type().Key().Kind() != reflect.String {
			return nil, false
		}
		m := make(map[string]any, v.Len())
		iter := v.MapRange()
		for iter.Next() {
			m[iter.Key().String()] = iter.Value().Interface()
		}
		return m, true
	case reflect.Slice:
		return keyValueFields(v)
	default:
		return nil, false
	}
}

// keyValueFields reads an ordered document — a slice of {Key string; Value}
// structs such as bson.D — into a map.
func keyValueFields(v reflect.Value) (map[string]any, bool) {
	m := make(map[string]any, v.Len())
	for i := 0; i < v.Len(); i++ {
		entry := indirectPropertyValue(v.Index(i))
		if !entry.IsValid() || entry.Kind() != reflect.Struct {
			return nil, false
		}
		key, val := entry.FieldByName("Key"), entry.FieldByName("Value")
		if !key.IsValid() || key.Kind() != reflect.String || !val.IsValid() || !val.CanInterface() {
			return nil, false
		}
		m[key.String()] = val.Interface()
	}
	return m, true
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
	// settlePauses are the waits between recounts while a ticket that ranks
	// first for contested seats waits for later claims to give theirs back.
	settlePauses []time.Duration
}

// defaultSettlePauses: about 1.5s in all, far longer than a confirm takes to
// recount and give a seat back.
var defaultSettlePauses = []time.Duration{
	25 * time.Millisecond, 50 * time.Millisecond, 100 * time.Millisecond,
	200 * time.Millisecond, 400 * time.Millisecond, 800 * time.Millisecond,
}

func NewTicketsService(l domain.ListingRepository, t domain.TicketRepository, n domain.NotificationRepository, ps PaystackClient, portalURL string) *TicketsService {
	return &TicketsService{listings: l, tickets: t, notifs: n, paystack: ps, portal: strings.TrimRight(portalURL, "/"), settlePauses: defaultSettlePauses}
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
			rem := max(tier.Capacity-v.Sold, 0)
			v.Remaining = &rem
		}
		views = append(views, v)
	}
	return &EventView{Event: *event, Tiers: views}, nil
}

// minTicketPesewas is the smallest ticket price (GH₵1), the same floor as
// pledges, orders and agent jobs.
const minTicketPesewas int64 = 100

// StartTicketPurchase records a pending ticket against an approved event tier
// and returns the Paystack authorization URL to redirect the buyer to.
func (s *TicketsService) StartTicketPurchase(ctx context.Context, slug, memberID, email, tierName string, qty int) (authorizationURL, accessCode, reference string, err error) {
	if qty < 1 || qty > maxTicketsPerPurchase {
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
	// A tier below GH₵1 can't be charged (P36: Paystack may refuse it), and
	// the total must fit in int64 pesewas (a wrapped product would sell seats
	// for almost nothing).
	if tier == nil || tier.PricePesewas < minTicketPesewas {
		return "", "", "", ErrTierNotFound
	}
	if tier.PricePesewas > math.MaxInt64/int64(qty) {
		return "", "", "", ErrTicketQty
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
	reference = newReference(RefPrefixTicket, event.Slug, strconv.FormatInt(now.UnixNano(), 10))
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
	if err := verifyCharge(ctx, s.paystack, reference, ticket.AmountPesewas, s.tickets.MarkFailed); err != nil {
		return nil, err
	}
	return s.fulfillTicket(ctx, ticket, true, ticket.AmountPesewas)
}

// FulfillTicket marks a ticket successful using an amount already verified by
// another gateway (e.g. Stripe). It is idempotent.
func (s *TicketsService) FulfillTicket(ctx context.Context, reference string, amountPesewas int64) (*domain.Ticket, error) {
	ticket, err := s.tickets.ByReference(ctx, reference)
	if err != nil {
		return nil, err
	}
	if ticket.Status == domain.PledgeSuccess {
		return ticket, nil
	}
	return s.fulfillTicket(ctx, ticket, true, amountPesewas)
}

func (s *TicketsService) fulfillTicket(ctx context.Context, ticket *domain.Ticket, success bool, amount int64) (*domain.Ticket, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if !success || (amount > 0 && amount < ticket.AmountPesewas) {
		_ = s.tickets.MarkFailed(ctx, ticket.Reference)
		return nil, ErrPaymentNotCompleted
	}
	// Seats are held only by issued tickets, so the tier may have filled since
	// this checkout started. Refuse before issuing when it clearly has.
	capacity, err := s.tierCapacity(ctx, ticket)
	if err != nil {
		return nil, err
	}
	fits, err := s.seatsFit(ctx, ticket, capacity)
	if err != nil {
		return nil, err
	}
	if !fits {
		return s.refuseSoldOut(ctx, ticket)
	}
	code, err := s.uniqueCode(ctx)
	if err != nil {
		return nil, err
	}
	// One conditional write issues the ticket and its code; concurrent confirms
	// of this reference race here and only the winner's code ever exists.
	claimed, err := s.tickets.MarkSuccess(ctx, ticket.Reference, now, code)
	if err != nil {
		return nil, err
	}
	if !claimed {
		return s.tickets.ByReference(ctx, ticket.Reference) // issued by a concurrent confirm
	}
	// Another buyer may have taken the last seats between the check above and
	// this claim. Recount with this ticket issued; if the tier is now over, give
	// the seat back unless this ticket wins it (winsContestedSeat). Every issuer
	// recounts after its own claim, so the last one to recount sees all the
	// others and a tier can never end up oversold. A claimed ticket finishes
	// settling even if the caller goes away.
	settle := context.WithoutCancel(ctx)
	if fits, err := s.seatsFit(settle, ticket, capacity); err == nil && !fits && !s.winsContestedSeat(settle, ticket, capacity) {
		return nil, s.revokeSoldOut(settle, ticket)
	}
	ticket.Status = domain.PledgeSuccess
	ticket.Code = code
	ticket.ConfirmedAt = now
	ticket.RefundDue, ticket.FailureReason = false, ""
	s.notifyEventOwner(ctx, ticket)
	return ticket, nil
}

// tierCapacity is the capacity of the ticket's tier on the event as it stands
// now; 0 means unlimited, or that the event/tier no longer exists (a paid
// ticket is then honoured rather than refused over an edit).
func (s *TicketsService) tierCapacity(ctx context.Context, ticket *domain.Ticket) (int, error) {
	event, err := s.listings.GetByID(ctx, ticket.EventID)
	var nf *domain.NotFoundError
	if errors.As(err, &nf) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	for _, tier := range eventTiers(event) {
		if tier.Name == ticket.Tier {
			return tier.Capacity, nil
		}
	}
	return 0, nil
}

// seatsFit reports whether the ticket's seats fit in its tier alongside every
// OTHER issued ticket (capacity 0 = unlimited).
func (s *TicketsService) seatsFit(ctx context.Context, ticket *domain.Ticket, capacity int) (bool, error) {
	if capacity <= 0 {
		return true, nil
	}
	tickets, err := s.tickets.ByEvent(ctx, ticket.EventID)
	if err != nil {
		return false, err
	}
	seats := ticket.Qty
	for _, t := range tickets {
		if t.Status == domain.PledgeSuccess && t.Tier == ticket.Tier && t.Reference != ticket.Reference {
			seats += t.Qty
		}
	}
	return seats <= capacity, nil
}

// winsContestedSeat settles a tier found over capacity right after this
// ticket's claim. Buyers whose payments confirm at the same moment can all
// claim before any of them recounts, so each sees the tier over, and giving
// every one of them a refund would leave the seats unsold. Instead each ranks
// the issued tickets in claim order (seatedInClaimOrder), which every confirm
// computes the same way: a ticket left unseated in that order gives its seat
// back at once, and a seated one waits for the later claims to give theirs
// back. It wins only once a recount fits: a later claim that recounted before
// this one claimed has kept its seat and won't give it back, so the tier is
// still never oversold.
func (s *TicketsService) winsContestedSeat(ctx context.Context, ticket *domain.Ticket, capacity int) bool {
	for i := 0; ; i++ {
		tickets, err := s.tickets.ByEvent(ctx, ticket.EventID)
		if err != nil {
			return false
		}
		issued, seated := seatedInClaimOrder(tickets, ticket, capacity)
		switch {
		case !seated:
			return false // the seats go to claims ranked before this one
		case issued <= capacity:
			return true // the later claims have given theirs back
		case i == len(s.settlePauses):
			return false // they kept theirs: they recounted before this claim
		}
		time.Sleep(s.settlePauses[i])
	}
}

// seatedInClaimOrder seats the issued tickets of the ticket's tier one by one
// in claim order — confirmedAt, then reference — skipping any that no longer
// fit. It returns the seats issued in all and whether the ticket is seated.
func seatedInClaimOrder(tickets []domain.Ticket, ticket *domain.Ticket, capacity int) (issued int, seated bool) {
	inTier := make([]domain.Ticket, 0, len(tickets))
	for _, t := range tickets {
		if t.Status == domain.PledgeSuccess && t.Tier == ticket.Tier {
			inTier = append(inTier, t)
			issued += t.Qty
		}
	}
	slices.SortFunc(inTier, func(a, b domain.Ticket) int {
		return cmp.Or(cmp.Compare(a.ConfirmedAt, b.ConfirmedAt), cmp.Compare(a.Reference, b.Reference))
	})
	taken := 0
	for _, t := range inTier {
		fits := taken+t.Qty <= capacity
		if t.Reference == ticket.Reference {
			return issued, fits
		}
		if fits {
			taken += t.Qty
		}
	}
	return issued, false
}

// revokeSoldOut withdraws a just-issued ticket whose seat went to a faster
// buyer and flags the payment for refund.
func (s *TicketsService) revokeSoldOut(ctx context.Context, ticket *domain.Ticket) error {
	if err := s.tickets.RevokeForRefund(ctx, ticket.Reference, domain.RefundReasonSoldOut); err != nil {
		return err
	}
	s.notifyBuyerRefundDue(ctx, ticket)
	return ErrSoldOutAfterPayment
}

// refuseSoldOut records a paid ticket that can't be seated as refund-due —
// unless a concurrent confirm of the same reference already issued it, in
// which case that ticket stands and is returned.
func (s *TicketsService) refuseSoldOut(ctx context.Context, ticket *domain.Ticket) (*domain.Ticket, error) {
	if err := s.tickets.MarkRefundDue(ctx, ticket.Reference, domain.RefundReasonSoldOut); err != nil {
		return nil, err
	}
	if cur, err := s.tickets.ByReference(ctx, ticket.Reference); err == nil && cur.Status == domain.PledgeSuccess {
		return cur, nil
	}
	s.notifyBuyerRefundDue(ctx, ticket)
	return nil, ErrSoldOutAfterPayment
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
		ID: newID(domain.PrefixNotification), MemberID: event.OwnerID,
		Kind:  "ticket",
		Title: "A ticket sold 🎟️",
		Body:  fmt.Sprintf("%d × %s for “%s” (GH₵ %.2f).%s", t.Qty, t.Tier, t.EventTitle, cedis, map[bool]string{true: " (Simulated — dev mode.)", false: ""}[t.Simulated]),
		Link:  "/events/" + t.EventSlug, CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

// notifyBuyerRefundDue tells a buyer their paid ticket could not be issued
// because the tier sold out first, and that the payment will be refunded.
func (s *TicketsService) notifyBuyerRefundDue(ctx context.Context, t *domain.Ticket) {
	if s.notifs == nil || t.MemberID == "" {
		return
	}
	_ = s.notifs.Insert(ctx, domain.Notification{
		ID: newID(domain.PrefixNotification), MemberID: t.MemberID,
		Kind:  "ticket",
		Title: "Ticket not issued — refund due",
		Body: fmt.Sprintf("%s for “%s” sold out before your payment was confirmed, so no ticket was issued. Your GH₵ %.2f will be refunded.",
			t.Tier, t.EventTitle, float64(t.AmountPesewas)/100),
		Link: "/events/" + t.EventSlug, CreatedAt: time.Now().UTC().Format(time.RFC3339),
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

// CheckIn admits one confirmed ticket by its code at the gate of ONE event —
// once only. The code must belong to that event: a cheap ticket for another
// event is refused (ErrTicketWrongEvent) rather than admitted. actorRole must
// be curator or steward; a second scan returns AlreadyCheckedInError with the
// original gate time.
func (s *TicketsService) CheckIn(ctx context.Context, eventSlug, code, actorRole string) (*domain.Ticket, error) {
	if actorRole != "curator" && actorRole != "steward" {
		return nil, &domain.ForbiddenError{Reason: "only curators and stewards can check tickets in"}
	}
	eventSlug = strings.TrimSpace(eventSlug)
	if eventSlug == "" {
		return nil, ErrCheckInEventRequired
	}
	event, err := s.listings.GetBySlug(ctx, domain.TypeEvent, eventSlug)
	if err != nil {
		return nil, err
	}
	ticket, err := s.tickets.ByCode(ctx, strings.ToUpper(strings.TrimSpace(code)))
	if err != nil {
		return nil, err
	}
	if ticket.EventID != event.ID {
		return nil, ErrTicketWrongEvent
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
