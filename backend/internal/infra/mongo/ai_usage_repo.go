package mongo

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// aiUsageRetention is how long a daily AI-usage counter is kept (90 days) —
// long enough for spend reviews, then the TTL index removes it (the counters
// are keyed by member id, i.e. personal data).
const aiUsageRetention = 90 * 24 * time.Hour

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

// Incr atomically increments (day, key) and returns the new count. A new
// counter is stamped with its expiry (day + 90 days) for the TTL index.
func (r *AIUsageRepo) Incr(ctx context.Context, day, key string) (int, error) {
	n, err := r.IncrBy(ctx, day, key, 1)
	return int(n), err
}

// IncrBy atomically adds n to (day, key) — one $inc upsert — and returns the
// new total. Counters written by Incr and IncrBy share the same field.
func (r *AIUsageRepo) IncrBy(ctx context.Context, day, key string, n int64) (int64, error) {
	var doc struct {
		Count int64 `bson:"count"`
	}
	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
	err := r.c.FindOneAndUpdate(ctx, bson.M{"_id": docID(day, key)}, usageIncUpdate(day, n), opts).Decode(&doc)
	return doc.Count, err
}

// usageIncUpdate adds n to a counter, stamping a new one with its expiry.
func usageIncUpdate(day string, n int64) bson.M {
	return bson.M{"$inc": bson.M{"count": n}, "$setOnInsert": bson.M{"expireAt": usageExpiry(day)}}
}

// usageExpiry is when a counter for day may be deleted.
func usageExpiry(day string) time.Time {
	d, err := time.Parse(time.DateOnly, day)
	if err != nil {
		d = time.Now().UTC()
	}
	return d.Add(aiUsageRetention)
}

// EnsureAIUsageRetention creates the TTL index on expireAt and backfills it
// (from the day in the _id) on counters written before retention existed.
func EnsureAIUsageRetention(ctx context.Context, db *mongo.Database) error {
	c := db.Collection(collAIUsage)
	if _, err := c.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "expireAt", Value: 1}},
		Options: options.Index().SetExpireAfterSeconds(0),
	}); err != nil {
		return err
	}
	_, err := c.UpdateMany(ctx, bson.M{"expireAt": bson.M{"$exists": false}}, mongo.Pipeline{
		{{Key: "$set", Value: bson.M{"expireAt": bson.M{"$add": bson.A{
			bson.M{"$dateFromString": bson.M{
				"dateString": bson.M{"$substrBytes": bson.A{"$_id", 0, 10}},
				"format":     "%Y-%m-%d", "onError": "$$NOW", "onNull": "$$NOW",
			}},
			aiUsageRetention.Milliseconds(),
		}}}}},
	})
	return err
}
