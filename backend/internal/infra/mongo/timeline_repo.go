package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

type TimelineRepo struct{ c *mongo.Collection }

func NewTimelineRepo(db *mongo.Database) *TimelineRepo {
	return &TimelineRepo{db.Collection(collTimeline)}
}

// All returns the whole timeline, oldest first — 4-digit year strings sort
// lexically, which is chronological.
func (r *TimelineRepo) All(ctx context.Context) ([]domain.TimelineEntry, error) {
	cur, err := r.c.Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "year", Value: 1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.TimelineEntry{}
	return out, cur.All(ctx, &out)
}

// InsertMany loads the seed timeline wholesale (seed only).
func (r *TimelineRepo) InsertMany(ctx context.Context, entries []domain.TimelineEntry) error {
	return insertAll(ctx, r.c, entries)
}
