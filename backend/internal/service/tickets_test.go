package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// fakeTickets is an in-memory TicketRepository.
type fakeTickets struct{ rows []domain.Ticket }

func (f *fakeTickets) Insert(_ context.Context, t domain.Ticket) error {
	f.rows = append(f.rows, t)
	return nil
}
func (f *fakeTickets) ByReference(_ context.Context, ref string) (*domain.Ticket, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			return &f.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "ticket"}
}

// MarkSuccess mirrors the repository's conditional write: only a ticket not
// already issued transitions, and the result says whether it did.
func (f *fakeTickets) MarkSuccess(_ context.Context, ref, at, code string) (bool, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status != domain.PledgeSuccess {
			f.rows[i].Status, f.rows[i].ConfirmedAt, f.rows[i].Code = domain.PledgeSuccess, at, code
			f.rows[i].RefundDue, f.rows[i].FailureReason = false, ""
			return true, nil
		}
	}
	return false, nil
}
func (f *fakeTickets) MarkFailed(_ context.Context, ref string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status != domain.PledgeSuccess {
			f.rows[i].Status = domain.PledgeFailed
		}
	}
	return nil
}
func (f *fakeTickets) MarkRefundDue(_ context.Context, ref, reason string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status != domain.PledgeSuccess {
			f.rows[i].Status, f.rows[i].RefundDue, f.rows[i].FailureReason = domain.PledgeFailed, true, reason
		}
	}
	return nil
}
func (f *fakeTickets) RevokeForRefund(_ context.Context, ref, reason string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status == domain.PledgeSuccess {
			f.rows[i].Status, f.rows[i].RefundDue, f.rows[i].FailureReason = domain.PledgeFailed, true, reason
			f.rows[i].Code, f.rows[i].ConfirmedAt = "", ""
		}
	}
	return nil
}
func (f *fakeTickets) ByEvent(_ context.Context, eventID string) ([]domain.Ticket, error) {
	out := []domain.Ticket{}
	for _, t := range f.rows {
		if t.EventID == eventID {
			out = append(out, t)
		}
	}
	return out, nil
}
func (f *fakeTickets) ByMember(_ context.Context, memberID string) ([]domain.Ticket, error) {
	out := []domain.Ticket{}
	for _, t := range f.rows {
		if t.MemberID == memberID {
			out = append(out, t)
		}
	}
	return out, nil
}
func (f *fakeTickets) ByCode(_ context.Context, code string) (*domain.Ticket, error) {
	for i := range f.rows {
		if f.rows[i].Code == code {
			return &f.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "ticket"}
}
func (f *fakeTickets) SetCheckedIn(_ context.Context, code, at string) error {
	for i := range f.rows {
		if f.rows[i].Code == code {
			f.rows[i].CheckedInAt = at
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "ticket"}
}
func (f *fakeTickets) All(context.Context) ([]domain.Ticket, error) { return f.rows, nil }
func (f *fakeTickets) ByEvents(_ context.Context, eventIDs []string) ([]domain.Ticket, error) {
	ids := map[string]bool{}
	for _, id := range eventIDs {
		ids[id] = true
	}
	var out []domain.Ticket
	for _, t := range f.rows {
		if ids[t.EventID] {
			out = append(out, t)
		}
	}
	return out, nil
}

func ticketsFixture(verifyOK bool, verifyAmount int64) (*TicketsService, *fakeTickets) {
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "e-1", Slug: "fetu-afahye-2026", Type: domain.TypeEvent, OwnerID: "m-nana", Status: domain.StatusApproved, Title: "Fetu Afahye 2026", Details: map[string]any{
			"tiers": []map[string]any{
				{"name": "Grand Durbar stand", "pricePesewas": int64(5_000), "capacity": 2},
				{"name": "Orange Friday carnival", "pricePesewas": int64(3_000), "capacity": 0},
			},
		}},
		{ID: "e-2", Slug: "free-prize-giving", Type: domain.TypeEvent, Status: domain.StatusApproved, Title: "Prize giving"},
		{ID: "e-3", Slug: "pending-gig", Type: domain.TypeEvent, Status: domain.StatusPending, Title: "Pending gig", Details: map[string]any{
			"tiers": []map[string]any{{"name": "Standard", "pricePesewas": int64(2_000), "capacity": 0}},
		}},
	}}
	tickets := &fakeTickets{}
	ps := &fakePaystack{verifyOK: verifyOK, verifyAmount: verifyAmount}
	svc := NewTicketsService(listings, tickets, stubNotifs{}, ps, "http://localhost:5173")
	return svc, tickets
}

// confirmed seeds a success ticket straight into the fake ledger.
func (f *fakeTickets) confirmed(eventID, tier string, qty int) {
	f.rows = append(f.rows, domain.Ticket{
		ID: "seed-" + eventID + "-" + tier, EventID: eventID, Tier: tier, Qty: qty,
		AmountPesewas: 5_000, Status: domain.PledgeSuccess, Code: "SEEDCODE" + tier[:1],
	})
}

func TestStartTicketPurchase_validation(t *testing.T) {
	svc, _ := ticketsFixture(true, 0)
	ctx := context.Background()

	if _, _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "Grand Durbar stand", 0); !errors.Is(err, ErrTicketQty) {
		t.Errorf("qty 0: expected ErrTicketQty, got %v", err)
	}
	if _, _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "", "Grand Durbar stand", 1); err == nil {
		t.Error("expected missing email to be rejected")
	}
	if _, _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "VIP", 1); !errors.Is(err, ErrTierNotFound) {
		t.Errorf("bad tier: expected ErrTierNotFound, got %v", err)
	}
	if _, _, _, err := svc.StartTicketPurchase(ctx, "free-prize-giving", "m-1", "a@b.c", "Standard", 1); !errors.Is(err, ErrTierNotFound) {
		t.Errorf("free event: expected ErrTierNotFound, got %v", err)
	}
	if _, _, _, err := svc.StartTicketPurchase(ctx, "pending-gig", "m-1", "a@b.c", "Standard", 1); err == nil {
		t.Error("expected buying into an unapproved event to be rejected")
	}
}

func TestStartTicketPurchase_capacity(t *testing.T) {
	svc, tickets := ticketsFixture(true, 0)
	ctx := context.Background()

	// One seat sold already; capacity 2.
	tickets.confirmed("e-1", "Grand Durbar stand", 1)

	// qty 2 would exceed capacity → rejected.
	if _, _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "Grand Durbar stand", 2); !errors.Is(err, ErrSoldOut) {
		t.Errorf("expected ErrSoldOut, got %v", err)
	}
	// The last seat is still buyable…
	if _, _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "Grand Durbar stand", 1); err != nil {
		t.Errorf("last seat should be buyable: %v", err)
	}
	// …and unlimited tiers never sell out.
	if _, _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "Orange Friday carnival", 10); err != nil {
		t.Errorf("unlimited tier should never sell out: %v", err)
	}
}

// One checkout buys 1–10 tickets; a huge quantity used to wrap the int64 price
// into a few cedis for quadrillions of seats (F143).
func TestStartTicketPurchase_boundsQuantityAndAmount(t *testing.T) {
	svc, tickets := ticketsFixture(true, 0)
	ctx := context.Background()
	for _, qty := range []int{-1, 0, 11, 1_844_674_407_370_956} {
		if _, _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "Orange Friday carnival", qty); !errors.Is(err, ErrTicketQty) {
			t.Errorf("qty %d: want ErrTicketQty, got %v", qty, err)
		}
	}
	if len(tickets.rows) != 0 {
		t.Fatalf("refused quantities must not record tickets, got %d", len(tickets.rows))
	}
	if _, _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "Orange Friday carnival", 10); err != nil {
		t.Fatalf("qty 10: %v", err)
	}
	if tickets.rows[0].AmountPesewas != 30_000 {
		t.Errorf("amount = %d, want 10 × 3000", tickets.rows[0].AmountPesewas)
	}
}

// Capacity is enforced when payment confirms, not only at checkout: two buyers
// who both started while seats looked free can't both be issued the last
// seats (F144/F145). The later one is flagged for refund, with no code.
func TestConfirmTicket_enforcesCapacityAtConfirmation(t *testing.T) {
	svc, tickets := ticketsFixture(true, 10_000)
	ctx := context.Background()
	// Capacity 2, none sold: both buyers pass the checkout check for 2 seats.
	_, _, refA, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-a", "a@example.com", "Grand Durbar stand", 2)
	if err != nil {
		t.Fatalf("buyer A start: %v", err)
	}
	_, _, refB, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-b", "b@example.com", "Grand Durbar stand", 2)
	if err != nil {
		t.Fatalf("buyer B start: %v", err)
	}
	if _, err := svc.ConfirmTicket(ctx, refA); err != nil {
		t.Fatalf("buyer A confirm: %v", err)
	}
	if _, err := svc.ConfirmTicket(ctx, refB); !errors.Is(err, ErrSoldOutAfterPayment) {
		t.Fatalf("buyer B confirm: want ErrSoldOutAfterPayment, got %v", err)
	}
	b, _ := tickets.ByReference(ctx, refB)
	if b.Status != domain.PledgeFailed || !b.RefundDue || b.Code != "" || b.FailureReason != domain.RefundReasonSoldOut {
		t.Errorf("buyer B ticket = %+v, want failed, refund due, no code", b)
	}
	view, _ := svc.EventView(ctx, "fetu-afahye-2026")
	if view.Tiers[0].Sold != 2 || *view.Tiers[0].Remaining != 0 {
		t.Errorf("sold/remaining = %d/%d, want 2/0 — never oversold", view.Tiers[0].Sold, *view.Tiers[0].Remaining)
	}
}

// When two confirms race for the last seats, the loser is revoked after its
// claim: its code is withdrawn and the payment flagged for refund.
func TestConfirmTicket_raceForLastSeatsNeverOversells(t *testing.T) {
	ctx := context.Background()
	svc, tickets := ticketsFixture(true, 10_000)
	ps := &racingPaystack{fakePaystack: fakePaystack{verifyOK: true, verifyAmount: 10_000}}
	svc.paystack = ps
	_, _, refA, _ := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-a", "a@example.com", "Grand Durbar stand", 2)
	_, _, refB, _ := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-b", "b@example.com", "Grand Durbar stand", 2)
	// B's confirm passes its capacity check, then A settles while B waits on Paystack.
	var errA error
	ps.meanwhile = func() { _, errA = svc.ConfirmTicket(ctx, refA) }
	_, errB := svc.ConfirmTicket(ctx, refB)
	if errA != nil {
		t.Fatalf("A (settled first): %v", errA)
	}
	if !errors.Is(errB, ErrSoldOutAfterPayment) {
		t.Fatalf("B: want ErrSoldOutAfterPayment, got %v", errB)
	}
	issued := 0
	for _, tk := range tickets.rows {
		if tk.Status == domain.PledgeSuccess {
			issued += tk.Qty
		}
	}
	if issued != 2 {
		t.Errorf("issued seats = %d, want exactly the capacity (2)", issued)
	}
}

// Concurrent confirms of ONE ticket issue one code, and every response shows
// the code that actually exists (F140).
func TestConfirmTicket_concurrentConfirmsIssueOneCode(t *testing.T) {
	ctx := context.Background()
	svc, tickets := ticketsFixture(true, 5_000)
	ps := &racingPaystack{fakePaystack: fakePaystack{verifyOK: true, verifyAmount: 5_000}}
	svc.paystack = ps
	_, _, ref, _ := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-a", "a@example.com", "Grand Durbar stand", 1)
	var inner *domain.Ticket
	ps.meanwhile = func() { inner, _ = svc.ConfirmTicket(ctx, ref) }
	outer, err := svc.ConfirmTicket(ctx, ref)
	if err != nil || inner == nil {
		t.Fatalf("confirms: outer err %v, inner %v", err, inner)
	}
	stored := tickets.rows[0].Code
	if outer.Code != stored || inner.Code != stored {
		t.Errorf("codes outer=%q inner=%q stored=%q — every response must show the stored code", outer.Code, inner.Code, stored)
	}
}

func TestEventView_soldAndRemaining(t *testing.T) {
	svc, tickets := ticketsFixture(true, 0)
	ctx := context.Background()
	tickets.confirmed("e-1", "Grand Durbar stand", 1)

	view, err := svc.EventView(ctx, "fetu-afahye-2026")
	if err != nil {
		t.Fatalf("EventView failed: %v", err)
	}
	if len(view.Tiers) != 2 {
		t.Fatalf("tiers = %d, want 2", len(view.Tiers))
	}
	if view.Tiers[0].Sold != 1 || view.Tiers[0].Remaining == nil || *view.Tiers[0].Remaining != 1 {
		t.Errorf("durbar sold/remaining = %d/%v, want 1/1", view.Tiers[0].Sold, view.Tiers[0].Remaining)
	}
	if view.Tiers[1].Remaining != nil {
		t.Errorf("unlimited tier should have nil remaining, got %v", *view.Tiers[1].Remaining)
	}
}

func TestTicketFlow_confirmIdempotent(t *testing.T) {
	svc, tickets := ticketsFixture(true, 5_000)
	ctx := context.Background()

	_, _, ref, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "ama@oguaa.test", "Grand Durbar stand", 1)
	if err != nil {
		t.Fatalf("StartTicketPurchase failed: %v", err)
	}
	if tickets.rows[0].Status != domain.PledgePending {
		t.Errorf("new ticket status = %q, want pending", tickets.rows[0].Status)
	}
	tk, err := svc.ConfirmTicket(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmTicket failed: %v", err)
	}
	if tk.Status != domain.PledgeSuccess {
		t.Errorf("confirmed status = %q, want success", tk.Status)
	}
	if len(tk.Code) != 8 || tk.Code != strings.ToUpper(tk.Code) {
		t.Errorf("code = %q, want an 8-char uppercase code", tk.Code)
	}

	// Idempotent: confirming again returns the same ticket, code unchanged.
	tk2, err := svc.ConfirmTicket(ctx, ref)
	if err != nil {
		t.Fatalf("second confirm errored: %v", err)
	}
	if tk2.Code != tk.Code {
		t.Errorf("double-confirm changed the code: %q → %q", tk.Code, tk2.Code)
	}
}

func TestConfirmTicket_failedVerification(t *testing.T) {
	svc, tickets := ticketsFixture(false, 0)
	ctx := context.Background()
	_, _, ref, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "ama@oguaa.test", "Grand Durbar stand", 1)
	if err != nil {
		t.Fatalf("StartTicketPurchase failed: %v", err)
	}
	if _, err := svc.ConfirmTicket(ctx, ref); err == nil {
		t.Error("expected confirm to fail when verification fails")
	}
	if tickets.rows[0].Status != domain.PledgeFailed {
		t.Errorf("ticket status = %q, want failed", tickets.rows[0].Status)
	}
	if tickets.rows[0].Code != "" {
		t.Errorf("failed ticket should have no code, got %q", tickets.rows[0].Code)
	}
}

func TestCheckIn_onceOnly(t *testing.T) {
	svc, tickets := ticketsFixture(true, 5_000)
	ctx := context.Background()
	_, _, ref, _ := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "ama@oguaa.test", "Grand Durbar stand", 1)
	tk, err := svc.ConfirmTicket(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmTicket failed: %v", err)
	}

	got, err := svc.CheckIn(ctx, "fetu-afahye-2026", tk.Code, "curator")
	if err != nil {
		t.Fatalf("first check-in failed: %v", err)
	}
	if got.CheckedInAt == "" {
		t.Error("expected CheckedInAt to be set")
	}
	// Second scan: rejected with the ORIGINAL gate time.
	_, err = svc.CheckIn(ctx, "fetu-afahye-2026", tk.Code, "curator")
	var used *AlreadyCheckedInError
	if !errors.As(err, &used) {
		t.Fatalf("expected AlreadyCheckedInError, got %v", err)
	}
	if used.At != got.CheckedInAt {
		t.Errorf("already-used time = %q, want original %q", used.At, got.CheckedInAt)
	}
	// A ticket whose payment never confirmed can't be admitted.
	_ = tickets.Insert(ctx, domain.Ticket{ID: "pending-1", EventID: "e-1", Tier: "Grand Durbar stand", Qty: 1, Status: domain.PledgePending, Code: "PENDING1"})
	if _, err := svc.CheckIn(ctx, "fetu-afahye-2026", "PENDING1", "curator"); err == nil {
		t.Error("expected an unconfirmed ticket to be refused at the gate")
	}
}

// A code only admits at its own event's gate: a cheap ticket for another
// event is refused and stays unused (F146).
func TestCheckIn_boundToEvent(t *testing.T) {
	svc, tickets := ticketsFixture(true, 5_000)
	ctx := context.Background()
	_ = tickets.Insert(ctx, domain.Ticket{ID: "other-1", EventID: "e-2", Tier: "Regular", Qty: 1, Status: domain.PledgeSuccess, Code: "PICNIC01"})
	if _, err := svc.CheckIn(ctx, "fetu-afahye-2026", "PICNIC01", "curator"); !errors.Is(err, ErrTicketWrongEvent) {
		t.Fatalf("other event's code: want ErrTicketWrongEvent, got %v", err)
	}
	if tickets.rows[0].CheckedInAt != "" {
		t.Error("a refused code must not be marked admitted")
	}
	if _, err := svc.CheckIn(ctx, "", "PICNIC01", "curator"); !errors.Is(err, ErrCheckInEventRequired) {
		t.Errorf("no event: want ErrCheckInEventRequired, got %v", err)
	}
	if _, err := svc.CheckIn(ctx, "free-prize-giving", "picnic01", "curator"); err != nil {
		t.Errorf("own event's gate: %v", err)
	}
}

func TestCheckIn_nonCuratorRejected(t *testing.T) {
	svc, tickets := ticketsFixture(true, 5_000)
	ctx := context.Background()
	_, _, ref, _ := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "ama@oguaa.test", "Grand Durbar stand", 1)
	tk, err := svc.ConfirmTicket(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmTicket failed: %v", err)
	}
	if _, err := svc.CheckIn(ctx, "fetu-afahye-2026", tk.Code, "member"); err == nil {
		t.Fatal("expected a member check-in to be rejected")
	} else {
		var fb *domain.ForbiddenError
		if !errors.As(err, &fb) {
			t.Errorf("expected ForbiddenError, got %v", err)
		}
	}
	if tickets.rows[0].CheckedInAt != "" {
		t.Error("rejected check-in must not mark the ticket")
	}
}

// P36: ticket tiers are at least GH₵1 when saved and when bought, so Paystack
// is never asked to charge a few pesewas.
func TestTicketTiers_minimumOneCedi(t *testing.T) {
	if _, err := cleanEventTiers([]any{map[string]any{"name": "Cheap", "pricePesewas": int64(50)}}); err == nil {
		t.Error("a 50-pesewa tier was saved")
	}
	if _, err := cleanEventTiers([]any{map[string]any{"name": "Standard", "pricePesewas": int64(100)}}); err != nil {
		t.Errorf("a GH₵1 tier was refused: %v", err)
	}
	svc, _ := ticketsFixture(true, 50)
	listings := svc.listings.(*fakeRepo)
	listings.listings[0].Details["tiers"] = []map[string]any{{"name": "Legacy", "pricePesewas": int64(50), "capacity": 0}}
	if _, _, _, err := svc.StartTicketPurchase(context.Background(), "fetu-afahye-2026", "m-1", "a@b.c", "Legacy", 1); !errors.Is(err, ErrTierNotFound) {
		t.Fatalf("legacy sub-cedi tier: err=%v, want ErrTierNotFound", err)
	}
}
