package service

import (
	"context"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// fakePlans is an in-memory PlanRepository for service/subscription tests.
type fakePlans struct {
	rows []domain.Plan
}

func (f *fakePlans) All(context.Context) ([]domain.Plan, error) { return f.rows, nil }
func (f *fakePlans) Get(_ context.Context, id string) (*domain.Plan, error) {
	for i := range f.rows {
		if f.rows[i].ID == id {
			return &f.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "plan"}
}
func (f *fakePlans) BySlug(_ context.Context, slug string) (*domain.Plan, error) {
	for i := range f.rows {
		if f.rows[i].Slug == slug {
			return &f.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "plan"}
}
func (f *fakePlans) Insert(_ context.Context, p domain.Plan) error {
	f.rows = append(f.rows, p)
	return nil
}
func (f *fakePlans) Update(_ context.Context, p domain.Plan) error {
	for i := range f.rows {
		if f.rows[i].ID == p.ID {
			f.rows[i] = p
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "plan"}
}
func (f *fakePlans) Delete(_ context.Context, id string) error {
	for i := range f.rows {
		if f.rows[i].ID == id {
			f.rows = append(f.rows[:i], f.rows[i+1:]...)
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "plan"}
}

// svcWithPlans builds a core Service with only the plans catalog wired.
func svcWithPlans(plans *fakePlans) *Service {
	return New(Deps{Plans: plans})
}

func TestPlans_publicListIsActiveAndOrdered(t *testing.T) {
	plans := &fakePlans{rows: []domain.Plan{
		{ID: "plan-b", Slug: "b", Name: "B", Active: true, SortOrder: 2},
		{ID: "plan-off", Slug: "off", Name: "Off", Active: false, SortOrder: 1},
		{ID: "plan-a", Slug: "a", Name: "A", Active: true, SortOrder: 1},
	}}
	svc := svcWithPlans(plans)

	public, err := svc.Plans(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(public) != 2 || public[0].Slug != "a" || public[1].Slug != "b" {
		t.Fatalf("public catalog = %+v, want active plans ordered by sortOrder", public)
	}
	all, err := svc.AdminPlans(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 3 {
		t.Fatalf("admin catalog = %d plans, want all 3", len(all))
	}
}

func TestCreatePlan_validatesAndDefaults(t *testing.T) {
	svc := svcWithPlans(&fakePlans{})

	if _, err := svc.CreatePlan(context.Background(), PlanInput{Name: "x", Audience: "any", Interval: "free", Prices: map[string]int64{"default": 0}}); err == nil {
		t.Error("expected error for too-short name")
	}
	if _, err := svc.CreatePlan(context.Background(), PlanInput{Name: "Good Name", Audience: "any", Interval: "month", Prices: map[string]int64{"default": 0}}); err == nil {
		t.Error("expected error for monthly plan with zero default price")
	}
	if _, err := svc.CreatePlan(context.Background(), PlanInput{Name: "Good Name", Audience: "any", Interval: "month", Prices: map[string]int64{"business": 500}}); err == nil {
		t.Error("expected error when the default price is missing")
	}

	p, err := svc.CreatePlan(context.Background(), PlanInput{
		Name: "Community Hero", Audience: "creator", Interval: "month",
		Prices: map[string]int64{"default": 1_500}, Perks: []string{"  Badge  ", ""},
	})
	if err != nil {
		t.Fatalf("valid create failed: %v", err)
	}
	if p.Slug != "community-hero" || p.ID != "plan-community-hero" {
		t.Errorf("slug/id = %q/%q, want slugified defaults", p.Slug, p.ID)
	}
	if len(p.Perks) != 1 || p.Perks[0] != "Badge" {
		t.Errorf("perks should be trimmed and empties dropped, got %+v", p.Perks)
	}
	if _, err := svc.CreatePlan(context.Background(), PlanInput{
		Name: "Community Hero 2", Slug: "community-hero", Audience: "creator", Interval: "month",
		Prices: map[string]int64{"default": 1_500},
	}); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Errorf("expected slug-collision error, got %v", err)
	}

	// A plan with no perks must still serialize as an empty array, never null
	// (null crashed the admin table render).
	bare, err := svc.CreatePlan(context.Background(), PlanInput{
		Name: "Bare Plan", Audience: "any", Interval: "free", Prices: map[string]int64{"default": 0},
	})
	if err != nil {
		t.Fatalf("bare create failed: %v", err)
	}
	if bare.Perks == nil {
		t.Error("perks must be an empty slice, not nil")
	}
}

func TestUpdatePlan_preservesCreatedAtAndChecksSlug(t *testing.T) {
	plans := &fakePlans{rows: []domain.Plan{
		{ID: "plan-supporter", Slug: "supporter", Name: "Supporter", Audience: "business", Interval: "month",
			Prices: map[string]int64{"default": 3_000, "business": 5_000}, Active: true, CreatedAt: "2026-07-15T00:00:00Z"},
		{ID: "plan-featured", Slug: "featured", Name: "Featured", Audience: "business", Interval: "month",
			Prices: map[string]int64{"default": 12_000}, Active: true},
	}}
	svc := svcWithPlans(plans)

	p, err := svc.UpdatePlan(context.Background(), "plan-supporter", PlanInput{
		Name: "Supporter+", Slug: "supporter", Audience: "business", Interval: "month",
		Prices: map[string]int64{"default": 3_500, "business": 5_500}, Active: true,
	})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	if p.CreatedAt != "2026-07-15T00:00:00Z" || p.UpdatedAt == "" {
		t.Errorf("timestamps wrong after update: %+v", p)
	}
	if p.PriceFor("business") != 5_500 || p.PriceFor("creator") != 3_500 {
		t.Errorf("prices not updated: %+v", p.Prices)
	}
	if _, err := svc.UpdatePlan(context.Background(), "plan-supporter", PlanInput{
		Name: "Supporter", Slug: "featured", Audience: "business", Interval: "month",
		Prices: map[string]int64{"default": 5_000}, Active: true,
	}); err == nil {
		t.Error("expected slug-collision error on rename to an existing slug")
	}
	if _, err := svc.UpdatePlan(context.Background(), "plan-nope", PlanInput{
		Name: "Ghost", Audience: "any", Interval: "free", Prices: map[string]int64{"default": 0},
	}); err == nil {
		t.Error("expected not-found error for unknown id")
	}
}

func TestDeletePlan(t *testing.T) {
	plans := &fakePlans{rows: []domain.Plan{{ID: "plan-x", Slug: "x", Name: "X"}}}
	svc := svcWithPlans(plans)
	if err := svc.DeletePlan(context.Background(), "plan-x"); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	if err := svc.DeletePlan(context.Background(), "plan-x"); err == nil {
		t.Error("second delete should be not-found")
	}
}

func TestPlanPriceFor_fallsBackToDefault(t *testing.T) {
	p := domain.Plan{Prices: map[string]int64{"default": 3_000, "business": 5_000}}
	if p.PriceFor("business") != 5_000 {
		t.Errorf("business price = %d, want 5000", p.PriceFor("business"))
	}
	if p.PriceFor("creator") != 3_000 {
		t.Errorf("creator price should fall back to default, got %d", p.PriceFor("creator"))
	}
}
