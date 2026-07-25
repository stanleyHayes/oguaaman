package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

func propertyTestService() (*Service, *fakeRepo) {
	f := &fakeRepo{listings: []domain.Listing{
		{ID: "p-1", Slug: "pedu-two-bed", Type: domain.TypeProperty, Status: domain.StatusApproved, OwnerID: "m-owner", Title: "Pedu two-bed",
			Details: map[string]any{"availability": domain.PropertyAvailabilityAvailable, "pricePesewas": int64(180000)}},
		{ID: "p-2", Slug: "abura-studio", Type: domain.TypeProperty, Status: domain.StatusApproved, OwnerID: "m-owner", Title: "Abura studio",
			Details: map[string]any{"availability": domain.PropertyAvailabilityLet, "pricePesewas": int64(90000)}},
	}}
	return newTestService(f), f
}

func TestSetPropertyAvailability_ownerCanMarkLet(t *testing.T) {
	svc, f := propertyTestService()
	owner := &domain.Member{ID: "m-owner", Role: domain.RoleMember}

	if err := svc.SetPropertyAvailability(context.Background(), "p-1", owner, "Let"); err != nil {
		t.Fatalf("owner mark-let failed: %v", err)
	}
	if got := asString(f.listings[0].Details, "availability"); got != domain.PropertyAvailabilityLet {
		t.Errorf("availability = %q, want let (input is trimmed + lowercased)", got)
	}
}

func TestSetPropertyAvailability_rejectsStranger(t *testing.T) {
	svc, f := propertyTestService()
	stranger := &domain.Member{ID: "m-stranger", Role: domain.RoleMember}

	err := svc.SetPropertyAvailability(context.Background(), "p-1", stranger, domain.PropertyAvailabilityLet)
	var fb *domain.ForbiddenError
	if err == nil || !isForbidden(err, &fb) {
		t.Errorf("expected ForbiddenError for a non-owner, got %v", err)
	}
	if got := asString(f.listings[0].Details, "availability"); got != domain.PropertyAvailabilityAvailable {
		t.Errorf("availability = %q, want unchanged available", got)
	}
}

func TestSetPropertyAvailability_curatorOverride(t *testing.T) {
	svc, f := propertyTestService()
	curator := &domain.Member{ID: "m-c", Role: domain.RoleCurator}

	if err := svc.SetPropertyAvailability(context.Background(), "p-2", curator, domain.PropertyAvailabilityAvailable); err != nil {
		t.Fatalf("curator override failed: %v", err)
	}
	if got := asString(f.listings[1].Details, "availability"); got != domain.PropertyAvailabilityAvailable {
		t.Errorf("availability = %q, want available", got)
	}
}

func TestSetPropertyAvailability_validatesValue(t *testing.T) {
	svc, _ := propertyTestService()
	owner := &domain.Member{ID: "m-owner", Role: domain.RoleMember}
	if err := svc.SetPropertyAvailability(context.Background(), "p-1", owner, "demolished"); err == nil {
		t.Error("expected an error for a value outside {available, reserved, let}")
	}
}

func TestProperties_excludesLetFromBrowse(t *testing.T) {
	svc, _ := propertyTestService()
	items, err := svc.Properties(context.Background())
	if err != nil {
		t.Fatalf("Properties: %v", err)
	}
	for _, l := range items {
		if l.Slug == "abura-studio" {
			t.Fatalf("a 'let' property must not appear in the public browse: %+v", items)
		}
	}
	if len(items) != 1 || items[0].Slug != "pedu-two-bed" {
		t.Fatalf("browse = %+v, want only the available pedu-two-bed", items)
	}
}
