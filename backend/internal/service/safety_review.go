package service

import (
	"context"
	"sort"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── follow-up review of auto-published safety posts (P060) ───────────────────
//
// Incidents and lost & found notices publish instantly because they are time
// critical, so a curator looks at each one afterwards: every auto-published
// post carries details.postReviewDueAt (PostReviewWindow after posting) and
// stays in the safety review queue until a curator marks it reviewed.

// PostReviewWindow is how soon a curator should look at an auto-published post.
const PostReviewWindow = 2 * time.Hour

func postReviewDue() string {
	return time.Now().UTC().Add(PostReviewWindow).Format(time.RFC3339)
}

// SafetyReviewRow is an auto-published post awaiting its follow-up review.
type SafetyReviewRow struct {
	domain.Listing
	Overdue bool `json:"overdue"`
}

// SafetyReviewQueue returns published incidents and lost & found notices that
// no curator has reviewed yet, the most overdue first.
func (s *Service) SafetyReviewQueue(ctx context.Context) ([]SafetyReviewRow, error) {
	rows := []SafetyReviewRow{}
	now := time.Now().UTC().Format(time.RFC3339)
	for _, typ := range []string{domain.TypeIncident, domain.TypeLostFound} {
		items, err := s.listings.Find(ctx, domain.ListingFilter{Type: typ, Status: domain.StatusApproved})
		if err != nil {
			return nil, err
		}
		for _, l := range items {
			due := asString(l.Details, "postReviewDueAt")
			if due == "" || asString(l.Details, "postReviewedAt") != "" {
				continue
			}
			rows = append(rows, SafetyReviewRow{Listing: l, Overdue: due < now})
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		return asString(rows[i].Details, "postReviewDueAt") < asString(rows[j].Details, "postReviewDueAt")
	})
	return rows, nil
}

// MarkSafetyReviewed records a curator's follow-up review of a safety post.
func (s *Service) MarkSafetyReviewed(ctx context.Context, actor *domain.Member, listingID string) error {
	if actor == nil || !isSafetyStaff(actor.Role) {
		return &domain.ForbiddenError{Reason: "only curators and stewards can review safety posts"}
	}
	l, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return err
	}
	if l.Type != domain.TypeIncident && l.Type != domain.TypeLostFound {
		return &domain.NotFoundError{Entity: "safety post"}
	}
	return s.listings.MarkPostReviewed(ctx, listingID, actor.ID, time.Now().UTC().Format(time.RFC3339))
}
