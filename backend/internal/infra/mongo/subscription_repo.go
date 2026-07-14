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
	if err := r.c.FindOne(ctx, bson.M{"reference": reference}).Decode(&s); err != nil {
		return nil, notFound("subscription", err)
	}
	return &s, nil
}

func (r *SubscriptionRepo) UpdateStatus(ctx context.Context, reference, status, at string) error {
	set := bson.M{"status": status}
	if status == domain.PledgeSuccess {
		set["confirmedAt"] = at
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"reference": reference}, bson.M{"$set": set})
	return err
}

func (r *SubscriptionRepo) SetPeriodEnd(ctx context.Context, reference, until string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"reference": reference}, bson.M{"$set": bson.M{"periodEnd": until}})
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
		"status":    domain.PledgeSuccess,
		"periodEnd": bson.M{"$gt": now},
	})
	return n > 0, err
}
