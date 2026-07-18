package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// GoalRepo is the Mongo-backed GoalRepository (collection "goals"). Display
// ordering (featured first, by cadence, newest period) is applied by the
// service; a stable periodStart/_id sort here keeps reads deterministic.
type GoalRepo struct{ c *mongo.Collection }

func NewGoalRepo(db *mongo.Database) *GoalRepo {
	return &GoalRepo{db.Collection(collGoals)}
}

func (r *GoalRepo) All(ctx context.Context) ([]domain.Goal, error) {
	cur, err := r.c.Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "periodStart", Value: -1}, {Key: "_id", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.Goal{}
	return out, cur.All(ctx, &out)
}

func (r *GoalRepo) ByID(ctx context.Context, id string) (domain.Goal, error) {
	var g domain.Goal
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&g); err != nil {
		return domain.Goal{}, notFound("goal", err)
	}
	return g, nil
}

func (r *GoalRepo) Create(ctx context.Context, g domain.Goal) (domain.Goal, error) {
	if _, err := r.c.InsertOne(ctx, g); err != nil {
		return domain.Goal{}, err
	}
	return g, nil
}

func (r *GoalRepo) Update(ctx context.Context, g domain.Goal) (domain.Goal, error) {
	if _, err := r.c.ReplaceOne(ctx, bson.M{"_id": g.ID}, g); err != nil {
		return domain.Goal{}, err
	}
	return g, nil
}

func (r *GoalRepo) Delete(ctx context.Context, id string) error {
	_, err := r.c.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

func (r *GoalRepo) InsertMany(ctx context.Context, gs []domain.Goal) error {
	return insertAll(ctx, r.c, gs)
}
