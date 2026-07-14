package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// recOrgs is an in-memory OrganizationRepository for the admin/create + manager
// tests. It embeds stubOrgs (nil-returning) and overrides the methods these
// tests exercise, keeping a single slice as the store.
type recOrgs struct {
	stubOrgs
	orgs []domain.Organization
}

func (r *recOrgs) BySlug(_ context.Context, slug string) (*domain.Organization, error) {
	for i := range r.orgs {
		if r.orgs[i].Slug == slug {
			return &r.orgs[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "organization"}
}
func (r *recOrgs) ByID(_ context.Context, id string) (*domain.Organization, error) {
	for i := range r.orgs {
		if r.orgs[i].ID == id {
			return &r.orgs[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "organization"}
}
func (r *recOrgs) Create(_ context.Context, o domain.Organization) error {
	r.orgs = append(r.orgs, o)
	return nil
}
func (r *recOrgs) UpdateProfile(_ context.Context, id string, p domain.OrgProfilePatch) error {
	for i := range r.orgs {
		if r.orgs[i].ID == id {
			r.orgs[i].Summary = p.Summary
			return nil
		}
	}
	return nil
}

// roleMembers returns one member with a fixed role for every ByID lookup.
type roleMembers struct {
	stubMembers
	role string
}

func (m roleMembers) ByID(_ context.Context, _ string) (*domain.Member, error) {
	return &domain.Member{ID: "m1", Role: m.role}, nil
}

func svcWith(orgs domain.OrganizationRepository, members domain.MemberRepository, claims domain.OrgClaimRepository) *Service {
	f := &fakeRepo{}
	return New(f, members, orgs, stubPlaces{}, modRepo{f}, stubNotifs{}, stubFollows{}, claims, stubNews{}, stubReports{}, stubTimeline{})
}

func TestCreateOrg_defaultsAndSlug(t *testing.T) {
	orgs := &recOrgs{}
	s := svcWith(orgs, stubMembers{}, stubClaims{})

	org, err := s.CreateOrg(context.Background(), "Brenu Beach", "", "Beach · quiet sand", "A calm beach west of town.")
	if err != nil {
		t.Fatalf("CreateOrg returned error: %v", err)
	}
	if org.Slug != "brenu-beach" {
		t.Errorf("slug = %q, want brenu-beach", org.Slug)
	}
	if org.Kind != "heritage" {
		t.Errorf("kind = %q, want heritage (default)", org.Kind)
	}
	if !org.Verified {
		t.Error("steward-created place should be verified")
	}
	if org.Name != "Brenu Beach" || org.Classification != "Beach · quiet sand" {
		t.Errorf("unexpected fields: name=%q class=%q", org.Name, org.Classification)
	}
	if len(orgs.orgs) != 1 {
		t.Errorf("expected 1 org persisted, got %d", len(orgs.orgs))
	}
}

func TestCreateOrg_requiresName(t *testing.T) {
	s := svcWith(&recOrgs{}, stubMembers{}, stubClaims{})
	if _, err := s.CreateOrg(context.Background(), "   ", "heritage", "", ""); err == nil {
		t.Error("expected an error for a blank name")
	}
}

func TestCreateOrg_slugCollisionGetsSuffix(t *testing.T) {
	orgs := &recOrgs{orgs: []domain.Organization{{ID: "org-x", Slug: "brenu-beach", Name: "Brenu Beach"}}}
	s := svcWith(orgs, stubMembers{}, stubClaims{})

	org, err := s.CreateOrg(context.Background(), "Brenu Beach", "heritage", "", "")
	if err != nil {
		t.Fatalf("CreateOrg returned error: %v", err)
	}
	if org.Slug != "brenu-beach-2" {
		t.Errorf("slug = %q, want brenu-beach-2 (collision)", org.Slug)
	}
}

func TestCreateOrg_honoursExplicitKind(t *testing.T) {
	s := svcWith(&recOrgs{}, stubMembers{}, stubClaims{})
	org, err := s.CreateOrg(context.Background(), "Cape Coast Museum", "civic", "Museum", "")
	if err != nil {
		t.Fatalf("CreateOrg returned error: %v", err)
	}
	if org.Kind != "civic" {
		t.Errorf("kind = %q, want civic", org.Kind)
	}
}

// requireManager is exercised through UpdateOrgProfile: a steward may edit any
// org without an approved claim; a plain member without a claim is refused.
func TestUpdateOrgProfile_stewardBypassesClaim(t *testing.T) {
	orgs := &recOrgs{orgs: []domain.Organization{{ID: "org-castle", Slug: "cape-coast-castle", Name: "Cape Coast Castle"}}}
	s := svcWith(orgs, roleMembers{role: domain.RoleSteward}, stubClaims{}) // stubClaims.IsManager == false

	_, err := s.UpdateOrgProfile(context.Background(), "m1", "cape-coast-castle", domain.OrgProfilePatch{Summary: "Edited by a steward."})
	if err != nil {
		t.Fatalf("steward should edit any org; got error: %v", err)
	}
	if orgs.orgs[0].Summary != "Edited by a steward." {
		t.Errorf("profile not updated: summary=%q", orgs.orgs[0].Summary)
	}
}

func TestUpdateOrgProfile_nonManagerRefused(t *testing.T) {
	orgs := &recOrgs{orgs: []domain.Organization{{ID: "org-castle", Slug: "cape-coast-castle"}}}
	s := svcWith(orgs, roleMembers{role: domain.RoleMember}, stubClaims{}) // not a steward, no claim

	if _, err := s.UpdateOrgProfile(context.Background(), "m1", "cape-coast-castle", domain.OrgProfilePatch{Summary: "x"}); err == nil {
		t.Error("a non-manager, non-steward member must be refused")
	}
}
