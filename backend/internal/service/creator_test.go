package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// Stacked promotions: the overview reads each listing's real paid window, not
// one recomputed per purchase from its confirm date (F149).
func TestCreatorOverview_countsStackedPromotions(t *testing.T) {
	ctx := context.Background()
	now := time.Now().UTC()
	day := func(n int) string { return now.Add(time.Duration(n) * 24 * time.Hour).Format(time.RFC3339) }
	listings := &fakeRepo{listings: []domain.Listing{
		// Two 30-day purchases, 35 days ago and 34 days ago → paid through day +25.
		{ID: "b-1", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Featured: true, FeaturedUntil: day(25), PromotedUntil: day(25)},
		// Placement paid before promotedUntil existed: featuredUntil is the window.
		{ID: "b-2", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Featured: true, FeaturedUntil: day(3)},
		// Editorially featured, never paid: not a promotion.
		{ID: "b-3", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Featured: true, FeaturedUntil: day(9)},
	}}
	promos := &fakePromos{rows: []domain.Promotion{
		{ID: "p1", ListingID: "b-1", MemberID: "m-yaw", Days: 30, Status: domain.PledgeSuccess, ConfirmedAt: day(-35)},
		{ID: "p2", ListingID: "b-1", MemberID: "m-yaw", Days: 30, Status: domain.PledgeSuccess, ConfirmedAt: day(-34)},
		{ID: "p3", ListingID: "b-2", MemberID: "m-yaw", Days: 7, Status: domain.PledgeSuccess, ConfirmedAt: day(-4)},
	}}
	svc := NewCreatorService(listings, &fakePledges{}, &fakeTickets{}, &fakeSubs{}, promos)
	ov, err := svc.Overview(ctx, "m-yaw")
	if err != nil {
		t.Fatalf("Overview: %v", err)
	}
	if ov.ActivePromotions != 2 {
		t.Errorf("activePromotions = %d, want 2", ov.ActivePromotions)
	}
	if ov.PromotionDaysLeft < 27 || ov.PromotionDaysLeft > 30 {
		t.Errorf("promotionDaysLeft = %d, want ~28 (25 + 3)", ov.PromotionDaysLeft)
	}
}

// The organiser's earnings ledger never carries buyers' check-in codes,
// payment references or member ids (F151).
func TestCreatorEarnings_omitsBuyerCredentials(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "e-1", Type: domain.TypeEvent, OwnerID: "m-nana", Status: domain.StatusApproved},
		{ID: "pr-1", Type: domain.TypeProject, OwnerID: "m-nana", Status: domain.StatusApproved},
	}}
	tickets := &fakeTickets{rows: []domain.Ticket{{
		ID: "ttkt-fetu-123", Reference: "tkt-fetu-123", EventID: "e-1", EventTitle: "Fetu", MemberID: "m-buyer",
		Tier: "Stand", Qty: 2, AmountPesewas: 10_000, Status: domain.PledgeSuccess, Code: "GATE1234", CheckedInAt: "2026-09-01T10:00:00Z",
	}}}
	pledges := &fakePledges{rows: []domain.Pledge{{
		ID: "ppledge-lib-9", Reference: "pledge-lib-9", ProjectID: "pr-1", ProjectTitle: "Library", MemberID: "m-donor",
		AmountPesewas: 5_000, NetPesewas: 4_750, Status: domain.PledgeSuccess,
	}}}
	svc := NewCreatorService(listings, pledges, tickets, &fakeSubs{}, &fakePromos{})
	out, err := svc.Earnings(ctx, "m-nana")
	if err != nil {
		t.Fatalf("Earnings: %v", err)
	}
	if len(out.TicketSales) != 1 || len(out.Pledges) != 1 {
		t.Fatalf("rows = %d tickets, %d pledges, want 1 and 1", len(out.TicketSales), len(out.Pledges))
	}
	if !out.TicketSales[0].CheckedIn || out.TicketSales[0].Qty != 2 || out.Pledges[0].NetPesewas != 4_750 {
		t.Errorf("ledger figures lost: %+v %+v", out.TicketSales[0], out.Pledges[0])
	}
	raw, _ := json.Marshal(out)
	for _, secret := range []string{"GATE1234", "tkt-fetu-123", "pledge-lib-9", "m-buyer", "m-donor", `"code"`, `"reference"`, `"memberId"`} {
		if strings.Contains(string(raw), secret) {
			t.Errorf("earnings JSON leaks %s: %s", secret, raw)
		}
	}
}
