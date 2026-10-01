package domain

import (
	"context"
	"strings"
)

// Roles (spec §9).
const (
	RoleMember    = "member"
	RoleCurator   = "curator"
	RoleSteward   = "steward"
	RoleEditor    = "editor"    // newsroom / editorial (spec §8.12)
	RoleModerator = "moderator" // queue/listings/reports/incidents only (Creator Platform plan §9.3)
	// RoleAccountabilityOfficer judges Town Goals achieved/missed. Kept separate
	// from the curators who SET goals — a deliberate separation of duties so the
	// people who make the promise are not the ones who mark it kept.
	RoleAccountabilityOfficer = "accountability"
	// RoleVettingOfficer vets & approves "Oguaa Outside" agents (background check:
	// ID, guarantor, bond) and can suspend them. Separate from curators.
	RoleVettingOfficer = "vetting"
)

// IsStaffRole reports whether a role carries back-office powers: every role
// except a plain member (curator, steward, editor, moderator, vetting,
// accountability). Staff must have two-factor on to use them in production.
func IsStaffRole(role string) bool { return role != "" && role != RoleMember }

// IsDemoEmail reports whether an email address belongs to the seeded demo
// identities (DemoMemberEmailSuffix). They share a password published in this
// repository, so production refuses them outright.
func IsDemoEmail(email string) bool {
	return strings.HasSuffix(strings.ToLower(strings.TrimSpace(email)), DemoMemberEmailSuffix)
}

// Notice versions: the Terms of Use and Privacy Policy currently in force.
// Registration records these (never a client-supplied version). Bump one when
// its document changes materially; members who accepted an older version are
// asked again (consentRequired on GET /api/auth/me).
const (
	CurrentTermsVersion   = "2026-10-01"
	CurrentPrivacyVersion = "2026-10-01"
)

// Platforms a member can accept the Terms from. Anything else is recorded as
// ConsentPlatformUnknown rather than rejected, so a client bug never blocks
// sign-up.
const (
	ConsentPlatformWeb     = "web"
	ConsentPlatformCreator = "creator"
	ConsentPlatformIOS     = "ios"
	ConsentPlatformAndroid = "android"
	ConsentPlatformUnknown = "unknown"
)

// ConsentPlatform normalises a client-supplied platform name.
func ConsentPlatform(p string) string {
	switch p = strings.ToLower(strings.TrimSpace(p)); p {
	case ConsentPlatformWeb, ConsentPlatformCreator, ConsentPlatformIOS, ConsentPlatformAndroid:
		return p
	}
	return ConsentPlatformUnknown
}

// Consent is a member's acceptance of the Terms of Use and Privacy Policy:
// the versions in force when they agreed, when (RFC3339) and where.
type Consent struct {
	TermsVersion   string `json:"termsVersion" bson:"termsVersion"`
	PrivacyVersion string `json:"privacyVersion" bson:"privacyVersion"`
	AcceptedAt     string `json:"acceptedAt" bson:"acceptedAt"`
	Platform       string `json:"platform" bson:"platform"`
}

// Current reports whether the consent covers the notice versions in force.
// Versions are ISO dates, so an older acceptance compares lower.
func (c *Consent) Current() bool {
	return c != nil && c.TermsVersion >= CurrentTermsVersion && c.PrivacyVersion >= CurrentPrivacyVersion
}

// DevDemoMemberIDs are the seeded demo identities used only when AUTH_REQUIRED is
// false. They must never be reached in production. The constants keep the literal
// IDs in one place for security scanning and auditing.
const (
	DevDemoMemberID      = "m-akua"
	DevDemoModeratorID   = "m-nana"
	DevDemoStewardMember = "m-nana"
)

// Creator types — the self-serve creator account kinds (Creator Platform plan §3).
// Orthogonal to Role: any member may create; roles stay staff-only.
const (
	CreatorBusiness    = "business"
	CreatorProperty    = "property"
	CreatorArtist      = "artist"
	CreatorOrganiser   = "organiser"
	CreatorInstitution = "institution"
	CreatorWriter      = "writer" // authors news/blog posts (Creator Platform plan §3)
)

// ValidCreatorType reports whether t is a known creator type.
func ValidCreatorType(t string) bool {
	switch t {
	case CreatorBusiness, CreatorProperty, CreatorArtist, CreatorOrganiser, CreatorInstitution, CreatorWriter:
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
	// CreatorPlanIntent is the plan a creator chose while joining. It is only a
	// preference for onboarding; paid access is granted exclusively by a
	// confirmed Subscription and must never be inferred from this field.
	CreatorPlanIntent string `json:"creatorPlanIntent,omitempty" bson:"creatorPlanIntent,omitempty"`
	// CreatorSubscribedUntil / CreatorPlan are the member-level creator
	// subscription (Creator Monetization): a confirmed paid plan on the account
	// that unlocks artist donations and fundraising campaigns and sets the
	// platform take-rate for both. CreatorSubscribedUntil is RFC3339; a value in
	// the future means the plan is active. Set only by ConfirmSubscription after
	// Paystack verifies the charge — never inferred from CreatorPlanIntent.
	CreatorSubscribedUntil string `json:"creatorSubscribedUntil,omitempty" bson:"creatorSubscribedUntil,omitempty"`
	CreatorPlan            string `json:"creatorPlan,omitempty" bson:"creatorPlan,omitempty"`
	// CampaignerVetted is set true when a curator approves the member's FIRST
	// fundraising campaign. Once vetted, subsequent campaigns auto-publish on
	// submit instead of entering the moderation queue (Creator Monetization).
	CampaignerVetted bool `json:"campaignerVetted,omitempty" bson:"campaignerVetted,omitempty"`
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
	// member opts in. Birthday is "MM-DD"; legacy values may still carry a year
	// until cmd/migratedob reduces them. It is never seeded from the sign-up
	// date of birth.
	Birthday          string `json:"birthday,omitempty" bson:"birthday,omitempty"`
	BroadcastBirthday bool   `json:"broadcastBirthday" bson:"broadcastBirthday"`
	// Diaspora — Cape Coast sons & daughters abroad (spec §4/§5/§15, Phase 2 foundation).
	// Opt-in; nil means the member hasn't said. Surfaces the "abroad" wall and is the
	// data foundation for adopt-a-project and investment features.
	Diaspora *Diaspora `json:"diaspora,omitempty" bson:"diaspora,omitempty"`
	// NotificationPrefs are the member's server-side notification preferences
	// (contract K14); nil = never chosen → DefaultNotificationPrefs. Private:
	// served only by GET /api/me/notification-preferences.
	NotificationPrefs *NotificationPrefs `json:"-" bson:"notificationPrefs,omitempty"`
	// AIConsentAt is when the member agreed that the writing assistant may send
	// the text they select to the AI provider (contract K15; RFC3339). Empty =
	// no consent. Private: /api/auth/me exposes only the aiConsent boolean.
	AIConsentAt string `json:"-" bson:"aiConsentAt,omitempty"`
	// Auth identifiers — private; never serialised to the public API (spec §11: phone private).
	Phone string `json:"-" bson:"phone,omitempty"`
	Email string `json:"-" bson:"email,omitempty"`
	// Phone verification state — used by the submit spam gate. The code hash and
	// expiry never leave the server; the public API only exposes phoneVerified.
	PhoneVerificationCodeHash  string `json:"-" bson:"phoneVerificationCodeHash,omitempty"`
	PhoneVerificationExpiresAt string `json:"-" bson:"phoneVerificationExpiresAt,omitempty"`
	// DateOfBirth — legacy only. Sign-up checks the date of birth for the 18+
	// gate (spec §14.4) without storing it and records AdultVerifiedAt instead;
	// cmd/migratedob removes the values older accounts still carry. Nothing
	// writes this field any more. Never serialised to any client.
	DateOfBirth string `json:"-" bson:"dateOfBirth,omitempty"`
	// AdultVerifiedAt (RFC3339) records when the member was confirmed 18 or
	// older: at sign-up from a date of birth checked and then discarded, or by
	// the member's own confirmation (POST /api/me/consent). Private; the self
	// view exposes it only as adultVerified.
	AdultVerifiedAt string `json:"-" bson:"adultVerifiedAt,omitempty"`
	// Consent is the member's current acceptance of the Terms of Use and
	// Privacy Policy; ConsentHistory keeps every acceptance, oldest first.
	// Private; the self view exposes them.
	Consent        *Consent  `json:"-" bson:"consent,omitempty"`
	ConsentHistory []Consent `json:"-" bson:"consentHistory,omitempty"`
	// PasswordHash — private; bcrypt hash of the member's password. Empty means
	// an invited account nobody has claimed yet: the invitee sets a password
	// through the "forgot password" reset flow, which proves they control the
	// email or phone. Sign-up never claims an existing account.
	PasswordHash string `json:"-" bson:"passwordHash,omitempty"`
	// TokenVersion is stamped into every session token. Bumping it (password
	// change or reset, two-factor enrolment) revokes every earlier session.
	TokenVersion int `json:"-" bson:"tokenVersion,omitempty"`
	// ErasedAt (RFC3339) marks an erased account's "Former member" tombstone.
	// Such an account can never be reactivated.
	ErasedAt string `json:"erasedAt,omitempty" bson:"erasedAt,omitempty"`
	// ErasureID is the random id an erasure gives the account: its tombstone's
	// id, which every record the erasure keeps is moved onto. It is reserved
	// when the erasure reaches the member record, so a retry reuses it; a
	// tombstone carries its own id here. Private.
	ErasureID string `json:"-" bson:"erasureId,omitempty"`
	// Sign-in abuse guards (never serialised): consecutive failed attempts
	// (wrong passwords and wrong two-factor codes), how many lockouts in a row
	// they have caused, and the current lock's expiry (RFC3339).
	FailedLogins  int    `json:"-" bson:"failedLogins,omitempty"`
	LoginLockouts int    `json:"-" bson:"loginLockouts,omitempty"`
	LockedUntil   string `json:"-" bson:"lockedUntil,omitempty"`
	// Password-reset state — mirrors phone verification: a short-lived bcrypt code
	// hash + expiry backing the "forgot password" flow. Both never leave the
	// server and are cleared once a reset completes.
	PasswordResetCodeHash  string `json:"-" bson:"passwordResetCodeHash,omitempty"`
	PasswordResetExpiresAt string `json:"-" bson:"passwordResetExpiresAt,omitempty"`
	// PasswordResetAttempts counts wrong guesses against the current reset
	// code; the code is thrown away once it reaches the limit.
	PasswordResetAttempts int `json:"-" bson:"passwordResetAttempts,omitempty"`
	// MFA (TOTP, RFC 6238 — authenticator apps). MFAEnabled is safe to expose so
	// clients can render the security state; the secret and recovery-code hashes
	// never leave the server.
	MFAEnabled        bool     `json:"mfaEnabled" bson:"mfaEnabled,omitempty"`
	TOTPSecret        string   `json:"-" bson:"totpSecret,omitempty"`
	MFARecoveryHashes []string `json:"-" bson:"mfaRecoveryHashes,omitempty"`
	// PendingTOTPSecret holds a new authenticator secret between setup and
	// confirmation, so (re-)enrolling never touches the active secret or its
	// recovery codes until the new authenticator has proven itself.
	PendingTOTPSecret string `json:"-" bson:"pendingTotpSecret,omitempty"`
	// MFAChallengeNonce binds the one sign-in challenge that may currently be
	// completed with a code; MFAChallengeFailures counts wrong codes against
	// it. The challenge dies after too many wrong codes or one success.
	MFAChallengeNonce    string `json:"-" bson:"mfaChallengeNonce,omitempty"`
	MFAChallengeFailures int    `json:"-" bson:"mfaChallengeFailures,omitempty"`
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
	// code hash and expiry backing the "forgot password" flow, and resets the
	// wrong-guess counter for the code.
	SetPasswordReset(ctx context.Context, id, codeHash, expiresAt string) error
	// RecordPasswordResetFailure counts a wrong guess against the current
	// reset code and returns the new count.
	RecordPasswordResetFailure(ctx context.Context, id string) (int, error)
	UpdateRole(ctx context.Context, id, role string) error
	SetSuspended(ctx context.Context, id string, suspended bool) error
	SetBirthday(ctx context.Context, id, birthday string, broadcast bool) error
	SetAffiliations(ctx context.Context, id, townID, asafoID string) error
	SetPhoto(ctx context.Context, id, photoURL string) error
	SetProfile(ctx context.Context, id, displayName, initials, bio string) error
	SetPasswordHash(ctx context.Context, id, hash string) error
	// SetAdultVerified records when (RFC3339) the member was confirmed 18+.
	SetAdultVerified(ctx context.Context, id, at string) error
	// SetConsent stores the member's current Terms/Privacy acceptance and
	// appends it to the consent history.
	SetConsent(ctx context.Context, id string, c Consent) error
	// BumpTokenVersion revokes every session issued so far and returns the new
	// version, which sessions issued from now on carry.
	BumpTokenVersion(ctx context.Context, id string) (int, error)
	// RecordLoginFailure counts a failed sign-in attempt (wrong password or
	// two-factor code) and returns the consecutive failure count.
	RecordLoginFailure(ctx context.Context, id string) (int, error)
	// LockLogin blocks sign-in until `until` (RFC3339), counts the lockout and
	// resets the failure count.
	LockLogin(ctx context.Context, id, until string) error
	// ClearLoginFailures forgets failed attempts, lockouts and any sign-in
	// challenge after a successful sign-in or password reset.
	ClearLoginFailures(ctx context.Context, id string) error
	// SetMFAChallenge binds (or, with "", clears) the member's outstanding
	// two-factor sign-in challenge and resets its wrong-code count.
	SetMFAChallenge(ctx context.Context, id, nonce string) error
	// RecordMFAChallengeFailure counts a wrong code against the outstanding
	// challenge and returns the new count.
	RecordMFAChallengeFailure(ctx context.Context, id string) (int, error)
	// SetPendingMFA stores (or, with "", clears) an authenticator secret that
	// is waiting for its first code.
	SetPendingMFA(ctx context.Context, id, secret string) error
	SetSchooling(ctx context.Context, id string, stints []SchoolStint) error
	SetDiaspora(ctx context.Context, id string, d *Diaspora) error
	SetLinks(ctx context.Context, id string, links []SocialLink) error
	// SetNotificationPrefs stores the member's notification preferences (K14).
	SetNotificationPrefs(ctx context.Context, id string, prefs NotificationPrefs) error
	// SetAIConsent records (at = RFC3339 time) or withdraws (at = "") the
	// member's consent to the AI writing assistant (K15).
	SetAIConsent(ctx context.Context, id, at string) error
	SetCreatorTypes(ctx context.Context, id string, types []string) error
	SetCreatorPlanIntent(ctx context.Context, id, planSlug string) error
	// SetCreatorSubscription records a confirmed member-level creator plan: its
	// slug and the RFC3339 paid-until date. Unlocks donations & campaigns.
	SetCreatorSubscription(ctx context.Context, id, planSlug, until string) error
	// SetCampaignerVetted flips the member's campaign auto-publish entitlement,
	// set true when their first campaign is approved.
	SetCampaignerVetted(ctx context.Context, id string, vetted bool) error
	// SetMFA persists the member's TOTP state: enabled flag, base32 secret
	// (empty clears it), and bcrypt hashes of unused recovery codes.
	SetMFA(ctx context.Context, id string, enabled bool, secret string, recoveryHashes []string) error
	// ReserveErasureID stores candidate as the member's ErasureID unless one is
	// already stored (an interrupted erasure, or a tombstone, whose own id it
	// is), and returns the stored id.
	ReserveErasureID(ctx context.Context, id, candidate string) (string, error)
	// Anonymize replaces the member with a locked, anonymous "Former member"
	// tombstone stored under tombstoneID (Act 843 right to erasure, spec
	// §14.2), so retained records keep a placeholder owner. When tombstoneID
	// differs from id, the original record — whose id may embed the name
	// chosen at sign-up — is removed; the tombstone is written first, so a
	// failure part-way leaves the original to retry from.
	Anonymize(ctx context.Context, id, tombstoneID string) error
}
