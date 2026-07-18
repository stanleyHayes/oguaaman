package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// CivicBehaviourRepo reads the code of behaviours (GET /api/civic). The service
// re-orders by ring for display; a stable slug sort here keeps reads
// deterministic.
type CivicBehaviourRepo struct{ c *mongo.Collection }

func NewCivicBehaviourRepo(db *mongo.Database) *CivicBehaviourRepo {
	return &CivicBehaviourRepo{db.Collection(collCivicBehaviours)}
}

// All returns every behaviour, sorted by slug for a stable base order.
func (r *CivicBehaviourRepo) All(ctx context.Context) ([]domain.CivicBehaviour, error) {
	cur, err := r.c.Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "_id", Value: 1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.CivicBehaviour{}
	return out, cur.All(ctx, &out)
}

// InsertMany loads the seed behaviours wholesale (seed only).
func (r *CivicBehaviourRepo) InsertMany(ctx context.Context, items []domain.CivicBehaviour) error {
	return insertAll(ctx, r.c, items)
}

func (r *CivicBehaviourRepo) BySlug(ctx context.Context, slug string) (domain.CivicBehaviour, error) {
	var b domain.CivicBehaviour
	if err := r.c.FindOne(ctx, bson.M{"_id": slug}).Decode(&b); err != nil {
		return domain.CivicBehaviour{}, notFound("behaviour", err)
	}
	return b, nil
}

func (r *CivicBehaviourRepo) Create(ctx context.Context, b domain.CivicBehaviour) (domain.CivicBehaviour, error) {
	if _, err := r.c.InsertOne(ctx, b); err != nil {
		return domain.CivicBehaviour{}, err
	}
	return b, nil
}

func (r *CivicBehaviourRepo) Update(ctx context.Context, b domain.CivicBehaviour) (domain.CivicBehaviour, error) {
	if _, err := r.c.ReplaceOne(ctx, bson.M{"_id": b.Slug}, b); err != nil {
		return domain.CivicBehaviour{}, err
	}
	return b, nil
}

func (r *CivicBehaviourRepo) Delete(ctx context.Context, slug string) error {
	_, err := r.c.DeleteOne(ctx, bson.M{"_id": slug})
	return err
}

// CivicLessonRepo reads the civilization lessons (GET /api/civic).
type CivicLessonRepo struct{ c *mongo.Collection }

func NewCivicLessonRepo(db *mongo.Database) *CivicLessonRepo {
	return &CivicLessonRepo{db.Collection(collCivicLessons)}
}

// All returns every lesson, sorted by slug for a stable base order (the service
// applies the curated chronological order).
func (r *CivicLessonRepo) All(ctx context.Context) ([]domain.CivicLesson, error) {
	cur, err := r.c.Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "_id", Value: 1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.CivicLesson{}
	return out, cur.All(ctx, &out)
}

// InsertMany loads the seed lessons wholesale (seed only).
func (r *CivicLessonRepo) InsertMany(ctx context.Context, items []domain.CivicLesson) error {
	return insertAll(ctx, r.c, items)
}
