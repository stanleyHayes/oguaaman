package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type PromotionRepo struct{ c *mongo.Collection }

func NewPromotionRepo(db *mongo.Database) *PromotionRepo {
	return &PromotionRepo{db.Collection(collPromotions)}
}

func (r *PromotionRepo) Insert(ctx context.Context, p domain.Promotion) error {
	_, err := r.c.InsertOne(ctx, p)
	return err
}

func (r *PromotionRepo) ByReference(ctx context.Context, reference string) (*domain.Promotion, error) {
	var p domain.Promotion
	if err := r.c.FindOne(ctx, bson.M{"reference": reference}).Decode(&p); err != nil {
		return nil, notFound("promotion", err)
	}
	return &p, nil
}

func (r *PromotionRepo) UpdateStatus(ctx context.Context, reference, status, at string) error {
	set := bson.M{"status": status}
	if status == domain.PledgeSuccess {
		set["confirmedAt"] = at
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"reference": reference}, bson.M{"$set": set})
	return err
}

func (r *PromotionRepo) All(ctx context.Context) ([]domain.Promotion, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.Promotion{}
	return out, cur.All(ctx, &out)
}

func (r *PromotionRepo) ByMember(ctx context.Context, memberID string) ([]domain.Promotion, error) {
	cur, err := r.c.Find(ctx, bson.M{"memberId": memberID})
	if err != nil {
		return nil, err
	}
	out := []domain.Promotion{}
	return out, cur.All(ctx, &out)
}
