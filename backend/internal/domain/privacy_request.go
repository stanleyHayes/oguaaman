package domain

import "context"

// ── data-rights requests (Act 843 ss. 32–35; contract K10) ──────────────────
//
// Anyone — member or not — can ask to see, correct or delete personal data, or
// object to how it is used. Each request gets a reference the requester can
// quote, a due date, and a status history staff work through.

// Privacy request types.
const (
	PrivacyRequestAccess     = "access"
	PrivacyRequestCorrection = "correction"
	PrivacyRequestDeletion   = "deletion"
	PrivacyRequestObjection  = "objection"
	PrivacyRequestOther      = "other"
)

// Privacy request statuses.
const (
	PrivacyStatusReceived   = "received"
	PrivacyStatusInProgress = "in_progress"
	PrivacyStatusCompleted  = "completed"
	PrivacyStatusRefused    = "refused"
)

// ValidPrivacyRequestType reports whether t is a known request type.
func ValidPrivacyRequestType(t string) bool {
	switch t {
	case PrivacyRequestAccess, PrivacyRequestCorrection, PrivacyRequestDeletion, PrivacyRequestObjection, PrivacyRequestOther:
		return true
	}
	return false
}

// ValidPrivacyStatus reports whether s is a known request status.
func ValidPrivacyStatus(s string) bool {
	switch s {
	case PrivacyStatusReceived, PrivacyStatusInProgress, PrivacyStatusCompleted, PrivacyStatusRefused:
		return true
	}
	return false
}

// PrivacyRequestEvent is one entry in a request's status history.
type PrivacyRequestEvent struct {
	Status  string `json:"status" bson:"status"`
	Note    string `json:"note,omitempty" bson:"note,omitempty"`
	ActorID string `json:"actorId,omitempty" bson:"actorId,omitempty"`
	At      string `json:"at" bson:"at"`
}

// PrivacyRequest is one data-rights request.
type PrivacyRequest struct {
	ID        string `json:"id" bson:"_id"`
	Reference string `json:"reference" bson:"reference"` // DR-XXXXXX, quoted by the requester
	Type      string `json:"type" bson:"type"`
	Status    string `json:"status" bson:"status"`
	Name      string `json:"name" bson:"name"`
	Contact   string `json:"contact" bson:"contact"` // email or phone to reply to
	Details   string `json:"details" bson:"details"`
	TargetURL string `json:"targetUrl,omitempty" bson:"targetUrl,omitempty"`
	// MemberID is set when the request was made while signed in; the identity
	// check then starts from "signed_in" rather than "unverified".
	MemberID      string                `json:"memberId,omitempty" bson:"memberId,omitempty"`
	IdentityCheck string                `json:"identityCheck" bson:"identityCheck"`
	ReceivedAt    string                `json:"receivedAt" bson:"receivedAt"`
	DueAt         string                `json:"dueAt" bson:"dueAt"`
	UpdatedAt     string                `json:"updatedAt" bson:"updatedAt"`
	ClosedAt      string                `json:"closedAt,omitempty" bson:"closedAt,omitempty"`
	History       []PrivacyRequestEvent `json:"history" bson:"history"`
}

// PrivacyRequestRepository persists data-rights requests.
type PrivacyRequestRepository interface {
	Insert(ctx context.Context, r PrivacyRequest) error
	ByID(ctx context.Context, id string) (*PrivacyRequest, error)
	// All lists every request, oldest due date first.
	All(ctx context.Context) ([]PrivacyRequest, error)
	// Transition sets the status (and closedAt when non-empty) and appends the
	// history event.
	Transition(ctx context.Context, id, status, closedAt string, ev PrivacyRequestEvent) error
	// ByMember lists requests made while signed in as the member.
	ByMember(ctx context.Context, memberID string) ([]PrivacyRequest, error)
}
