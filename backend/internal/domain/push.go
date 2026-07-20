package domain

import "context"

// Push platforms.
const (
	PushWeb  = "web"  // browser Web Push (RFC 8291): endpoint + p256dh/auth keys
	PushExpo = "expo" // mobile Expo push token
)

// PushSubscription is a member's registered push target. Severe safety alerts
// (high/critical incidents + emergency directives) fan out to these so a phone
// or browser can ring like a call even when the app isn't open. A member may
// have several (multiple devices/browsers). Deduped by Endpoint (web) or
// ExpoToken (mobile), which is also the document _id.
type PushSubscription struct {
	ID        string `json:"id" bson:"_id"` // = Endpoint (web) or ExpoToken (expo)
	MemberID  string `json:"memberId" bson:"memberId"`
	Platform  string `json:"platform" bson:"platform"` // web | expo
	Endpoint  string `json:"endpoint,omitempty" bson:"endpoint,omitempty"`
	P256dh    string `json:"p256dh,omitempty" bson:"p256dh,omitempty"`
	Auth      string `json:"auth,omitempty" bson:"auth,omitempty"`
	ExpoToken string `json:"expoToken,omitempty" bson:"expoToken,omitempty"`
	CreatedAt string `json:"createdAt" bson:"createdAt"`
}

// PushRepository stores members' push subscriptions.
type PushRepository interface {
	// Upsert registers (or refreshes) a subscription, keyed by its _id.
	Upsert(ctx context.Context, s PushSubscription) error
	// DeleteByID removes a subscription by its _id (endpoint or expo token) —
	// used on unsubscribe and to prune dead endpoints (410/404 from the push
	// service). memberID scopes the delete to the owner.
	DeleteByID(ctx context.Context, memberID, id string) error
	// All returns every subscription (broadcast fan-out; town-scale volumes).
	All(ctx context.Context) ([]PushSubscription, error)
	// ByMembers returns subscriptions for the given member ids (targeted alerts).
	ByMembers(ctx context.Context, memberIDs []string) ([]PushSubscription, error)
}
