package domain

import "context"

// MemberBlock — one member blocks another.
//
// Required by App Store Review Guideline 1.2 (user-generated content): an app
// with UGC must give people "the ability to block abusive users". Reporting and
// moderation cover the platform's response; blocking is the one lever the
// affected member controls directly and takes effect immediately.
//
// A block is one-directional as a record (who blocked whom) but symmetric in
// effect: neither party sees the other's content or can act on it. That avoids
// the common trap where blocking hides the abuser from you but leaves your
// posts, profile and reviews on display for them.
type MemberBlock struct {
	BlockerID string `json:"blockerId" bson:"blockerId"`
	BlockedID string `json:"blockedId" bson:"blockedId"`
	CreatedAt string `json:"createdAt" bson:"createdAt"`
	// Optional free-text reason, kept private to the blocker. Never surfaced to
	// the blocked member and never used for moderation — reporting does that.
	Reason string `json:"reason,omitempty" bson:"reason,omitempty"`
}

// BlockedMember is a row in "people you have blocked" — the block joined to the
// blocked member's public identity, so the UI can offer an unblock list.
type BlockedMember struct {
	MemberID    string `json:"memberId"`
	Slug        string `json:"slug"`
	DisplayName string `json:"displayName"`
	PhotoURL    string `json:"photoUrl,omitempty"`
	CreatedAt   string `json:"createdAt"`
	Reason      string `json:"reason,omitempty"`
}

// BlockRepository stores member↔member blocks.
type BlockRepository interface {
	Block(ctx context.Context, blockerID, blockedID, reason string) error
	Unblock(ctx context.Context, blockerID, blockedID string) error
	// IsBlocked reports whether a block exists in EITHER direction, which is the
	// question every read path actually needs to ask.
	IsBlocked(ctx context.Context, a, b string) (bool, error)
	// BlockedBy returns the members this member has blocked.
	BlockedBy(ctx context.Context, blockerID string) ([]MemberBlock, error)
	// HiddenFor returns every member ID that must be invisible to this member —
	// those they blocked and those who blocked them, deduplicated.
	HiddenFor(ctx context.Context, memberID string) ([]string, error)
	// DeleteByMember removes every block naming this member, in either
	// direction. Called on account erasure so a deleted account leaves no
	// residue pointing at it.
	DeleteByMember(ctx context.Context, memberID string) error
}
