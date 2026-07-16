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

func (r *recOrgs) All(context.Context) ([]domain.Organization, error) {
	return append([]domain.Organization(nil), r.orgs...), nil
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
	return New(Deps{Listings: f, Members: members, Orgs: orgs, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: stubNotifs{}, Follows: stubFollows{}, Claims: claims, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}})
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

// SetVerified records the call and mutates the store (stubOrgs' is a no-op).
func (r *recOrgs) SetVerified(_ context.Context, id string, verified bool, on string) error {
	for i := range r.orgs {
		if r.orgs[i].ID == id {
			r.orgs[i].Verified = verified
			r.orgs[i].VerifiedOn = on
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "organization"}
}

// SetOffices replaces the roster (stubOrgs' is a no-op; team invites seat it).
func (r *recOrgs) SetOffices(_ context.Context, id string, offices []domain.Office) error {
	for i := range r.orgs {
		if r.orgs[i].ID == id {
			r.orgs[i].Offices = offices
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "organization"}
}

func svcWithListings(orgs domain.OrganizationRepository, repo *fakeRepo) *Service {
	return New(Deps{Listings: repo, Members: stubMembers{}, Orgs: orgs, Places: stubPlaces{}, Mod: modRepo{repo}, Notifs: stubNotifs{}, Follows: stubFollows{}, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}})
}

// Revoking verification takes the page offline AND sends the institution's
// self-published events back to the review queue; other orgs' events and
// already-pending events are untouched (spec §8.13).
func TestVerifyInstitution_revokeDemotesOfficialEvents(t *testing.T) {
	orgs := &recOrgs{orgs: []domain.Organization{{ID: "org-ucc", Slug: "ucc", Verified: true, VerifiedOn: "2026-05-14"}}}
	repo := &fakeRepo{listings: []domain.Listing{
		{ID: "ev-1", Type: domain.TypeEvent, Status: domain.StatusApproved, PostedByOrgID: "org-ucc"},
		{ID: "ev-2", Type: domain.TypeEvent, Status: domain.StatusApproved, PostedByOrgID: "org-ucc"},
		{ID: "ev-other", Type: domain.TypeEvent, Status: domain.StatusApproved, PostedByOrgID: "org-other"},
		{ID: "ev-pending", Type: domain.TypeEvent, Status: domain.StatusPending, PostedByOrgID: "org-ucc"},
	}}
	s := svcWithListings(orgs, repo)

	if err := s.VerifyInstitution(context.Background(), "org-ucc", false); err != nil {
		t.Fatalf("VerifyInstitution returned error: %v", err)
	}
	if orgs.orgs[0].Verified || orgs.orgs[0].VerifiedOn != "" {
		t.Errorf("org should be unverified with empty verifiedOn, got %+v", orgs.orgs[0])
	}
	for _, l := range repo.listings {
		switch l.ID {
		case "ev-1", "ev-2":
			if l.Status != domain.StatusPending {
				t.Errorf("%s: status = %q, want pending (back to review queue)", l.ID, l.Status)
			}
		case "ev-other":
			if l.Status != domain.StatusApproved {
				t.Errorf("another org's event must stay approved, got %q", l.Status)
			}
		case "ev-pending":
			if l.Status != domain.StatusPending {
				t.Errorf("already-pending event must stay pending, got %q", l.Status)
			}
		}
	}
}

// Verifying sets the date and leaves the org's events alone.
func TestVerifyInstitution_verifySetsDateKeepsEvents(t *testing.T) {
	orgs := &recOrgs{orgs: []domain.Organization{{ID: "org-ucc", Slug: "ucc"}}}
	repo := &fakeRepo{listings: []domain.Listing{
		{ID: "ev-1", Type: domain.TypeEvent, Status: domain.StatusApproved, PostedByOrgID: "org-ucc"},
	}}
	s := svcWithListings(orgs, repo)

	if err := s.VerifyInstitution(context.Background(), "org-ucc", true); err != nil {
		t.Fatalf("VerifyInstitution returned error: %v", err)
	}
	if !orgs.orgs[0].Verified || orgs.orgs[0].VerifiedOn == "" {
		t.Errorf("org should be verified with a date, got %+v", orgs.orgs[0])
	}
	if repo.listings[0].Status != domain.StatusApproved {
		t.Errorf("verifying must not touch events, got %q", repo.listings[0].Status)
	}
}

// The public directory only lists verified institutions; the steward's
// AllInstitutions queue keeps the rest (spec §8.13).
func TestInstitutions_publicDirectoryExcludesUnverified(t *testing.T) {
	orgs := &recOrgs{orgs: []domain.Organization{
		{ID: "org-mfantsipim", Slug: "mfantsipim", Kind: "school", Verified: true},
		{ID: "org-kotokuraba", Slug: "kotokuraba-traders", Kind: "association"},
	}}
	s := svcWithListings(orgs, &fakeRepo{})

	public, err := s.Institutions(context.Background())
	if err != nil {
		t.Fatalf("Institutions returned error: %v", err)
	}
	if len(public) != 1 || public[0].ID != "org-mfantsipim" {
		t.Errorf("public directory should list only verified orgs, got %+v", public)
	}
	queue, err := s.AllInstitutions(context.Background())
	if err != nil {
		t.Fatalf("AllInstitutions returned error: %v", err)
	}
	if len(queue) != 2 {
		t.Errorf("steward queue should list all orgs, got %d", len(queue))
	}
}
