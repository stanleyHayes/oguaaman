package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

func strp(s string) *string { return &s }

// scopedOrgFixture is the team fixture plus an officer (m-off), a MoMo number
// and one verification link on the org, and a recording notification inbox.
func scopedOrgFixture() (*recOrgs, teamMembers, *recClaims, *recNotifs, *Service) {
	orgs, members, claims := teamFixture()
	orgs.orgs[0].MoMoNumber = "024 000 0000"
	orgs.orgs[0].VerificationArtifacts = []domain.SocialLink{{Label: "GES list", URL: "https://ges.gov.gh/list"}}
	claims.claims = append(claims.claims, domain.OrgClaim{
		ID: "clm-off", OrgID: "org-bak", MemberID: "m-off", RequestedRole: "Secretary",
		Status: domain.ClaimApproved, Scope: domain.ScopeOfficer,
	})
	notifs := &recNotifs{}
	f := &fakeRepo{}
	svc := New(Deps{
		Listings: f, Members: members, Orgs: orgs, Places: stubPlaces{}, Mod: modRepo{f},
		Notifs: notifs, Follows: stubFollows{}, Claims: claims, News: stubNews{},
		Reports: stubReports{}, Timeline: stubTimeline{},
	})
	return orgs, members, claims, notifs, svc
}

func isForbiddenErr(err error) bool {
	var fb *domain.ForbiddenError
	return errors.As(err, &fb)
}

// F105: an officer ("content only") must not redirect donations.
func TestUpdateOrgProfile_officerCannotChangeMoMoNumber(t *testing.T) {
	orgs, _, _, _, svc := scopedOrgFixture()

	_, err := svc.UpdateOrgProfile(context.Background(), "m-off", "bakaano-basic", domain.OrgProfilePatch{MoMoNumber: strp("055 111 2222")})
	if !isForbiddenErr(err) {
		t.Fatalf("officer changing the MoMo number: err = %v, want forbidden", err)
	}
	if orgs.orgs[0].MoMoNumber != "024 000 0000" {
		t.Errorf("MoMo number changed to %q", orgs.orgs[0].MoMoNumber)
	}
}

func TestUpdateOrgProfile_officerCannotChangeVerificationLinks(t *testing.T) {
	_, _, _, _, svc := scopedOrgFixture()
	forged := []domain.SocialLink{{Label: "Official", URL: "https://evil.example/fake"}}

	_, err := svc.UpdateOrgProfile(context.Background(), "m-off", "bakaano-basic", domain.OrgProfilePatch{VerificationArtifacts: &forged})
	if !isForbiddenErr(err) {
		t.Fatalf("officer changing verification links: err = %v, want forbidden", err)
	}
}

// The existing forms re-send every field; an officer's content edit that
// carries the unchanged money/trust fields must still save.
func TestUpdateOrgProfile_officerResendingUnchangedFieldsSaves(t *testing.T) {
	orgs, _, _, _, svc := scopedOrgFixture()
	same := []domain.SocialLink{{Label: "GES list", URL: "https://ges.gov.gh/list"}}

	_, err := svc.UpdateOrgProfile(context.Background(), "m-off", "bakaano-basic", domain.OrgProfilePatch{
		Summary: strp("Updated by the secretary."), MoMoNumber: strp(" 024 000 0000 "), VerificationArtifacts: &same,
	})
	if err != nil {
		t.Fatalf("officer content edit with unchanged money fields: %v", err)
	}
	if orgs.orgs[0].Summary != "Updated by the secretary." {
		t.Errorf("summary = %q", orgs.orgs[0].Summary)
	}
}

// A manager may change the number; every OTHER manager is told, the actor and
// officers are not.
func TestUpdateOrgProfile_managerChangeNotifiesOtherManagers(t *testing.T) {
	orgs, _, claims, notifs, svc := scopedOrgFixture()
	claims.claims = append(claims.claims, domain.OrgClaim{
		ID: "clm-mgr2", OrgID: "org-bak", MemberID: "m-new", RequestedRole: "Chair", Status: domain.ClaimApproved,
	})

	if _, err := svc.UpdateOrgProfile(context.Background(), "m-mgr", "bakaano-basic", domain.OrgProfilePatch{MoMoNumber: strp("055 111 2222")}); err != nil {
		t.Fatalf("manager change: %v", err)
	}
	if orgs.orgs[0].MoMoNumber != "055 111 2222" {
		t.Errorf("MoMo number = %q", orgs.orgs[0].MoMoNumber)
	}
	told := map[string]bool{}
	for _, n := range notifs.inserted {
		told[n.MemberID] = true
	}
	if !told["m-new"] || told["m-mgr"] || told["m-off"] {
		t.Errorf("notified %v, want only the other manager m-new", told)
	}
}

func TestUpdateOrgProfile_rejectsMalformedMoMoNumber(t *testing.T) {
	_, _, _, _, svc := scopedOrgFixture()
	if _, err := svc.UpdateOrgProfile(context.Background(), "m-mgr", "bakaano-basic", domain.OrgProfilePatch{MoMoNumber: strp("pay me on telegram")}); err == nil {
		t.Error("a non-numeric MoMo number must be refused")
	}
}

// F110/F117: the roster is a manager power.
func TestSetOrgOffices_officerRefused(t *testing.T) {
	_, _, _, _, svc := scopedOrgFixture()
	_, err := svc.SetOrgOffices(context.Background(), "m-off", "bakaano-basic", []domain.Office{{Role: "Director", HolderName: "Hon. X"}})
	if !isForbiddenErr(err) {
		t.Fatalf("officer roster edit: err = %v, want forbidden", err)
	}
}

// F117: "verified" is recomputed server-side, never taken from the client.
func TestSetOrgOffices_recomputesVerification(t *testing.T) {
	orgs, _, _, _, svc := scopedOrgFixture()
	in := []domain.Office{
		{Role: "Director", HolderName: "Hon. X", Verified: true},                      // forged tick, no holder
		{Role: "Secretary", HolderID: "m-off"},                                        // real team member
		{Role: "Headteacher", HolderID: "m-mgr", HolderName: "Mr. B", Verified: true}, // renamed verified row
		{Role: "PTA Chair", HolderID: "m-new", HolderName: "Kofi Annan", Verified: true},
	}
	if _, err := svc.SetOrgOffices(context.Background(), "m-mgr", "bakaano-basic", in); err != nil {
		t.Fatalf("SetOrgOffices: %v", err)
	}
	got := map[string]domain.Office{}
	for _, o := range orgs.orgs[0].Offices {
		got[o.Role] = o
	}
	if o := got["Director"]; o.Verified || o.HolderID != "" {
		t.Errorf("forged tick survived: %+v", o)
	}
	if o := got["Secretary"]; !o.Verified || o.HolderName != "Ms. Essien" {
		t.Errorf("team member row should be verified with their own name: %+v", o)
	}
	if o := got["Headteacher"]; o.Verified || o.HolderID != "" || o.HolderName != "Mr. B" {
		t.Errorf("a renamed verified row must become an unverified row for the new name: %+v", o)
	}
	if o := got["PTA Chair"]; o.Verified || o.HolderID != "" {
		t.Errorf("a holder without an approved claim must not be verified: %+v", o)
	}
}

// A steward-curated verified row survives a manager's roster save untouched,
// but loses its tick the moment its holder is renamed.
func TestSetOrgOffices_keepsUntouchedVerifiedRows(t *testing.T) {
	orgs, _, _, _, svc := scopedOrgFixture()
	orgs.orgs[0].Offices = []domain.Office{
		{ID: "o-chief", Role: "Omanhene", HolderName: "Osabarimba Kwesi Atta II", Verified: true},
		{ID: "o-head", Role: "Headteacher", HolderName: "Mr. A", Verified: true},
	}
	in := []domain.Office{
		{ID: "o-chief", Role: "Omanhene", HolderName: "Osabarimba Kwesi Atta II", Verified: true},
		{ID: "o-head", Role: "Headteacher", HolderName: "Mr. B", Verified: true},
		{Role: "Treasurer", HolderName: "Mrs. C", Verified: true},
	}
	if _, err := svc.SetOrgOffices(context.Background(), "m-mgr", "bakaano-basic", in); err != nil {
		t.Fatalf("SetOrgOffices: %v", err)
	}
	got := map[string]domain.Office{}
	for _, o := range orgs.orgs[0].Offices {
		got[o.Role] = o
	}
	if !got["Omanhene"].Verified {
		t.Error("an untouched verified row must keep its tick")
	}
	if got["Headteacher"].Verified || got["Headteacher"].HolderName != "Mr. B" {
		t.Errorf("a renamed row must lose its tick: %+v", got["Headteacher"])
	}
	if got["Treasurer"].Verified {
		t.Errorf("a new row can't arrive verified: %+v", got["Treasurer"])
	}
}

// F110: an authority officer's news waits for review; a manager's publishes.
func TestSubmitNews_onlyAuthorityManagersSkipReview(t *testing.T) {
	members := teamMembers{members: []domain.Member{{ID: "m-vol", DisplayName: "Volunteer"}, {ID: "m-boss", DisplayName: "Chief"}}}
	claims := &recClaims{claims: []domain.OrgClaim{
		{ID: "c-vol", OrgID: "org-fire", MemberID: "m-vol", Status: domain.ClaimApproved, Scope: domain.ScopeOfficer},
		{ID: "c-boss", OrgID: "org-fire", MemberID: "m-boss", Status: domain.ClaimApproved},
	}}
	news := &researchNewsRepo{}
	f := &fakeRepo{}
	svc := New(Deps{
		Listings: f, Members: members, Orgs: authorityOrgs(), Places: stubPlaces{}, Mod: modRepo{f},
		Notifs: stubNotifs{}, Follows: stubFollows{}, Claims: claims, News: news,
		Reports: stubReports{}, Timeline: stubTimeline{},
	})
	in := NewsInput{Title: "Fire safety week", Body: "Check your extinguishers."}
	officer, err := svc.SubmitNews(context.Background(), "m-vol", in)
	if err != nil {
		t.Fatalf("officer submit: %v", err)
	}
	if officer.Status != domain.NewsDraft {
		t.Errorf("an officer's authority news must wait for review, status = %q", officer.Status)
	}
	manager, err := svc.SubmitNews(context.Background(), "m-boss", in)
	if err != nil {
		t.Fatalf("manager submit: %v", err)
	}
	if manager.Status != domain.NewsPublished {
		t.Errorf("a verified authority manager publishes directly, status = %q", manager.Status)
	}
}

// F110: an officer of a verified authority can't issue a directive.
func TestCreateDirectiveForOrg_officerForbidden(t *testing.T) {
	claims := &recClaims{claims: []domain.OrgClaim{{
		ID: "clm-vol", OrgID: "org-fire", MemberID: "m-vol", RequestedRole: "Volunteer",
		Status: domain.ClaimApproved, Scope: domain.ScopeOfficer,
	}}}
	dirs := &fakeDirectives{}
	svc := directiveSvc(dirs, authorityOrgs(), dirMembers{role: domain.RoleMember}, claims, stubNotifs{})

	in := validDirectiveInput()
	in.Severity = "critical"
	if _, err := svc.CreateDirectiveForOrg(context.Background(), "m-vol", "cape-coast-fire", in); !isForbiddenErr(err) {
		t.Fatalf("officer directive: err = %v, want forbidden", err)
	}
	if dirs.count() != 0 {
		t.Errorf("no directive should be stored, got %d", dirs.count())
	}
}
