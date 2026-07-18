package service

import (
	"context"
	"fmt"
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
	svc := &Service{goals: newFakeGoals(seed)}
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
}
