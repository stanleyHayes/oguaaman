package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// staffReachMembers is lfMembers that can also look a member up by id, so
// out-of-band copies (email / WhatsApp) reach the staff.
type staffReachMembers struct{ lfMembers }

func (m staffReachMembers) ByID(_ context.Context, id string) (*domain.Member, error) {
	for i := range m.members {
		if m.members[i].ID == id {
			return &m.members[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}

func incidentReviewService(f *fakeRepo, notifs *lfNotifs, email EmailSender, push *PushSender) *Service {
	members := staffReachMembers{lfMembers{members: []domain.Member{
		{ID: "m-c", Role: domain.RoleCurator, Email: "curator@example.com"},
		{ID: "m-s", Role: domain.RoleSteward, Email: "steward@example.com"},
		{ID: "m-1", Role: domain.RoleMember, Email: "one@example.com"},
	}}}
	return New(Deps{Listings: f, Members: members, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: notifs,
		Follows: stubFollows{}, Blocks: &fakeBlockRepo{}, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{},
		Timeline: stubTimeline{}, Email: email, Push: push})
}

func heldCriticalCrime(t *testing.T, svc *Service) *domain.Listing {
	t.Helper()
	l, err := svc.SubmitIncident(context.Background(), &domain.Member{ID: "m-9", PhoneVerified: true}, IncidentInput{
		Title: "Armed robbery", Category: "crime", Severity: "critical", Location: "Kotokuraba market",
	})
	if err != nil || !l.Held {
		t.Fatalf("submit: %+v (%v)", l, err)
	}
	return l
}

// R02: a held report reaches curators out of band (email and a staff push),
// never the town.
func TestHeldIncident_alertsCuratorsOutOfBand(t *testing.T) {
	syncIncidentFanOut(t)
	push, _, expo := expoFixture(t, 0, "c", "s", "1")
	mail := &recEmail{}
	svc := incidentReviewService(&fakeRepo{}, &lfNotifs{}, mail, push)
	heldCriticalCrime(t, svc)

	got := map[string]bool{}
	for _, m := range mail.sent {
		got[m.to] = true
	}
	if !got["curator@example.com"] || !got["steward@example.com"] || got["one@example.com"] {
		t.Fatalf("held-report email went to %v, want the curator and steward only", got)
	}
	if expo.delivered[expoToken("c")] != 1 || expo.delivered[expoToken("s")] != 1 {
		t.Fatalf("staff push deliveries = %v", expo.delivered)
	}
	if expo.delivered[expoToken("1")] != 0 {
		t.Fatal("a held report must not push to ordinary members")
	}
}

// R02: the admin Incidents list shows held reports (first) to safety staff
// only, so they can verify them.
func TestAdminIncidents_listsHeldReportsForStaff(t *testing.T) {
	syncIncidentFanOut(t)
	f := &fakeRepo{listings: []domain.Listing{
		{ID: "inc-live", Type: domain.TypeIncident, Status: domain.StatusApproved, CreatedAt: "2026-09-30T10:00:00Z"},
		{ID: "inc-draft", Type: domain.TypeIncident, Status: domain.StatusPending, CreatedAt: "2026-09-30T11:00:00Z"},
	}}
	svc := incidentReviewService(f, &lfNotifs{}, nil, nil)
	held := heldCriticalCrime(t, svc)

	if _, err := svc.AdminIncidents(context.Background(), &domain.Member{ID: "m-1"}); err == nil {
		t.Fatal("a member must not read the staff incident list")
	}
	items, err := svc.AdminIncidents(context.Background(), &domain.Member{ID: "m-c", Role: domain.RoleCurator})
	if err != nil {
		t.Fatalf("admin incidents: %v", err)
	}
	if len(items) != 2 || items[0].ID != held.ID || items[1].ID != "inc-live" {
		t.Fatalf("admin incidents = %+v, want the held report first, then the live one", items)
	}
}

// R02: approving a held incident from the moderation queue is a verification:
// it publishes the report, records the verified status and alerts the town
// (ringing, as it is critical).
func TestModerateApprove_heldIncidentGoesThroughVerification(t *testing.T) {
	syncIncidentFanOut(t)
	f, notifs := &fakeRepo{}, &lfNotifs{}
	svc := incidentReviewService(f, notifs, nil, nil)
	held := heldCriticalCrime(t, svc)

	if err := svc.Moderate(context.Background(), held.ID, actionApprove, "", "m-c"); err != nil {
		t.Fatalf("moderate: %v", err)
	}
	l := f.listings[0]
	if l.Status != domain.StatusApproved || l.Held {
		t.Fatalf("status %q held %v, want approved", l.Status, l.Held)
	}
	if asString(l.Details, "incidentStatus") != domain.IncidentStatusVerified {
		t.Fatalf("incidentStatus = %v, want verified", l.Details["incidentStatus"])
	}
	if asString(l.Details, "broadcastAt") == "" || asString(l.Details, "ringAt") == "" {
		t.Fatalf("a verified critical incident must alert and ring: %+v", l.Details)
	}
	if noticesTo(notifs, "m-1") == 0 {
		t.Fatal("the town must get the alert once the report is approved")
	}
}
