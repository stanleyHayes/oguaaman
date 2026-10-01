package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// P32/P49: settled simulated records (dev mode, no money moved) never reach
// the revenue dashboard or the pledge fee totals; they are counted apart.
func TestRevenue_excludesSimulatedRecords(t *testing.T) {
	ok, sim := domain.PledgeSuccess, true
	pledges := &fakePledges{rows: []domain.Pledge{
		{Reference: "plg-real", AmountPesewas: 10_000, FeePesewas: 500, NetPesewas: 9_500, Status: ok},
		{Reference: "plg-sim", AmountPesewas: 25_000, FeePesewas: 1_250, NetPesewas: 23_750, Status: ok, Simulated: sim},
	}}
	tickets := &fakeTickets{rows: []domain.Ticket{
		{Reference: "tkt-real", AmountPesewas: 5_000, Status: ok},
		{Reference: "tkt-sim", AmountPesewas: 4_000, Status: ok, Simulated: sim},
	}}
	subs := &fakeSubs{rows: []domain.Subscription{{Reference: "sub-sim", AmountPesewas: 5_000, Status: ok, Simulated: sim}}}
	promos := &fakePromos{rows: []domain.Promotion{{Reference: "pro-sim", AmountPesewas: 14_000, Status: ok, Simulated: sim}}}
	orders := &orderFake{rows: []domain.CommerceOrder{
		{Reference: "ord-real", AmountPesewas: 9_000, PlatformFeePesewas: 450, BusinessNetPesewas: 8_550, Status: domain.OrderPaid},
		{Reference: "ord-sim", AmountPesewas: 3_000, PlatformFeePesewas: 150, Status: domain.OrderPaid, Simulated: sim},
	}}
	ov, err := NewRevenueService(pledges, tickets, subs, promos, orders).Overview(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if ov.Pledges.GrossPesewas != 10_000 || ov.Tickets.Count != 1 || ov.Subscriptions.Count != 0 || ov.Promotions.Count != 0 || ov.Commerce.Count != 1 {
		t.Fatalf("simulated money counted: %+v", ov)
	}
	if ov.TotalPesewas != 500+5_000+450 {
		t.Fatalf("total = %d, want %d", ov.TotalPesewas, 500+5_000+450)
	}
	if ov.Simulated.Count != 5 || ov.Simulated.GrossPesewas != 25_000+4_000+5_000+14_000+3_000 {
		t.Fatalf("simulated bucket = %+v", ov.Simulated)
	}
	svc := NewPaymentsService(&fakeRepo{}, pledges, stubNotifs{}, stubMembers{}, &fakePlans{}, &fakePaystack{}, "", 5)
	if gross, fee, net, _ := svc.FeeTotals(context.Background()); gross != 10_000 || fee != 500 || net != 9_500 {
		t.Fatalf("fee totals = %d/%d/%d, want the real pledge only", gross, fee, net)
	}
}
