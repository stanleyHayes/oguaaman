package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

func ev(slug, festival, year, startsAt string) domain.Listing {
	return domain.Listing{
		Slug: slug, Type: domain.TypeEvent, Status: domain.StatusApproved, Title: slug,
		Details: map[string]any{"festival": festival, "edition": year, "startsAt": startsAt},
	}
}

func TestFestivals_groupsByFestivalSlug(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{
		ev("fetu-2025", "fetu-afahye", "2025", "2025-09-06"),
		ev("fetu-2026", "fetu-afahye", "2026", "2026-09-05"),
		ev("bakatue-2026", "edina-bakatue", "2026", "2026-07-07"),
		{Slug: "plain-gig", Type: domain.TypeEvent, Status: domain.StatusApproved, Title: "A gig", Details: map[string]any{"startsAt": "2026-08-01"}},
		{Slug: "pending-fetu", Type: domain.TypeEvent, Status: domain.StatusPending, Title: "Pending", Details: map[string]any{"festival": "fetu-afahye", "edition": "2026"}},
	}}
	svc := newTestService(f)

	festivals, err := svc.Festivals(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(festivals) != 2 {
		t.Fatalf("expected 2 festivals, got %d: %+v", len(festivals), festivals)
	}
	// Sorted by name: Edina Bakatue before Fetu Afahye.
	if festivals[0].Slug != "edina-bakatue" || festivals[0].Name != "Edina Bakatue" {
		t.Errorf("expected edina-bakatue first, got %+v", festivals[0])
	}
	fetu := festivals[1]
	if fetu.Slug != "fetu-afahye" || fetu.Name != "Fetu Afahye" {
		t.Errorf("expected fetu-afahye, got %+v", fetu)
	}
	if fetu.Editions != 2 {
		t.Errorf("expected 2 fetu editions, got %d", fetu.Editions)
	}
	if fetu.NextEdition == nil || fetu.NextEdition.Slug != "fetu-2026" {
		t.Errorf("expected next edition fetu-2026, got %+v", fetu.NextEdition)
	}
}

func TestFestival_groupsEditionsYearDescending(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{
		ev("fetu-2024", "fetu-afahye", "2024", "2024-09-07"),
		ev("fetu-2026", "fetu-afahye", "2026", "2026-09-05"),
		ev("fetu-2025", "fetu-afahye", "2025", "2025-09-06"),
	}}
	svc := newTestService(f)

	view, err := svc.Festival(ctx, "fetu-afahye")
	if err != nil {
		t.Fatal(err)
	}
	if view.Name != "Fetu Afahye" {
		t.Errorf("expected registry name, got %q", view.Name)
	}
	if view.History == "" || view.Tagline == "" {
		t.Errorf("expected registry history/tagline, got %+v", view)
	}
	want := []string{"2026", "2025", "2024"}
	if len(view.Editions) != len(want) {
		t.Fatalf("expected %d editions, got %d", len(want), len(view.Editions))
	}
	for i, y := range want {
		if view.Editions[i].Year != y {
			t.Errorf("edition %d: expected year %q, got %q", i, y, view.Editions[i].Year)
		}
		if len(view.Editions[i].Events) != 1 {
			t.Errorf("edition %s: expected 1 event, got %d", y, len(view.Editions[i].Events))
		}
	}
}

func TestFestival_recapTravelsWithEdition(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{
		{Slug: "fetu-2024", Type: domain.TypeEvent, Status: domain.StatusApproved, Title: "Fetu @60",
			Details: map[string]any{"festival": "fetu-afahye", "edition": "2024", "startsAt": "2024-09-07", "recap": "The Asantehene attended."}},
	}}
	svc := newTestService(f)

	view, err := svc.Festival(ctx, "fetu-afahye")
	if err != nil {
		t.Fatal(err)
	}
	if view.Editions[0].Recap != "The Asantehene attended." {
		t.Errorf("expected recap on the edition, got %q", view.Editions[0].Recap)
	}
}

func TestFestival_unknownSlugFallsBackToTitleCase(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{
		ev("kakum-2026", "kakum-canopy-festival", "2026", "2026-10-03"),
	}}
	svc := newTestService(f)

	festivals, err := svc.Festivals(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(festivals) != 1 || festivals[0].Name != "Kakum Canopy Festival" {
		t.Fatalf("expected title-cased fallback name, got %+v", festivals)
	}

	view, err := svc.Festival(ctx, "kakum-canopy-festival")
	if err != nil {
		t.Fatal(err)
	}
	if view.Name != "Kakum Canopy Festival" {
		t.Errorf("expected title-cased fallback name, got %q", view.Name)
	}
}

func TestFestival_notFound(t *testing.T) {
	ctx := context.Background()
	svc := newTestService(&fakeRepo{})
	if _, err := svc.Festival(ctx, "no-such-festival"); err == nil {
		t.Fatal("expected a not-found error")
	} else if _, ok := err.(*domain.NotFoundError); !ok {
		t.Fatalf("expected NotFoundError, got %T: %v", err, err)
	}
}
