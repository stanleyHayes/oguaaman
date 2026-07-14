package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// AIUsageRepo stores daily AI-usage counters keyed by "<day>:<bucket>".
type AIUsageRepo struct{ c *mongo.Collection }

func NewAIUsageRepo(db *mongo.Database) *AIUsageRepo { return &AIUsageRepo{db.Collection(collAIUsage)} }

func docID(day, key string) string { return day + ":" + key }

func (r *AIUsageRepo) Count(ctx context.Context, day, key string) (int, error) {
	var doc struct {
		Count int `bson:"count"`
	}
	err := r.c.FindOne(ctx, bson.M{"_id": docID(day, key)}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return 0, nil
	}
	return doc.Count, err
}

func (r *AIUsageRepo) Incr(ctx context.Context, day, key string) (int, error) {
	var doc struct {
		Count int `bson:"count"`
	}
	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
	err := r.c.FindOneAndUpdate(ctx,
		bson.M{"_id": docID(day, key)},
		bson.M{"$inc": bson.M{"count": 1}},
		opts,
	).Decode(&doc)
	return doc.Count, err
}
