package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// stubListingRepo implements only Find; the embedded interface makes any other
// call panic loudly rather than silently returning a zero value.
type stubListingRepo struct {
	domain.ListingRepository
	items []domain.Listing
}

func (s stubListingRepo) Find(_ context.Context, f domain.ListingFilter) ([]domain.Listing, error) {
	out := []domain.Listing{}
	for _, l := range s.items {
		if f.Type != "" && l.Type != f.Type {
			continue
		}
		if f.Status != "" && l.Status != f.Status {
			continue
		}
		out = append(out, l)
	}
	return out, nil
}

func publicSvc(items ...domain.Listing) *Service {
	return New(Deps{Listings: stubListingRepo{items: items}})
}

// The indexing filter must key off the per-document Demo flag, not the listing
// type. Every seeded business is invented, but "business" is exactly what a real
// trader creates — filtering by type would mean no genuine shop is ever indexed,
// which would silently defeat the whole sitemap.
func TestPublicListingsIndexesRealBusinessesAndHidesDemo(t *testing.T) {
	real := domain.Listing{ID: "b-real", Slug: "aunties-kitchen", Type: domain.TypeBusiness, Status: domain.StatusApproved}
	demo := domain.Listing{ID: "b-demo", Slug: "invented-shop", Type: domain.TypeBusiness, Status: domain.StatusApproved, Demo: true}

	got, err := publicSvc(real, demo).PublicListingsByType(context.Background(), domain.TypeBusiness)
	if err != nil {
		t.Fatalf("PublicListingsByType: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("returned %d listings, want 1 (the real shop)", len(got))
	}
	if got[0].ID != "b-real" {
		t.Errorf("returned %q, want the real business — filtering by type would hide every genuine shop", got[0].ID)
	}
}

func TestPublicListingsSkipsUnapprovedAndSlugless(t *testing.T) {
	items := []domain.Listing{
		{ID: "a", Slug: "ok", Type: domain.TypeBusiness, Status: domain.StatusApproved},
		{ID: "b", Slug: "pending", Type: domain.TypeBusiness, Status: "pending"},
		{ID: "c", Slug: "", Type: domain.TypeBusiness, Status: domain.StatusApproved},
	}
	got, err := publicSvc(items...).PublicListingsByType(context.Background(), domain.TypeBusiness)
	if err != nil {
		t.Fatalf("PublicListingsByType: %v", err)
	}
	if len(got) != 1 || got[0].ID != "a" {
		t.Errorf("got %d listings %v, want only the approved one with a slug", len(got), ids(got))
	}
}
