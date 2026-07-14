package domain

import "context"

// Notification — an in-platform notice to a member (spec §8.2 approve/reject,
// §8.11 yearly remembrance). Delivered in-app; email/WhatsApp ride the same model.
type Notification struct {
	ID        string `json:"id" bson:"_id"`
	MemberID  string `json:"memberId" bson:"memberId"`
	Kind      string `json:"kind" bson:"kind"` // approved | rejected | changes | remembrance | welcome
	Title     string `json:"title" bson:"title"`
	Body      string `json:"body" bson:"body"`
	Link      string `json:"link,omitempty" bson:"link,omitempty"`
	Read      bool   `json:"read" bson:"read"`
	CreatedAt string `json:"createdAt" bson:"createdAt"`
}

// NotificationRepository — in-platform notices (spec §8.2, §8.11).
type NotificationRepository interface {
	Insert(ctx context.Context, n Notification) error
	ByMember(ctx context.Context, memberID string) ([]Notification, error)
	MarkRead(ctx context.Context, id, memberID string) error
	MarkAllRead(ctx context.Context, memberID string) error
	UnreadCount(ctx context.Context, memberID string) (int, error)
}
