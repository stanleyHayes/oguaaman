package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// fakeAdReports is an AdReports over a fixed set of campaigns.
type fakeAdReports struct {
	ads     map[string]AdReport
	removed map[string]string // id → staff id
}

func (f *fakeAdReports) AdForReport(_ context.Context, id string) (*AdReport, error) {
	a, ok := f.ads[id]
	if !ok {
		return nil, &domain.NotFoundError{Entity: "ad"}
	}
	return &a, nil
}

func (f *fakeAdReports) RemoveReportedAd(_ context.Context, id, staffID, _ string) error {
	if f.removed == nil {
		f.removed = map[string]string{}
	}
	f.removed[id] = staffID
	return nil
}

// Spec §1.6: ads are reportable, never auto-hidden, political ads jump the
// queue, and "remove" takes the campaign down through the ads service.
func TestSubmitReport_ads(t *testing.T) {
	ctx := context.Background()
	reps := &fakeReports{}
	members := &suspendMembers{lfMembers: lfMembers{members: []domain.Member{{ID: "m-rep", PhoneVerified: true}}}}
	svc := reportServiceWith(&fakeRepo{}, reps, nil, members, &fakeReviews{})

	var nf *domain.NotFoundError
	if _, err := svc.SubmitReport(ctx, ReportInput{TargetType: domain.ReportTargetAd, TargetID: "ad_1", Reason: domain.ReasonScam}); !errors.As(err, &nf) {
		t.Fatalf("without the ads service an ad report is not found, got %v", err)
	}

	ads := &fakeAdReports{ads: map[string]AdReport{
		"ad_1": {ID: "ad_1", Title: "Kotokuraba market days", OwnerID: "m-adv", Status: "active", Evidence: map[string]string{"headline": "Kotokuraba market days"}},
		"ad_2": {ID: "ad_2", OwnerID: "m-pol", Status: "active", Political: true},
	}}
	svc.SetAdReports(ads)

	// An urgent reason still never hides an ad.
	rep, err := svc.SubmitReport(ctx, ReportInput{TargetType: domain.ReportTargetAd, TargetID: "ad_1", Reason: domain.ReasonChildSafety, ReporterID: "m-rep"})
	if err != nil {
		t.Fatal(err)
	}
	if rep.AutoHidden || rep.TargetTitle != "Kotokuraba market days" || rep.TargetOwnerID != "m-adv" || rep.Evidence == "" || rep.Priority != 0 {
		t.Fatalf("commercial ad report = %+v", rep)
	}

	pol, err := svc.SubmitReport(ctx, ReportInput{TargetType: domain.ReportTargetAd, TargetID: "ad_2", Reason: domain.ReasonInaccurate})
	if err != nil {
		t.Fatal(err)
	}
	if pol.Priority != domain.ReportPriorityHigh || pol.TargetTitle != "Advertisement" {
		t.Fatalf("political ad report priority %d title %q", pol.Priority, pol.TargetTitle)
	}
	plain, _ := svc.SubmitReport(ctx, ReportInput{TargetType: domain.ReportTargetAd, TargetID: "ad_1", Reason: domain.ReasonInaccurate})
	if plain.Priority != domain.ReportPriority(domain.ReasonInaccurate) {
		t.Fatalf("commercial ad report priority = %d", plain.Priority)
	}

	if err := svc.ResolveReport(ctx, pol.ID, ResolveReportInput{Action: domain.ReportActionRemove, Resolution: "false claims"}, "m-c"); err != nil {
		t.Fatal(err)
	}
	if ads.removed["ad_2"] != "m-c" {
		t.Fatalf("remove must go through the ads service: %v", ads.removed)
	}
}
