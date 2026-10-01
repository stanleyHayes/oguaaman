package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// R04: who may take content down with a single urgent report.
func TestSubmitReport_autoHideNeedsTrustedSignedInReporter(t *testing.T) {
	members := []domain.Member{
		{ID: "m-ok", PhoneVerified: true},
		{ID: "m-nophone"},
		{ID: "m-susp", PhoneVerified: true, Suspended: true},
		{ID: "m-c", Role: domain.RoleCurator},
	}
	cases := []struct {
		name     string
		in       ReportInput
		listType string
		hides    bool
	}{
		{"verified member", ReportInput{ReporterID: "m-ok"}, domain.TypeEvent, true},
		{"anonymous", ReportInput{}, domain.TypeEvent, false},
		{"no verified phone", ReportInput{ReporterID: "m-nophone"}, domain.TypeEvent, false},
		{"suspended", ReportInput{ReporterID: "m-susp"}, domain.TypeEvent, false},
		{"legacy route, even signed in", ReportInput{ReporterID: "m-ok", Legacy: true}, domain.TypeEvent, false},
		{"incident, one report", ReportInput{ReporterID: "m-ok"}, domain.TypeIncident, false},
		{"lost & found, one report", ReportInput{ReporterID: "m-ok"}, domain.TypeLostFound, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := &fakeRepo{listings: []domain.Listing{{ID: "l-1", Type: c.listType, Status: domain.StatusApproved, Title: "Post", OwnerID: "m-owner"}}}
			reps, notifs := &fakeReports{}, &lfNotifs{}
			svc := reportServiceWith(f, reps, notifs, &suspendMembers{lfMembers: lfMembers{members: members}}, &fakeReviews{})
			in := c.in
			in.TargetType, in.TargetID, in.Reason = domain.ReportTargetListing, "l-1", domain.ReasonChildSafety
			rep, err := svc.SubmitReport(context.Background(), in)
			if err != nil {
				t.Fatalf("submit: %v", err)
			}
			hidden := f.listings[0].Status != domain.StatusApproved
			if rep.AutoHidden != c.hides || hidden != c.hides {
				t.Fatalf("autoHidden %v, listing status %q; want hidden=%v", rep.AutoHidden, f.listings[0].Status, c.hides)
			}
			if rep.Priority != 0 || noticesTo(notifs, "m-c") != 1 {
				t.Fatalf("an urgent report is top priority and alerts staff: priority %d notices %+v", rep.Priority, notifs.inserted)
			}
		})
	}
}

// R04: a safety post is held only once several different people report it;
// any number of anonymous reports count as one reporter.
func TestSubmitReport_safetyPostNeedsDistinctReporters(t *testing.T) {
	ctx := context.Background()
	members := []domain.Member{{ID: "m-a", PhoneVerified: true}, {ID: "m-b"}, {ID: "m-d"}}
	f := &fakeRepo{listings: []domain.Listing{{ID: "inc-1", Type: domain.TypeIncident, Status: domain.StatusApproved, Title: "Flood", OwnerID: "m-owner"}}}
	svc := reportServiceWith(f, &fakeReports{}, nil, &suspendMembers{lfMembers: lfMembers{members: members}}, &fakeReviews{})
	report := func(reporter string, legacy bool) {
		t.Helper()
		if _, err := svc.SubmitReport(ctx, ReportInput{TargetType: domain.ReportTargetListing, TargetID: "inc-1", Reason: domain.ReasonChildSafety, ReporterID: reporter, Legacy: legacy}); err != nil {
			t.Fatalf("submit: %v", err)
		}
	}
	for i := 0; i < 5; i++ {
		report("", true)
	}
	report("m-a", false)
	if f.listings[0].Status != domain.StatusApproved {
		t.Fatalf("anonymous reports plus one member must not hide an incident, got %q", f.listings[0].Status)
	}
	report("m-b", false)
	if f.listings[0].Status != domain.StatusPending || !f.listings[0].Held {
		t.Fatalf("three distinct reporters hold the incident for review, got %q", f.listings[0].Status)
	}
}
