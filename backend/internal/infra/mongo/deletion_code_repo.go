package mongo

import (
	"context"
	"errors"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// DeletionCodeRepo stores pending account-deletion confirmation codes
// (domain.AccountDeletionCodeRepository): one per member, expired by a TTL
// index so abandoned requests clean themselves up.
type DeletionCodeRepo struct{ c *mongo.Collection }

func NewDeletionCodeRepo(db *mongo.Database) *DeletionCodeRepo {
	return &DeletionCodeRepo{c: db.Collection(collAccountDeletionCodes)}
}

// EnsureIndexes creates the TTL index on expiresAt.
func (r *DeletionCodeRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.c.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "expiresAt", Value: 1}},
		Options: options.Index().SetExpireAfterSeconds(0),
	})
	return err
}

// Save replaces any pending code for the member (a new request supersedes the
// old one and resets the attempt counter).
func (r *DeletionCodeRepo) Save(ctx context.Context, c domain.AccountDeletionCode) error {
	_, err := r.c.ReplaceOne(ctx, bson.M{"_id": c.MemberID}, c, options.Replace().SetUpsert(true))
	return err
}

// Get returns the member's pending code, or nil when there is none.
func (r *DeletionCodeRepo) Get(ctx context.Context, memberID string) (*domain.AccountDeletionCode, error) {
	var c domain.AccountDeletionCode
	err := r.c.FindOne(ctx, bson.M{"_id": memberID}).Decode(&c)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *DeletionCodeRepo) IncrementAttempts(ctx context.Context, memberID string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": memberID}, bson.M{"$inc": bson.M{"attempts": 1}})
	return err
}

func (r *DeletionCodeRepo) Delete(ctx context.Context, memberID string) error {
	_, err := r.c.DeleteOne(ctx, bson.M{"_id": memberID})
	return err
}
