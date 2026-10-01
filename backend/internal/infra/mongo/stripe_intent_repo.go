package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

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

// ByReference returns the newest intent for a reference (an older one may
// have been retired when the checkout was re-opened).
func (r *StripeIntentRepo) ByReference(ctx context.Context, reference string) (*domain.StripeIntent, error) {
	var i domain.StripeIntent
	opts := options.FindOne().SetSort(bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}})
	if err := r.c.FindOne(ctx, bson.M{"reference": reference}, opts).Decode(&i); err != nil {
		return nil, notFound("stripe_intent", err)
	}
	return &i, nil
}

// Confirm is conditional on the intent still being pending, so a retired
// (failed) intent can never be flipped to succeeded.
func (r *StripeIntentRepo) Confirm(ctx context.Context, reference, at string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"reference": reference, "status": domain.StripeIntentPending}, bson.M{"$set": bson.M{"status": domain.StripeIntentSucceeded, "confirmedAt": at}})
	return err
}

// MarkFailed retires every pending intent for the reference.
func (r *StripeIntentRepo) MarkFailed(ctx context.Context, reference, at string) error {
	_, err := r.c.UpdateMany(ctx, bson.M{"reference": reference, "status": domain.StripeIntentPending}, bson.M{"$set": bson.M{"status": domain.StripeIntentFailed, "confirmedAt": at}})
	return err
}
