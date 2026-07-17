package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type StripeIntentRepo struct{ c *mongo.Collection }

func NewStripeIntentRepo(db *mongo.Database) *StripeIntentRepo {
	return &StripeIntentRepo{db.Collection(collStripeIntents)}
}

func (r *StripeIntentRepo) Insert(ctx context.Context, i domain.StripeIntent) error {
	_, err := r.c.InsertOne(ctx, i)
	return err
}

func (r *StripeIntentRepo) ByReference(ctx context.Context, reference string) (*domain.StripeIntent, error) {
	var i domain.StripeIntent
	if err := r.c.FindOne(ctx, bson.M{"reference": reference}).Decode(&i); err != nil {
		return nil, notFound("stripe_intent", err)
	}
	return &i, nil
}

func (r *StripeIntentRepo) Confirm(ctx context.Context, reference, at string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"reference": reference}, bson.M{"$set": bson.M{"status": domain.StripeIntentSucceeded, "confirmedAt": at}})
	return err
}
