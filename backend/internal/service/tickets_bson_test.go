package service

import (
	"context"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/oguaa/backend/internal/domain"
)

// mongoRoundTrip stores and reloads a listing through the real BSON codec, so
// Details comes back in the driver's default shapes (bson.A of bson.D) exactly
// as ListingRepo.GetBySlug would hand it to the service.
func mongoRoundTrip(t *testing.T, l domain.Listing) domain.Listing {
	t.Helper()
	raw, err := bson.Marshal(l)
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}
	var out domain.Listing
	if err := bson.Unmarshal(raw, &out); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}
	return out
}

// Tiers stored in MongoDB decode as bson.A of bson.D, not the seed's
// []map[string]any: a paid event must still expose and sell its tiers.
func TestEventTiers_parseMongoDecodedTiers(t *testing.T) {
	event := mongoRoundTrip(t, domain.Listing{
		ID: "e-gala", Slug: "castle-gala", Type: domain.TypeEvent, OwnerID: "m-nana", Status: domain.StatusApproved, Title: "Castle gala",
		Details: map[string]any{"tiers": []map[string]any{
			{"name": "Regular", "pricePesewas": int64(5_000), "capacity": 200},
			{"name": "VIP", "pricePesewas": float64(20_000), "capacity": int32(0)},
		}},
	})
	if _, isSeedShape := event.Details["tiers"].([]map[string]any); isSeedShape {
		t.Fatal("round trip should produce the driver's shapes, not the seed's")
	}

	tiers := eventTiers(&event)
	if len(tiers) != 2 {
		t.Fatalf("eventTiers = %+v, want 2 tiers from the Mongo-decoded document", tiers)
	}
	if tiers[0] != (TicketTier{Name: "Regular", PricePesewas: 5_000, Capacity: 200}) {
		t.Errorf("tier 0 = %+v", tiers[0])
	}
	if tiers[1] != (TicketTier{Name: "VIP", PricePesewas: 20_000, Capacity: 0}) {
		t.Errorf("tier 1 = %+v", tiers[1])
	}

	listings := &fakeRepo{listings: []domain.Listing{event}}
	tickets := &fakeTickets{}
	svc := NewTicketsService(listings, tickets, stubNotifs{}, &fakePaystack{verifyOK: true, verifyAmount: 5_000}, "http://portal.test")
	ctx := context.Background()

	view, err := svc.EventView(ctx, "castle-gala")
	if err != nil {
		t.Fatalf("EventView: %v", err)
	}
	if len(view.Tiers) != 2 || view.Tiers[0].Remaining == nil || *view.Tiers[0].Remaining != 200 {
		t.Fatalf("EventView tiers = %+v, want both tiers with 200 Regular seats left", view.Tiers)
	}
	if _, _, _, err := svc.StartTicketPurchase(ctx, "castle-gala", "m-1", "ama@example.com", "Regular", 1); err != nil {
		t.Fatalf("StartTicketPurchase on a Mongo-decoded tier: %v", err)
	}
	if tickets.rows[0].AmountPesewas != 5_000 {
		t.Errorf("amount = %d, want 5000", tickets.rows[0].AmountPesewas)
	}
}
