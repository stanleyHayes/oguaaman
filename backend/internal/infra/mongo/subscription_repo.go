package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type SubscriptionRepo struct{ c *mongo.Collection }

func NewSubscriptionRepo(db *mongo.Database) *SubscriptionRepo {
	return &SubscriptionRepo{db.Collection(collSubscriptions)}
}

func (r *SubscriptionRepo) Insert(ctx context.Context, s domain.Subscription) error {
	_, err := r.c.InsertOne(ctx, s)
	return err
}

func (r *SubscriptionRepo) ByReference(ctx context.Context, reference string) (*domain.Subscription, error) {
	var s domain.Subscription
	if err := r.c.FindOne(ctx, bson.M{fieldReference: reference}).Decode(&s); err != nil {
		return nil, notFound("subscription", err)
	}
	return &s, nil
}

// MarkSuccess settles a subscription and its paid-until date in one
// conditional write; see domain.SubscriptionRepository for the contract.
func (r *SubscriptionRepo) MarkSuccess(ctx context.Context, reference, at, periodEnd, featuredUntil string) (bool, error) {
	set := bson.M{fieldStatus: domain.PledgeSuccess, fieldConfirmedAt: at, "periodEnd": periodEnd, fieldGrantPending: true}
	if featuredUntil != "" {
		set[fieldFeaturedUntil] = featuredUntil
	}
	return won(r.c.UpdateOne(ctx, unsettled(reference), bson.M{"$set": set}))
}

// MarkGranted clears grantPending once the subscription's grant is applied.
func (r *SubscriptionRepo) MarkGranted(ctx context.Context, reference string) error {
	return markGranted(ctx, r.c, reference)
}

// MarkFailed records a failed payment unless the subscription already succeeded.
func (r *SubscriptionRepo) MarkFailed(ctx context.Context, reference string) error {
	_, err := r.c.UpdateOne(ctx, unsettled(reference), bson.M{"$set": bson.M{fieldStatus: domain.PledgeFailed}})
	return err
}

func (r *SubscriptionRepo) ByMember(ctx context.Context, memberID string) ([]domain.Subscription, error) {
	cur, err := r.c.Find(ctx, bson.M{"memberId": memberID})
	if err != nil {
		return nil, err
	}
	out := []domain.Subscription{}
	return out, cur.All(ctx, &out)
}

func (r *SubscriptionRepo) All(ctx context.Context) ([]domain.Subscription, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.Subscription{}
	return out, cur.All(ctx, &out)
}

func (r *SubscriptionRepo) ActiveByListing(ctx context.Context, listingID, now string) (bool, error) {
	n, err := r.c.CountDocuments(ctx, bson.M{
		"listingId": listingID,
		fieldStatus: domain.PledgeSuccess,
		"periodEnd": bson.M{"$gt": now},
	})
	return n > 0, err
}
