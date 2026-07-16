package domain

import (
	"context"
	"strings"
)

// reservedSlugs are impersonation-sensitive official handles that ordinary
// members and orgs may NOT self-claim or self-create — only stewards may assign
// them (spec: reserved usernames). They cover the emergency/security/health and
// local-government authorities whose name carries public trust.
var reservedSlugs = map[string]bool{
	"police":       true,
	"ghana-police": true,
	"fire":         true,
	"fire-service": true,

	"ghana-fire-service":  true,
	"ambulance":           true,
	"health-service":      true,
	"assembly":            true,
	"cape-coast-assembly": true,
	"metro-assembly":      true,
	"nadmo":               true,
}

// IsReservedSlug reports whether slug is a reserved authority handle. Enforced
// at institution create/claim: a non-steward may not create or claim an org
// whose slug is reserved. Stewards bypass.
func IsReservedSlug(slug string) bool {
	return reservedSlugs[strings.ToLower(strings.TrimSpace(slug))]
}

// Claim lifecycle (spec §8.13 — institutions claim their official home).
// The team extension (Creator plan §4.1.2) adds the invitation branch: a
// manager invites a citizen (invited) who accepts (approved, no steward
// review) or declines; managers and stewards/moderators may revoke any
// membership.
const (
	ClaimPending  = "pending"
	ClaimApproved = "approved"
	ClaimRejected = "rejected"
	ClaimInvited  = "invited"
	ClaimDeclined = "declined"
	ClaimRevoked  = "revoked"
)

// Team scopes (Creator plan §4.1.2): managers do everything incl. team +
// revoke; officers edit content only (profile, gallery, sections, events).
const (
	ScopeManager = "manager"
	ScopeOfficer = "officer"
)

// NewOrgRequest is a citizen's request for a brand-new institution page
// (Creator plan §4.1.1): steward creates + verifies the org and the claim is
// auto-approved for the requester — all from the single claim review click.
type NewOrgRequest struct {
	Name string `json:"name" bson:"name"`
	Kind string `json:"kind" bson:"kind"`
	Seat string `json:"seat" bson:"seat"` // town/quarter it sits in
}

// InstitutionKind is one entry of the server-side kind catalog.
type InstitutionKind struct {
	Slug  string `json:"slug"`
	Label string `json:"label"`
}

// InstitutionKindCatalog is the canonical list of institution kinds (Creator
// plan §4.1.1 — kinds come from the server, not free text).
var InstitutionKindCatalog = []InstitutionKind{
	{Slug: "school", Label: "School"},
	{Slug: "traditional-authority", Label: "Traditional authority"},
	{Slug: "association", Label: "Association"},
	{Slug: "faith", Label: "Faith / church"},
	{Slug: "civic", Label: "Civic"},
	{Slug: "asafo", Label: "Asafo company"},
	{Slug: "heritage", Label: "Heritage / visitor site"},
	// Authority kinds — institutions empowered to issue directives/announcements
	// that carry official weight (see IsAuthorityKind and the directives feature).
	{Slug: "emergency-service", Label: "Emergency service"},
	{Slug: "security-service", Label: "Security service"},
	{Slug: "health-service", Label: "Health service"},
	{Slug: "local-government", Label: "Local government"},
}

// authorityKinds is the subset of the catalog whose members may issue
// authorized directives. Kept as a set for O(1) IsAuthorityKind lookups.
var authorityKinds = map[string]bool{
	"emergency-service": true,
	"security-service":  true,
	"health-service":    true,
	"local-government":  true,
}

// IsAuthorityKind reports whether an institution of this kind may issue
// authorized directives (spec: the directives/announcements feature).
func IsAuthorityKind(kind string) bool {
	return authorityKinds[kind]
}

// ValidInstitutionKind reports whether slug is in the catalog.
func ValidInstitutionKind(slug string) bool {
	for _, k := range InstitutionKindCatalog {
		if k.Slug == slug {
			return true
		}
	}
	return false
}

// OrgClaim is a member's request to manage an institution's official presence.
// A steward reviews it; once approved, the member becomes an org manager and may
// edit the profile, manage the roster of offices, and post official events. This
// is the trust gate that keeps institution identity authoritative (spec §8.13).
type OrgClaim struct {
	ID            string         `json:"id" bson:"_id"`
	OrgID         string         `json:"orgId" bson:"orgId"`
	MemberID      string         `json:"memberId" bson:"memberId"`
	RequestedRole string         `json:"requestedRole" bson:"requestedRole"` // e.g. "OBA President", "Headmaster"
	Note          string         `json:"note,omitempty" bson:"note,omitempty"`
	Status        string         `json:"status" bson:"status"`
	Scope         string         `json:"scope,omitempty" bson:"scope,omitempty"`             // manager | officer (team invites)
	InvitedByID   string         `json:"invitedById,omitempty" bson:"invitedById,omitempty"` // manager who sent the invite
	NewOrg        *NewOrgRequest `json:"newOrg,omitempty" bson:"newOrg,omitempty"`           // set = request to CREATE the institution
	CreatedAt     string         `json:"createdAt" bson:"createdAt"`
	ReviewedByID  string         `json:"reviewedById,omitempty" bson:"reviewedById,omitempty"`
	ReviewedAt    string         `json:"reviewedAt,omitempty" bson:"reviewedAt,omitempty"`
}

// EffectiveScope resolves the member's team powers. Original claimants (and
// every claim predating the team feature) carry no scope — they are managers;
// only invitees can hold the narrower officer scope.
func (c OrgClaim) EffectiveScope() string {
	if c.Scope == ScopeOfficer {
		return ScopeOfficer
	}
	return ScopeManager
}

// OrgClaimRepository persists management claims and answers "who manages what".
type OrgClaimRepository interface {
	Insert(ctx context.Context, c OrgClaim) error
	Get(ctx context.Context, id string) (*OrgClaim, error)
	Pending(ctx context.Context) ([]OrgClaim, error)
	ByMember(ctx context.Context, memberID string) ([]OrgClaim, error)
	// ByOrg lists every claim (any status) for an org — the team roster source.
	ByOrg(ctx context.Context, orgID string) ([]OrgClaim, error)
	UpdateStatus(ctx context.Context, id, status, reviewedBy, at string) error
	UpdateScope(ctx context.Context, id, scope string) error
	// AttachOrg points a new-institution request at the org the steward created.
	AttachOrg(ctx context.Context, id, orgID string) error
	// IsManager reports an approved claim exists for (member, org).
	IsManager(ctx context.Context, memberID, orgID string) (bool, error)
	// ActiveClaim returns the member's approved claim for the org, or nil.
	ActiveClaim(ctx context.Context, memberID, orgID string) (*OrgClaim, error)
	// ManagedOrgIDs lists org ids the member has an approved claim for.
	ManagedOrgIDs(ctx context.Context, memberID string) ([]string, error)
	// HasActiveClaim reports a pending, approved or invited claim exists for (member, org).
	HasActiveClaim(ctx context.Context, memberID, orgID string) (bool, error)
}

// OrgProfilePatch is the set of "soft" institution fields a verified manager may
// edit, including the crest/logo image. Authoritative fields (name, kind,
// verification) stay steward-only.
type OrgProfilePatch struct {
	Summary  string
	History  string
	Motto    string
	CrestURL string
	Contact  []SocialLink

	// Per-kind structured catalog fields (§4 perkind-catalog).
	// Education (schools):
	GESCategory  string // e.g. "Senior High", "Junior High", "Primary"
	BoardingType string // "boarding", "day", "both"
	GenderPolicy string // "boys", "girls", "mixed"

	// Health:
	NHISAccredited *bool // nil = not specified

	// All kinds:
	GhanaPostGPS          string // GhanaPost digital address e.g. "CF-0172-0842"
	MoMoNumber            string // Mobile money number for donations/giving
	Latitude              *float64
	Longitude             *float64
	QuarterTag            string
	AsafoTag              string
	VerificationArtifacts []SocialLink
}
