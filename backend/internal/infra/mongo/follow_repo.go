package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type FollowRepo struct {
	c *mongo.Collection // memorial "remember" links
	m *mongo.Collection // member↔member follows
}

func NewFollowRepo(db *mongo.Database) *FollowRepo {
	return &FollowRepo{c: db.Collection(collFollows), m: db.Collection(collMemberFollows)}
}

func (r *FollowRepo) Add(ctx context.Context, memberID, listingID string) error {
	q := bson.M{"memberId": memberID, "listingId": listingID}
	if n, _ := r.c.CountDocuments(ctx, q); n > 0 {
		return nil // idempotent
	}
	_, err := r.c.InsertOne(ctx, domain.Follow{MemberID: memberID, ListingID: listingID})
	return err
}

func (r *FollowRepo) Remove(ctx context.Context, memberID, listingID string) error {
	_, err := r.c.DeleteOne(ctx, bson.M{"memberId": memberID, "listingId": listingID})
	return err
}

func (r *FollowRepo) IsFollowing(ctx context.Context, memberID, listingID string) (bool, error) {
	n, err := r.c.CountDocuments(ctx, bson.M{"memberId": memberID, "listingId": listingID})
	return n > 0, err
}

func (r *FollowRepo) Followers(ctx context.Context, listingID string) ([]string, error) {
	cur, err := r.c.Find(ctx, bson.M{"listingId": listingID})
	if err != nil {
		return nil, err
	}
	rows := []domain.Follow{}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, f := range rows {
		ids = append(ids, f.MemberID)
	}
	return ids, nil
}

// ── member ↔ member follows ──────────────────────────────────────────────────

func (r *FollowRepo) FollowMember(ctx context.Context, followerID, memberID string) error {
	if followerID == memberID {
		return nil // can't follow yourself
	}
	q := bson.M{"followerId": followerID, "memberId": memberID}
	if n, _ := r.m.CountDocuments(ctx, q); n > 0 {
		return nil // idempotent
	}
	_, err := r.m.InsertOne(ctx, domain.MemberFollow{FollowerID: followerID, MemberID: memberID})
	return err
}

func (r *FollowRepo) UnfollowMember(ctx context.Context, followerID, memberID string) error {
	_, err := r.m.DeleteOne(ctx, bson.M{"followerId": followerID, "memberId": memberID})
	return err
}

func (r *FollowRepo) IsFollowingMember(ctx context.Context, followerID, memberID string) (bool, error) {
	n, err := r.m.CountDocuments(ctx, bson.M{"followerId": followerID, "memberId": memberID})
	return n > 0, err
}

func (r *FollowRepo) MemberFollowers(ctx context.Context, memberID string) ([]string, error) {
	cur, err := r.m.Find(ctx, bson.M{"memberId": memberID})
	if err != nil {
		return nil, err
	}
	rows := []domain.MemberFollow{}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, f := range rows {
		ids = append(ids, f.FollowerID)
	}
	return ids, nil
}
