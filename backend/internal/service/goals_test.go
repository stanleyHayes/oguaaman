package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

func TestGoalEffectiveStatus(t *testing.T) {
	now := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	cases := []struct {
		name string
		g    domain.Goal
		want string
	}{
		{"active within window", domain.Goal{Status: domain.GoalStatusActive, PeriodEnd: "2026-12-31T23:59:59Z"}, domain.GoalStatusActive},
		{"pending review after window", domain.Goal{Status: domain.GoalStatusActive, PeriodEnd: "2026-06-30T23:59:59Z"}, domain.GoalStatusPendingReview},
		{"achieved verdict wins even past end", domain.Goal{Status: domain.GoalStatusAchieved, PeriodEnd: "2026-06-30T23:59:59Z"}, domain.GoalStatusAchieved},
		{"missed verdict wins even past end", domain.Goal{Status: domain.GoalStatusMissed, PeriodEnd: "2026-06-30T23:59:59Z"}, domain.GoalStatusMissed},
		{"empty end stays active", domain.Goal{Status: domain.GoalStatusActive, PeriodEnd: ""}, domain.GoalStatusActive},
	}
	for _, c := range cases {
		if got := c.g.EffectiveStatus(now); got != c.want {
			t.Errorf("%s: EffectiveStatus = %q, want %q", c.name, got, c.want)
		}
	}
}

type fakeGoals struct{ items map[string]domain.Goal }

func newFakeGoals(gs ...domain.Goal) *fakeGoals {
	f := &fakeGoals{items: map[string]domain.Goal{}}
	for _, g := range gs {
		f.items[g.ID] = g
	}
	return f
}

func (f *fakeGoals) All(context.Context) ([]domain.Goal, error) {
	out := make([]domain.Goal, 0, len(f.items))
	for _, g := range f.items {
		out = append(out, g)
	}
	return out, nil
}

func (f *fakeGoals) ByID(_ context.Context, id string) (domain.Goal, error) {
	g, ok := f.items[id]
	if !ok {
		return domain.Goal{}, fmt.Errorf("goal %q not found", id)
	}
	return g, nil
}

func (f *fakeGoals) Create(_ context.Context, g domain.Goal) (domain.Goal, error) {
	f.items[g.ID] = g
	return g, nil
}

func (f *fakeGoals) Update(_ context.Context, g domain.Goal) (domain.Goal, error) {
	f.items[g.ID] = g
	return g, nil
}

func (f *fakeGoals) Delete(_ context.Context, id string) error {
	delete(f.items, id)
	return nil
}

func (f *fakeGoals) InsertMany(_ context.Context, gs []domain.Goal) error {
	for _, g := range gs {
		f.items[g.ID] = g
	}
	return nil
}

func TestReviewGoal(t *testing.T) {
	seed := domain.Goal{ID: "goal-1", Title: "Test goal", Status: domain.GoalStatusActive, PeriodEnd: "2026-06-30T23:59:59Z"}
	audit := &fakeRepo{}
	svc := &Service{goals: newFakeGoals(seed), mod: modRepo{audit}}
	officer := domain.Member{ID: "m-off", DisplayName: "Ama Officer", Role: domain.RoleAccountabilityOfficer}
	ctx := context.Background()

	// An invalid verdict is rejected before anything is written.
	if _, err := svc.ReviewGoal(ctx, "goal-1", "maybe", "", officer); err == nil {
		t.Fatal("expected an error for an invalid verdict")
	}

	// A valid verdict records the reviewer, note, and timestamp.
	out, err := svc.ReviewGoal(ctx, "goal-1", domain.GoalStatusAchieved, "The town turned out.", officer)
	if err != nil {
		t.Fatalf("ReviewGoal: %v", err)
	}
	if out.Status != domain.GoalStatusAchieved {
		t.Errorf("status = %q, want %q", out.Status, domain.GoalStatusAchieved)
	}
	if out.ReviewedByName != "Ama Officer" || out.ReviewNote != "The town turned out." {
		t.Errorf("accountability trail not recorded: %+v", out)
	}
	if out.ReviewedAt == "" {
		t.Error("ReviewedAt was not set")
	}
	if len(audit.mods) != 1 || audit.mods[0].Action != goalAuditVerdict || audit.mods[0].ListingID != "goal-1" || audit.mods[0].ModeratorID != "m-off" {
		t.Errorf("verdict not audited: %+v", audit.mods)
	}
}

// TestGoalVerdictIsFinal: once an officer has judged a goal, the curators who
// set it (and other officers) cannot rewrite, re-judge or delete it; only a
// steward can, and every change is audited.
func TestGoalVerdictIsFinal(t *testing.T) {
	judged := domain.Goal{ID: "goal-j", Title: "Clear the drains", Cadence: domain.GoalCadenceQuarterly,
		Status: domain.GoalStatusMissed, ReviewNote: "5 of 12 still blocked", ReviewedByID: "m-off",
		PeriodStart: "2026-01-01T00:00:00Z", PeriodEnd: "2026-03-31T23:59:59Z"}
	open := domain.Goal{ID: "goal-o", Title: "Plant trees", Cadence: domain.GoalCadenceAnnual, Status: domain.GoalStatusActive,
		PeriodStart: "2026-01-01T00:00:00Z", PeriodEnd: "2026-12-31T23:59:59Z"}
	goals := newFakeGoals(judged, open)
	audit := &fakeRepo{}
	svc := &Service{goals: goals, mod: modRepo{audit}}
	ctx := context.Background()
	curator := domain.Member{ID: "m-cur", Role: domain.RoleCurator}
	officer2 := domain.Member{ID: "m-off2", Role: domain.RoleAccountabilityOfficer}
	steward := domain.Member{ID: "m-stw", Role: domain.RoleSteward}
	edit := GoalInput{Title: "Clear ALL the drains", Cadence: domain.GoalCadenceQuarterly,
		PeriodStart: "2026-01-01T00:00:00Z", PeriodEnd: "2026-03-31T23:59:59Z"}

	var fb *domain.ForbiddenError
	if _, err := svc.UpdateGoal(ctx, curator, "goal-j", edit); !errors.As(err, &fb) {
		t.Errorf("curator edit of a judged goal: want ForbiddenError, got %v", err)
	}
	if err := svc.DeleteGoal(ctx, curator, "goal-j"); !errors.As(err, &fb) {
		t.Errorf("curator delete of a judged goal: want ForbiddenError, got %v", err)
	}
	if _, err := svc.ReviewGoal(ctx, "goal-j", domain.GoalStatusAchieved, "looks fine", officer2); !errors.As(err, &fb) {
		t.Errorf("second verdict by an officer: want ForbiddenError, got %v", err)
	}
	var ve *domain.ValidationError
	if _, err := svc.ReviewGoal(ctx, "goal-o", domain.GoalStatusAchieved, "  ", officer2); !errors.As(err, &ve) {
		t.Errorf("verdict without a note: want ValidationError, got %v", err)
	}
	if g := goals.items["goal-j"]; g.Status != domain.GoalStatusMissed || g.Title != "Clear the drains" {
		t.Fatalf("judged goal changed: %+v", g)
	}
	if len(audit.mods) != 0 {
		t.Fatalf("refused actions must not be audited: %+v", audit.mods)
	}

	// Curators still edit open goals (audited).
	if _, err := svc.UpdateGoal(ctx, curator, "goal-o", GoalInput{Title: "Plant 500 trees", Cadence: domain.GoalCadenceAnnual,
		PeriodStart: "2026-01-01T00:00:00Z", PeriodEnd: "2026-12-31T23:59:59Z"}); err != nil {
		t.Fatalf("curator edit of an open goal: %v", err)
	}

	// A steward may amend the verdict; the old one is kept in the audit reason.
	g, err := svc.ReviewGoal(ctx, "goal-j", domain.GoalStatusAchieved, "Re-inspected: all clear", steward)
	if err != nil || g.Status != domain.GoalStatusAchieved {
		t.Fatalf("steward amendment: %+v, %v", g, err)
	}
	if err := svc.DeleteGoal(ctx, steward, "goal-j"); err != nil {
		t.Fatalf("steward delete: %v", err)
	}
	var actions []string
	for _, m := range audit.mods {
		actions = append(actions, m.Action)
	}
	want := []string{goalAuditEdit, goalAuditAmend, goalAuditDelete}
	if fmt.Sprint(actions) != fmt.Sprint(want) {
		t.Fatalf("audit actions = %v, want %v", actions, want)
	}
	if !strings.Contains(audit.mods[1].Reason, "was missed") {
		t.Errorf("amendment should record the previous verdict: %q", audit.mods[1].Reason)
	}
}
