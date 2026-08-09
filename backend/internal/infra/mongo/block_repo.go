package mongo

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type BlockRepo struct {
	c *mongo.Collection
}

func NewBlockRepo(db *mongo.Database) *BlockRepo {
	return &BlockRepo{c: db.Collection(collMemberBlocks)}
}

func (r *BlockRepo) Block(ctx context.Context, blockerID, blockedID, reason string) error {
	if blockerID == "" || blockedID == "" || blockerID == blockedID {
		return nil // blocking yourself is a no-op, not an error
	}
	q := bson.M{"blockerId": blockerID, "blockedId": blockedID}
	if n, _ := r.c.CountDocuments(ctx, q); n > 0 {
		return nil // idempotent — blocking twice is the same as blocking once
	}
	_, err := r.c.InsertOne(ctx, domain.MemberBlock{
		BlockerID: blockerID,
		BlockedID: blockedID,
		Reason:    reason,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	return err
}

func (r *BlockRepo) Unblock(ctx context.Context, blockerID, blockedID string) error {
	_, err := r.c.DeleteOne(ctx, bson.M{"blockerId": blockerID, "blockedId": blockedID})
	return err
}

// IsBlocked answers for either direction: if A blocked B, B must not see A
// either, or blocking would hide the abuser while leaving the victim exposed.
func (r *BlockRepo) IsBlocked(ctx context.Context, a, b string) (bool, error) {
	if a == "" || b == "" || a == b {
		return false, nil
	}
	n, err := r.c.CountDocuments(ctx, bson.M{"$or": []bson.M{
		{"blockerId": a, "blockedId": b},
		{"blockerId": b, "blockedId": a},
	}})
	return n > 0, err
}

func (r *BlockRepo) BlockedBy(ctx context.Context, blockerID string) ([]domain.MemberBlock, error) {
	cur, err := r.c.Find(ctx, bson.M{"blockerId": blockerID})
	if err != nil {
		return nil, err
	}
	rows := []domain.MemberBlock{}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

func (r *BlockRepo) HiddenFor(ctx context.Context, memberID string) ([]string, error) {
	if memberID == "" {
		return nil, nil
	}
	cur, err := r.c.Find(ctx, bson.M{"$or": []bson.M{
		{"blockerId": memberID},
		{"blockedId": memberID},
	}})
	if err != nil {
		return nil, err
	}
	rows := []domain.MemberBlock{}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	seen := make(map[string]struct{}, len(rows))
	ids := make([]string, 0, len(rows))
	for _, b := range rows {
		other := b.BlockedID
		if other == memberID {
			other = b.BlockerID
		}
		if other == "" || other == memberID {
			continue
		}
		if _, dup := seen[other]; dup {
			continue
		}
		seen[other] = struct{}{}
		ids = append(ids, other)
	}
	return ids, nil
}

func (r *BlockRepo) DeleteByMember(ctx context.Context, memberID string) error {
	_, err := r.c.DeleteMany(ctx, bson.M{"$or": []bson.M{
		{"blockerId": memberID},
		{"blockedId": memberID},
	}})
	return err
}
