package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// P060: auto-published safety posts wait in a follow-up queue until reviewed.
func TestSafetyReviewQueue(t *testing.T) {
	syncIncidentFanOut(t)
	ctx := context.Background()
	f := &fakeRepo{}
	svc := incidentPolicyService(f, &lfNotifs{}, &fakeBlockRepo{})
	l, err := svc.SubmitIncident(ctx, &domain.Member{ID: "m-9", PhoneVerified: true}, IncidentInput{Title: "Burst pipe", Category: "utility", Severity: "low", Location: "Siwdu"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SubmitIncident(ctx, &domain.Member{ID: "m-9"}, IncidentInput{Title: "Stabbing", Category: "crime", Severity: "high", Location: "Abura"}); err != nil {
		t.Fatal(err)
	}
	rows, err := svc.SafetyReviewQueue(ctx)
	if err != nil || len(rows) != 1 || rows[0].ID != l.ID {
		t.Fatalf("queue = %+v (%v), want only the auto-published incident", rows, err)
	}
	var fb *domain.ForbiddenError
	if err := svc.MarkSafetyReviewed(ctx, &domain.Member{ID: "m-1"}, l.ID); !errors.As(err, &fb) {
		t.Fatalf("members can't mark reviews: %v", err)
	}
	if err := svc.MarkSafetyReviewed(ctx, &domain.Member{ID: "m-c", Role: domain.RoleCurator}, l.ID); err != nil {
		t.Fatal(err)
	}
	if rows, _ := svc.SafetyReviewQueue(ctx); len(rows) != 0 {
		t.Fatalf("reviewed post still queued: %+v", rows)
	}
	pub, err := svc.Incident(ctx, nil, l.Slug)
	if err != nil || pub.Details["postReviewedBy"] != nil {
		t.Fatalf("public view leaks the reviewer: %+v (%v)", pub, err)
	}
}
