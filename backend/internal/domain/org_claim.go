package domain

import "context"

// Claim lifecycle (spec §8.13 — institutions claim their official home).
const (
	ClaimPending  = "pending"
	ClaimApproved = "approved"
	ClaimRejected = "rejected"
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
	CreatedAt     string `json:"createdAt" bson:"createdAt"`
	ReviewedByID  string `json:"reviewedById,omitempty" bson:"reviewedById,omitempty"`
	ReviewedAt    string `json:"reviewedAt,omitempty" bson:"reviewedAt,omitempty"`
}

// OrgClaimRepository persists management claims and answers "who manages what".
type OrgClaimRepository interface {
	Insert(ctx context.Context, c OrgClaim) error
	Get(ctx context.Context, id string) (*OrgClaim, error)
	Pending(ctx context.Context) ([]OrgClaim, error)
	ByMember(ctx context.Context, memberID string) ([]OrgClaim, error)
	UpdateStatus(ctx context.Context, id, status, reviewedBy, at string) error
	// IsManager reports an approved claim exists for (member, org).
	IsManager(ctx context.Context, memberID, orgID string) (bool, error)
	// ManagedOrgIDs lists org ids the member has an approved claim for.
	ManagedOrgIDs(ctx context.Context, memberID string) ([]string, error)
	// HasActiveClaim reports a pending or approved claim exists for (member, org).
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
