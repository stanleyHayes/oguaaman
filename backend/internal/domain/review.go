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
	// MemberSlug is the author's public profile handle, so readers can report
	// or block the author from the review row.
	MemberSlug string `json:"memberSlug,omitempty" bson:"memberSlug,omitempty"`
	AuthorName string `json:"authorName" bson:"authorName"`
	Rating     int    `json:"rating" bson:"rating"` // 1–5
	Body       string `json:"body,omitempty" bson:"body,omitempty"`
	CreatedAt  string `json:"createdAt" bson:"createdAt"`
	UpdatedAt  string `json:"updatedAt,omitempty" bson:"updatedAt,omitempty"`
	// Status is empty for a visible review. Hidden (pending review after a
	// child-safety / intimate-image report) and removed reviews are kept as
	// evidence but never shown or counted in the rating.
	Status string `json:"status,omitempty" bson:"status,omitempty"`
}

// Review visibility (Review.Status). The zero value is visible.
const (
	ReviewHidden  = "hidden"
	ReviewRemoved = "removed"
)

// ReviewRepository persists listing reviews.
type ReviewRepository interface {
	ByListing(ctx context.Context, listingID string) ([]Review, error)
	// Upsert creates or updates the member's single review for the listing
	// (keyed by listingID+memberID), so a member editing their review updates it
	// rather than stacking duplicates. An edit keeps the review's id, creation
	// time and moderation status. Anonymous (empty memberID) reviews always insert.
	Upsert(ctx context.Context, r Review) error
	// HasReviewed reports whether the member already reviewed the listing.
	HasReviewed(ctx context.Context, listingID, memberID string) (bool, error)
	// Get returns one review by id (or NotFound).
	Get(ctx context.Context, id string) (*Review, error)
	// SetStatus changes a review's visibility ("" visible, ReviewHidden,
	// ReviewRemoved) without deleting it.
	SetStatus(ctx context.Context, id, status string) error
}
