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
