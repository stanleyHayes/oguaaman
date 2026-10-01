package mongo

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// notificationRetention is how long an in-app notice is kept before the TTL
// index removes it (12 months) — the retention schedule for notifications.
const notificationRetention = 365 * 24 * time.Hour

type NotificationRepo struct{ c *mongo.Collection }

func NewNotificationRepo(db *mongo.Database) *NotificationRepo {
	return &NotificationRepo{db.Collection(collNotifications)}
}

// withExpiry stamps the retention deadline on a notice about to be stored.
func withExpiry(n domain.Notification) domain.Notification {
	if n.ExpireAt.IsZero() {
		n.ExpireAt = time.Now().UTC().Add(notificationRetention)
	}
	return n
}

func (r *NotificationRepo) Insert(ctx context.Context, n domain.Notification) error {
	_, err := r.c.InsertOne(ctx, withExpiry(n))
	return err
}

// InsertOnce inserts n unless a notice with its id already exists; a duplicate
// key is not an error, it just reports false.
func (r *NotificationRepo) InsertOnce(ctx context.Context, n domain.Notification) (bool, error) {
	_, err := r.c.InsertOne(ctx, withExpiry(n))
	if mongo.IsDuplicateKeyError(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (r *NotificationRepo) ByMember(ctx context.Context, memberID string) ([]domain.Notification, error) {
	cur, err := r.c.Find(ctx, bson.M{"memberId": memberID})
	if err != nil {
		return nil, err
	}
	out := []domain.Notification{}
	return out, cur.All(ctx, &out)
}

func (r *NotificationRepo) MarkRead(ctx context.Context, id, memberID string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id, "memberId": memberID}, bson.M{"$set": bson.M{"read": true}})
	return err
}

func (r *NotificationRepo) MarkAllRead(ctx context.Context, memberID string) error {
	_, err := r.c.UpdateMany(ctx, bson.M{"memberId": memberID, "read": false}, bson.M{"$set": bson.M{"read": true}})
	return err
}

func (r *NotificationRepo) UnreadCount(ctx context.Context, memberID string) (int, error) {
	n, err := r.c.CountDocuments(ctx, bson.M{"memberId": memberID, "read": false})
	return int(n), err
}

// EnsureNotificationRetention creates the TTL index that deletes each notice
// at its expireAt, and backfills expireAt (createdAt + 12 months) on notices
// stored before retention existed. Idempotent; run with the other indexes.
func EnsureNotificationRetention(ctx context.Context, db *mongo.Database) error {
	c := db.Collection(collNotifications)
	if _, err := c.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "expireAt", Value: 1}},
		Options: options.Index().SetExpireAfterSeconds(0),
	}); err != nil {
		return err
	}
	_, err := c.UpdateMany(ctx, bson.M{"expireAt": bson.M{"$exists": false}}, mongo.Pipeline{
		{{Key: "$set", Value: bson.M{"expireAt": bson.M{"$add": bson.A{
			bson.M{"$dateFromString": bson.M{"dateString": "$createdAt", "onError": "$$NOW", "onNull": "$$NOW"}},
			notificationRetention.Milliseconds(),
		}}}}},
	})
	return err
}
