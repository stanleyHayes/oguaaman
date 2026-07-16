package service

import (
	"context"
	"strings"

	"github.com/oguaa/backend/internal/domain"
)

// ── member ↔ member follows + birthday opt-in (spec §8.11) ───────────────────

// FollowMember records that one member follows another (by slug). A member's
// followers are the default audience for their posts' remembrances and birthday.
// Returns the target's updated follower count.
func (s *Service) FollowMember(ctx context.Context, followerID, slug string) (int, error) {
	m, err := s.members.BySlug(ctx, slug)
	if err != nil {
		return 0, err
	}
	if err := s.follows.FollowMember(ctx, followerID, m.ID); err != nil {
		return 0, err
	}
	fol, _ := s.follows.MemberFollowers(ctx, m.ID)
	return len(fol), nil
}

func (s *Service) UnfollowMember(ctx context.Context, followerID, slug string) (int, error) {
	m, err := s.members.BySlug(ctx, slug)
	if err != nil {
		return 0, err
	}
	if err := s.follows.UnfollowMember(ctx, followerID, m.ID); err != nil {
		return 0, err
	}
	fol, _ := s.follows.MemberFollowers(ctx, m.ID)
	return len(fol), nil
}

func (s *Service) IsFollowingMember(ctx context.Context, followerID, slug string) (bool, error) {
	m, err := s.members.BySlug(ctx, slug)
	if err != nil {
		return false, err
	}
	return s.follows.IsFollowingMember(ctx, followerID, m.ID)
}

// SetMemberBirthday lets a member set their own birthday and opt in/out of
// broadcasting it to their followers (spec §8.11 — creator-controlled).
func (s *Service) SetMemberBirthday(ctx context.Context, memberID, birthday string, broadcast bool) error {
	birthday = strings.TrimSpace(birthday)
	if broadcast && monthDayOf(birthday) == "" {
		return &domain.ForbiddenError{Reason: "add a valid birthday (YYYY-MM-DD or MM-DD) before broadcasting it"}
	}
	return s.members.SetBirthday(ctx, memberID, birthday, broadcast)
}

// SetMemberAffiliations sets the member's quarter (town) and Asafo company —
// "rep your quarter and your Asafo" (spec §8.6).
func (s *Service) SetMemberAffiliations(ctx context.Context, memberID, townID, asafoID string) error {
	return s.members.SetAffiliations(ctx, memberID, strings.TrimSpace(townID), strings.TrimSpace(asafoID))
}

// SetMemberPhoto sets (or clears, when empty) the member's profile photo. The
// URL is uploaded client-side to Cloudinary; we store only the returned link.
func (s *Service) SetMemberPhoto(ctx context.Context, memberID, photoURL string) error {
	return s.members.SetPhoto(ctx, memberID, strings.TrimSpace(photoURL))
}

// SetMemberLinks replaces the member's social/contact links (Creator Platform
// plan §3). URLs are sanitized so a javascript:/data: scheme can't be stored and
// later rendered as an <a href>; fully-empty rows are dropped.
func (s *Service) SetMemberLinks(ctx context.Context, memberID string, links []domain.SocialLink) error {
	clean := make([]domain.SocialLink, 0, len(links))
	for _, l := range links {
		l.Label = strings.TrimSpace(l.Label)
		l.URL = safeURL(l.URL)
		if l.Label == "" && l.URL == "" {
			continue
		}
		clean = append(clean, l)
	}
	if len(clean) > 20 {
		return &domain.ForbiddenError{Reason: "that's too many links — keep it under 20"}
	}
	return s.members.SetLinks(ctx, memberID, clean)
}

// MemberVerified reports whether a member earns the verified badge and a short
// label for who/what verifies them. True for curators and stewards, and for an
// approved manager/officer of a VERIFIED authority-kind institution (spec:
// verified badge). Clients show a checkmark next to verified members' names.
func (s *Service) MemberVerified(ctx context.Context, memberID string) (bool, string, error) {
	m, err := s.members.ByID(ctx, memberID)
	if err != nil {
		return false, "", err
	}
	return s.memberVerified(ctx, m)
}

// memberVerified computes the badge from an already-loaded member.
func (s *Service) memberVerified(ctx context.Context, m *domain.Member) (bool, string, error) {
	if m == nil {
		return false, "", nil
	}
	switch m.Role {
	case domain.RoleCurator:
		return true, "Curator", nil
	case domain.RoleSteward:
		return true, "Steward", nil
	}
	ids, err := s.claims.ManagedOrgIDs(ctx, m.ID)
	if err != nil {
		return false, "", err
	}
	for _, id := range ids {
		org, err := s.orgs.ByID(ctx, id)
		if err != nil || org == nil {
			continue
		}
		if org.Verified && domain.IsAuthorityKind(org.Kind) {
			return true, org.Name, nil
		}
	}
	return false, "", nil
}

// EnrichMemberBadge computes and stamps the verified/verifiedAs badge fields on
// m so serialized member payloads (/api/auth/me, the public profile) carry the
// checkmark signal. Best-effort: a lookup error leaves the badge off.
func (s *Service) EnrichMemberBadge(ctx context.Context, m *domain.Member) {
	if m == nil {
		return
	}
	if v, as, err := s.memberVerified(ctx, m); err == nil {
		m.Verified, m.VerifiedAs = v, as
	}
}
