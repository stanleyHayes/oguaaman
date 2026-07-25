package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// ReviewRepo is the Mongo-backed ReviewRepository ("reviews").
type ReviewRepo struct{ c *mongo.Collection }

func NewReviewRepo(db *mongo.Database) *ReviewRepo { return &ReviewRepo{db.Collection(collReviews)} }

func (r *ReviewRepo) ByListing(ctx context.Context, listingID string) ([]domain.Review, error) {
	cur, err := r.c.Find(ctx, bson.M{"listingId": listingID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.Review{}
	return out, cur.All(ctx, &out)
}

// Upsert replaces the member's single review for the listing (keyed by
// listingId+memberId); an anonymous review (empty memberId) always inserts.
func (r *ReviewRepo) Upsert(ctx context.Context, rv domain.Review) error {
	if rv.MemberID == "" {
		_, err := r.c.InsertOne(ctx, rv)
		return err
	}
	_, err := r.c.ReplaceOne(ctx,
		bson.M{"listingId": rv.ListingID, "memberId": rv.MemberID},
		rv,
		options.Replace().SetUpsert(true),
	)
	return err
}

func (r *ReviewRepo) HasReviewed(ctx context.Context, listingID, memberID string) (bool, error) {
	if memberID == "" {
		return false, nil
	}
	n, err := r.c.CountDocuments(ctx, bson.M{"listingId": listingID, "memberId": memberID})
	return n > 0, err
}
