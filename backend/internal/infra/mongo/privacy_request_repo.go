package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// PrivacyRequestRepo stores data-rights requests (domain.PrivacyRequestRepository).
type PrivacyRequestRepo struct{ c *mongo.Collection }

func NewPrivacyRequestRepo(db *mongo.Database) *PrivacyRequestRepo {
	return &PrivacyRequestRepo{c: db.Collection(collPrivacyRequests)}
}

// EnsureIndexes creates the unique reference index and the queue index.
func (r *PrivacyRequestRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.c.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "reference", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "dueAt", Value: 1}}},
		{Keys: bson.D{{Key: fMemberID, Value: 1}}},
	})
	return err
}

func (r *PrivacyRequestRepo) Insert(ctx context.Context, pr domain.PrivacyRequest) error {
	_, err := r.c.InsertOne(ctx, pr)
	return err
}

func (r *PrivacyRequestRepo) ByID(ctx context.Context, id string) (*domain.PrivacyRequest, error) {
	var pr domain.PrivacyRequest
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&pr); err != nil {
		return nil, notFound("privacy request", err)
	}
	return &pr, nil
}

func (r *PrivacyRequestRepo) All(ctx context.Context) ([]domain.PrivacyRequest, error) {
	return findMemberDocs[domain.PrivacyRequest](ctx, r.c, bson.M{},
		options.Find().SetSort(bson.D{{Key: "dueAt", Value: 1}, {Key: "receivedAt", Value: 1}}))
}

func (r *PrivacyRequestRepo) Transition(ctx context.Context, id, status, closedAt string, ev domain.PrivacyRequestEvent) error {
	set := bson.M{"status": status, "updatedAt": ev.At}
	update := bson.M{opSet: set, "$push": bson.M{"history": ev}}
	if closedAt != "" {
		set["closedAt"] = closedAt
	} else {
		update[opUnset] = bson.M{"closedAt": ""}
	}
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return &domain.NotFoundError{Entity: "privacy request"}
	}
	return nil
}

func (r *PrivacyRequestRepo) ByMember(ctx context.Context, memberID string) ([]domain.PrivacyRequest, error) {
	return findMemberDocs[domain.PrivacyRequest](ctx, r.c, bson.M{fMemberID: memberID})
}
