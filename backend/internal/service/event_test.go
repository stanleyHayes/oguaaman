package service

import "testing"

func TestCleanEventDetailsPaidTiers(t *testing.T) {
	details, err := cleanEventDetails(map[string]any{
		"admission": "paid",
		"tiers": []any{
			map[string]any{"name": " General ", "pricePesewas": float64(2500), "capacity": float64(200)},
		},
	})
	if err != nil {
		t.Fatalf("cleanEventDetails: %v", err)
	}
	tiers := details["tiers"].([]map[string]any)
	if len(tiers) != 1 || tiers[0]["name"] != "General" || tiers[0]["pricePesewas"] != int64(2500) {
		t.Fatalf("tiers = %#v", tiers)
	}
}

func TestCleanEventDetailsRejectsPaidWithoutTickets(t *testing.T) {
	_, err := cleanEventDetails(map[string]any{"admission": "paid", "tiers": []any{}})
	if err == nil {
		t.Fatal("expected paid event without tickets to fail")
	}
}

func TestCleanEventDetailsFreeDropsTickets(t *testing.T) {
	details, err := cleanEventDetails(map[string]any{"admission": "free", "tiers": []any{map[string]any{"name": "Old"}}})
	if err != nil {
		t.Fatalf("cleanEventDetails: %v", err)
	}
	if _, ok := details["tiers"]; ok {
		t.Fatal("free event retained tiers")
	}
}
