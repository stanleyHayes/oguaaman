package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

func incidentTestService() (*Service, *fakeRepo) {
	f := &fakeRepo{listings: []domain.Listing{
		{ID: "inc-1", Slug: "fallen-tree-at-aboom", Type: domain.TypeIncident, Status: domain.StatusApproved, OwnerID: "m-7", Title: "Fallen tree at Aboom",
			Details: map[string]any{
				"category": "utility", "severity": "medium", "incidentStatus": "reported",
				"statusHistory": []map[string]any{{"status": "reported", "by": "m-7", "note": "Incident reported", "at": "2026-07-01T00:00:00Z"}},
			}},
	}}
	return newTestService(f), f
}

func TestSubmitIncident_validatesEnums(t *testing.T) {
	svc, _ := incidentTestService()
	ctx := context.Background()
	m := &domain.Member{ID: "m-9", Role: domain.RoleMember}

	if _, err := svc.SubmitIncident(ctx, m, IncidentInput{Title: "Spill", Category: "spaceship", Severity: "low", Location: "Aboom"}); err == nil {
		t.Error("expected an error for an unknown category")
	}
	if _, err := svc.SubmitIncident(ctx, m, IncidentInput{Title: "Spill", Category: "flood", Severity: "apocalyptic", Location: "Aboom"}); err == nil {
		t.Error("expected an error for an unknown severity")
	}
	if _, err := svc.SubmitIncident(ctx, m, IncidentInput{Title: "Spill", Category: "flood", Severity: "low"}); err == nil {
		t.Error("expected an error when the location is missing")
	}
	if _, err := svc.SubmitIncident(ctx, nil, IncidentInput{Title: "Spill", Category: "flood", Severity: "low", Location: "Aboom"}); err == nil {
		t.Error("expected an error with no signed-in member")
	}
}

func TestSubmitIncident_autoPublishes(t *testing.T) {
	svc, _ := incidentTestService()
	m := &domain.Member{ID: "m-9", Role: domain.RoleMember, TownID: "aboom"}
	l, err := svc.SubmitIncident(context.Background(), m, IncidentInput{
		Title: "Oil spill at the harbour", Category: "other", Severity: "high", Location: "Bakaano harbour", Contact: "m-9",
	})
	if err != nil {
		t.Fatalf("valid incident failed: %v", err)
	}
	if l.Type != domain.TypeIncident {
		t.Errorf("type = %q, want incident", l.Type)
	}
	if l.Status != domain.StatusApproved {
		t.Errorf("status = %q, want approved (incidents auto-publish)", l.Status)
	}
	if l.PublishedAt == "" {
		t.Error("publishedAt should be set on auto-publish")
	}
	if got := asString(l.Details, "incidentStatus"); got != "reported" {
		t.Errorf("incidentStatus = %q, want reported", got)
	}
	if l.OwnerID != "m-9" || l.TownID != "aboom" {
		t.Errorf("owner/town not attributed: %+v", l)
	}
	hist, _ := l.Details["statusHistory"].([]map[string]any)
	if len(hist) != 1 || hist[0]["status"] != "reported" {
		t.Errorf("statusHistory should open with a single reported entry: %v", hist)
	}
}

func TestTransitionIncident_appendsHistory(t *testing.T) {
	svc, f := incidentTestService()
	curator := &domain.Member{ID: "m-c", Role: domain.RoleCurator}

	if err := svc.TransitionIncident(context.Background(), "inc-1", curator, "verified", "Confirmed on the ground"); err != nil {
		t.Fatalf("transition failed: %v", err)
	}
	d := f.listings[0].Details
	if got := asString(d, "incidentStatus"); got != "verified" {
		t.Errorf("incidentStatus = %q, want verified", got)
	}
	hist, _ := d["statusHistory"].([]map[string]any)
	if len(hist) != 2 {
		t.Fatalf("statusHistory should have 2 entries, got %d", len(hist))
	}
	last := hist[1]
	if last["status"] != "verified" || last["by"] != "m-c" || last["note"] != "Confirmed on the ground" {
		t.Errorf("appended entry = %v", last)
	}
}

func TestTransitionIncident_validatesStatus(t *testing.T) {
	svc, _ := incidentTestService()
	curator := &domain.Member{ID: "m-c", Role: domain.RoleCurator}
	if err := svc.TransitionIncident(context.Background(), "inc-1", curator, "teleported", ""); err == nil {
		t.Error("expected an error for a status outside the lifecycle")
	}
}

func TestTransitionIncident_rejectsNonCurator(t *testing.T) {
	svc, f := incidentTestService()
	member := &domain.Member{ID: "m-9", Role: domain.RoleMember}

	err := svc.TransitionIncident(context.Background(), "inc-1", member, "verified", "")
	var fb *domain.ForbiddenError
	if err == nil || !isForbidden(err, &fb) {
		t.Errorf("expected ForbiddenError for a plain member, got %v", err)
	}
	if got := asString(f.listings[0].Details, "incidentStatus"); got != "reported" {
		t.Errorf("incidentStatus = %q, want unchanged reported", got)
	}
}

// isForbidden reports whether err is (or wraps) a *ForbiddenError, binding target.
func isForbidden(err error, target **domain.ForbiddenError) bool {
	fb, ok := err.(*domain.ForbiddenError)
	if ok {
		*target = fb
	}
	return ok
}
