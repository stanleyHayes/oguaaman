package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type NotificationRepo struct{ c *mongo.Collection }

func NewNotificationRepo(db *mongo.Database) *NotificationRepo {
	return &NotificationRepo{db.Collection(collNotifications)}
}

func (r *NotificationRepo) Insert(ctx context.Context, n domain.Notification) error {
	_, err := r.c.InsertOne(ctx, n)
	return err
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
