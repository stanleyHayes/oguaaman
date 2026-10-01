package service

import (
	"context"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// syncIncidentFanOut runs the town-wide fan-out inline so tests can observe it.
func syncIncidentFanOut(t *testing.T) {
	t.Helper()
	prev := incidentFanOut
	incidentFanOut = func(f func()) { f() }
	t.Cleanup(func() { incidentFanOut = prev })
}

func incidentPolicyService(f *fakeRepo, notifs *lfNotifs, blocks *fakeBlockRepo) *Service {
	members := lfMembers{members: []domain.Member{
		{ID: "m-c", Role: domain.RoleCurator},
		{ID: "m-s", Role: domain.RoleSteward},
		{ID: "m-1", Role: domain.RoleMember},
		{ID: "m-2", Role: domain.RoleMember},
	}}
	return New(Deps{Listings: f, Members: members, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: notifs, Follows: stubFollows{}, Blocks: blocks, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}})
}

func noticesTo(notifs *lfNotifs, ids ...string) int {
	want := map[string]bool{}
	for _, id := range ids {
		want[id] = true
	}
	n := 0
	for _, ntf := range notifs.inserted {
		if want[ntf.MemberID] {
			n++
		}
	}
	return n
}

// D3 / A020: crime and medical reports are held for a curator (K12 shape).
func TestSubmitIncident_holdsCrimeAndMedical(t *testing.T) {
	syncIncidentFanOut(t)
	for _, category := range []string{"crime", "medical"} {
		f, notifs := &fakeRepo{}, &lfNotifs{}
		svc := incidentPolicyService(f, notifs, &fakeBlockRepo{})
		l, err := svc.SubmitIncident(context.Background(), &domain.Member{ID: "m-9", PhoneVerified: true}, IncidentInput{
			Title: "Robbery at the market", Category: category, Severity: "critical", Location: "Kotokuraba",
		})
		if err != nil {
			t.Fatalf("%s: submit: %v", category, err)
		}
		if l.Status != domain.StatusPending || !l.Held || l.PublishedAt != "" {
			t.Fatalf("%s: status %q held %v, want pending and held", category, l.Status, l.Held)
		}
		if noticesTo(notifs, "m-1", "m-2") != 0 {
			t.Fatalf("%s: a held report must not alert the town", category)
		}
		if noticesTo(notifs, "m-c", "m-s") != 2 {
			t.Fatalf("%s: curators must be told a report is waiting: %+v", category, notifs.inserted)
		}
	}
}

// F085 / F093 / G117: only a verified member in good standing alerts the town
// straight away; anyone else's severe report reaches curators only.
func TestSubmitIncident_townAlertNeedsTrustedReporter(t *testing.T) {
	syncIncidentFanOut(t)
	in := IncidentInput{Title: "Fire at the harbour", Category: "fire", Severity: "critical", Location: "Bakaano harbour"}

	f, notifs := &fakeRepo{}, &lfNotifs{}
	l, err := incidentPolicyService(f, notifs, &fakeBlockRepo{}).SubmitIncident(context.Background(), &domain.Member{ID: "m-new"}, in)
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if l.Status != domain.StatusApproved {
		t.Fatalf("a fire report still auto-publishes, got %q", l.Status)
	}
	if noticesTo(notifs, "m-1", "m-2") != 0 || noticesTo(notifs, "m-c", "m-s") != 2 {
		t.Fatalf("unverified reporter: want curators only, got %+v", notifs.inserted)
	}

	f, notifs = &fakeRepo{}, &lfNotifs{}
	blocks := &fakeBlockRepo{}
	_ = blocks.Block(context.Background(), "m-2", "m-ok", "")
	if _, err := incidentPolicyService(f, notifs, blocks).SubmitIncident(context.Background(), &domain.Member{ID: "m-ok", PhoneVerified: true}, in); err != nil {
		t.Fatalf("submit: %v", err)
	}
	if noticesTo(notifs, "m-1") != 1 {
		t.Fatalf("a verified reporter's severe report must alert members: %+v", notifs.inserted)
	}
	if noticesTo(notifs, "m-2") != 0 {
		t.Fatal("a member who blocked the reporter must not get the in-app notice")
	}
	if got := asString(f.listings[0].Details, "broadcastAt"); got == "" {
		t.Fatal("the town-wide alert must be recorded so it is sent only once")
	}
	if _, rung := f.listings[0].Details["ringAt"]; rung {
		t.Fatal("an unverified incident must never ring")
	}
}

// A033 / D3: alert text is generic and never carries the member's words.
func TestIncidentAlertIsGeneric(t *testing.T) {
	l := domain.Listing{ID: "inc-1", Slug: "x", Type: domain.TypeIncident, Title: "Kofi Mensah collapsed, HIV positive",
		Details: map[string]any{"category": "medical", "severity": "critical", "location": "Pedu Junction",
			"description": "He is diabetic", "contact": "0244 123 456"}}
	payload := incidentPushPayload(&l, false)
	if payload.Title != "Safety alert near Pedu Junction" || payload.Body != "Medical emergency reported. Open Oguaa for details." {
		t.Fatalf("alert text = %q / %q", payload.Title, payload.Body)
	}
	for _, private := range []string{"Kofi", "HIV", "diabetic", "0244"} {
		if strings.Contains(payload.Title+payload.Body, private) {
			t.Fatalf("alert leaks member-written text %q", private)
		}
	}
	if payload.Ring {
		t.Fatal("ring must be off unless a curator verified the incident")
	}
}

// D3: a curator's verification publishes a held report and sends the alert
// (ringing when critical) exactly once.
func TestTransitionIncident_verifyPublishesAndAlertsOnce(t *testing.T) {
	syncIncidentFanOut(t)
	f, notifs := &fakeRepo{}, &lfNotifs{}
	svc := incidentPolicyService(f, notifs, &fakeBlockRepo{})
	l, err := svc.SubmitIncident(context.Background(), &domain.Member{ID: "m-9"}, IncidentInput{
		Title: "Armed robbery", Category: "crime", Severity: "critical", Location: "Kotokuraba",
	})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	curator := &domain.Member{ID: "m-c", Role: domain.RoleCurator}
	for i := 0; i < 2; i++ {
		if err := svc.TransitionIncident(context.Background(), l.ID, curator, domain.IncidentStatusVerified, "confirmed"); err != nil {
			t.Fatalf("verify: %v", err)
		}
	}
	stored := f.listings[0]
	if stored.Status != domain.StatusApproved || stored.Held {
		t.Fatalf("verification must publish the held report: status %q held %v", stored.Status, stored.Held)
	}
	if noticesTo(notifs, "m-1") != 1 {
		t.Fatalf("members must be alerted exactly once, got %d", noticesTo(notifs, "m-1"))
	}
	if asString(stored.Details, "ringAt") == "" {
		t.Fatal("a verified critical incident rings")
	}
}

// G117: a retraction unpublishes and corrects the alert.
func TestTransitionIncident_retractCorrectsTheAlert(t *testing.T) {
	syncIncidentFanOut(t)
	f, notifs := &fakeRepo{}, &lfNotifs{}
	svc := incidentPolicyService(f, notifs, &fakeBlockRepo{})
	l, err := svc.SubmitIncident(context.Background(), &domain.Member{ID: "m-9", PhoneVerified: true}, IncidentInput{
		Title: "Flood", Category: "flood", Severity: "high", Location: "Siwdu",
	})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if err := svc.TransitionIncident(context.Background(), l.ID, &domain.Member{ID: "m-c", Role: domain.RoleCurator}, domain.IncidentStatusRetracted, "false alarm"); err != nil {
		t.Fatalf("retract: %v", err)
	}
	if f.listings[0].Status != domain.StatusUnpublished {
		t.Fatalf("retracted incident status = %q, want unpublished", f.listings[0].Status)
	}
	var corrected bool
	for _, n := range notifs.inserted {
		if n.MemberID == "m-1" && strings.HasPrefix(n.Title, "Correction") {
			corrected = true
		}
	}
	if !corrected {
		t.Fatalf("members who got the alert must get the correction: %+v", notifs.inserted)
	}
}

// F095 / D3: the public never sees the reporter's contact, member id or the
// ids of the staff who updated an incident.
func TestIncidentPublicViewHidesReporter(t *testing.T) {
	svc, _ := incidentTestService()
	ctx := context.Background()
	list, err := svc.Incidents(ctx, nil, IncidentFilters{})
	if err != nil || len(list) != 1 {
		t.Fatalf("list: %v %v", list, err)
	}
	pub := list[0]
	if pub.OwnerID != "" || pub.Details["contact"] != nil {
		t.Fatalf("public incident exposes the reporter: %+v", pub)
	}
	hist, _ := pub.Details["statusHistory"].([]any)
	if len(hist) != 1 || hist[0].(map[string]any)["by"] != nil || hist[0].(map[string]any)["status"] != "reported" {
		t.Fatalf("public history = %+v, want entries without actor ids", hist)
	}
	for _, viewer := range []*domain.Member{{ID: "m-7"}, {ID: "m-x", Role: domain.RoleModerator}} {
		l, err := svc.Incident(ctx, viewer, "fallen-tree-at-aboom")
		if err != nil || l.OwnerID != "m-7" {
			t.Fatalf("%s must see the reporter: %+v (%v)", viewer.ID, l, err)
		}
	}
}

func TestSubmitIncident_contentScreen(t *testing.T) {
	syncIncidentFanOut(t)
	svc := incidentPolicyService(&fakeRepo{}, &lfNotifs{}, &fakeBlockRepo{})
	member := &domain.Member{ID: "m-9", PhoneVerified: true}
	// R03: a report quoting a threat reaches curators (held), never refused.
	quoted, err := svc.SubmitIncident(context.Background(), member, IncidentInput{
		Title: "Threat to my life", Category: "other", Severity: "high", Location: "Abura",
		Description: "My neighbour shouted 'I will kill you' and chased me with a cutlass",
	})
	if err != nil {
		t.Fatalf("a quoted threat must not be refused: %v", err)
	}
	if !quoted.Held || quoted.Status != domain.StatusPending {
		t.Fatalf("a report quoting a threat must wait for a curator: %+v", quoted)
	}
	l, err := svc.SubmitIncident(context.Background(), member, IncidentInput{
		Title: "Accident", Category: "accident", Severity: "high", Location: "Abura", Description: "The driver's wife is on 0244 123 456",
	})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if !l.Held || l.Status != domain.StatusPending {
		t.Fatalf("a report naming a phone number must wait for a curator: %+v", l)
	}
}
