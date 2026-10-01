package service

import (
	"context"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// pairBlocks is a minimal BlockRepository: one block, either direction.
type pairBlocks struct{ blocker, blocked string }

func (p pairBlocks) Block(context.Context, string, string, string) error { return nil }
func (p pairBlocks) Unblock(context.Context, string, string) error       { return nil }
func (p pairBlocks) IsBlocked(_ context.Context, a, b string) (bool, error) {
	return (a == p.blocker && b == p.blocked) || (a == p.blocked && b == p.blocker), nil
}
func (p pairBlocks) BlockedBy(context.Context, string) ([]domain.MemberBlock, error) { return nil, nil }
func (p pairBlocks) HiddenFor(_ context.Context, id string) ([]string, error) {
	switch id {
	case p.blocker:
		return []string{p.blocked}, nil
	case p.blocked:
		return []string{p.blocker}, nil
	}
	return nil, nil
}
func (p pairBlocks) DeleteByMember(context.Context, string) error { return nil }

// teamSvc wires the team fixture with listings, blocks and notifications.
func teamSvc(orgs *recOrgs, members teamMembers, claims *recClaims, listings *fakeRepo, blocks domain.BlockRepository, notifs domain.NotificationRepository) *Service {
	return New(Deps{
		Listings: listings, Members: members, Orgs: orgs, Places: stubPlaces{}, Mod: modRepo{listings},
		Notifs: notifs, Follows: stubFollows{}, Blocks: blocks, Claims: claims, News: stubNews{},
		Reports: stubReports{}, Timeline: stubTimeline{},
	})
}

// F121: a block in either direction stops the invite, with the same answer
// as an unknown identifier.
func TestInviteToTeam_refusedAcrossABlock(t *testing.T) {
	for _, b := range []pairBlocks{{blocker: "m-new", blocked: "m-mgr"}, {blocker: "m-mgr", blocked: "m-new"}} {
		orgs, members, claims := teamFixture()
		s := teamSvc(orgs, members, claims, &fakeRepo{}, b, &recNotifs{})
		_, err := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "kofi@oguaa.test", "PTA Chair", "")
		if err == nil || err.Error() != msgInviteeNotFound {
			t.Errorf("block %+v: err = %v, want the not-found answer", b, err)
		}
		if len(claims.claims) != 1 {
			t.Errorf("block %+v: no claim should be created, have %d", b, len(claims.claims))
		}
	}
}

// F121: the office title is capped.
func TestInviteToTeam_capsTheRole(t *testing.T) {
	orgs, members, claims := teamFixture()
	s := svcWith(orgs, members, claims)
	if _, err := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "kofi@oguaa.test", strings.Repeat("x", 81), ""); err == nil {
		t.Error("an 81-character role must be refused")
	}
}

// F121: email/WhatsApp copies carry none of the inviter's free text.
func TestInviteToTeam_outOfBandCarriesNoInviterText(t *testing.T) {
	orgs, members, claims := teamFixture()
	email := &recEmail{}
	s := teamSvc(orgs, members, claims, &fakeRepo{}, nil, &recNotifs{})
	s.email = email
	role := "Treasurer - send your MoMo PIN to 0240000000"
	if _, err := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "kofi@oguaa.test", role, ""); err != nil {
		t.Fatalf("invite: %v", err)
	}
	for _, m := range email.sent {
		if strings.Contains(m.html, "MoMo PIN") || strings.Contains(m.subject, "MoMo PIN") {
			t.Errorf("inviter free text leaked out of band: %+v", m)
		}
	}
}

// F125: a mixed-case email finds the member (identifiers are stored lower-case).
func TestInviteToTeam_normalisesEmail(t *testing.T) {
	orgs, members, claims := teamFixture()
	s := svcWith(orgs, members, claims)
	c, err := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "  Kofi@Oguaa.Test ", "PTA Chair", "")
	if err != nil {
		t.Fatalf("mixed-case invite: %v", err)
	}
	if c.MemberID != "m-new" {
		t.Errorf("invited %q, want m-new", c.MemberID)
	}
}

// F118 + F122: revoking removes the member's verified office and hands the
// institution's events they posted to the revoking manager.
func TestRevokeTeamMember_vacatesOfficeAndReassignsEvents(t *testing.T) {
	orgs, members, claims := teamFixture()
	orgs.orgs[0].Verified = true
	listings := &fakeRepo{}
	s := teamSvc(orgs, members, claims, listings, nil, &recNotifs{})
	c, err := s.InviteToTeam(context.Background(), "m-mgr", "bakaano-basic", "kofi@oguaa.test", "PTA Chair", "")
	if err != nil {
		t.Fatalf("invite: %v", err)
	}
	if err := s.RespondToInvite(context.Background(), "m-new", c.ID, true); err != nil {
		t.Fatalf("accept: %v", err)
	}
	ev, err := s.PostOrgEvent(context.Background(), "m-new", "bakaano-basic", "Speech Day", map[string]any{"startsAt": "2026-11-01"})
	if err != nil {
		t.Fatalf("post event: %v", err)
	}
	listings.listings = append(listings.listings, domain.Listing{ID: "other-org-ev", OwnerID: "m-new", PostedByOrgID: "org-other"})

	if err := s.RevokeTeamMember(context.Background(), "m-mgr", "bakaano-basic", "m-new"); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	for _, o := range orgs.orgs[0].Offices {
		if o.HolderID == "m-new" {
			t.Errorf("revoked member still on the roster: %+v", o)
		}
	}
	owners := map[string]string{}
	for _, l := range listings.listings {
		owners[l.ID] = l.OwnerID
	}
	if owners[ev.ID] != "m-mgr" {
		t.Errorf("org event owner = %q, want the revoking manager", owners[ev.ID])
	}
	if owners["other-org-ev"] != "m-new" {
		t.Errorf("another institution's event must not move, owner = %q", owners["other-org-ev"])
	}
}

func TestSuccessorOwner(t *testing.T) {
	claims := []domain.OrgClaim{
		{MemberID: "m-gone", Status: domain.ClaimApproved, CreatedAt: "2020-01-01T00:00:00Z"},
		{MemberID: "m-off-old", Status: domain.ClaimApproved, Scope: domain.ScopeOfficer, CreatedAt: "2021-01-01T00:00:00Z"},
		{MemberID: "m-mgr-new", Status: domain.ClaimApproved, CreatedAt: "2024-01-01T00:00:00Z"},
		{MemberID: "m-mgr-old", Status: domain.ClaimApproved, CreatedAt: "2022-01-01T00:00:00Z"},
		{MemberID: "m-revoked", Status: domain.ClaimRevoked, CreatedAt: "2019-01-01T00:00:00Z"},
	}
	if got := successorOwner(claims, "m-mgr-new", "m-gone"); got != "m-mgr-new" {
		t.Errorf("acting team member should take over, got %q", got)
	}
	if got := successorOwner(claims, "m-steward", "m-gone"); got != "m-mgr-old" {
		t.Errorf("longest-serving manager should take over, got %q", got)
	}
	if got := successorOwner(claims[:2], "m-steward", "m-gone"); got != "m-off-old" {
		t.Errorf("an officer should take over when no manager remains, got %q", got)
	}
	if got := successorOwner(claims[:1], "m-steward", "m-gone"); got != "" {
		t.Errorf("no team left → unowned, got %q", got)
	}
}

// F112: two institutions posting the same title get distinct slugs.
// F113: curated festival keys are dropped from an institution's event.
func TestPostOrgEvent_uniqueSlugAndNoCuratedKeys(t *testing.T) {
	orgs, members, claims := teamFixture()
	orgs.orgs[0].Verified = true
	listings := &fakeRepo{}
	s := teamSvc(orgs, members, claims, listings, nil, &recNotifs{})
	details := func() map[string]any {
		return map[string]any{
			"startsAt": "2026-01-01", "description": "Our speech day.",
			"festival": "fetu-afahye", "edition": "2026", "recap": "Fetu Afahye 2026 has been cancelled",
			"anchorFestival": "fetu-afahye", "spotlight": true,
		}
	}
	a, err := s.PostOrgEvent(context.Background(), "m-mgr", "bakaano-basic", "Speech and Prize Giving Day", details())
	if err != nil {
		t.Fatalf("first post: %v", err)
	}
	b, err := s.PostOrgEvent(context.Background(), "m-mgr", "bakaano-basic", "Speech and Prize Giving Day", details())
	if err != nil {
		t.Fatalf("second post: %v", err)
	}
	if a.Slug == b.Slug || !strings.HasPrefix(a.Slug, "speech-and-prize-giving-day-") {
		t.Errorf("slugs %q and %q must be distinct and title-based", a.Slug, b.Slug)
	}
	for _, k := range []string{"festival", "edition", "recap", "anchorFestival", "spotlight"} {
		if _, ok := a.Details[k]; ok {
			t.Errorf("curated key %q must not be accepted from an institution post", k)
		}
	}
	if a.Details["description"] != "Our speech day." {
		t.Errorf("ordinary event details must be kept, got %+v", a.Details)
	}
}

// F124: a new authority institution is created unverified — never "live".
func TestReviewOrgClaim_newAuthorityIsNotAnnouncedLive(t *testing.T) {
	orgs := &recOrgs{}
	members := teamMembers{members: []domain.Member{{ID: "m-req", DisplayName: "Chief Officer"}}}
	claims := &recClaims{claims: []domain.OrgClaim{{
		ID: "clm-new", MemberID: "m-req", RequestedRole: "Commander", Status: domain.ClaimPending,
		NewOrg: &domain.NewOrgRequest{Name: "Cape Coast Security Unit", Kind: "security-service", Seat: "Cape Coast"},
	}}}
	notifs := &recNotifs{}
	s := teamSvc(orgs, members, claims, &fakeRepo{}, nil, notifs)
	if err := s.ReviewOrgClaim(context.Background(), "clm-new", true, "m-steward"); err != nil {
		t.Fatalf("approve: %v", err)
	}
	if len(notifs.inserted) != 1 {
		t.Fatalf("expected one notice, got %d", len(notifs.inserted))
	}
	n := notifs.inserted[0]
	if strings.Contains(n.Title, "live") || strings.Contains(n.Body, "verified.") {
		t.Errorf("an unverified authority must not be announced live/verified: %q / %q", n.Title, n.Body)
	}
}

func TestReviewOrgClaim_rejectedNewInstitutionIsNamed(t *testing.T) {
	members := teamMembers{members: []domain.Member{{ID: "m-req", DisplayName: "Ama"}}}
	claims := &recClaims{claims: []domain.OrgClaim{{
		ID: "clm-new", MemberID: "m-req", RequestedRole: "Founder", Status: domain.ClaimPending,
		NewOrg: &domain.NewOrgRequest{Name: "Kotokuraba Traders", Kind: "association", Seat: "Kotokuraba"},
	}}}
	notifs := &recNotifs{}
	s := teamSvc(&recOrgs{}, members, claims, &fakeRepo{}, nil, notifs)
	if err := s.ReviewOrgClaim(context.Background(), "clm-new", false, "m-steward"); err != nil {
		t.Fatalf("reject: %v", err)
	}
	if len(notifs.inserted) != 1 || !strings.Contains(notifs.inserted[0].Body, "Kotokuraba Traders") {
		t.Errorf("rejection should name the requested institution, got %+v", notifs.inserted)
	}
}
