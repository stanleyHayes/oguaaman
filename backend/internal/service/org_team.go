package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/oguaa/backend/internal/domain"
)

// ── institution teams: manager invitations, officer scopes (Creator plan §4.1.2) ──
//
// A manager invites any citizen by email/phone + assigns their office. The
// invitee accepts (approved without steward review — a verified manager vouched
// for them) or declines. Two scopes: manager (everything incl. team + revoke)
// and officer (content only). Original claimants are always managers.

// TeamMember is one row of an institution's team roster.
type TeamMember struct {
	ClaimID       string `json:"claimId"`
	MemberID      string `json:"memberId"`
	MemberName    string `json:"memberName"`
	MemberSlug    string `json:"memberSlug"`
	PhotoURL      string `json:"photoUrl,omitempty"`
	Role          string `json:"role"`   // the office they hold (RequestedRole)
	Scope         string `json:"scope"`  // manager | officer (effective)
	Status        string `json:"status"` // approved | invited
	InvitedByName string `json:"invitedByName,omitempty"`
}

// TeamView is the team roster plus the viewing member's own scope, so clients
// know whether to render the manager-only actions (invite, promote, revoke).
type TeamView struct {
	ViewerScope string       `json:"viewerScope"`
	Team        []TeamMember `json:"team"`
}

// InvitationView enriches a pending invitation with org + inviter display names.
type InvitationView struct {
	domain.OrgClaim
	OrgName       string `json:"orgName"`
	OrgSlug       string `json:"orgSlug"`
	InvitedByName string `json:"invitedByName"`
}

// requireManagerScope guards the manager-only powers: team administration,
// the roster of verified offices, official directives, and the institution's
// money/trust fields (MoMo number, verification links). The member must hold
// an approved MANAGER-scope claim for the org. Stewards bypass (editors of
// record); officers are refused — they edit content only (profile text,
// sections, gallery, events), which requireManager covers.
func (s *Service) requireManagerScope(ctx context.Context, memberID, orgSlug string) (*domain.Organization, error) {
	org, err := s.orgs.BySlug(ctx, orgSlug)
	if err != nil {
		return nil, err
	}
	if s.actingRole(ctx, memberID) == domain.RoleSteward {
		return org, nil
	}
	claim, err := s.claims.ActiveClaim(ctx, memberID, org.ID)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			return nil, &domain.ForbiddenError{Reason: "you don't manage this institution"}
		}
		return nil, err
	}
	if claim.EffectiveScope() != domain.ScopeManager {
		return nil, &domain.ForbiddenError{Reason: msgManagersOnly}
	}
	return org, nil
}

// managesVerifiedAuthority reports whether the member holds an approved
// MANAGER-scope claim on a verified authority institution (emergency,
// security, health, local government) — the trust that lets what they post
// speak for the authority without review. Officers don't qualify.
func (s *Service) managesVerifiedAuthority(ctx context.Context, memberID string) bool {
	claims, err := s.claims.ByMember(ctx, memberID)
	if err != nil {
		return false
	}
	for _, c := range claims {
		if c.Status != domain.ClaimApproved || c.EffectiveScope() != domain.ScopeManager {
			continue
		}
		if org, err := s.orgs.ByID(ctx, c.OrgID); err == nil && org != nil && org.Verified && domain.IsAuthorityKind(org.Kind) {
			return true
		}
	}
	return false
}

// msgManagersOnly is the refusal an officer gets for a manager-only action.
const msgManagersOnly = "only the institution's managers can do this — officers edit content only"

// OrgTeam lists the institution's managers + officers (approved and invited),
// managers first. Any team member (either scope) or steward may view.
func (s *Service) OrgTeam(ctx context.Context, memberID, orgSlug string) (*TeamView, error) {
	org, err := s.orgs.BySlug(ctx, orgSlug)
	if err != nil {
		return nil, err
	}
	viewerScope := ""
	if s.actingRole(ctx, memberID) == domain.RoleSteward {
		viewerScope = domain.ScopeManager
	} else if claim, err := s.claims.ActiveClaim(ctx, memberID, org.ID); err == nil && claim != nil {
		viewerScope = claim.EffectiveScope()
	}
	if viewerScope == "" {
		return nil, &domain.ForbiddenError{Reason: "you don't manage this institution"}
	}
	claims, err := s.claims.ByOrg(ctx, org.ID)
	if err != nil {
		return nil, err
	}
	team := make([]TeamMember, 0, len(claims))
	for _, c := range claims {
		if c.Status != domain.ClaimApproved && c.Status != domain.ClaimInvited {
			continue
		}
		row := TeamMember{
			ClaimID: c.ID, MemberID: c.MemberID, Role: c.RequestedRole,
			Scope: c.EffectiveScope(), Status: c.Status,
		}
		if m, err := s.members.ByID(ctx, c.MemberID); err == nil && m != nil {
			row.MemberName, row.MemberSlug, row.PhotoURL = m.DisplayName, m.Slug, m.PhotoURL
		}
		if c.InvitedByID != "" {
			if inv, err := s.members.ByID(ctx, c.InvitedByID); err == nil && inv != nil {
				row.InvitedByName = inv.DisplayName
			}
		}
		team = append(team, row)
	}
	sort.SliceStable(team, func(i, j int) bool {
		rank := func(t TeamMember) int {
			if t.Status == domain.ClaimInvited {
				return 2
			}
			if t.Scope == domain.ScopeManager {
				return 0
			}
			return 1
		}
		return rank(team[i]) < rank(team[j])
	})
	return &TeamView{ViewerScope: viewerScope, Team: team}, nil
}

// maxOfficeRoleLen caps an office title (runes) — it is shown to the invitee
// and on the public roster, so it must stay a title, not a message.
const maxOfficeRoleLen = 80

// msgInviteeNotFound is the one answer for "can't invite that person": an
// unknown identifier and a block (in either direction) read the same, so an
// invite can never be used to probe who has blocked whom.
const msgInviteeNotFound = "no member with that email or phone — they need to join Oguaa first"

// InviteToTeam pre-creates an invited claim for the invitee (manager scope
// required) and notifies them. Accepting needs no steward review. The
// identifier is normalised like sign-in (emails are case-insensitive), a block
// between the two members refuses the invite, and the office title is capped.
// The out-of-band copy (email/WhatsApp) is a fixed Oguaa message that carries
// none of the inviter's free text.
func (s *Service) InviteToTeam(ctx context.Context, actorID, orgSlug, identifier, role, scope string) (*domain.OrgClaim, error) {
	org, err := s.requireManagerScope(ctx, actorID, orgSlug)
	if err != nil {
		return nil, err
	}
	identifier, role, scope, err = normalizeInvite(identifier, role, scope)
	if err != nil {
		return nil, err
	}
	invitee, err := s.findInvitee(ctx, actorID, identifier)
	if err != nil {
		return nil, err
	}
	active, err := s.claims.HasActiveClaim(ctx, invitee.ID, org.ID)
	if err != nil {
		return nil, err
	}
	if active {
		return nil, fmt.Errorf("%s is already on the team or has a pending invite", invitee.DisplayName)
	}
	now := time.Now().UTC().Format(time.RFC3339)
	c := domain.OrgClaim{
		ID:            newID(domain.PrefixClaim),
		OrgID:         org.ID,
		MemberID:      invitee.ID,
		RequestedRole: role,
		Status:        domain.ClaimInvited,
		Scope:         scope,
		InvitedByID:   actorID,
		CreatedAt:     now,
	}
	if err := s.claims.Insert(ctx, c); err != nil {
		return nil, err
	}
	actorName := "A manager"
	if actor, err := s.members.ByID(ctx, actorID); err == nil && actor != nil {
		actorName = actor.DisplayName
	}
	title := "You're invited to join " + org.Name
	s.notifyInApp(ctx, invitee.ID, "org-invite", title,
		fmt.Sprintf("%s invited you as %s. Open your creator Team workspace to accept or decline.", actorName, role),
		"")
	s.notifyOutOfBandAs(ctx, invitee.ID, "org-invite", title,
		"You've been invited to join "+org.Name+"'s team on Oguaa. Open the Oguaa creator app to accept or decline. If you weren't expecting this, you can ignore it.",
		"")
	return &c, nil
}

// normalizeInvite validates an invitation's fields: the identifier is
// normalised like sign-in, the office title is whitespace-collapsed and
// capped, and the scope defaults to officer.
func normalizeInvite(identifier, role, scope string) (string, string, string, error) {
	identifier = normalizeIdentifier(identifier)
	if identifier == "" {
		return "", "", "", fmt.Errorf("give the email or phone of the person you're inviting")
	}
	role = strings.Join(strings.Fields(role), " ")
	if role == "" {
		return "", "", "", fmt.Errorf("assign the office they'll hold (e.g. PTA Chair)")
	}
	if utf8.RuneCountInString(role) > maxOfficeRoleLen {
		return "", "", "", fmt.Errorf("keep the office title to %d characters or fewer", maxOfficeRoleLen)
	}
	if scope == "" {
		scope = domain.ScopeOfficer
	}
	if scope != domain.ScopeManager && scope != domain.ScopeOfficer {
		return "", "", "", fmt.Errorf("scope must be manager or officer")
	}
	return identifier, role, scope, nil
}

// findInvitee resolves who is being invited. An unknown identifier and a
// block between the two members (either direction) give the same answer.
func (s *Service) findInvitee(ctx context.Context, actorID, identifier string) (*domain.Member, error) {
	invitee, err := s.members.ByIdentifier(ctx, identifier)
	var nf *domain.NotFoundError
	if errors.As(err, &nf) || (err == nil && invitee == nil) {
		return nil, errors.New(msgInviteeNotFound)
	}
	if err != nil {
		return nil, err
	}
	if s.blocks == nil {
		return invitee, nil
	}
	blocked, err := s.blocks.IsBlocked(ctx, actorID, invitee.ID)
	if err != nil {
		return nil, err
	}
	if blocked {
		return nil, errors.New(msgInviteeNotFound)
	}
	return invitee, nil
}

// MyInvitations lists the member's unanswered team invitations, newest first.
func (s *Service) MyInvitations(ctx context.Context, memberID string) ([]InvitationView, error) {
	claims, err := s.claims.ByMember(ctx, memberID)
	if err != nil {
		return nil, err
	}
	out := make([]InvitationView, 0, len(claims))
	for _, c := range claims {
		if c.Status != domain.ClaimInvited {
			continue
		}
		v := InvitationView{OrgClaim: c}
		if org, err := s.orgs.ByID(ctx, c.OrgID); err == nil && org != nil {
			v.OrgName, v.OrgSlug = org.Name, org.Slug
		}
		if inv, err := s.members.ByID(ctx, c.InvitedByID); err == nil && inv != nil {
			v.InvitedByName = inv.DisplayName
		}
		out = append(out, v)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, nil
}

// RespondToInvite lets the invitee accept (approved, no steward review) or
// decline a team invitation. The inviter is told the outcome.
func (s *Service) RespondToInvite(ctx context.Context, memberID, claimID string, accept bool) error {
	c, err := s.claims.Get(ctx, claimID)
	if err != nil {
		return err
	}
	if c.MemberID != memberID {
		return &domain.ForbiddenError{Reason: "this invitation isn't yours"}
	}
	if c.Status != domain.ClaimInvited {
		return fmt.Errorf("this invitation has already been answered")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	status := domain.ClaimDeclined
	if accept {
		status = domain.ClaimApproved
	}
	if err := s.claims.UpdateStatus(ctx, claimID, status, memberID, now); err != nil {
		return err
	}
	org, _ := s.orgs.ByID(ctx, c.OrgID)
	orgName := "the institution"
	if org != nil {
		orgName = org.Name
	}
	if accept {
		s.ensureOffice(ctx, c.OrgID, c.MemberID, c.RequestedRole)
	}
	inviteeName := "The invitee"
	if m, err := s.members.ByID(ctx, memberID); err == nil && m != nil {
		inviteeName = m.DisplayName
	}
	verb := "declined"
	if accept {
		verb = "accepted"
	}
	s.notify(ctx, c.InvitedByID, "org-invite-response",
		fmt.Sprintf("%s %s your invitation", inviteeName, verb),
		fmt.Sprintf("%s %s the invitation to join %s as %s.", inviteeName, verb, orgName, c.RequestedRole),
		"")
	return nil
}

// RevokeTeamMember removes a member (approved or invited) from the team.
// Managers (scope) plus stewards/moderators may revoke; no self-revoke.
func (s *Service) RevokeTeamMember(ctx context.Context, actorID, orgSlug, targetMemberID string) error {
	if actorID == targetMemberID {
		return fmt.Errorf("you can't revoke yourself — another manager or a steward must do it")
	}
	role := s.actingRole(ctx, actorID)
	staffOverride := role == domain.RoleSteward || role == domain.RoleModerator
	var org *domain.Organization
	var err error
	if staffOverride {
		org, err = s.orgs.BySlug(ctx, orgSlug)
	} else {
		org, err = s.requireManagerScope(ctx, actorID, orgSlug)
	}
	if err != nil {
		return err
	}
	claims, err := s.claims.ByOrg(ctx, org.ID)
	if err != nil {
		return err
	}
	var target *domain.OrgClaim
	for i := range claims {
		if claims[i].MemberID == targetMemberID && (claims[i].Status == domain.ClaimApproved || claims[i].Status == domain.ClaimInvited) {
			target = &claims[i]
			break
		}
	}
	if target == nil {
		return &domain.NotFoundError{Entity: "team member"}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := s.claims.UpdateStatus(ctx, target.ID, domain.ClaimRevoked, actorID, now); err != nil {
		return err
	}
	s.releaseRevokedMember(ctx, org, claims, actorID, targetMemberID)
	s.notify(ctx, targetMemberID, "org-team",
		"Removed from "+org.Name,
		fmt.Sprintf("Your membership of %s's team (as %s) was revoked.", org.Name, target.RequestedRole),
		"")
	return nil
}

// releaseRevokedMember leaves a removed member no trace of authority: their
// verified office leaves the public roster, and the institution's official
// events they posted pass to a remaining team member (they would otherwise
// keep editing the event and reading its ticket codes).
func (s *Service) releaseRevokedMember(ctx context.Context, org *domain.Organization, claims []domain.OrgClaim, actorID, memberID string) {
	s.vacateOffices(ctx, org, memberID)
	if s.listings == nil {
		return
	}
	successor := successorOwner(claims, actorID, memberID)
	if _, err := s.listings.ReassignOrgListings(ctx, org.ID, memberID, successor); err != nil && s.log != nil {
		s.log.Warn("revoke: reassigning institution events failed", "orgId", org.ID, "memberId", memberID, "err", err)
	}
}

// vacateOffices drops every roster row the removed member held (the rows
// ensureOffice seated when their claim was approved), so a revoked member
// no longer shows as a "Verified office-holder".
func (s *Service) vacateOffices(ctx context.Context, org *domain.Organization, memberID string) {
	kept := make([]domain.Office, 0, len(org.Offices))
	for _, o := range org.Offices {
		if o.HolderID != memberID {
			kept = append(kept, o)
		}
	}
	if len(kept) == len(org.Offices) {
		return
	}
	if err := s.orgs.SetOffices(ctx, org.ID, kept); err != nil && s.log != nil {
		s.log.Warn("revoke: vacating offices failed", "orgId", org.ID, "memberId", memberID, "err", err)
	}
}

// successorOwner picks who takes over a removed member's official events: the
// revoking manager when they are on the team, else the longest-serving
// remaining manager, else the longest-serving officer, else nobody ("" —
// curators and stewards can still edit, and a steward can seat a new manager).
func successorOwner(claims []domain.OrgClaim, actorID, removedID string) string {
	var manager, officer *domain.OrgClaim
	for i := range claims {
		c := &claims[i]
		if c.Status != domain.ClaimApproved || c.MemberID == removedID {
			continue
		}
		if c.MemberID == actorID {
			return actorID
		}
		best := &officer
		if c.EffectiveScope() == domain.ScopeManager {
			best = &manager
		}
		if *best == nil || c.CreatedAt < (*best).CreatedAt {
			*best = c
		}
	}
	switch {
	case manager != nil:
		return manager.MemberID
	case officer != nil:
		return officer.MemberID
	}
	return ""
}

// SetTeamMemberScope promotes/demotes an approved team member (manager-only).
// Managers can't change their own scope — another manager must, so an org
// can't accidentally lose its last manager.
func (s *Service) SetTeamMemberScope(ctx context.Context, actorID, orgSlug, targetMemberID, scope string) error {
	if scope != domain.ScopeManager && scope != domain.ScopeOfficer {
		return fmt.Errorf("scope must be manager or officer")
	}
	if actorID == targetMemberID {
		return fmt.Errorf("you can't change your own scope — ask another manager")
	}
	org, err := s.requireManagerScope(ctx, actorID, orgSlug)
	if err != nil {
		return err
	}
	target, err := s.claims.ActiveClaim(ctx, targetMemberID, org.ID)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			return &domain.NotFoundError{Entity: "team member"}
		}
		return err
	}
	return s.claims.UpdateScope(ctx, target.ID, scope)
}

// notify inserts one in-app notification for a member and mirrors it out of
// band (best-effort, nil-safe).
func (s *Service) notify(ctx context.Context, memberID, kind, title, body, link string) {
	if s.notifs == nil || memberID == "" {
		return
	}
	s.notifyInApp(ctx, memberID, kind, title, body, link)
	s.notifyOutOfBandAs(ctx, memberID, kind, title, body, link)
}

// notifyInApp inserts one in-app notification (best-effort, nil-safe).
func (s *Service) notifyInApp(ctx context.Context, memberID, kind, title, body, link string) {
	if s.notifs == nil || memberID == "" {
		return
	}
	_ = s.notifs.Insert(ctx, domain.Notification{
		ID: newID(domain.PrefixNotification), MemberID: memberID,
		Kind: kind, Title: title, Body: body, Link: link,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
}
