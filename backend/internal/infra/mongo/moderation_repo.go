package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type ModerationRepo struct{ c *mongo.Collection }

func NewModerationRepo(db *mongo.Database) *ModerationRepo {
	return &ModerationRepo{db.Collection(collModeration)}
}

func (r *ModerationRepo) Insert(ctx context.Context, rec domain.ModerationRecord) error {
	_, err := r.c.InsertOne(ctx, rec)
	return err
}

func (r *ModerationRepo) All(ctx context.Context) ([]domain.ModerationRecord, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.ModerationRecord{}
	return out, cur.All(ctx, &out)
}
