package mongo

import (
	"context"
	"errors"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

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

// Unclaim drops a claim whose grant failed (never an erased member's record:
// those carry erasedAt and are kept for replay protection).
func (r *AppleTxRepo) Unclaim(ctx context.Context, id string) error {
	_, err := r.c.DeleteOne(ctx, bson.M{"_id": id, "erasedAt": bson.M{"$exists": false}})
	return err
}

func (r *AppleTxRepo) ByTransactionID(ctx context.Context, id string) (*domain.AppleTransactionRecord, error) {
	return r.findOne(ctx, bson.M{"_id": id})
}

func (r *AppleTxRepo) LatestByOriginalTransactionID(ctx context.Context, id string) (*domain.AppleTransactionRecord, error) {
	if id == "" {
		return nil, nil
	}
	return r.findOne(ctx, bson.M{"originalTransactionId": id}, options.FindOne().SetSort(bson.D{{Key: "redeemedAt", Value: -1}}))
}

// findOne returns (nil, nil) when nothing matches.
func (r *AppleTxRepo) findOne(ctx context.Context, filter bson.M, opts ...options.Lister[options.FindOneOptions]) (*domain.AppleTransactionRecord, error) {
	var rec domain.AppleTransactionRecord
	if err := r.c.FindOne(ctx, filter, opts...).Decode(&rec); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}
	return &rec, nil
}

// PseudonymiseMember keeps every record (they are the replay protection and
// part of the financial ledger) but unlinks it from the erased member.
func (r *AppleTxRepo) PseudonymiseMember(ctx context.Context, memberID, pseudonym, erasedAt, retainUntil string) error {
	_, err := r.c.UpdateMany(ctx, bson.M{"memberId": memberID}, bson.M{
		"$set":   bson.M{"memberId": pseudonym, "erasedAt": erasedAt, "retainUntil": retainUntil},
		"$unset": bson.M{"reference": ""},
	})
	return err
}
