package mongo

import (
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

func TestSeedPropertiesCoverRentStayAndModeration(t *testing.T) {
	var properties, approved, pending, shortStay, longTerm int
	for _, listing := range seedListings() {
		if listing.Type != domain.TypeProperty {
			continue
		}
		properties++
		switch listing.Status {
		case domain.StatusApproved:
			approved++
		case domain.StatusPending:
			pending++
		}
		offer, _ := listing.Details["offerType"].(string)
		switch offer {
		case "short-stay":
			shortStay++
		case "long-term":
			longTerm++
		default:
			t.Errorf("property %q has invalid offerType %q", listing.ID, offer)
		}
		period, _ := listing.Details["pricePeriod"].(string)
		if period != "month" && period != "night" {
			t.Errorf("property %q has invalid pricePeriod %q", listing.ID, period)
		}
		price, ok := listing.Details["pricePesewas"].(int64)
		if !ok || price <= 0 {
			t.Errorf("property %q has invalid pricePesewas %v", listing.ID, listing.Details["pricePesewas"])
		}
	}
	if properties != 5 || approved != 4 || pending != 1 {
		t.Fatalf("property seed counts = total %d, approved %d, pending %d; want 5/4/1", properties, approved, pending)
	}
	if shortStay == 0 || longTerm == 0 {
		t.Fatalf("property seeds must include short-stay and long-term inventory, got %d/%d", shortStay, longTerm)
	}
}

func TestSeedYawIsAPropertyCreator(t *testing.T) {
	for _, member := range seedMembers {
		if member.ID != "m-yaw" {
			continue
		}
		for _, creatorType := range member.CreatorTypes {
			if creatorType == domain.CreatorProperty {
				return
			}
		}
		t.Fatalf("Yaw creator types = %v, want property", member.CreatorTypes)
	}
	t.Fatal("seed member m-yaw not found")
}
