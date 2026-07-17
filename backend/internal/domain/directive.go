package domain

import (
	"context"
	"time"
)

// Directive — an authorized directive/announcement issued by a recognised
// authority institution (an emergency/security/health service or local
// government). Unlike a member's incident report, a directive carries the
// weight of the issuing office: it tells the town what is happening and, often,
// what to do (the Action). It is a first-class document (its own collection),
// mirroring the incident model's severity scale and read-time status.
type Directive struct {
	ID       string `json:"id" bson:"_id"`
	Slug     string `json:"slug" bson:"slug"`
	Title    string `json:"title" bson:"title"`
	Body     string `json:"body" bson:"body"`
	Severity string `json:"severity" bson:"severity"` // low | medium | high | critical
	Kind     string `json:"kind" bson:"kind"`         // advisory | directive | emergency
	Action   string `json:"action,omitempty" bson:"action,omitempty"`
	Area     string `json:"area,omitempty" bson:"area,omitempty"`
	TownID   string `json:"townId,omitempty" bson:"townId,omitempty"`

	// Optional geo: when a directive/closure covers a known place, these draw it
	// as a circular area on the town map (centre + radius in metres). All three
	// must be set for the area to render; no server-side geocoding.
	Latitude  *float64 `json:"latitude,omitempty" bson:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty" bson:"longitude,omitempty"`
	RadiusM   *float64 `json:"radiusM,omitempty" bson:"radiusM,omitempty"`

	// Attribution — copied off the issuing authority at creation so the notice
	// stays legible even if the org is later renamed.
	IssuedByOrgID   string `json:"issuedByOrgId" bson:"issuedByOrgId"`
	IssuedByOrgSlug string `json:"issuedByOrgSlug" bson:"issuedByOrgSlug"`
	IssuedByName    string `json:"issuedByName" bson:"issuedByName"`

	// Effective window (RFC3339). EffectiveUntil empty = open-ended.
	EffectiveFrom  string `json:"effectiveFrom" bson:"effectiveFrom"`
	EffectiveUntil string `json:"effectiveUntil,omitempty" bson:"effectiveUntil,omitempty"`

	Status      string `json:"status" bson:"status"` // active | cancelled | expired
	CreatedAt   string `json:"createdAt" bson:"createdAt"`
	CreatedByID string `json:"createdById" bson:"createdById"`
}

// Directive severities — the same four-point scale incidents use.
const (
	DirectiveSeverityLow      = "low"
	DirectiveSeverityMedium   = "medium"
	DirectiveSeverityHigh     = "high"
	DirectiveSeverityCritical = "critical"
)

// Directive kinds — the authority's intent, softest to hardest.
const (
	DirectiveKindAdvisory  = "advisory"
	DirectiveKindDirective = "directive"
	DirectiveKindEmergency = "emergency"
)

// Directive statuses. "expired" is computed on read (past effectiveUntil) — no
// cron required — and optionally persisted; "cancelled" is set by a curator.
const (
	DirectiveStatusActive    = "active"
	DirectiveStatusCancelled = "cancelled"
	DirectiveStatusExpired   = "expired"
)

// IsActive reports whether the directive is in force at now: its status is
// active AND now is within [effectiveFrom, effectiveUntil] (an empty
// effectiveUntil is open-ended). Unparseable bounds are treated as unset so a
// malformed date never silently hides a live directive.
func (d Directive) IsActive(now time.Time) bool {
	if d.Status != DirectiveStatusActive {
		return false
	}
	if from, err := time.Parse(time.RFC3339, d.EffectiveFrom); err == nil && now.Before(from) {
		return false
	}
	if d.EffectiveUntil != "" {
		if until, err := time.Parse(time.RFC3339, d.EffectiveUntil); err == nil && now.After(until) {
			return false
		}
	}
	return true
}

// DirectiveFilters narrows a directive query. ActiveOnly keeps only
// active-status rows at the store (the service then applies the time window);
// IncludeAllStatuses returns every status (the admin view). With neither set,
// the store excludes cancelled rows (the public default).
type DirectiveFilters struct {
	ActiveOnly         bool
	Town               string
	IncludeAllStatuses bool
}

// DirectiveRepository persists authorized directives.
type DirectiveRepository interface {
	Insert(ctx context.Context, d *Directive) error
	List(ctx context.Context, f DirectiveFilters) ([]Directive, error)
	BySlug(ctx context.Context, slug string) (*Directive, error)
	ByID(ctx context.Context, id string) (*Directive, error)
	SetStatus(ctx context.Context, id, status string) error
}
