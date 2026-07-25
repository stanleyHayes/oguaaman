package domain

import "context"

// Review — a member's rating + note on a listing (businesses in v1). One review
// per member per listing; the listing's details.ratingAvg / details.ratingCount
// are recomputed from these on every write so directory reads stay cheap.
type Review struct {
	ID          string `json:"id" bson:"_id"`
	ListingID   string `json:"listingId" bson:"listingId"`
	ListingSlug string `json:"listingSlug" bson:"listingSlug"`
	MemberID    string `json:"memberId,omitempty" bson:"memberId,omitempty"`
	AuthorName  string `json:"authorName" bson:"authorName"`
	Rating      int    `json:"rating" bson:"rating"` // 1–5
	Body        string `json:"body,omitempty" bson:"body,omitempty"`
	CreatedAt   string `json:"createdAt" bson:"createdAt"`
}

// ReviewRepository persists listing reviews.
type ReviewRepository interface {
	ByListing(ctx context.Context, listingID string) ([]Review, error)
	// Upsert creates or replaces the member's single review for the listing
	// (keyed by listingID+memberID), so a member editing their review updates it
	// rather than stacking duplicates. Anonymous (empty memberID) reviews always insert.
	Upsert(ctx context.Context, r Review) error
	// HasReviewed reports whether the member already reviewed the listing.
	HasReviewed(ctx context.Context, listingID, memberID string) (bool, error)
}
