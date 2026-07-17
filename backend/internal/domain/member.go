package domain

import "context"

// Roles (spec §9).
const (
	RoleMember    = "member"
	RoleCurator   = "curator"
	RoleSteward   = "steward"
	RoleEditor    = "editor"    // newsroom / editorial (spec §8.12)
	RoleModerator = "moderator" // queue/listings/reports/incidents only (Creator Platform plan §9.3)
)

// DevDemoMemberIDs are the seeded demo identities used only when AUTH_REQUIRED is
// false. They must never be reached in production. The constants keep the literal
// IDs in one place for security scanning and auditing.
const (
	DevDemoMemberID       = "m-akua"
	DevDemoModeratorID    = "m-nana"
	DevDemoStewardMember  = "m-nana"
)

// Creator types — the self-serve creator account kinds (Creator Platform plan §3).
// Orthogonal to Role: any member may create; roles stay staff-only.
const (
	CreatorBusiness    = "business"
	CreatorArtist      = "artist"
	CreatorOrganiser   = "organiser"
	CreatorInstitution = "institution"
	CreatorWriter      = "writer" // authors news/blog posts (Creator Platform plan §3)
)

// ValidCreatorType reports whether t is a known creator type.
func ValidCreatorType(t string) bool {
	switch t {
	case CreatorBusiness, CreatorArtist, CreatorOrganiser, CreatorInstitution, CreatorWriter:
		return true
	}
	return false
}

// SchoolStint — a member's time at a school. Overlapping stints at the same
// school make people classmates — the basis of "people you may know" (spec §8.6).
type SchoolStint struct {
	SchoolID string `json:"schoolId" bson:"schoolId"`
	FromYear int    `json:"fromYear,omitempty" bson:"fromYear,omitempty"`
	ToYear   int    `json:"toYear,omitempty" bson:"toYear,omitempty"`
}

// Member — Pillar 1, the identity layer (spec §8.1).
type Member struct {
	ID            string        `json:"id" bson:"_id"`
	Slug          string        `json:"slug" bson:"slug"`
	DisplayName   string        `json:"displayName" bson:"displayName"`
	Initials      string        `json:"initials" bson:"initials"`
	PhotoURL      string        `json:"photoUrl,omitempty" bson:"photoUrl,omitempty"`
	Bio           string        `json:"bio,omitempty" bson:"bio,omitempty"`
	TownID        string        `json:"townId,omitempty" bson:"townId,omitempty"`
	AsafoID       string        `json:"asafoId,omitempty" bson:"asafoId,omitempty"` // Asafo company affiliation (spec §8.6)
	SchoolIDs     []string      `json:"schoolIds" bson:"schoolIds"`
	Schooling     []SchoolStint `json:"schooling,omitempty" bson:"schooling,omitempty"` // schools + years, for connections (spec §8.6)
	Links         []SocialLink  `json:"links,omitempty" bson:"links,omitempty"`
	PhoneVerified bool          `json:"phoneVerified" bson:"phoneVerified"`
	Role          string        `json:"role" bson:"role"`
	// CreatorTypes — empty means a plain citizen; any value makes the member a
	// creator with dashboard access (Creator Platform plan §3).
	CreatorTypes []string `json:"creatorTypes,omitempty" bson:"creatorTypes,omitempty"`
	// Verified / VerifiedAs are the checkmark-badge signal. They are COMPUTED at
	// serialization time (never persisted — bson:"-"): a member is verified as a
	// curator/steward, or as an approved manager of a verified authority-kind
	// institution. Populated by Service.EnrichMemberBadge before a member is
	// serialized on /api/auth/me and the public profile.
	Verified   bool   `json:"verified" bson:"-"`
	VerifiedAs string `json:"verifiedAs,omitempty" bson:"-"`
	Suspended  bool   `json:"suspended" bson:"suspended"`
	JoinedAt   string `json:"joinedAt" bson:"joinedAt"`
	// Living-member birthday (spec §8.11). Broadcast to followers only if the
	// member opts in. Birthday is "MM-DD" or "YYYY-MM-DD".
	Birthday          string `json:"birthday,omitempty" bson:"birthday,omitempty"`
	BroadcastBirthday bool   `json:"broadcastBirthday" bson:"broadcastBirthday"`
	// Diaspora — Cape Coast sons & daughters abroad (spec §4/§5/§15, Phase 2 foundation).
	// Opt-in; nil means the member hasn't said. Surfaces the "abroad" wall and is the
	// data foundation for adopt-a-project and investment features.
	Diaspora *Diaspora `json:"diaspora,omitempty" bson:"diaspora,omitempty"`
	// Auth identifiers — private; never serialised to the public API (spec §11: phone private).
	Phone string `json:"-" bson:"phone,omitempty"`
	Email string `json:"-" bson:"email,omitempty"`
	// Phone verification state — used by the submit spam gate. The code hash and
	// expiry never leave the server; the public API only exposes phoneVerified.
	PhoneVerificationCodeHash  string `json:"-" bson:"phoneVerificationCodeHash,omitempty"`
	PhoneVerificationExpiresAt string `json:"-" bson:"phoneVerificationExpiresAt,omitempty"`
	// DateOfBirth — private; captured at signup for the 18+ self-registration gate
	// (spec §14.4). Never serialised to any client.
	DateOfBirth string `json:"-" bson:"dateOfBirth,omitempty"`
	// PasswordHash — private; bcrypt hash of the member's password. Empty means
	// the account predates password sign-in and can be claimed via the Join flow.
	PasswordHash string `json:"-" bson:"passwordHash,omitempty"`
	// Password-reset state — mirrors phone verification: a short-lived bcrypt code
	// hash + expiry backing the "forgot password" flow. Both never leave the
	// server and are cleared once a reset completes.
	PasswordResetCodeHash  string `json:"-" bson:"passwordResetCodeHash,omitempty"`
	PasswordResetExpiresAt string `json:"-" bson:"passwordResetExpiresAt,omitempty"`
	// MFA (TOTP, RFC 6238 — authenticator apps). MFAEnabled is safe to expose so
	// clients can render the security state; the secret and recovery-code hashes
	// never leave the server.
	MFAEnabled        bool     `json:"mfaEnabled" bson:"mfaEnabled,omitempty"`
	TOTPSecret        string   `json:"-" bson:"totpSecret,omitempty"`
	MFARecoveryHashes []string `json:"-" bson:"mfaRecoveryHashes,omitempty"`
}

// Diaspora is a member's location away from Cape Coast (spec §4/§5/§15).
type Diaspora struct {
	Abroad  bool   `json:"abroad" bson:"abroad"`
	City    string `json:"city,omitempty" bson:"city,omitempty"`
	Country string `json:"country,omitempty" bson:"country,omitempty"`
}

type MemberRepository interface {
	All(ctx context.Context) ([]Member, error)
	ByID(ctx context.Context, id string) (*Member, error)
	BySlug(ctx context.Context, slug string) (*Member, error)
	ByIdentifier(ctx context.Context, identifier string) (*Member, error) // phone or email
	Insert(ctx context.Context, m Member) error
	SetPhoneVerified(ctx context.Context, id string, verified bool) error
	SetPhoneVerification(ctx context.Context, id, codeHash, expiresAt string) error
	// SetPasswordReset stores (or, with empty args, clears) the password-reset
	// code hash and expiry backing the "forgot password" flow.
	SetPasswordReset(ctx context.Context, id, codeHash, expiresAt string) error
	UpdateRole(ctx context.Context, id, role string) error
	SetSuspended(ctx context.Context, id string, suspended bool) error
	SetBirthday(ctx context.Context, id, birthday string, broadcast bool) error
	SetAffiliations(ctx context.Context, id, townID, asafoID string) error
	SetPhoto(ctx context.Context, id, photoURL string) error
	SetProfile(ctx context.Context, id, displayName, initials, bio string) error
	SetPasswordHash(ctx context.Context, id, hash string) error
	SetDateOfBirth(ctx context.Context, id, dateOfBirth string) error
	SetSchooling(ctx context.Context, id string, stints []SchoolStint) error
	SetDiaspora(ctx context.Context, id string, d *Diaspora) error
	SetLinks(ctx context.Context, id string, links []SocialLink) error
	SetCreatorTypes(ctx context.Context, id string, types []string) error
	// SetMFA persists the member's TOTP state: enabled flag, base32 secret
	// (empty clears it), and bcrypt hashes of unused recovery codes.
	SetMFA(ctx context.Context, id string, enabled bool, secret string, recoveryHashes []string) error
	// Anonymize wipes a member's personal data and suspends the account
	// (Act 843 right to erasure, spec §14.2), keeping the row so published
	// content retains a "Former member" owner.
	Anonymize(ctx context.Context, id string) error
}
