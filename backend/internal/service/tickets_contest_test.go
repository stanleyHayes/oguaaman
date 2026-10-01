package service

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// lockedTickets lets several confirms share the in-memory ledger at once:
// every call the confirm path makes takes the lock, and lookups return copies
// as the database does. The hooks run unlocked around each claim
// (MarkSuccess) and after each read of an event's tickets, so a test can line
// confirms up at those points.
type lockedTickets struct {
	domain.TicketRepository // the *fakeTickets; only the confirm path's calls are locked
	mu                      sync.Mutex
	f                       *fakeTickets
	beforeClaim, afterClaim func(ref string)
	afterRead               func()
}

func lockTickets(f *fakeTickets) *lockedTickets {
	return &lockedTickets{TicketRepository: f, f: f}
}

func (l *lockedTickets) ByReference(ctx context.Context, ref string) (*domain.Ticket, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	t, err := l.f.ByReference(ctx, ref)
	if err != nil {
		return nil, err
	}
	c := *t
	return &c, nil
}
func (l *lockedTickets) ByCode(ctx context.Context, code string) (*domain.Ticket, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	t, err := l.f.ByCode(ctx, code)
	if err != nil {
		return nil, err
	}
	c := *t
	return &c, nil
}
func (l *lockedTickets) ByEvent(ctx context.Context, eventID string) ([]domain.Ticket, error) {
	l.mu.Lock()
	rows, err := l.f.ByEvent(ctx, eventID)
	l.mu.Unlock()
	if l.afterRead != nil {
		l.afterRead()
	}
	return rows, err
}
func (l *lockedTickets) MarkSuccess(ctx context.Context, ref, at, code string) (bool, error) {
	if l.beforeClaim != nil {
		l.beforeClaim(ref)
	}
	l.mu.Lock()
	won, err := l.f.MarkSuccess(ctx, ref, at, code)
	l.mu.Unlock()
	if l.afterClaim != nil {
		l.afterClaim(ref)
	}
	return won, err
}
func (l *lockedTickets) MarkFailed(ctx context.Context, ref string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.f.MarkFailed(ctx, ref)
}
func (l *lockedTickets) MarkRefundDue(ctx context.Context, ref, reason string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.f.MarkRefundDue(ctx, ref, reason)
}
func (l *lockedTickets) RevokeForRefund(ctx context.Context, ref, reason string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.f.RevokeForRefund(ctx, ref, reason)
}

// issuedSeats sums the seats issued in a tier of the fixture event.
func issuedSeats(f *fakeTickets, tier string) int {
	n := 0
	for _, t := range f.rows {
		if t.Status == domain.PledgeSuccess && t.Tier == tier {
			n += t.Qty
		}
	}
	return n
}

// R33: two buyers of the last seat whose payments confirm at the same moment
// both pass the capacity check, both claim, and both recount — each seeing
// the tier over capacity — before either gives a seat back. Exactly one keeps
// the seat and the other is refunded: neither oversold nor left unsold.
func TestConfirmTicket_simultaneousConfirmsForLastSeatSeatExactlyOne(t *testing.T) {
	ctx := context.Background()
	svc, fake := ticketsFixture(true, 5_000)
	tickets := lockTickets(fake)
	svc.tickets = tickets
	const tier = "Grand Durbar stand" // capacity 2
	fake.confirmed("e-1", tier, 1)
	_, _, refA, _ := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-a", "a@example.com", tier, 1)
	_, _, refB, _ := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-b", "b@example.com", tier, 1)

	// Both confirms pass the capacity check before either claims, both claims
	// land before either recounts, and both recounts are read before either
	// confirm acts on its own.
	var checked, claimed, recounted sync.WaitGroup
	checked.Add(2)
	claimed.Add(2)
	recounted.Add(2)
	var bothClaimed atomic.Bool
	var reads atomic.Int32
	tickets.beforeClaim = func(string) { checked.Done(); checked.Wait() }
	tickets.afterClaim = func(string) { claimed.Done(); claimed.Wait(); bothClaimed.Store(true) }
	tickets.afterRead = func() {
		if bothClaimed.Load() && reads.Add(1) <= 2 {
			recounted.Done()
			recounted.Wait()
		}
	}

	errs := make(map[string]error, 2)
	var mu sync.Mutex
	var confirms sync.WaitGroup
	for _, ref := range []string{refA, refB} {
		confirms.Add(1)
		go func() {
			defer confirms.Done()
			_, err := svc.ConfirmTicket(ctx, ref)
			mu.Lock()
			errs[ref] = err
			mu.Unlock()
		}()
	}
	done := make(chan struct{})
	go func() { confirms.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("confirms did not finish")
	}

	kept, refunded := 0, 0
	for _, ref := range []string{refA, refB} {
		tk, _ := fake.ByReference(ctx, ref)
		switch {
		case errs[ref] == nil && tk.Status == domain.PledgeSuccess && tk.Code != "":
			kept++
		case errors.Is(errs[ref], ErrSoldOutAfterPayment) && tk.Status == domain.PledgeFailed && tk.RefundDue && tk.Code == "":
			refunded++
		default:
			t.Errorf("%s: err %v, ticket %+v", ref, errs[ref], tk)
		}
	}
	if kept != 1 || refunded != 1 {
		t.Fatalf("kept %d, refunded %d — want exactly one buyer seated and one refunded", kept, refunded)
	}
	if got := issuedSeats(fake, tier); got != 2 {
		t.Fatalf("issued seats = %d, want the capacity (2): never oversold, never left unsold", got)
	}
}

// R33: ranking the claims must not oversell. A later claim that recounted
// before this one claimed saw the tier fit and kept its seat, so the claim
// ranked first waits for that seat to come back and, when it doesn't, gives up
// its own.
func TestConfirmTicket_firstRankedClaimYieldsToASeatAlreadyKept(t *testing.T) {
	ctx := context.Background()
	svc, fake := ticketsFixture(true, 5_000)
	tickets := lockTickets(fake)
	svc.tickets = tickets
	svc.settlePauses = []time.Duration{time.Millisecond, time.Millisecond}
	const tier = "Grand Durbar stand" // capacity 2
	fake.confirmed("e-1", tier, 1)
	_, _, refA, _ := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-a", "a@example.com", tier, 1)
	_, _, refB, _ := svc.StartTicketPurchase(ctx, "fetu-afahye-2026", "m-b", "b@example.com", tier, 1)
	if refA >= refB {
		t.Fatalf("A must rank first in claim order: %q vs %q", refA, refB)
	}
	// A passes its capacity check; B then confirms in full (claims, recounts,
	// fits, keeps its seat) before A's claim lands.
	var errB error
	tickets.beforeClaim = func(ref string) {
		if ref == refA {
			tickets.beforeClaim = nil
			_, errB = svc.ConfirmTicket(ctx, refB)
		}
	}
	_, errA := svc.ConfirmTicket(ctx, refA)

	b, _ := fake.ByReference(ctx, refB)
	if errB != nil || b.Status != domain.PledgeSuccess || b.Code == "" {
		t.Fatalf("B (kept first) = %+v, err %v — want issued", b, errB)
	}
	a, _ := fake.ByReference(ctx, refA)
	if !errors.Is(errA, ErrSoldOutAfterPayment) || a.Status != domain.PledgeFailed || !a.RefundDue || a.Code != "" {
		t.Fatalf("A = %+v, err %v — want refunded with no code", a, errA)
	}
	if got := issuedSeats(fake, tier); got != 2 {
		t.Fatalf("issued seats = %d, want the capacity (2) — never oversold", got)
	}
}
