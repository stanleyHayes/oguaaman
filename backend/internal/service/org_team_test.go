package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// recClaims is an in-memory OrgClaimRepository for the team tests (Creator
// plan §4.1.2). One slice is the store; queries filter it.
type recClaims struct {
	claims []domain.OrgClaim
}

func (r *recClaims) Insert(_ context.Context, c domain.OrgClaim) error {
	r.claims = append(r.claims, c)
	return nil
}
func (r *recClaims) Get(_ context.Context, id string) (*domain.OrgClaim, error) {
	for i := range r.claims {
		if r.claims[i].ID == id {
			return &r.claims[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "claim"}
}
func (r *recClaims) Pending(context.Context) ([]domain.OrgClaim, error) { return nil, nil }
func (r *recClaims) ByMember(_ context.Context, memberID string) ([]domain.OrgClaim, error) {
	out := []domain.OrgClaim{}
	for _, c := range r.claims {
		if c.MemberID == memberID {
			out = append(out, c)
		}
	}
	return out, nil
}
func (r *recClaims) ByOrg(_ context.Context, orgID string) ([]domain.OrgClaim, error) {
	out := []domain.OrgClaim{}
	for _, c := range r.claims {
		if c.OrgID == orgID {
			out = append(out, c)
		}
	}
	return out, nil
}
func (r *recClaims) UpdateStatus(_ context.Context, id, status, reviewedBy, at string) error {
	for i := range r.claims {
		if r.claims[i].ID == id {
			r.claims[i].Status = status
			r.claims[i].ReviewedByID = reviewedBy
			r.claims[i].ReviewedAt = at
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "claim"}
}
func (r *recClaims) UpdateScope(_ context.Context, id, scope string) error {
	for i := range r.claims {
		if r.claims[i].ID == id {
			r.claims[i].Scope = scope
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "claim"}
}
func (r *recClaims) IsManager(_ context.Context, memberID, orgID string) (bool, error) {
	for _, c := range r.claims {
		if c.MemberID == memberID && c.OrgID == orgID && c.Status == domain.ClaimApproved {
			return true, nil
		}
	}
	return false, nil
}
func (r *recClaims) ActiveClaim(_ context.Context, memberID, orgID string) (*domain.OrgClaim, error) {
	for i := range r.claims {
		if r.claims[i].MemberID == memberID && r.claims[i].OrgID == orgID && r.claims[i].Status == domain.ClaimApproved {
			return &r.claims[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "claim"}
}
func (r *recClaims) ManagedOrgIDs(_ context.Context, memberID string) ([]string, error) {
	ids := []string{}
	for _, c := range r.claims {
		if c.MemberID == memberID && c.Status == domain.ClaimApproved {
			ids = append(ids, c.OrgID)
		}
	}
	return ids, nil
}
func (r *recClaims) HasActiveClaim(_ context.Context, memberID, orgID string) (bool, error) {
	for _, c := range r.claims {
		if c.MemberID == memberID && c.OrgID == orgID &&
			(c.Status == domain.ClaimPending || c.Status == domain.ClaimApproved || c.Status == domain.ClaimInvited) {
			return true, nil
		}
	}
	return false, nil
}

// teamMembers is an in-memory member directory matching email OR phone, like
// the mongo ByIdentifier.
type teamMembers struct {
	stubMembers
	members []domain.Member
}

func (m teamMembers) ByID(_ context.Context, id string) (*domain.Member, error) {
	for i := range m.members {
		if m.members[i].ID == id {
			return &m.members[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}
func (m teamMembers) ByIdentifier(_ context.Context, identifier string) (*domain.Member, error) {
	for i := range m.members {
		if m.members[i].Email == identifier || m.members[i].Phone == identifier {
			return &m.members[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}

func teamFixture() (*recOrgs, teamMembers, *recClaims) {
	orgs := &recOrgs{orgs: []domain.Organization{{ID: "org-bak", Slug: "bakaano-basic", Name: "Bakaano M/A Basic School"}}}
	members := teamMembers{members: []domain.Member{
		{ID: "m-mgr", Slug: "mr-aidoo", DisplayName: "Mr. Samuel Aidoo", Email: "aidoo@oguaa.test", Role: domain.RoleMember},
		{ID: "m-off", Slug: "ms-essien", DisplayName: "Ms. Essien", Email: "essien@oguaa.test", Phone: "+233200000001", Role: domain.RoleMember},
		{ID: "m-new", Slug: "kofi", DisplayName: "Kofi Annan", Email: "kofi@oguaa.test", Role: domain.RoleMember},
	}}
	claims := &recClaims{claims: []domain.OrgClaim{
		// The original claimant: approved, no scope recorded → manager.
		{ID: "clm-mgr", OrgID: "org-bak", MemberID: "m-mgr", RequestedRole: "Headteacher", Status: domain.ClaimApproved},
	}}
	return orgs, members, claims
}

// A manager invites a citizen by email; the claim starts invited with the
// officer default scope, and no steward review is involved.
func TestInviteToTeam_happyPathDefaultsOfficer(t *testing.T) {
	orgs, members, claims := teamFixture()
	s := svcWith(orgs, members, claims)

	c, err := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "kofi@oguaa.test", "PTA Chair", "")
	if err != nil {
		t.Fatalf("InviteToTeam returned error: %v", err)
	}
	if c.Status != domain.ClaimInvited {
		t.Errorf("status = %q, want invited", c.Status)
	}
	if c.Scope != domain.ScopeOfficer {
		t.Errorf("scope = %q, want officer (default)", c.Scope)
	}
	if c.InvitedByID != "m-mgr" || c.MemberID != "m-new" {
		t.Errorf("unexpected claim parties: %+v", c)
	}
}

// Officers edit content but may NOT administer the team.
func TestInviteToTeam_officerRefused(t *testing.T) {
	orgs, members, claims := teamFixture()
	claims.claims = append(claims.claims, domain.OrgClaim{
		ID: "clm-off", OrgID: "org-bak", MemberID: "m-off", RequestedRole: "Secretary",
		Status: domain.ClaimApproved, Scope: domain.ScopeOfficer,
	})
	s := svcWith(orgs, members, claims)

	if _, err := s.InviteToTeam(context.Background(), "m-off", "bakaano-basic", "kofi@oguaa.test", "PTA Chair", ""); err == nil {
		t.Error("an officer must not invite — manager scope required")
	}
}

// Inviting someone already on the team (or with a live claim) is refused.
func TestInviteToTeam_blocksDuplicates(t *testing.T) {
	orgs, members, claims := teamFixture()
	s := svcWith(orgs, members, claims)

	if _, err := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "aidoo@oguaa.test", "Duplicate", ""); err == nil {
		t.Error("inviting an existing manager must fail")
	}
}

// Inviting an unknown identifier gives the friendly "join first" error.
func TestInviteToTeam_unknownMember(t *testing.T) {
	orgs, members, claims := teamFixture()
	s := svcWith(orgs, members, claims)

	if _, err := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "ghost@nowhere.test", "PTA Chair", ""); err == nil {
		t.Error("an unknown identifier must fail")
	}
}

// Accepting approves the claim without steward review and seats the office;
// the member then manages the org.
func TestRespondToInvite_acceptApprovesAndSeatsOffice(t *testing.T) {
	orgs, members, claims := teamFixture()
	s := svcWith(orgs, members, claims)
	c, err := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "kofi@oguaa.test", "PTA Chair", "")
	if err != nil {
		t.Fatalf("invite: %v", err)
	}

	if err := s.RespondToInvite(context.Background(), "m-new", c.ID, true); err != nil {
		t.Fatalf("accept: %v", err)
	}
	got, _ := claims.Get(context.Background(), c.ID)
	if got.Status != domain.ClaimApproved {
		t.Errorf("status = %q, want approved after accept", got.Status)
	}
	orgs2, err := s.ManagedOrgs(context.Background(), "m-new")
	if err != nil || len(orgs2) != 1 || orgs2[0].ID != "org-bak" {
		t.Errorf("accepting should make the org manageable, got %v %v", orgs2, err)
	}
	found := false
	for _, o := range orgs.orgs[0].Offices {
		if o.HolderID == "m-new" && o.Role == "PTA Chair" {
			found = true
		}
	}
	if !found {
		t.Error("the invitee's office should be seated on accept")
	}
}

// Only the invitee may answer; answered invitations can't be answered twice.
func TestRespondToInvite_guards(t *testing.T) {
	orgs, members, claims := teamFixture()
	s := svcWith(orgs, members, claims)
	c, _ := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "kofi@oguaa.test", "PTA Chair", "")

	if err := s.RespondToInvite(context.Background(), "m-off", c.ID, true); err == nil {
		t.Error("another member must not answer someone else's invitation")
	}
	if err := s.RespondToInvite(context.Background(), "m-new", c.ID, false); err != nil {
		t.Fatalf("decline: %v", err)
	}
	got, _ := claims.Get(context.Background(), c.ID)
	if got.Status != domain.ClaimDeclined {
		t.Errorf("status = %q, want declined", got.Status)
	}
	if err := s.RespondToInvite(context.Background(), "m-new", c.ID, true); err == nil {
		t.Error("a declined invitation must not be acceptable afterwards")
	}
}

// A manager revokes a team member; self-revoke is refused; the revoked member
// loses management immediately and could be re-invited later.
func TestRevokeTeamMember_managerRevokes(t *testing.T) {
	orgs, members, claims := teamFixture()
	s := svcWith(orgs, members, claims)
	c, _ := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "kofi@oguaa.test", "PTA Chair", "")
	_ = s.RespondToInvite(context.Background(), "m-new", c.ID, true)

	if err := s.RevokeTeamMember(context.Background(), "m-mgr", "bakaano-basic", "m-mgr"); err == nil {
		t.Error("self-revoke must be refused")
	}
	if err := s.RevokeTeamMember(context.Background(), "m-mgr", "bakaano-basic", "m-new"); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	got, _ := claims.Get(context.Background(), c.ID)
	if got.Status != domain.ClaimRevoked {
		t.Errorf("status = %q, want revoked", got.Status)
	}
	ok, _ := claims.IsManager(context.Background(), "m-new", "org-bak")
	if ok {
		t.Error("a revoked member must lose management immediately")
	}
	active, _ := claims.HasActiveClaim(context.Background(), "m-new", "org-bak")
	if active {
		t.Error("a revoked membership must not block a future re-invite")
	}
}

// An officer may not revoke, but a moderator (staff) may.
func TestRevokeTeamMember_officerRefusedModeratorAllowed(t *testing.T) {
	orgs, members, claims := teamFixture()
	claims.claims = append(claims.claims, domain.OrgClaim{
		ID: "clm-off", OrgID: "org-bak", MemberID: "m-off", RequestedRole: "Secretary",
		Status: domain.ClaimApproved, Scope: domain.ScopeOfficer,
	})
	s := svcWith(orgs, members, claims)

	if err := s.RevokeTeamMember(context.Background(), "m-off", "bakaano-basic", "m-mgr"); err == nil {
		t.Error("an officer must not revoke team members")
	}
	members.members[2].Role = domain.RoleModerator // m-new acts as staff
	if err := s.RevokeTeamMember(context.Background(), "m-new", "bakaano-basic", "m-mgr"); err != nil {
		t.Errorf("a moderator should keep revoke power, got: %v", err)
	}
}

// Managers promote/demote each other; nobody changes their own scope.
func TestSetTeamMemberScope_promoteAndSelfGuard(t *testing.T) {
	orgs, members, claims := teamFixture()
	s := svcWith(orgs, members, claims)
	c, _ := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "kofi@oguaa.test", "PTA Chair", "")
	_ = s.RespondToInvite(context.Background(), "m-new", c.ID, true)

	if err := s.SetTeamMemberScope(context.Background(), "m-mgr", "bakaano-basic", "m-mgr", domain.ScopeOfficer); err == nil {
		t.Error("changing your own scope must be refused")
	}
	if err := s.SetTeamMemberScope(context.Background(), "m-mgr", "bakaano-basic", "m-new", domain.ScopeManager); err != nil {
		t.Fatalf("promote: %v", err)
	}
	got, _ := claims.Get(context.Background(), c.ID)
	if got.EffectiveScope() != domain.ScopeManager {
		t.Errorf("scope = %q, want manager after promotion", got.EffectiveScope())
	}
}

// The roster lists managers first, then officers, then pending invites, and
// reports the viewer's own scope.
func TestOrgTeam_orderingAndViewerScope(t *testing.T) {
	orgs, members, claims := teamFixture()
	s := svcWith(orgs, members, claims)
	c, _ := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "kofi@oguaa.test", "PTA Chair", "")
	claims.claims = append(claims.claims, domain.OrgClaim{
		ID: "clm-off", OrgID: "org-bak", MemberID: "m-off", RequestedRole: "Secretary",
		Status: domain.ClaimApproved, Scope: domain.ScopeOfficer,
	})

	view, err := s.OrgTeam(context.Background(), "m-mgr", "bakaano-basic")
	if err != nil {
		t.Fatalf("OrgTeam: %v", err)
	}
	if view.ViewerScope != domain.ScopeManager {
		t.Errorf("viewerScope = %q, want manager for the original claimant", view.ViewerScope)
	}
	if len(view.Team) != 3 {
		t.Fatalf("team should have 3 rows, got %d", len(view.Team))
	}
	if view.Team[0].MemberID != "m-mgr" || view.Team[1].MemberID != "m-off" || view.Team[2].MemberID != "m-new" {
		t.Errorf("expected manager → officer → invited order, got %+v", view.Team)
	}
	if view.Team[2].Status != domain.ClaimInvited || view.Team[2].ClaimID != c.ID {
		t.Errorf("invited row malformed: %+v", view.Team[2])
	}
	if _, err := s.OrgTeam(context.Background(), "m-new", "bakaano-basic"); err == nil {
		t.Error("an invitee who hasn't accepted must not view the roster")
	}
}

// MyInvitations surfaces only unanswered invites, enriched for display.
func TestMyInvitations_listsPendingOnly(t *testing.T) {
	orgs, members, claims := teamFixture()
	s := svcWith(orgs, members, claims)
	_, _ = s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "kofi@oguaa.test", "PTA Chair", "")

	invites, err := s.MyInvitations(context.Background(), "m-new")
	if err != nil || len(invites) != 1 {
		t.Fatalf("expected 1 invitation, got %v %v", invites, err)
	}
	if invites[0].OrgName != "Bakaano M/A Basic School" || invites[0].InvitedByName != "Mr. Samuel Aidoo" {
		t.Errorf("invitation not enriched: %+v", invites[0])
	}
}
