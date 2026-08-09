package service

import (
	"context"
	"strings"

	"github.com/oguaa/backend/internal/domain"
)

// ── member ↔ member blocking (App Store Review Guideline 1.2) ────────────────
//
// An app that hosts user-generated content must let people block abusive users.
// Reporting (see reports) and the moderation queue are the platform's response;
// a block is the member's own, and applies the moment it is made.

const blockReasonMax = 300

// BlockMember blocks the member identified by slug, on behalf of blockerID.
//
// Blocking also severs any follow in either direction: leaving a follow in place
// would keep pushing the blocked member's activity into notifications, which is
// exactly what the member asked to stop.
func (s *Service) BlockMember(ctx context.Context, blockerID, slug, reason string) error {
	target, err := s.members.BySlug(ctx, slug)
	if err != nil {
		return err
	}
	if target.ID == blockerID {
		return &domain.ForbiddenError{Reason: "you cannot block yourself"}
	}
	reason = strings.TrimSpace(reason)
	if len(reason) > blockReasonMax {
		reason = reason[:blockReasonMax]
	}
	if err := s.blocks.Block(ctx, blockerID, target.ID, reason); err != nil {
		return err
	}
	// Best-effort: a follow that survives a block would keep delivering the
	// blocked member's activity. Failing to unfollow must not fail the block.
	_ = s.follows.UnfollowMember(ctx, blockerID, target.ID)
	_ = s.follows.UnfollowMember(ctx, target.ID, blockerID)
	return nil
}

func (s *Service) UnblockMember(ctx context.Context, blockerID, slug string) error {
	target, err := s.members.BySlug(ctx, slug)
	if err != nil {
		return err
	}
	return s.blocks.Unblock(ctx, blockerID, target.ID)
}

// IsBlockedMember reports whether a block exists between the viewer and slug, in
// either direction.
func (s *Service) IsBlockedMember(ctx context.Context, viewerID, slug string) (bool, error) {
	target, err := s.members.BySlug(ctx, slug)
	if err != nil {
		return false, err
	}
	return s.blocks.IsBlocked(ctx, viewerID, target.ID)
}

// MyBlocked lists the members this member has blocked, with enough identity to
// render an unblock list. Members that no longer resolve are skipped.
func (s *Service) MyBlocked(ctx context.Context, memberID string) ([]domain.BlockedMember, error) {
	rows, err := s.blocks.BlockedBy(ctx, memberID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.BlockedMember, 0, len(rows))
	for _, b := range rows {
		m, err := s.members.ByID(ctx, b.BlockedID)
		if err != nil || m == nil {
			continue
		}
		out = append(out, domain.BlockedMember{
			MemberID:    m.ID,
			Slug:        m.Slug,
			DisplayName: m.DisplayName,
			PhotoURL:    m.PhotoURL,
			CreatedAt:   b.CreatedAt,
			Reason:      b.Reason,
		})
	}
	return out, nil
}

// hiddenFor returns the set of member IDs that must be invisible to viewerID.
// Read paths use it to drop blocked authors from anything they return. A lookup
// failure yields an empty set rather than an error: a filter that cannot be
// computed must not take the whole page down with it.
func (s *Service) hiddenFor(ctx context.Context, viewerID string) map[string]struct{} {
	if viewerID == "" || s.blocks == nil {
		return nil
	}
	ids, err := s.blocks.HiddenFor(ctx, viewerID)
	if err != nil || len(ids) == 0 {
		if err != nil {
			s.log.Warn("block filter unavailable — showing unfiltered results", "memberId", viewerID, "err", err)
		}
		return nil
	}
	set := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		set[id] = struct{}{}
	}
	return set
}

// FilterBlockedListings drops listings owned by a blocked member. Safe to call
// with an empty viewer (signed-out), where it returns the input untouched.
func (s *Service) FilterBlockedListings(ctx context.Context, viewerID string, in []domain.Listing) []domain.Listing {
	hidden := s.hiddenFor(ctx, viewerID)
	if len(hidden) == 0 {
		return in
	}
	out := make([]domain.Listing, 0, len(in))
	for _, l := range in {
		if _, blocked := hidden[l.OwnerID]; blocked {
			continue
		}
		out = append(out, l)
	}
	return out
}

// FilterBlockedReviews drops reviews written by a blocked member.
func (s *Service) FilterBlockedReviews(ctx context.Context, viewerID string, in []domain.Review) []domain.Review {
	hidden := s.hiddenFor(ctx, viewerID)
	if len(hidden) == 0 {
		return in
	}
	out := make([]domain.Review, 0, len(in))
	for _, rv := range in {
		if _, blocked := hidden[rv.MemberID]; blocked {
			continue
		}
		out = append(out, rv)
	}
	return out
}

// ForgetBlocks removes every block naming a member, in both directions. Called
// on account erasure (Act 843 §14.2) so a deleted account leaves no rows
// pointing at it.
func (s *Service) ForgetBlocks(ctx context.Context, memberID string) error {
	if s.blocks == nil {
		return nil
	}
	return s.blocks.DeleteByMember(ctx, memberID)
}
