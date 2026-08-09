package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

type PushRepo struct{ c *mongo.Collection }

func NewPushRepo(db *mongo.Database) *PushRepo {
	return &PushRepo{c: db.Collection(collPushSubs)}
}

// Upsert registers or refreshes a subscription by its _id (endpoint or token).
func (r *PushRepo) Upsert(ctx context.Context, s domain.PushSubscription) error {
	_, err := r.c.ReplaceOne(ctx, bson.M{"_id": s.ID}, s, options.Replace().SetUpsert(true))
	return err
}

// DeleteByID removes a member's subscription by its _id.
func (r *PushRepo) DeleteByID(ctx context.Context, memberID, id string) error {
	_, err := r.c.DeleteOne(ctx, bson.M{"_id": id, "memberId": memberID})
	return err
}

// DeleteByMember removes every subscription a member registered (account
// erasure). Unlike the member document itself — which is anonymised in place so
// community content keeps an owner — a device token carries no community value
// and is itself an identifier, so it is genuinely removed.
func (r *PushRepo) DeleteByMember(ctx context.Context, memberID string) error {
	_, err := r.c.DeleteMany(ctx, bson.M{"memberId": memberID})
	return err
}

func (r *PushRepo) All(ctx context.Context) ([]domain.PushSubscription, error) {
	return r.find(ctx, bson.M{})
}

func (r *PushRepo) ByMembers(ctx context.Context, memberIDs []string) ([]domain.PushSubscription, error) {
	if len(memberIDs) == 0 {
		return []domain.PushSubscription{}, nil
	}
	return r.find(ctx, bson.M{"memberId": bson.M{"$in": memberIDs}})
}

func (r *PushRepo) find(ctx context.Context, q bson.M) ([]domain.PushSubscription, error) {
	cur, err := r.c.Find(ctx, q)
	if err != nil {
		return nil, err
	}
	out := []domain.PushSubscription{}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}
