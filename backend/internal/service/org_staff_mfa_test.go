package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// staffOrgSvc is the team fixture plus a steward (m-stw) and a moderator
// (m-mod), neither holding a claim on the org, with two-factor as given.
func staffOrgSvc(production, mfa bool) (*recOrgs, *Service) {
	orgs, members, claims := teamFixture()
	orgs.orgs[0].MoMoNumber = "024 000 0000"
	members.members = append(members.members,
		domain.Member{ID: "m-stw", Slug: "steward", DisplayName: "Steward", Role: domain.RoleSteward, MFAEnabled: mfa},
		domain.Member{ID: "m-mod", Slug: "moderator", DisplayName: "Moderator", Role: domain.RoleModerator, MFAEnabled: mfa},
	)
	f := &fakeRepo{}
	svc := New(Deps{
		Listings: f, Members: members, Orgs: orgs, Places: stubPlaces{}, Mod: modRepo{f},
		Notifs: &recNotifs{}, Follows: stubFollows{}, Claims: claims, News: stubNews{},
		Reports: stubReports{}, Timeline: stubTimeline{}, Directives: &fakeDirectives{},
		Production: production,
	})
	return orgs, svc
}

// R10/D9: in production a steward without two-factor has no institution
// powers in the service either — re-reading the stored role must not hand
// back what the request middleware withheld.
func TestStaffWithoutMFAHasNoInstitutionPowersInProduction(t *testing.T) {
	ctx := context.Background()
	orgs, svc := staffOrgSvc(true, false)

	if _, err := svc.UpdateOrgProfile(ctx, "m-stw", "bakaano-basic", domain.OrgProfilePatch{MoMoNumber: strp("055 111 2222")}); !isForbiddenErr(err) {
		t.Fatalf("steward without 2FA changing the MoMo number: err = %v, want forbidden", err)
	}
	if orgs.orgs[0].MoMoNumber != "024 000 0000" {
		t.Fatalf("MoMo number changed to %q", orgs.orgs[0].MoMoNumber)
	}
	if _, err := svc.CreateDirectiveForOrg(ctx, "m-stw", "bakaano-basic", validDirectiveInput()); !isForbiddenErr(err) {
		t.Fatalf("steward without 2FA issuing a directive: err = %v, want forbidden", err)
	}
	if _, err := svc.SetOrgOffices(ctx, "m-stw", "bakaano-basic", []domain.Office{{Role: "Head", Verified: true}}); !isForbiddenErr(err) {
		t.Fatalf("steward without 2FA replacing offices: err = %v, want forbidden", err)
	}
	if _, err := svc.OrgTeam(ctx, "m-stw", "bakaano-basic"); !isForbiddenErr(err) {
		t.Fatalf("steward without 2FA viewing the team: err = %v, want forbidden", err)
	}
	if err := svc.RevokeTeamMember(ctx, "m-mod", "bakaano-basic", "m-mgr"); !isForbiddenErr(err) {
		t.Fatalf("moderator without 2FA revoking a manager: err = %v, want forbidden", err)
	}
}

func TestStaffWithMFAKeepsInstitutionPowersInProduction(t *testing.T) {
	ctx := context.Background()
	orgs, svc := staffOrgSvc(true, true)

	if _, err := svc.UpdateOrgProfile(ctx, "m-stw", "bakaano-basic", domain.OrgProfilePatch{MoMoNumber: strp("055 111 2222")}); err != nil {
		t.Fatalf("steward with 2FA changing the MoMo number: %v", err)
	}
	if orgs.orgs[0].MoMoNumber == "024 000 0000" {
		t.Fatal("MoMo number not changed")
	}
	if _, err := svc.OrgTeam(ctx, "m-stw", "bakaano-basic"); err != nil {
		t.Fatalf("steward with 2FA viewing the team: %v", err)
	}
	if err := svc.RevokeTeamMember(ctx, "m-mod", "bakaano-basic", "m-mgr"); err != nil {
		t.Fatalf("moderator with 2FA revoking: %v", err)
	}
}

// Outside production nothing is held back (dev and test deployments).
func TestStaffWithoutMFAKeepsPowersOutsideProduction(t *testing.T) {
	_, svc := staffOrgSvc(false, false)
	if _, err := svc.OrgTeam(context.Background(), "m-stw", "bakaano-basic"); err != nil {
		t.Fatalf("dev steward without 2FA: %v", err)
	}
}
