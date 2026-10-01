package domain

import (
	"context"
	"time"
)

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
	// ExpireAt drives the retention TTL: the store stamps it (12 months out)
	// on insert and MongoDB deletes the notice once it passes.
	ExpireAt time.Time `json:"-" bson:"expireAt,omitempty"`
}

// NotificationRepository — in-platform notices (spec §8.2, §8.11).
type NotificationRepository interface {
	Insert(ctx context.Context, n Notification) error
	// InsertOnce inserts n unless a notice with the same ID already exists and
	// reports whether it was inserted. Deterministic ids make scheduled
	// fan-outs (remembrance, birthdays) idempotent across restarts, extra
	// instances and manual re-runs.
	InsertOnce(ctx context.Context, n Notification) (bool, error)
	ByMember(ctx context.Context, memberID string) ([]Notification, error)
	MarkRead(ctx context.Context, id, memberID string) error
	MarkAllRead(ctx context.Context, memberID string) error
	UnreadCount(ctx context.Context, memberID string) (int, error)
}

// ── notification preferences (contract K14) ─────────────────────────────────

// Message categories. Every notification kind belongs to exactly one (see
// service.notificationCategory). Safety, account and transaction messages are
// service messages: a member can't switch them off by category, only by
// channel. Community, remembrances and product are the member's choice, and
// product — news about Oguaa itself, i.e. marketing — is opt-in.
const (
	CategorySafety       = "safety"
	CategoryAccount      = "account"
	CategoryTransaction  = "transaction"
	CategoryCommunity    = "community"
	CategoryRemembrances = "remembrances"
	CategoryProduct      = "product"
)

// Delivery channels a member switches on or off. In-app notices are not a
// channel: they follow the categories alone.
const (
	ChannelPush     = "push"
	ChannelEmail    = "email"
	ChannelWhatsApp = "whatsapp"
)

// NotificationCategories are the category switches. Safety is reported for
// completeness but can't be switched off: it always reads true.
type NotificationCategories struct {
	Safety       bool `json:"safety" bson:"safety"`
	Community    bool `json:"community" bson:"community"`
	Remembrances bool `json:"remembrances" bson:"remembrances"`
	Product      bool `json:"product" bson:"product"`
}

// NotificationChannels are the channel switches.
type NotificationChannels struct {
	Push     bool `json:"push" bson:"push"`
	Email    bool `json:"email" bson:"email"`
	WhatsApp bool `json:"whatsapp" bson:"whatsapp"`
}

// NotificationPrefs is a member's server-side notification preferences — what
// every sender (in-app, push, email, WhatsApp) consults. Its JSON is the K14
// wire shape: {"categories":{…},"channels":{…}}.
type NotificationPrefs struct {
	Categories NotificationCategories `json:"categories" bson:"categories"`
	Channels   NotificationChannels   `json:"channels" bson:"channels"`
	// The consent record for product (marketing) messages: when the member
	// opted in and when they last withdrew (RFC3339). Never on the wire.
	ProductConsentAt   string `json:"-" bson:"productConsentAt,omitempty"`
	ProductWithdrawnAt string `json:"-" bson:"productWithdrawnAt,omitempty"`
	UpdatedAt          string `json:"-" bson:"updatedAt,omitempty"`
}

// DefaultNotificationPrefs are the preferences of a member who never chose:
// everything that serves them is on; product news is OFF until they opt in,
// and so is WhatsApp (a typed-in number may not even be theirs).
func DefaultNotificationPrefs() NotificationPrefs {
	return NotificationPrefs{
		Categories: NotificationCategories{Safety: true, Community: true, Remembrances: true, Product: false},
		Channels:   NotificationChannels{Push: true, Email: true, WhatsApp: false},
	}
}

// CategoryIsOptional reports whether members may switch the category off.
func CategoryIsOptional(category string) bool {
	switch category {
	case CategoryCommunity, CategoryRemembrances, CategoryProduct:
		return true
	}
	return false
}

// AllowsCategory reports whether messages of the category may reach the
// member at all. Service categories (safety, account, transaction) always may.
func (p NotificationPrefs) AllowsCategory(category string) bool {
	switch category {
	case CategoryCommunity:
		return p.Categories.Community
	case CategoryRemembrances:
		return p.Categories.Remembrances
	case CategoryProduct:
		return p.Categories.Product
	}
	return true
}

// ChannelOn reports whether the member accepts messages on the channel.
func (p NotificationPrefs) ChannelOn(channel string) bool {
	switch channel {
	case ChannelPush:
		return p.Channels.Push
	case ChannelEmail:
		return p.Channels.Email
	case ChannelWhatsApp:
		return p.Channels.WhatsApp
	}
	return false
}

// Allows reports whether a message of the category may go out on the channel.
func (p NotificationPrefs) Allows(category, channel string) bool {
	return p.AllowsCategory(category) && p.ChannelOn(channel)
}

// NotificationPreferences returns the member's preferences, or the defaults
// when they never chose (or m is nil). Safety always reads true.
func (m *Member) NotificationPreferences() NotificationPrefs {
	if m == nil || m.NotificationPrefs == nil {
		return DefaultNotificationPrefs()
	}
	p := *m.NotificationPrefs
	p.Categories.Safety = true
	return p
}
