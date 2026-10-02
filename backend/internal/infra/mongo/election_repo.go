package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

const (
	collElections = "elections"
	fPollDate     = "pollDate"
	electionNoun  = "election"
)

// ElectionRepo stores the election calendar (domain.ElectionRepository).
type ElectionRepo struct{ c *mongo.Collection }

func NewElectionRepo(db *mongo.Database) *ElectionRepo {
	return &ElectionRepo{c: db.Collection(collElections)}
}

// EnsureIndexes creates the poll-date index the calendar is read by.
func (r *ElectionRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.c.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: fPollDate, Value: -1}}})
	return err
}

func (r *ElectionRepo) Insert(ctx context.Context, e domain.Election) error {
	_, err := r.c.InsertOne(ctx, e)
	return err
}

// Update replaces the stored election with e.
func (r *ElectionRepo) Update(ctx context.Context, e domain.Election) error {
	res, err := r.c.ReplaceOne(ctx, bson.M{"_id": e.ID}, e)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return &domain.NotFoundError{Entity: electionNoun}
	}
	return nil
}

func (r *ElectionRepo) Delete(ctx context.Context, id string) error {
	res, err := r.c.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return &domain.NotFoundError{Entity: electionNoun}
	}
	return nil
}

func (r *ElectionRepo) Get(ctx context.Context, id string) (*domain.Election, error) {
	var e domain.Election
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&e); err != nil {
		return nil, notFound(electionNoun, err)
	}
	return &e, nil
}

// All returns the whole calendar, latest poll first.
func (r *ElectionRepo) All(ctx context.Context) ([]domain.Election, error) {
	cur, err := r.c.Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: fPollDate, Value: -1}, {Key: "_id", Value: 1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.Election{}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}
