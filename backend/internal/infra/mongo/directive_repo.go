package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

// DirectiveRepo is the Mongo-backed DirectiveRepository (collection
// "directives"). Result ordering (most-severe then newest) is applied by the
// service, matching how the incident feed is sorted.
type DirectiveRepo struct{ c *mongo.Collection }

func NewDirectiveRepo(db *mongo.Database) *DirectiveRepo {
	return &DirectiveRepo{db.Collection(collDirectives)}
}

func (r *DirectiveRepo) Insert(ctx context.Context, d *domain.Directive) error {
	_, err := r.c.InsertOne(ctx, d)
	return err
}

func (r *DirectiveRepo) List(ctx context.Context, f domain.DirectiveFilters) ([]domain.Directive, error) {
	q := bson.M{}
	if f.Town != "" {
		q["townId"] = f.Town
	}
	switch {
	case f.IncludeAllStatuses:
		// admin view — every status (active, cancelled, expired).
	case f.ActiveOnly:
		q["status"] = domain.DirectiveStatusActive
	default:
		// public default — everything the authority hasn't cancelled.
		q["status"] = bson.M{"$ne": domain.DirectiveStatusCancelled}
	}
	cur, err := r.c.Find(ctx, q)
	if err != nil {
		return nil, err
	}
	out := []domain.Directive{}
	return out, cur.All(ctx, &out)
}

func (r *DirectiveRepo) BySlug(ctx context.Context, slug string) (*domain.Directive, error) {
	var d domain.Directive
	if err := r.c.FindOne(ctx, bson.M{"slug": slug}).Decode(&d); err != nil {
		return nil, notFound("directive", err)
	}
	return &d, nil
}

func (r *DirectiveRepo) ByID(ctx context.Context, id string) (*domain.Directive, error) {
	var d domain.Directive
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&d); err != nil {
		return nil, notFound("directive", err)
	}
	return &d, nil
}

func (r *DirectiveRepo) SetStatus(ctx context.Context, id, status string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"status": status}})
	return err
}
