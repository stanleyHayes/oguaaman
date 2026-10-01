package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// fakeReports is an in-memory ReportRepository.
type fakeReports struct{ rows []domain.Report }

func (f *fakeReports) Insert(_ context.Context, r domain.Report) error {
	f.rows = append(f.rows, r)
	return nil
}
func (f *fakeReports) All(context.Context) ([]domain.Report, error) {
	return append([]domain.Report(nil), f.rows...), nil
}
func (f *fakeReports) Get(_ context.Context, id string) (*domain.Report, error) {
	for i := range f.rows {
		if f.rows[i].ID == id {
			r := f.rows[i]
			return &r, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "report"}
}
func (f *fakeReports) UpdateStatus(_ context.Context, id, status, reviewedBy, resolution, at string) error {
	return f.Resolve(context.Background(), id, status, "", reviewedBy, resolution, at)
}
func (f *fakeReports) OpenCount(context.Context) (int, error) {
	n := 0
	for _, r := range f.rows {
		if r.Status == domain.ReportOpen {
			n++
		}
	}
	return n, nil
}
func (f *fakeReports) OpenByTarget(_ context.Context, typ, id string) ([]domain.Report, error) {
	out := []domain.Report{}
	for _, r := range f.rows {
		if r.Status == domain.ReportOpen && reportTargetType(&r) == typ && reportTargetID(&r) == id {
			out = append(out, r)
		}
	}
	return out, nil
}
func (f *fakeReports) Resolve(_ context.Context, id, status, action, reviewedBy, resolution, at string) error {
	for i := range f.rows {
		if f.rows[i].ID == id {
			f.rows[i].Status, f.rows[i].Action, f.rows[i].ReviewedByID, f.rows[i].Resolution, f.rows[i].ReviewedAt = status, action, reviewedBy, resolution, at
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "report"}
}

// suspendMembers records suspensions and serves a fixed member list.
type suspendMembers struct {
	lfMembers
	suspended map[string]bool
}

func (m *suspendMembers) SetSuspended(_ context.Context, id string, v bool) error {
	if m.suspended == nil {
		m.suspended = map[string]bool{}
	}
	m.suspended[id] = v
	return nil
}
func (m *suspendMembers) ByID(_ context.Context, id string) (*domain.Member, error) {
	for i := range m.members {
		if m.members[i].ID == id {
			return &m.members[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}

func reportService(f *fakeRepo, reps *fakeReports, notifs *lfNotifs) *Service {
	return reportServiceWith(f, reps, notifs, &suspendMembers{}, &fakeReviews{})
}

func reportServiceWith(f *fakeRepo, reps *fakeReports, notifs *lfNotifs, members *suspendMembers, reviews *fakeReviews) *Service {
	var n domain.NotificationRepository = stubNotifs{}
	if notifs != nil {
		n = notifs
	}
	return New(Deps{Listings: f, Members: members, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: n, Follows: stubFollows{}, Claims: stubClaims{}, News: stubNews{}, Reports: reps, Timeline: stubTimeline{}, Reviews: reviews})
}

// K11 / G109 / G110 / A017: an urgent report hides the content at once, keeps
// evidence and alerts every safety role.
func TestSubmitReport_urgentHidesAndAlerts(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{{ID: "l-1", Type: domain.TypeEvent, Status: domain.StatusApproved, Title: "Party", OwnerID: "m-bad"}}}
	reps, notifs := &fakeReports{}, &lfNotifs{}
	members := &suspendMembers{lfMembers: lfMembers{members: []domain.Member{{ID: "m-c", Role: domain.RoleCurator}, {ID: "m-mod", Role: domain.RoleModerator}, {ID: "m-1", PhoneVerified: true}}}}
	svc := reportServiceWith(f, reps, notifs, members, &fakeReviews{})
	for _, reason := range []string{domain.ReasonChildSafety} {
		rep, err := svc.SubmitReport(ctx, ReportInput{TargetType: domain.ReportTargetListing, TargetID: "l-1", Reason: reason, ReporterID: "m-1"})
		if err != nil {
			t.Fatalf("submit: %v", err)
		}
		if !rep.AutoHidden || f.listings[0].Status != domain.StatusPending || rep.Evidence == "" || rep.Priority != 0 {
			t.Fatalf("urgent report: hidden %v status %q evidence %q priority %d", rep.AutoHidden, f.listings[0].Status, rep.Evidence, rep.Priority)
		}
	}
	if noticesTo(notifs, "m-c", "m-mod") != 2 || noticesTo(notifs, "m-1") != 0 {
		t.Fatalf("staff alerts: %+v", notifs.inserted)
	}
	// Dismissing with no action puts the content back.
	if err := svc.ResolveReport(ctx, reps.rows[0].ID, ResolveReportInput{Status: domain.ReportDismissed}, "m-c"); err != nil {
		t.Fatal(err)
	}
	if f.listings[0].Status != domain.StatusApproved {
		t.Fatalf("dismissed urgent report must restore the listing, got %q", f.listings[0].Status)
	}
}

// K11 / A004 / P051: every target type resolves; reviews and tributes hide.
func TestSubmitReport_targetTypes(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{
		{ID: "b-1", Slug: "shop", Type: domain.TypeBusiness, Status: domain.StatusApproved, Title: "Shop", OwnerID: "m-owner",
			Products: []domain.StoreItem{{ID: "p-1", Name: "Kente"}}},
		{ID: "mem-1", Type: domain.TypeMemorial, Status: domain.StatusApproved, Title: "Auntie", Tributes: []domain.Tribute{{ID: "trb-1", MemberID: "m-t", AuthorName: "T"}}},
	}}
	reviews := &fakeReviews{rows: []domain.Review{{ID: "rev-1", ListingID: "b-1", MemberID: "m-r", AuthorName: "R", Rating: 1}}}
	members := &suspendMembers{lfMembers: lfMembers{members: []domain.Member{{ID: "m-x", Slug: "kofi", DisplayName: "Kofi"}, {ID: "m-rep", PhoneVerified: true}}}}
	svc := reportServiceWith(f, &fakeReports{}, nil, members, reviews)

	cases := []struct {
		in    ReportInput
		owner string
	}{
		{ReportInput{TargetType: "listing", TargetID: "b-1"}, "m-owner"},
		{ReportInput{TargetType: "member", TargetID: "kofi"}, "m-x"},
		{ReportInput{TargetType: "review", TargetID: "rev-1"}, "m-r"},
		{ReportInput{TargetType: "tribute", TargetID: "trb-1"}, "m-t"},
		{ReportInput{TargetType: "product", TargetID: "p-1", ListingID: "b-1"}, "m-owner"},
		{ReportInput{TargetType: "ai_output", TargetID: "sugg-1"}, ""},
	}
	for _, c := range cases {
		c.in.Reason, c.in.ReporterID = domain.ReasonNCII, "m-rep"
		rep, err := svc.SubmitReport(ctx, c.in)
		if err != nil {
			t.Fatalf("%s: %v", c.in.TargetType, err)
		}
		if rep.TargetOwnerID != c.owner || rep.TargetTitle == "" {
			t.Fatalf("%s: owner %q title %q", c.in.TargetType, rep.TargetOwnerID, rep.TargetTitle)
		}
	}
	if reviews.rows[0].Status != domain.ReviewHidden || f.listings[1].Tributes[0].Status != domain.TributeHidden {
		t.Fatalf("urgent review/tribute reports must hide them: %q %q", reviews.rows[0].Status, f.listings[1].Tributes[0].Status)
	}
	if _, err := svc.SubmitReport(ctx, ReportInput{TargetType: "spaceship", TargetID: "x", Reason: domain.ReasonOther}); err == nil {
		t.Fatal("unknown target types are refused")
	}
	var nf *domain.NotFoundError
	if _, err := svc.SubmitReport(ctx, ReportInput{TargetType: "tribute", TargetID: "nope", Reason: domain.ReasonOther}); !errors.As(err, &nf) {
		t.Fatalf("missing tribute: got %v", err)
	}
}

// A017 / K11: remove_and_suspend takes the content down and suspends its author.
func TestResolveReport_removeAndSuspend(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{{ID: "l-1", Type: domain.TypeEvent, Status: domain.StatusApproved, Title: "Scam", OwnerID: "m-bad"}}}
	reps, notifs := &fakeReports{}, &lfNotifs{}
	members := &suspendMembers{}
	svc := reportServiceWith(f, reps, notifs, members, &fakeReviews{})
	rep, err := svc.SubmitReport(ctx, ReportInput{ListingID: "l-1", Reason: domain.ReasonScam, ReporterID: "m-rep"})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.ResolveReport(ctx, rep.ID, ResolveReportInput{Action: domain.ReportActionRemoveAndSuspend, Resolution: "fake event"}, "m-c"); err != nil {
		t.Fatal(err)
	}
	if f.listings[0].Status != domain.StatusUnpublished || !members.suspended["m-bad"] {
		t.Fatalf("status %q suspended %v", f.listings[0].Status, members.suspended)
	}
	if reps.rows[0].Status != domain.ReportActioned || reps.rows[0].Action != domain.ReportActionRemoveAndSuspend {
		t.Fatalf("report row = %+v", reps.rows[0])
	}
	if noticesTo(notifs, "m-rep") != 1 {
		t.Fatal("the reporter must be told the outcome")
	}
	if len(f.mods) == 0 || f.mods[len(f.mods)-1].Action != "report-remove_and_suspend" {
		t.Fatalf("the removal must be audited: %+v", f.mods)
	}
}

// A017: the queue carries age and SLA state; the most urgent open reports lead.
func TestReports_slaAndOrder(t *testing.T) {
	old := time.Now().UTC().Add(-25 * time.Hour).Format(time.RFC3339)
	fresh := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	reps := &fakeReports{rows: []domain.Report{
		{ID: "r-closed", Status: domain.ReportDismissed, CreatedAt: old},
		{ID: "r-scam", Status: domain.ReportOpen, Reason: domain.ReasonScam, Priority: 4, CreatedAt: old, ListingID: "l-9", ListingTitle: "Legacy"},
		{ID: "r-child", Status: domain.ReportOpen, Reason: domain.ReasonChildSafety, Priority: 0, CreatedAt: fresh},
	}}
	svc := reportService(&fakeRepo{}, reps, nil)
	rows, err := svc.Reports(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if rows[0].ID != "r-child" || rows[1].ID != "r-scam" || rows[2].ID != "r-closed" {
		t.Fatalf("order = %s %s %s", rows[0].ID, rows[1].ID, rows[2].ID)
	}
	if !rows[1].SLABreached || rows[0].SLABreached || rows[2].SLABreached || rows[1].AgeMinutes < 24*60 {
		t.Fatalf("sla flags wrong: %+v", rows)
	}
	if rows[1].TargetType != domain.ReportTargetListing || rows[1].TargetID != "l-9" || rows[1].TargetTitle != "Legacy" {
		t.Fatalf("legacy row not normalised: %+v", rows[1].Report)
	}
}

// A017: a sensitive listing is held once three people have open reports.
func TestSubmitReport_thresholdHoldsSensitiveListing(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{{ID: "inc-1", Type: domain.TypeIncident, Status: domain.StatusApproved, Title: "Fire"}}}
	svc := reportService(f, &fakeReports{}, nil)
	for i, who := range []string{"m-1", "m-2", "m-2", "m-3"} {
		if _, err := svc.SubmitReport(ctx, ReportInput{ListingID: "inc-1", Reason: domain.ReasonInaccurate, ReporterID: who}); err != nil {
			t.Fatal(err)
		}
		held := f.listings[0].Status == domain.StatusPending
		if want := i == 3; held != want {
			t.Fatalf("after report %d held = %v, want %v", i+1, held, want)
		}
	}
}

func (m *suspendMembers) BySlug(_ context.Context, slug string) (*domain.Member, error) {
	for i := range m.members {
		if m.members[i].Slug == slug {
			return &m.members[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}
