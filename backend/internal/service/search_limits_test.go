package service

import (
	"context"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// F097: the query is bounded to a few distinct terms.
func TestSearchTerms_bounded(t *testing.T) {
	terms := searchTerms(strings.Repeat("an ", 5000) + "fish")
	if len(terms) != 1 || terms[0] != "an" {
		t.Fatalf("repeated terms must collapse, got %d terms", len(terms))
	}
	terms = searchTerms("aa bb cc dd ee ff gg hh ii jj kk")
	if len(terms) != maxSearchTerms {
		t.Fatalf("got %d terms, want %d", len(terms), maxSearchTerms)
	}
}

// K13: search hides listings owned by, and member hits for, blocked members.
func TestSearchAs_hidesBlockedMembers(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{
		{Slug: "kofi-fish", Type: domain.TypeBusiness, Status: domain.StatusApproved, Title: "Kofi fish", OwnerID: "m-kofi"},
		{Slug: "ama-fish", Type: domain.TypeBusiness, Status: domain.StatusApproved, Title: "Ama fish", OwnerID: "m-ama"},
	}}
	blocks := &fakeBlockRepo{}
	_ = blocks.Block(ctx, "m-ama", "m-kofi", "")
	svc := tributeService(f, blocks)
	hits, err := svc.SearchAs(ctx, &domain.Member{ID: "m-ama"}, "fish", 20)
	if err != nil || len(hits) != 1 || hits[0].Slug != "ama-fish" {
		t.Fatalf("blocked owner's listing leaked: %+v (%v)", hits, err)
	}
	if all, _ := svc.SearchAs(ctx, nil, "fish", 20); len(all) != 2 {
		t.Fatalf("signed-out search sees everything, got %d", len(all))
	}
}
