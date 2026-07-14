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
func (f *fakeTickets) UpdateStatus(_ context.Context, ref, status, at string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			f.rows[i].Status = status
			if status == domain.PledgeSuccess {
				f.rows[i].ConfirmedAt = at
			}
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "ticket"}
}
func (f *fakeTickets) SetCode(_ context.Context, ref, code string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			f.rows[i].Code = code
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "ticket"}
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

	if _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "Grand Durbar stand", 0); !errors.Is(err, ErrTicketQty) {
		t.Errorf("qty 0: expected ErrTicketQty, got %v", err)
	}
	if _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "", "Grand Durbar stand", 1); err == nil {
		t.Error("expected missing email to be rejected")
	}
	if _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "VIP", 1); !errors.Is(err, ErrTierNotFound) {
		t.Errorf("bad tier: expected ErrTierNotFound, got %v", err)
	}
	if _, _, err := svc.StartTicketPurchase(ctx, "free-prize-giving", "m-1", "a@b.c", "Standard", 1); !errors.Is(err, ErrTierNotFound) {
		t.Errorf("free event: expected ErrTierNotFound, got %v", err)
	}
	if _, _, err := svc.StartTicketPurchase(ctx, "pending-gig", "m-1", "a@b.c", "Standard", 1); err == nil {
		t.Error("expected buying into an unapproved event to be rejected")
	}
}

func TestStartTicketPurchase_capacity(t *testing.T) {
	svc, tickets := ticketsFixture(true, 0)
	ctx := context.Background()

	// One seat sold already; capacity 2.
	tickets.confirmed("e-1", "Grand Durbar stand", 1)

	// qty 2 would exceed capacity → rejected.
	if _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "Grand Durbar stand", 2); !errors.Is(err, ErrSoldOut) {
		t.Errorf("expected ErrSoldOut, got %v", err)
	}
	// The last seat is still buyable…
	if _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "Grand Durbar stand", 1); err != nil {
		t.Errorf("last seat should be buyable: %v", err)
	}
	// …and unlimited tiers never sell out.
	if _, _, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "a@b.c", "Orange Friday carnival", 50); err != nil {
		t.Errorf("unlimited tier should never sell out: %v", err)
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

	_, ref, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "ama@oguaa.test", "Grand Durbar stand", 1)
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
	_, ref, err := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "ama@oguaa.test", "Grand Durbar stand", 1)
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
	_, ref, _ := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "ama@oguaa.test", "Grand Durbar stand", 1)
	tk, err := svc.ConfirmTicket(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmTicket failed: %v", err)
	}

	got, err := svc.CheckIn(ctx, tk.Code, "curator")
	if err != nil {
		t.Fatalf("first check-in failed: %v", err)
	}
	if got.CheckedInAt == "" {
		t.Error("expected CheckedInAt to be set")
	}
	// Second scan: rejected with the ORIGINAL gate time.
	_, err = svc.CheckIn(ctx, tk.Code, "curator")
	var used *AlreadyCheckedInError
	if !errors.As(err, &used) {
		t.Fatalf("expected AlreadyCheckedInError, got %v", err)
	}
	if used.At != got.CheckedInAt {
		t.Errorf("already-used time = %q, want original %q", used.At, got.CheckedInAt)
	}
	// A ticket whose payment never confirmed can't be admitted.
	_ = tickets.Insert(ctx, domain.Ticket{ID: "pending-1", EventID: "e-1", Tier: "Grand Durbar stand", Qty: 1, Status: domain.PledgePending, Code: "PENDING1"})
	if _, err := svc.CheckIn(ctx, "PENDING1", "curator"); err == nil {
		t.Error("expected an unconfirmed ticket to be refused at the gate")
	}
}

func TestCheckIn_nonCuratorRejected(t *testing.T) {
	svc, tickets := ticketsFixture(true, 5_000)
	ctx := context.Background()
	_, ref, _ := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-1", "ama@oguaa.test", "Grand Durbar stand", 1)
	tk, err := svc.ConfirmTicket(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmTicket failed: %v", err)
	}
	if _, err := svc.CheckIn(ctx, tk.Code, "member"); err == nil {
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
