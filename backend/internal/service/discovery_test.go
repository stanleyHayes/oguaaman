package service

import (
	"context"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

func TestIsAdult(t *testing.T) {
	now := time.Date(2026, 6, 6, 0, 0, 0, 0, time.UTC)
	cases := map[string]bool{
		"2008-06-06": true,  // exactly 18 today
		"2008-06-07": false, // turns 18 tomorrow
		"2000-01-01": true,
		"2010-01-01": false, // 16
		"":           false, // missing → fail closed
		"not-a-date": false, // malformed → fail closed
	}
	for dob, want := range cases {
		if got := isAdult(dob, now); got != want {
			t.Errorf("isAdult(%q) = %v, want %v", dob, got, want)
		}
	}
}

func TestSearch_matchesRanksAndAnds(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{
		{Slug: "ck-mann", Type: domain.TypeArtist, Status: domain.StatusApproved, Title: "C.K. Mann", Tags: []string{"highlife"}},
		{Slug: "ebo-taylor", Type: domain.TypeArtist, Status: domain.StatusApproved, Title: "Ebo Taylor", Tags: []string{"afrobeat", "mann"}},
		{Slug: "draft-mann", Type: domain.TypeArtist, Status: domain.StatusPending, Title: "Hidden Mann"},
	}}
	svc := newTestService(f)

	hits, err := svc.Search(ctx, "mann", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 2 {
		t.Fatalf("expected 2 hits (approved only), got %d: %+v", len(hits), hits)
	}
	// Whole-word title match ("C.K. Mann") should outrank a tag match ("mann").
	if hits[0].Slug != "ck-mann" {
		t.Errorf("expected ck-mann ranked first, got %q", hits[0].Slug)
	}

	// AND semantics: every term must match somewhere.
	if got := svc.mustSearch(t, ctx, "ebo highlife"); len(got) != 0 {
		t.Errorf("expected no hits when one term is absent, got %d", len(got))
	}
	if got := svc.mustSearch(t, ctx, "ebo taylor"); len(got) != 1 || got[0].Slug != "ebo-taylor" {
		t.Errorf("expected only ebo-taylor, got %+v", got)
	}
	if got := svc.mustSearch(t, ctx, " "); len(got) != 0 {
		t.Errorf("blank query should return nothing, got %d", len(got))
	}
}

func (s *Service) mustSearch(t *testing.T, ctx context.Context, q string) []SearchHit {
	t.Helper()
	hits, err := s.Search(ctx, q, 20)
	if err != nil {
		t.Fatal(err)
	}
	return hits
}
