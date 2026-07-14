package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type PlaceRepo struct{ c *mongo.Collection }

func NewPlaceRepo(db *mongo.Database) *PlaceRepo { return &PlaceRepo{db.Collection(collPlaces)} }

func (r *PlaceRepo) All(ctx context.Context) ([]domain.Place, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.Place{}
	return out, cur.All(ctx, &out)
}

func (r *PlaceRepo) ByID(ctx context.Context, id string) (*domain.Place, error) {
	var p domain.Place
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&p); err != nil {
		return nil, notFound("place", err)
	}
	return &p, nil
}
