package domain

import "context"

// Follow — a member "remembers"/follows a memorial; who the yearly remembrance
// notifies (spec §8.11, §10).
type Follow struct {
	MemberID  string `json:"memberId" bson:"memberId"`
	ListingID string `json:"listingId" bson:"listingId"`
	CreatedAt string `json:"createdAt" bson:"createdAt"`
}

// MemberFollow — a member follows another member. A member's followers are the
// default audience for that member's posts' remembrances and their birthday
// (spec §8.11). Distinct from memorial "Remember".
type MemberFollow struct {
	FollowerID string `json:"followerId" bson:"followerId"`
	MemberID   string `json:"memberId" bson:"memberId"`
	CreatedAt  string `json:"createdAt" bson:"createdAt"`
}

// FollowRepository — both memorial "remember" links and member↔member follows
// (spec §8.11).
type FollowRepository interface {
	Add(ctx context.Context, memberID, listingID string) error
	Remove(ctx context.Context, memberID, listingID string) error
	IsFollowing(ctx context.Context, memberID, listingID string) (bool, error)
	Followers(ctx context.Context, listingID string) ([]string, error)

	// Member↔member follows.
	FollowMember(ctx context.Context, followerID, memberID string) error
	UnfollowMember(ctx context.Context, followerID, memberID string) error
	IsFollowingMember(ctx context.Context, followerID, memberID string) (bool, error)
	MemberFollowers(ctx context.Context, memberID string) ([]string, error)
}
