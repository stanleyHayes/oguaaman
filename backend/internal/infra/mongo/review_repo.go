package mongo

import (
	"context"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// ReviewRepo is the Mongo-backed ReviewRepository ("reviews").
type ReviewRepo struct {
	c *mongo.Collection
	// oneEach makes sure the one-review-per-member index exists before this
	// process writes its first review (see ensureOneReviewEach).
	oneEach *sync.Once
}

func NewReviewRepo(db *mongo.Database) *ReviewRepo {
	return &ReviewRepo{c: db.Collection(collReviews), oneEach: &sync.Once{}}
}

// ensureOneReviewEach creates the unique {listingId, memberId} index that backs
// "one review per member" (anonymous reviews, with no memberId, are exempt).
// Best-effort: an existing index is a no-op, and a failure only loses the
// database-level guarantee, never the request.
func (r *ReviewRepo) ensureOneReviewEach(ctx context.Context) {
	r.oneEach.Do(func() {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		_, _ = r.c.Indexes().CreateOne(ctx, mongo.IndexModel{
			Keys: bson.D{{Key: "listingId", Value: 1}, {Key: "memberId", Value: 1}},
			Options: options.Index().SetUnique(true).
				SetPartialFilterExpression(bson.M{"memberId": bson.M{"$type": "string"}}),
		})
	})
}

func (r *ReviewRepo) ByListing(ctx context.Context, listingID string) ([]domain.Review, error) {
	cur, err := r.c.Find(ctx, bson.M{"listingId": listingID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.Review{}
	return out, cur.All(ctx, &out)
}

// Upsert writes the member's single review for the listing (keyed by
// listingId+memberId); an anonymous review (empty memberId) always inserts.
//
// An edit updates the content fields only. The review keeps its original _id
// (immutable in MongoDB — replacing the whole document with a fresh id fails
// with "the (immutable) field '_id' was found to have been altered"), its
// creation time and its moderation status.
func (r *ReviewRepo) Upsert(ctx context.Context, rv domain.Review) error {
	if rv.MemberID == "" {
		_, err := r.c.InsertOne(ctx, rv)
		return err
	}
	r.ensureOneReviewEach(ctx)
	updatedAt := rv.UpdatedAt
	if updatedAt == "" {
		updatedAt = rv.CreatedAt
	}
	_, err := r.c.UpdateOne(ctx,
		bson.M{"listingId": rv.ListingID, "memberId": rv.MemberID},
		bson.M{
			"$set": bson.M{
				"listingSlug": rv.ListingSlug,
				"memberSlug":  rv.MemberSlug,
				"authorName":  rv.AuthorName,
				"rating":      rv.Rating,
				"body":        rv.Body,
				"updatedAt":   updatedAt,
			},
			"$setOnInsert": bson.M{"_id": rv.ID, "createdAt": rv.CreatedAt},
		},
		options.UpdateOne().SetUpsert(true),
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

// Get returns one review by id.
func (r *ReviewRepo) Get(ctx context.Context, id string) (*domain.Review, error) {
	var rv domain.Review
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&rv); err != nil {
		return nil, notFound("review", err)
	}
	return &rv, nil
}

// SetStatus changes a review's visibility without deleting it.
func (r *ReviewRepo) SetStatus(ctx context.Context, id, status string) error {
	update := bson.M{"$set": bson.M{"status": status}}
	if status == "" {
		update = bson.M{"$unset": bson.M{"status": ""}}
	}
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return &domain.NotFoundError{Entity: "review"}
	}
	return nil
}
