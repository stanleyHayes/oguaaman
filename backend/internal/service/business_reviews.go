package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── business reviews & ratings ───────────────────────────────────────────────
//
// Members rate and review approved businesses (1–5 stars + an optional note).
// One review per member per business (editing replaces it). Every write
// recomputes the business's details.ratingAvg / ratingCount so the directory
// and marketing site can show the star rating without re-reading every review.

// ReviewInput is a create/update review payload.
type ReviewInput struct {
	Rating int    `json:"rating"`
	Body   string `json:"body"`
}

const maxReviewBodyRunes = 1500

// BusinessReviews returns a business's reviews (newest first) plus the aggregate.
func (s *Service) BusinessReviews(ctx context.Context, slug string) ([]domain.Review, float64, int, error) {
	l, err := s.listings.GetBySlug(ctx, domain.TypeBusiness, slug)
	if err != nil {
		return nil, 0, 0, err
	}
	reviews, err := s.reviews.ByListing(ctx, l.ID)
	if err != nil {
		return nil, 0, 0, err
	}
	avg, count := ratingAggregate(reviews)
	return reviews, avg, count, nil
}

// AddBusinessReview records (or replaces) a member's review of a business and
// recomputes the business's aggregate rating.
func (s *Service) AddBusinessReview(ctx context.Context, actor *domain.Member, slug string, in ReviewInput) (*domain.Review, error) {
	if actor == nil {
		return nil, &domain.ForbiddenError{Reason: "sign in to leave a review"}
	}
	if in.Rating < 1 || in.Rating > 5 {
		return nil, fmt.Errorf("a rating from 1 to 5 stars is required")
	}
	body := strings.TrimSpace(in.Body)
	if len([]rune(body)) > maxReviewBodyRunes {
		return nil, fmt.Errorf("keep the review under %d characters", maxReviewBodyRunes)
	}
	l, err := s.listings.GetBySlug(ctx, domain.TypeBusiness, slug)
	if err != nil {
		return nil, err
	}
	if l.Status != domain.StatusApproved {
		return nil, &domain.NotFoundError{Entity: "business"}
	}
	if actor.ID == l.OwnerID {
		return nil, &domain.ForbiddenError{Reason: "you can't review your own business"}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	name := strings.TrimSpace(actor.DisplayName)
	if name == "" {
		name = "A member of the community"
	}
	review := domain.Review{
		ID:          newID(domain.PrefixReview),
		ListingID:   l.ID,
		ListingSlug: l.Slug,
		MemberID:    actor.ID,
		AuthorName:  name,
		Rating:      in.Rating,
		Body:        body,
		CreatedAt:   now,
	}
	if err := s.reviews.Upsert(ctx, review); err != nil {
		return nil, err
	}
	// Recompute and store the aggregate for cheap directory reads.
	all, err := s.reviews.ByListing(ctx, l.ID)
	if err != nil {
		return nil, err
	}
	avg, count := ratingAggregate(all)
	if err := s.listings.SetRating(ctx, l.ID, avg, count); err != nil {
		return nil, err
	}
	// Notify the owner a review landed (in-app only; best-effort).
	if s.notifs != nil && l.OwnerID != "" {
		_ = s.notifs.Insert(ctx, domain.Notification{
			ID: newID(domain.PrefixNotification), MemberID: l.OwnerID,
			Kind: "review", Title: "A new review",
			Body: fmt.Sprintf("%s left %d★ on “%s”.", name, in.Rating, l.Title),
			Link: "/business/" + l.Slug, CreatedAt: now,
		})
	}
	return &review, nil
}

// ratingAggregate returns the mean rating (1 decimal) and count.
func ratingAggregate(reviews []domain.Review) (float64, int) {
	if len(reviews) == 0 {
		return 0, 0
	}
	sum := 0
	for _, r := range reviews {
		sum += r.Rating
	}
	avg := float64(sum) / float64(len(reviews))
	// Round to one decimal place.
	avg = float64(int(avg*10+0.5)) / 10
	return avg, len(reviews)
}
