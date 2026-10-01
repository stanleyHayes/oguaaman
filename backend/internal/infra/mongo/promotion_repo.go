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
	if err := r.c.FindOne(ctx, bson.M{fieldReference: reference}).Decode(&p); err != nil {
		return nil, notFound("promotion", err)
	}
	return &p, nil
}

// MarkSuccess settles a promotion in one conditional write; see
// domain.PromotionRepository for the contract.
func (r *PromotionRepo) MarkSuccess(ctx context.Context, reference, at, featuredUntil string) (bool, error) {
	return won(r.c.UpdateOne(ctx, unsettled(reference), bson.M{"$set": bson.M{
		fieldStatus: domain.PledgeSuccess, fieldConfirmedAt: at, fieldFeaturedUntil: featuredUntil, fieldGrantPending: true,
	}}))
}

// MarkGranted clears grantPending once the promotion's placement is applied.
func (r *PromotionRepo) MarkGranted(ctx context.Context, reference string) error {
	return markGranted(ctx, r.c, reference)
}

// MarkFailed records a failed payment unless the promotion already succeeded.
func (r *PromotionRepo) MarkFailed(ctx context.Context, reference string) error {
	_, err := r.c.UpdateOne(ctx, unsettled(reference), bson.M{"$set": bson.M{fieldStatus: domain.PledgeFailed}})
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
