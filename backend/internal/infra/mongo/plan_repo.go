package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type PlanRepo struct{ c *mongo.Collection }

func NewPlanRepo(db *mongo.Database) *PlanRepo { return &PlanRepo{db.Collection(collPlans)} }

func (r *PlanRepo) All(ctx context.Context) ([]domain.Plan, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.Plan{}
	return out, cur.All(ctx, &out)
}

func (r *PlanRepo) Get(ctx context.Context, id string) (*domain.Plan, error) {
	var p domain.Plan
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&p); err != nil {
		return nil, notFound("plan", err)
	}
	return &p, nil
}

func (r *PlanRepo) BySlug(ctx context.Context, slug string) (*domain.Plan, error) {
	var p domain.Plan
	if err := r.c.FindOne(ctx, bson.M{"slug": slug}).Decode(&p); err != nil {
		return nil, notFound("plan", err)
	}
	return &p, nil
}

func (r *PlanRepo) Insert(ctx context.Context, p domain.Plan) error {
	_, err := r.c.InsertOne(ctx, p)
	return err
}

func (r *PlanRepo) Update(ctx context.Context, p domain.Plan) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": p.ID}, bson.M{"$set": bson.M{
		"slug": p.Slug, "name": p.Name, "audience": p.Audience, "prices": p.Prices,
		"interval": p.Interval, "perks": p.Perks, "maxListings": p.MaxListings,
		"includedPromoDays": p.IncludedPromoDays, "goldBadge": p.GoldBadge,
		"active": p.Active, "sortOrder": p.SortOrder, "updatedAt": p.UpdatedAt,
	}})
	return err
}

func (r *PlanRepo) Delete(ctx context.Context, id string) error {
	res, err := r.c.DeleteOne(ctx, bson.M{"_id": id})
	if err == nil && res.DeletedCount == 0 {
		return &domain.NotFoundError{Entity: "plan"}
	}
	return err
}
