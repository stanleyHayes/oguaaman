package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

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

// requireManagerScope guards team administration: the member must hold an
// approved MANAGER-scope claim for the org. Stewards bypass (editors of
// record); officers are refused — they edit content, not the team.
func (s *Service) requireManagerScope(ctx context.Context, memberID, orgSlug string) (*domain.Organization, error) {
	org, err := s.orgs.BySlug(ctx, orgSlug)
	if err != nil {
		return nil, err
	}
	if m, err := s.members.ByID(ctx, memberID); err == nil && m != nil && m.Role == domain.RoleSteward {
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
		return nil, &domain.ForbiddenError{Reason: "only managers may manage the team"}
	}
	return org, nil
}

// OrgTeam lists the institution's managers + officers (approved and invited),
// managers first. Any team member (either scope) or steward may view.
func (s *Service) OrgTeam(ctx context.Context, memberID, orgSlug string) (*TeamView, error) {
	org, err := s.orgs.BySlug(ctx, orgSlug)
	if err != nil {
		return nil, err
	}
	viewerScope := ""
	if m, err := s.members.ByID(ctx, memberID); err == nil && m != nil && m.Role == domain.RoleSteward {
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

// InviteToTeam pre-creates an invited claim for the invitee (manager scope
// required) and notifies them. Accepting needs no steward review.
func (s *Service) InviteToTeam(ctx context.Context, actorID, orgSlug, identifier, role, scope string) (*domain.OrgClaim, error) {
	org, err := s.requireManagerScope(ctx, actorID, orgSlug)
	if err != nil {
		return nil, err
	}
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return nil, fmt.Errorf("give the email or phone of the person you're inviting")
	}
	role = strings.TrimSpace(role)
	if role == "" {
		return nil, fmt.Errorf("assign the office they'll hold (e.g. PTA Chair)")
	}
	if scope == "" {
		scope = domain.ScopeOfficer
	}
	if scope != domain.ScopeManager && scope != domain.ScopeOfficer {
		return nil, fmt.Errorf("scope must be manager or officer")
	}
	invitee, err := s.members.ByIdentifier(ctx, identifier)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			return nil, fmt.Errorf("no member with that email or phone — they need to join Oguaa first")
		}
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
		ID:            "clm-" + fmt.Sprintf("%d", time.Now().UnixNano()),
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
	s.notify(ctx, invitee.ID, "org-invite",
		"You're invited to join "+org.Name,
		fmt.Sprintf("%s invited you as %s. Open your creator Team workspace to accept or decline.", actorName, role),
		"")
	return &c, nil
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
	actor, _ := s.members.ByID(ctx, actorID)
	staffOverride := actor != nil && (actor.Role == domain.RoleSteward || actor.Role == domain.RoleModerator)
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
	s.notify(ctx, targetMemberID, "org-team",
		"Removed from "+org.Name,
		fmt.Sprintf("Your membership of %s's team (as %s) was revoked.", org.Name, target.RequestedRole),
		"")
	return nil
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

// notify inserts one notification for a member (best-effort, nil-safe).
func (s *Service) notify(ctx context.Context, memberID, kind, title, body, link string) {
	if s.notifs == nil || memberID == "" {
		return
	}
	_ = s.notifs.Insert(ctx, domain.Notification{
		ID: "ntf-" + fmt.Sprintf("%d", time.Now().UnixNano()), MemberID: memberID,
		Kind: kind, Title: title, Body: body, Link: link,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	s.notifyOutOfBand(ctx, memberID, title, body, link)
}
