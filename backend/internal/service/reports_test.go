package service

import (
	"context"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

func reportTestService() (*Service, *fakeRepo) {
	f := &fakeRepo{listings: []domain.Listing{
		{ID: "l-1", Slug: "ck-mann", Type: domain.TypeArtist, Status: domain.StatusApproved, Title: "C.K. Mann"},
	}}
	return newTestService(f), f
}

func TestSubmitReport_validatesReason(t *testing.T) {
	svc, _ := reportTestService()
	ctx := context.Background()

	if _, err := svc.SubmitReport(ctx, ReportInput{ListingID: "l-1", Reason: "spaceship"}); err == nil {
		t.Error("expected an error for an unknown reason category")
	}
	if _, err := svc.SubmitReport(ctx, ReportInput{ListingID: "l-1", Reason: ""}); err == nil {
		t.Error("expected an error for a missing reason")
	}
}

func TestSubmitReport_rejectsOverlongDetail(t *testing.T) {
	svc, _ := reportTestService()
	in := ReportInput{ListingID: "l-1", Reason: domain.ReasonInappropriate, Detail: strings.Repeat("x", 2001)}
	if _, err := svc.SubmitReport(context.Background(), in); err == nil {
		t.Error("expected an error for detail over 2000 chars")
	}
}

func TestSubmitReport_unknownListingIsNotFound(t *testing.T) {
	svc, _ := reportTestService()
	_, err := svc.SubmitReport(context.Background(), ReportInput{ListingID: "nope", Reason: domain.ReasonInaccurate})
	var nf *domain.NotFoundError
	if err == nil || !asNotFound(err, &nf) {
		t.Errorf("expected NotFoundError for an unknown listing, got %v", err)
	}
}

func TestSubmitReport_denormalisesListingAndDefaults(t *testing.T) {
	svc, _ := reportTestService()
	rep, err := svc.SubmitReport(context.Background(), ReportInput{
		ListingID: "l-1", Reason: domain.ReasonBereavement, Detail: "  please review  ",
		ReporterID: "m-9", ReporterName: "Ama",
	})
	if err != nil {
		t.Fatalf("valid report failed: %v", err)
	}
	if rep.ListingSlug != "ck-mann" || rep.ListingType != domain.TypeArtist || rep.ListingTitle != "C.K. Mann" {
		t.Errorf("report did not denormalise the listing: %+v", rep)
	}
	if rep.Status != domain.ReportOpen {
		t.Errorf("new report status = %q, want open", rep.Status)
	}
	if rep.Detail != "please review" {
		t.Errorf("detail not trimmed: %q", rep.Detail)
	}
	if rep.ReporterID != "m-9" || rep.ReporterName != "Ama" {
		t.Errorf("reporter not attributed: %+v", rep)
	}
}

func TestResolveReport_validatesStatus(t *testing.T) {
	svc, _ := reportTestService()
	ctx := context.Background()
	if err := svc.ResolveReport(ctx, "rpt-1", "maybe", "", "m-mod"); err == nil {
		t.Error("expected an error for an invalid resolution status")
	}
	if err := svc.ResolveReport(ctx, "rpt-1", domain.ReportActioned, "removed", "m-mod"); err != nil {
		t.Errorf("actioned resolution should succeed, got %v", err)
	}
	if err := svc.ResolveReport(ctx, "rpt-1", domain.ReportDismissed, "", "m-mod"); err != nil {
		t.Errorf("dismissed resolution should succeed, got %v", err)
	}
}

// asNotFound reports whether err is (or wraps) a *NotFoundError, binding target.
func asNotFound(err error, target **domain.NotFoundError) bool {
	nf, ok := err.(*domain.NotFoundError)
	if ok {
		*target = nf
	}
	return ok
}
