package domain

import "context"

// ModerationRecord — the audit trail; every moderation action is recorded (spec §8.10).
type ModerationRecord struct {
	ID          string `json:"id" bson:"_id"`
	ListingID   string `json:"listingId" bson:"listingId"`
	ModeratorID string `json:"moderatorId" bson:"moderatorId"`
	Action      string `json:"action" bson:"action"`
	Reason      string `json:"reason,omitempty" bson:"reason,omitempty"`
	CreatedAt   string `json:"createdAt" bson:"createdAt"`
}

type ModerationRepository interface {
	Insert(ctx context.Context, r ModerationRecord) error
	All(ctx context.Context) ([]ModerationRecord, error)
}
