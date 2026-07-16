package domain

import "context"

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

// OrgClaim is a member's request to manage an institution's official presence.
// A steward reviews it; once approved, the member becomes an org manager and may
// edit the profile, manage the roster of offices, and post official events. This
// is the trust gate that keeps institution identity authoritative (spec §8.13).
type OrgClaim struct {
	ID            string `json:"id" bson:"_id"`
	OrgID         string `json:"orgId" bson:"orgId"`
	MemberID      string `json:"memberId" bson:"memberId"`
	RequestedRole string `json:"requestedRole" bson:"requestedRole"` // e.g. "OBA President", "Headmaster"
	Note          string `json:"note,omitempty" bson:"note,omitempty"`
	Status        string `json:"status" bson:"status"`
	Scope         string `json:"scope,omitempty" bson:"scope,omitempty"`           // manager | officer (team invites)
	InvitedByID   string `json:"invitedById,omitempty" bson:"invitedById,omitempty"` // manager who sent the invite
	CreatedAt     string `json:"createdAt" bson:"createdAt"`
	ReviewedByID  string `json:"reviewedById,omitempty" bson:"reviewedById,omitempty"`
	ReviewedAt    string `json:"reviewedAt,omitempty" bson:"reviewedAt,omitempty"`
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
}
