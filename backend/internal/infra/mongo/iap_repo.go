package mongo

import (
	"context"
	"errors"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type AppleTxRepo struct {
	c *mongo.Collection
}

func NewAppleTxRepo(db *mongo.Database) *AppleTxRepo {
	return &AppleTxRepo{c: db.Collection(collAppleTransactions)}
}

// Claim inserts the redemption record, relying on the _id unique index to
// reject a replay.
//
// InsertOne rather than an upsert on purpose: the duplicate-key error IS the
// answer. A read-then-write would leave a window in which two concurrent
// requests both see "not redeemed" and both grant a month.
func (r *AppleTxRepo) Claim(ctx context.Context, rec domain.AppleTransactionRecord) (bool, error) {
	_, err := r.c.InsertOne(ctx, rec)
	if err == nil {
		return false, nil
	}
	if mongo.IsDuplicateKeyError(err) {
		return true, nil
	}
	var we mongo.WriteException
	if errors.As(err, &we) {
		for _, e := range we.WriteErrors {
			if e.Code == 11000 {
				return true, nil
			}
		}
	}
	return false, err
}

func (r *AppleTxRepo) ByTransactionID(ctx context.Context, id string) (*domain.AppleTransactionRecord, error) {
	var rec domain.AppleTransactionRecord
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&rec); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}
	return &rec, nil
}

func (r *AppleTxRepo) DeleteByMember(ctx context.Context, memberID string) error {
	_, err := r.c.DeleteMany(ctx, bson.M{"memberId": memberID})
	return err
}
