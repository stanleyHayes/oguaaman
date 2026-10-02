package service

import (
	"context"
	crypto_rand "crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/platform/emailtmpl"
	"github.com/oguaa/backend/internal/platform/logger"
)

// ErrUnderage is returned when a new self-registration is under 18 (spec §14.4).
var ErrUnderage = errors.New("you must be 18 or older to join")

// ErrInvalidCredentials is returned for every failed sign-in: an unknown
// identifier, a wrong password, an invited account with no password yet, or a
// demo identity in production. One error for all of them means the response
// never reveals whether an account exists.
var ErrInvalidCredentials = errors.New("invalid identifier or password")

// ErrIdentifierTaken is returned when registering an identifier that already
// belongs to an account. Sign-up never claims an existing account — invited
// accounts are claimed through the password-reset flow instead.
var ErrIdentifierTaken = errors.New("an account already exists for that identifier")

// ErrNoPassword is returned when a password operation reaches an account that
// has no password yet (an unclaimed invitation).
var ErrNoPassword = errors.New("this account has no password yet")

// ErrSuspended is returned when a suspended account tries to sign in.
var ErrSuspended = errors.New("this account is suspended")

// ErrAccountLocked is returned while sign-in is locked after repeated failures.
var ErrAccountLocked = errors.New("too many failed sign-in attempts — try again later")

// ErrTermsNotAccepted is returned when sign-up or a consent update arrives
// without agreement to the Terms of Use and Privacy Policy (K1/K2).
var ErrTermsNotAccepted = errors.New("please agree to the Terms of Use and Privacy Policy")

// ErrAdultConfirmationRequired is returned when a member whose age was never
// verified accepts the Terms without confirming they are 18 or older.
var ErrAdultConfirmationRequired = errors.New("please confirm you are 18 or older")

// ErrInvalidMFACode is returned when a TOTP/recovery code doesn't match.
var ErrInvalidMFACode = errors.New("that code didn't work — check your authenticator app and try again")

// ErrMFANotSetup is returned when MFA is touched before enrolment.
var ErrMFANotSetup = errors.New("two-factor authentication isn't set up on this account")

// ErrMFACodeRequired is returned when a member with two-factor on asks for a
// new authenticator without proving they hold the current one.
var ErrMFACodeRequired = errors.New("enter a code from your current authenticator app, or a recovery code, to set up a new one")

// ErrInvalidChallenge is returned for an expired, forged, used-up or
// superseded MFA sign-in challenge.
var ErrInvalidChallenge = errors.New("your sign-in challenge expired — please sign in again")

// ErrPhoneVerificationNotSetup is returned when a verification code is checked
// before one was issued.
var ErrPhoneVerificationNotSetup = errors.New("phone verification hasn't been started on this account")

// ErrPhoneVerificationExpired is returned when the verification code has timed out.
var ErrPhoneVerificationExpired = errors.New("that verification code expired — please request a new one")

// ErrInvalidPhoneVerificationCode is returned when the verification code doesn't match.
var ErrInvalidPhoneVerificationCode = errors.New("that verification code didn't work")

// ErrCodeNotDelivered is returned in production when no delivery channel
// accepted a verification code. The code is never handed back in the response
// instead (F030/P076).
var ErrCodeNotDelivered = errors.New("we couldn't send a code right now — try again later")

// ErrPhoneCodeUnavailable is returned in production when the code would have
// to go to a phone number and no phone channel (WhatsApp) is live, so the
// member is told plainly instead of waiting for a code that never comes (F025).
var ErrPhoneCodeUnavailable = errors.New("we can't send codes to phone numbers yet — try again later, or use the email address on your account")

// ErrResetAccountNotFound is returned by StartPasswordReset when no account
// matches the identifier. The handler maps it to a GENERIC success so the
// public endpoint never reveals whether an account exists.
var ErrResetAccountNotFound = errors.New("no account matches that identifier")

// ErrResetNotStarted is returned when a reset code is confirmed before one was issued.
var ErrResetNotStarted = errors.New("no password reset is in progress on this account")

// ErrResetExpired is returned when the reset code has timed out.
var ErrResetExpired = errors.New("that reset code expired — please request a new one")

// ErrInvalidResetCode is returned when the reset code doesn't match.
var ErrInvalidResetCode = errors.New("that reset code didn't work")

// ErrResetPasswordTooShort is returned when the new password is below the floor.
var ErrResetPasswordTooShort = fmt.Errorf("password must be at least %d characters", minPasswordLen)

// ErrCurrentPasswordWrong is returned by ChangePassword when the supplied
// current password doesn't match the account's stored hash.
var ErrCurrentPasswordWrong = errors.New("your current password is incorrect")

// minSignupAge is the self-registration floor; minors join only via a guardian
// (a deferred flow). See spec §14.4.
const minSignupAge = 18

// minPasswordLen is the floor for password sign-up.
const minPasswordLen = 8

// phoneVerificationTTL bounds the contact-verification window.
const phoneVerificationTTL = 10 * time.Minute

// passwordResetTTL bounds the "forgot password" code window.
const passwordResetTTL = 10 * time.Minute

// maxCodeAttempts is how many wrong guesses a two-factor sign-in challenge
// survives before it is thrown away, and how many one source may make at a
// password-reset code (see resetCodeMaxGuesses for the code's overall cap).
const maxCodeAttempts = 5

// loginLockThreshold is how many consecutive failed sign-in attempts (wrong
// passwords or wrong two-factor codes) lock the account's sign-in.
const loginLockThreshold = 10

// loginLockBase is the first lock's length; each consecutive lockout doubles
// it, up to loginLockMax. A successful sign-in or password reset starts over.
const (
	loginLockBase = 15 * time.Minute
	loginLockMax  = 4 * time.Hour
)

// AuthService implements password-based sign-in → JWT sessions (spec §8.1, §9).
type AuthService struct {
	members domain.MemberRepository
	plans   domain.PlanRepository
	secret  []byte
	logKey  []byte     // keys the identifier hashes in security events
	enc     *mfaCipher // seals TOTP secrets at rest; nil = plaintext (no key)
	otp     OTPSender  // nil = no phone channel for verification codes
	// email/wa deliver password-reset codes out-of-band (mirrors notifyOutOfBand).
	// Either may be nil (channel not configured). Outside production an
	// undelivered code is echoed for testing; production never echoes one.
	email EmailSender
	wa    MessageSender
	log   *slog.Logger
	// production (GO_ENV=production) refuses the seeded demo identities and
	// withholds staff powers from staff accounts without two-factor.
	production bool
	// loginStrikes and resetStrikes remember which sources failed against an
	// account, so its lock and reset-code budget bind only them (R01).
	loginStrikes *sourceStrikes
	resetStrikes *sourceStrikes
}

// OTPSender delivers a one-time code to a phone number out-of-band.
// Implement with infra/whatsapp.Client for production.
type OTPSender interface {
	SendOTP(ctx context.Context, phone, code string) error
}

func NewAuthService(members domain.MemberRepository, secret string) *AuthService {
	logKey := sha256.Sum256([]byte("oguaa/security-log/identifier/v1|" + secret))
	return &AuthService{
		members: members, secret: []byte(secret), logKey: logKey[:], log: slog.Default(),
		loginStrikes: newSourceStrikes(loginLockMax), resetStrikes: newSourceStrikes(passwordResetTTL),
	}
}

// WithLogger routes the service's logs (and security events) to log.
func (a *AuthService) WithLogger(log *slog.Logger) *AuthService {
	if log != nil {
		a.log = log
	}
	return a
}

// WithProduction switches on the production-only rules: the seeded demo
// identities (DemoMemberEmailSuffix) can never sign in, register or reset a
// password, and staff accounts get no staff powers until two-factor is on.
func (a *AuthService) WithProduction(production bool) *AuthService {
	a.production = production
	return a
}

// WithMFAEncryption enables AES-GCM encryption of TOTP secrets at rest, keyed
// by the given secret (empty = disabled, secrets stay plaintext). Returns the
// service for chaining. A malformed key is a fatal misconfiguration.
func (a *AuthService) WithMFAEncryption(key string) *AuthService {
	c, err := newMFACipher(key)
	if err != nil {
		a.log.Error("mfa encryption disabled: bad key", "err", err)
		return a
	}
	a.enc = c
	return a
}

// sealSecret returns the on-disk form of a fresh plaintext TOTP secret: AES-GCM
// sealed when a key is configured, plaintext otherwise.
func (a *AuthService) sealSecret(plain string) (string, error) {
	if a.enc == nil {
		return plain, nil
	}
	return a.enc.seal(plain)
}

// revealSecret decrypts a stored secret for validation. Legacy plaintext values
// (no marker) pass through unchanged so pre-encryption enrolments keep working.
// A sealed value that cannot be opened — wrong or missing MFA_ENC_KEY — is an
// error, never an empty secret: callers must fail closed.
func (a *AuthService) revealSecret(stored string) (string, error) {
	if !isSealed(stored) {
		return stored, nil
	}
	if a.enc == nil {
		return "", errors.New("mfa: secret is sealed but no MFA_ENC_KEY is configured")
	}
	return a.enc.open(stored)
}

// reseal migrates a stored secret to sealed form when a key is configured and
// the value is still legacy plaintext; otherwise it returns it unchanged. Used
// on writes so existing enrolments become encrypted the next time they change.
func (a *AuthService) reseal(stored string) string {
	if a.enc == nil || stored == "" || isSealed(stored) {
		return stored
	}
	if sealed, err := a.enc.seal(stored); err == nil {
		return sealed
	}
	return stored
}

// WithPlans attaches the staff-managed plans catalog used to validate a
// creator's signup choice. The stored choice is onboarding intent only; this
// service never creates subscriptions or grants paid benefits.
func (a *AuthService) WithPlans(plans domain.PlanRepository) *AuthService {
	a.plans = plans
	return a
}

// WithOTPSender attaches an out-of-band OTP delivery channel.
func (a *AuthService) WithOTPSender(s OTPSender) *AuthService {
	a.otp = s
	return a
}

// WithNotifiers attaches the email/WhatsApp channels used to deliver
// password-reset codes out-of-band. Either may be nil.
func (a *AuthService) WithNotifiers(email EmailSender, wa MessageSender) *AuthService {
	a.email = email
	a.wa = wa
	return a
}

// ── production guards & security events ─────────────────────────────────────

// demoBlocked reports whether an identifier or account email is one of the
// seeded demo identities and production refuses it.
func (a *AuthService) demoBlocked(emailOrIdentifier string) bool {
	return a.production && domain.IsDemoEmail(emailOrIdentifier)
}

// StaffMFARequired reports whether the member holds a staff role but may not
// use it yet: in production, staff must have two-factor on (D9).
func (a *AuthService) StaffMFARequired(m *domain.Member) bool {
	return staffMFAHeldBack(a.production, m)
}

// securityEvent logs a structured security event (type=security).
func (a *AuthService) securityEvent(ctx context.Context, event string, args ...any) {
	logger.Security(ctx, a.log, event, args...)
}

// hashIdentifier pseudonymises a sign-in identifier for security events.
func (a *AuthService) hashIdentifier(identifier string) string {
	return logger.HashIdentifier(a.logKey, identifier)
}

// ── registration ─────────────────────────────────────────────────────────────

// RegisterInput is a sign-up request (contract K1).
type RegisterInput struct {
	Identifier  string // email or phone
	DisplayName string
	// DateOfBirth ("YYYY-MM-DD") is checked against the 18+ gate (spec §14.4)
	// and then discarded: only the fact and time of the check are stored.
	DateOfBirth  string
	Password     string
	CreatorTypes []string
	// CreatorPlanIntent is validated against the active catalog and defaults to
	// Starter for creators. It never grants paid entitlement.
	CreatorPlanIntent string
	AcceptTerms       bool // must be true: "I agree to the Terms of Use and Privacy Policy"
	// TermsVersion is the version the client displayed. It is informational:
	// the server records its own current notice versions.
	TermsVersion string
	Platform     string // web | creator | ios | android
}

// Register signs up a brand-new member and returns a signed session token plus
// the member. It never claims an existing account: an identifier that already
// belongs to anyone — including an invited account with no password yet —
// returns ErrIdentifierTaken. Invitees claim their account through the
// password-reset flow, which proves they control the email or phone.
func (a *AuthService) Register(ctx context.Context, in RegisterInput) (string, *domain.Member, error) {
	identifier, err := a.validateRegistration(in)
	if err != nil {
		return "", nil, err
	}
	types, err := cleanCreatorTypes(in.CreatorTypes)
	if err != nil {
		return "", nil, err
	}
	planIntent, err := a.resolveCreatorPlanIntent(ctx, types, in.CreatorPlanIntent)
	if err != nil {
		return "", nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return "", nil, err
	}
	existing, err := a.members.ByIdentifier(ctx, identifier)
	if err != nil && !isRepoNotFound(err) {
		return "", nil, err
	}
	if err == nil && existing != nil {
		return "", nil, ErrIdentifierTaken
	}
	member, err := a.registerNew(ctx, identifier, in, string(hash))
	if err != nil {
		return "", nil, err
	}
	if len(types) > 0 {
		if err := a.members.SetCreatorTypes(ctx, member.ID, types); err != nil {
			return "", nil, err
		}
		member.CreatorTypes = types
		if err := a.members.SetCreatorPlanIntent(ctx, member.ID, planIntent); err != nil {
			return "", nil, err
		}
		member.CreatorPlanIntent = planIntent
	}

	token, err := a.issue(member)
	if err != nil {
		return "", nil, err
	}
	return token, member, nil
}

// validateRegistration checks a sign-up request before anything is written and
// returns the normalised identifier.
func (a *AuthService) validateRegistration(in RegisterInput) (string, error) {
	if !in.AcceptTerms {
		return "", ErrTermsNotAccepted
	}
	identifier := normalizeIdentifier(in.Identifier)
	if identifier == "" {
		return "", &domain.ValidationError{Message: "Enter a phone number or email to join."}
	}
	if a.demoBlocked(identifier) {
		return "", &domain.ValidationError{Message: "That email address can't be used to join Oguaa."}
	}
	if len(in.Password) < minPasswordLen {
		return "", &domain.ValidationError{Message: fmt.Sprintf("Your password must be at least %d characters.", minPasswordLen)}
	}
	born, err := parseDateOfBirth(in.DateOfBirth)
	if err != nil {
		return "", err
	}
	if !adultOn(born, time.Now().UTC()) {
		return "", ErrUnderage
	}
	return identifier, nil
}

// parseDateOfBirth reads a sign-up date of birth ("YYYY-MM-DD").
func parseDateOfBirth(dob string) (time.Time, error) {
	dob = strings.TrimSpace(dob)
	if dob == "" {
		return time.Time{}, &domain.ValidationError{Message: "Please enter your date of birth to join."}
	}
	born, err := time.Parse(time.DateOnly, dob)
	if err != nil {
		return time.Time{}, &domain.ValidationError{Message: "Enter your date of birth as YYYY-MM-DD."}
	}
	return born, nil
}

// resolveCreatorPlanIntent validates a creator's onboarding preference before
// any account is inserted. Citizens carry no plan intent. An active paid plan
// may be remembered, but no entitlement is created here.
func (a *AuthService) resolveCreatorPlanIntent(ctx context.Context, creatorTypes []string, requested string) (string, error) {
	if len(creatorTypes) == 0 {
		return "", nil
	}
	if a.plans == nil {
		return "", fmt.Errorf("creator plans catalog is not configured")
	}

	slug := strings.ToLower(strings.TrimSpace(requested))
	if slug == "" {
		slug = domain.DefaultCreatorPlanIntentSlug
	}
	plan, err := a.plans.BySlug(ctx, slug)
	if err != nil {
		if isRepoNotFound(err) {
			return "", &domain.ValidationError{Message: "That creator plan is no longer available."}
		}
		return "", err
	}
	if !plan.Active {
		return "", &domain.ValidationError{Message: "That creator plan is not available right now."}
	}
	if !creatorPlanEligible(plan.Audience, creatorTypes) {
		return "", &domain.ValidationError{Message: "That plan is not available for the creator type you selected."}
	}
	if slug == domain.DefaultCreatorPlanIntentSlug && (plan.Interval != "free" || plan.Prices["default"] != 0) {
		return "", fmt.Errorf("default creator plan %q is not configured as free", domain.DefaultCreatorPlanIntentSlug)
	}
	return plan.Slug, nil
}

// creatorPlanEligible applies the staff-managed catalog audience to the
// creator kinds selected during signup. Mixed creator accounts can choose from
// either side of the catalog; "any" plans are available to every creator.
func creatorPlanEligible(audience string, creatorTypes []string) bool {
	if audience == "any" {
		return true
	}
	for _, creatorType := range creatorTypes {
		isBusinessCreator := creatorType == domain.CreatorBusiness || creatorType == domain.CreatorProperty
		if audience == "business" && isBusinessCreator {
			return true
		}
		if audience == "creator" && !isBusinessCreator {
			return true
		}
	}
	return false
}

// cleanCreatorTypes validates and dedupes creator-type slugs, preserving order.
func cleanCreatorTypes(in []string) ([]string, error) {
	seen := map[string]bool{}
	out := []string{}
	for _, t := range in {
		t = strings.ToLower(strings.TrimSpace(t))
		if t == "" {
			continue
		}
		if !domain.ValidCreatorType(t) {
			return nil, &domain.ValidationError{Message: fmt.Sprintf("Unknown creator type %q.", t)}
		}
		if !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	return out, nil
}

// registerNew inserts a brand-new account. The 18+ check already passed, so it
// records when (adultVerifiedAt) instead of the date of birth, and stores the
// member's acceptance of the current Terms and Privacy Policy.
func (a *AuthService) registerNew(ctx context.Context, identifier string, in RegisterInput, hash string) (*domain.Member, error) {
	member, err := a.newMember(ctx, identifier, in.DisplayName)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	consent := newConsent(in.Platform, now)
	member.PasswordHash = hash
	member.AdultVerifiedAt = now.Format(time.RFC3339)
	member.Consent = &consent
	member.ConsentHistory = []domain.Consent{consent}
	if err := a.members.Insert(ctx, *member); err != nil {
		return nil, err
	}
	return member, nil
}

// ── sign-in ──────────────────────────────────────────────────────────────────

// Login authenticates an existing member and returns a signed session token
// plus the member — or, when two-factor is on (member.MFAEnabled), a 5-minute
// challenge token to complete with MFALogin. Every credential failure returns
// ErrInvalidCredentials; suspension is revealed only once the password has
// been verified. A locked account returns ErrAccountLocked to the sources
// that caused the lock (and to any wrong password); the right password from
// another source still signs in, so nobody can lock the owner out (R01).
func (a *AuthService) Login(ctx context.Context, identifier, password string) (string, *domain.Member, error) {
	identifier = normalizeIdentifier(identifier)
	member, err := a.loginAccount(ctx, identifier)
	if err != nil {
		return "", nil, err
	}
	if member == nil {
		spendPasswordCheck(password) // same cost as a real account: no timing oracle
		a.securityEvent(ctx, logger.EventLoginFailed, "identifier", a.hashIdentifier(identifier), "reason", "unknown_account")
		return "", nil, ErrInvalidCredentials
	}
	locked := isLoginLocked(member, time.Now().UTC())
	if a.loginLockedFor(ctx, member.ID, locked) {
		a.securityEvent(ctx, logger.EventLoginFailed, logger.KeyMemberID, member.ID, "reason", "locked")
		return "", nil, ErrAccountLocked
	}
	if !passwordMatches(member.PasswordHash, password) {
		a.recordLoginFailure(ctx, member, "password")
		if locked {
			return "", nil, ErrAccountLocked
		}
		return "", nil, ErrInvalidCredentials
	}
	if member.Suspended {
		return "", nil, ErrSuspended
	}
	// MFA enrolment turns the password step into a challenge: the client must
	// complete MFALogin with a TOTP/recovery code before a full session issues.
	if member.MFAEnabled {
		challenge, err := a.issueMFAChallenge(ctx, member)
		if err != nil {
			return "", nil, err
		}
		return challenge, member, nil
	}
	a.clearLoginFailures(ctx, member)
	token, err := a.issue(member)
	if err != nil {
		return "", nil, err
	}
	return token, member, nil
}

// loginAccount finds the account an identifier signs in to. It returns
// (nil, nil) for "no usable account": unknown, or a demo identity production
// refuses — the caller answers both exactly like a wrong password.
func (a *AuthService) loginAccount(ctx context.Context, identifier string) (*domain.Member, error) {
	if identifier == "" {
		return nil, nil
	}
	member, err := a.members.ByIdentifier(ctx, identifier)
	if isRepoNotFound(err) || (err == nil && member == nil) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if a.demoBlocked(identifier) || a.demoBlocked(member.Email) {
		a.securityEvent(ctx, logger.EventLoginBlockedDemo, logger.KeyMemberID, member.ID)
		return nil, nil
	}
	return member, nil
}

// recordLoginFailure counts a failed attempt against the account and locks
// sign-in once the failures reach loginLockThreshold.
func (a *AuthService) recordLoginFailure(ctx context.Context, m *domain.Member, reason string) {
	a.loginStrikes.add(m.ID, requestSource(ctx), time.Now())
	n, err := a.members.RecordLoginFailure(ctx, m.ID)
	if err != nil {
		a.log.Error("recording a failed sign-in", logger.KeyMemberID, m.ID, "err", err)
		return
	}
	a.securityEvent(ctx, logger.EventLoginFailed, logger.KeyMemberID, m.ID, "reason", reason, "failures", n)
	if n < loginLockThreshold {
		return
	}
	until := time.Now().UTC().Add(loginLockDuration(m.LoginLockouts)).Format(time.RFC3339)
	if err := a.members.LockLogin(ctx, m.ID, until); err != nil {
		a.log.Error("locking sign-in", logger.KeyMemberID, m.ID, "err", err)
		return
	}
	m.LockedUntil = until
	a.securityEvent(ctx, logger.EventLoginLocked, logger.KeyMemberID, m.ID, "until", until, "lockouts", m.LoginLockouts+1)
}

// clearLoginFailures resets the abuse counters after a successful sign-in,
// skipping the write when there is nothing to clear.
func (a *AuthService) clearLoginFailures(ctx context.Context, m *domain.Member) {
	a.loginStrikes.clear(m.ID)
	if m.FailedLogins == 0 && m.LoginLockouts == 0 && m.LockedUntil == "" && m.MFAChallengeNonce == "" && m.MFAChallengeFailures == 0 {
		return
	}
	if err := a.members.ClearLoginFailures(ctx, m.ID); err != nil {
		a.log.Error("clearing sign-in failures", logger.KeyMemberID, m.ID, "err", err)
		return
	}
	m.FailedLogins, m.LoginLockouts, m.LockedUntil = 0, 0, ""
	m.MFAChallengeNonce, m.MFAChallengeFailures = "", 0
}

// loginLockDuration is how long the next lock lasts after `previous` lockouts
// in a row: 15 minutes, doubling each time, capped at 4 hours.
func loginLockDuration(previous int) time.Duration {
	d := loginLockBase
	for i := 0; i < previous && d < loginLockMax; i++ {
		d *= 2
	}
	return min(d, loginLockMax)
}

// isLoginLocked reports whether sign-in is currently locked for the member.
func isLoginLocked(m *domain.Member, now time.Time) bool {
	if m.LockedUntil == "" {
		return false
	}
	until, err := time.Parse(time.RFC3339, m.LockedUntil)
	return err == nil && now.Before(until)
}

// passwordMatches compares a password with a stored bcrypt hash. An account
// with no password (an unclaimed invitation) never matches, but still spends
// the same bcrypt time as a real comparison.
func passwordMatches(hash, password string) bool {
	if hash == "" {
		spendPasswordCheck(password)
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// dummyPasswordHash is compared against when there is no real hash, so a
// sign-in for an unknown account costs the same as one for a real account.
var dummyPasswordHash = sync.OnceValue(func() []byte {
	h, _ := bcrypt.GenerateFromPassword([]byte("oguaa-no-such-account"), bcrypt.DefaultCost)
	return h
})

func spendPasswordCheck(password string) {
	_ = bcrypt.CompareHashAndPassword(dummyPasswordHash(), []byte(password))
}

// ── contact verification ─────────────────────────────────────────────────────

// StartPhoneVerification generates a short-lived verification code, stores its
// hash on the member record, and delivers it by email or WhatsApp. Outside
// production an undelivered code is returned for display so local development
// stays testable; in production it never is — the member gets
// ErrPhoneCodeUnavailable (phone-only account, no phone channel) or
// ErrCodeNotDelivered instead.
func (a *AuthService) StartPhoneVerification(ctx context.Context, memberID string) (*domain.Member, string, string, error) {
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return nil, "", "", err
	}
	if m.PhoneVerified {
		return m, "", "", nil
	}
	if a.production && strings.TrimSpace(m.Email) == "" && a.otp == nil {
		// Nothing could carry the code: say so before issuing one.
		return nil, "", "", ErrPhoneCodeUnavailable
	}
	code, err := newVerificationCode()
	if err != nil {
		return nil, "", "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", "", err
	}
	expiresAt := time.Now().UTC().Add(phoneVerificationTTL).Format(time.RFC3339)
	if err := a.members.SetPhoneVerification(ctx, m.ID, string(hash), expiresAt); err != nil {
		return nil, "", "", err
	}
	m.PhoneVerificationCodeHash = string(hash)
	m.PhoneVerificationExpiresAt = expiresAt
	m.PhoneVerified = false

	// A code echoed back to the caller is not a second factor, it is just a
	// number the client already had — so once any channel accepted it, it
	// stays out of the response.
	if a.deliverVerificationCode(ctx, m, code) {
		return m, "", expiresAt, nil
	}
	if a.production {
		return nil, "", "", ErrCodeNotDelivered
	}
	a.log.Warn("verification code returned in API response (dev only) — no delivery channel accepted it", logger.KeyMemberID, m.ID)
	return m, code, expiresAt, nil
}

// deliverVerificationCode tries email first (the provisioned channel), then
// WhatsApp, and reports whether a provider accepted the code. A channel that
// is not configured (nil, or a sender reporting "not configured") never
// counts as delivered.
func (a *AuthService) deliverVerificationCode(ctx context.Context, m *domain.Member, code string) bool {
	if a.email != nil && strings.TrimSpace(m.Email) != "" {
		body := fmt.Sprintf("Your Oguaa verification code is %s. It expires in 10 minutes. Do not share it with anyone.", code)
		htmlBody := brandedEmail(emailtmpl.VerificationCode(code, phoneVerificationTTL), body)
		e := a.email.Send(ctx, m.Email, emailtmpl.SubjectVerificationCode, htmlBody)
		if e == nil {
			return true
		}
		a.log.Warn("verification email failed", logger.KeyMemberID, m.ID, "err", e)
	}
	if a.otp != nil && strings.TrimSpace(m.Phone) != "" {
		e := a.otp.SendOTP(ctx, m.Phone, code)
		if e == nil {
			return true
		}
		a.log.Warn("WhatsApp OTP delivery failed", logger.KeyMemberID, m.ID, "err", e)
	}
	return false
}

// ConfirmPhoneVerification checks a verification code and marks the member as
// verified once it matches and hasn't expired yet.
func (a *AuthService) ConfirmPhoneVerification(ctx context.Context, memberID, code string) (*domain.Member, error) {
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return nil, err
	}
	if m.PhoneVerified {
		return m, nil
	}
	if m.PhoneVerificationCodeHash == "" || m.PhoneVerificationExpiresAt == "" {
		return nil, ErrPhoneVerificationNotSetup
	}
	expiresAt, err := time.Parse(time.RFC3339, m.PhoneVerificationExpiresAt)
	if err != nil {
		return nil, ErrPhoneVerificationNotSetup
	}
	if time.Now().UTC().After(expiresAt) {
		return nil, ErrPhoneVerificationExpired
	}
	if bcrypt.CompareHashAndPassword([]byte(m.PhoneVerificationCodeHash), []byte(normalizeVerificationCode(code))) != nil {
		return nil, ErrInvalidPhoneVerificationCode
	}
	if err := a.members.SetPhoneVerified(ctx, m.ID, true); err != nil {
		return nil, err
	}
	m.PhoneVerified = true
	m.PhoneVerificationCodeHash = ""
	m.PhoneVerificationExpiresAt = ""
	return m, nil
}

// ── password reset & change ──────────────────────────────────────────────────

// StartPasswordReset issues a short-lived password-reset code for the account
// matching identifier (the same lookup Login uses), stores its bcrypt hash, and
// delivers it out-of-band via email/WhatsApp. This is also how an invited
// account (no password yet) is claimed. To avoid leaking whether an account
// exists, an unknown identifier — or a demo identity in production — returns
// ErrResetAccountNotFound, which the handler maps to the same generic success.
// In production a phone-number identifier with no phone channel configured is
// refused with ErrPhoneCodeUnavailable before any lookup — the same answer for
// every phone number, so it reveals nothing about which accounts exist; an
// email address with no email provider likewise gets ErrCodeNotDelivered. In
// production a code no channel accepted is withdrawn and ErrCodeNotDelivered
// returned (HTTP 503). Outside production the plaintext code is returned so
// the handler can echo it (mirrors the phone-verification flow); in
// production it is always "".
func (a *AuthService) StartPasswordReset(ctx context.Context, identifier string) (*domain.Member, string, error) {
	if a.production && a.wa == nil && isPhoneIdentifier(identifier) {
		return nil, "", ErrPhoneCodeUnavailable
	}
	// No email provider: refuse every email address alike, before any lookup,
	// so the answer says nothing about which accounts exist.
	if a.production && a.email == nil && !isPhoneIdentifier(identifier) {
		return nil, "", ErrCodeNotDelivered
	}
	m, err := a.resetAccount(ctx, identifier)
	if err != nil {
		return nil, "", err
	}
	code, err := newVerificationCode()
	if err != nil {
		return nil, "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}
	expiresAt := time.Now().UTC().Add(passwordResetTTL).Format(time.RFC3339)
	if err := a.members.SetPasswordReset(ctx, m.ID, string(hash), expiresAt); err != nil {
		return nil, "", err
	}
	m.PasswordResetCodeHash = string(hash)
	m.PasswordResetExpiresAt = expiresAt
	m.PasswordResetAttempts = 0
	a.resetStrikes.clear(m.ID) // a fresh code starts every source's budget over
	delivered := a.deliverResetCode(ctx, m, code)
	if a.production {
		if !delivered {
			// Nothing reached the member: withdraw the code and say so (503),
			// rather than a 200 that promises a code that never comes.
			if err := a.members.SetPasswordReset(ctx, m.ID, "", ""); err != nil {
				return nil, "", err
			}
			return nil, "", ErrCodeNotDelivered
		}
		return m, "", nil
	}
	return m, code, nil
}

// isPhoneIdentifier reports whether a sign-in identifier is a phone number
// (anything that is not an email address).
func isPhoneIdentifier(identifier string) bool {
	identifier = strings.TrimSpace(identifier)
	return identifier != "" && !strings.Contains(identifier, "@")
}

// resetAccount finds the account a reset request targets, answering "no such
// account" (ErrResetAccountNotFound) for unknown identifiers and, in
// production, for the demo identities.
func (a *AuthService) resetAccount(ctx context.Context, identifier string) (*domain.Member, error) {
	identifier = normalizeIdentifier(identifier)
	if identifier == "" || a.demoBlocked(identifier) {
		return nil, ErrResetAccountNotFound
	}
	m, err := a.members.ByIdentifier(ctx, identifier)
	if isRepoNotFound(err) || (err == nil && m == nil) {
		return nil, ErrResetAccountNotFound
	}
	if err != nil {
		return nil, err
	}
	if a.demoBlocked(m.Email) {
		return nil, ErrResetAccountNotFound
	}
	return m, nil
}

// ConfirmPasswordReset checks a reset code and, when it matches and hasn't
// expired, sets the new password, clears the reset state, lifts any sign-in
// lock and signs out every existing session. It never issues a session — the
// member signs in fresh with the new password. Each source gets
// maxCodeAttempts guesses at a code; after resetCodeMaxGuesses wrong guesses
// in total the code is thrown away and a new one must be requested.
func (a *AuthService) ConfirmPasswordReset(ctx context.Context, identifier, code, newPassword string) error {
	if len(newPassword) < minPasswordLen {
		return ErrResetPasswordTooShort
	}
	m, err := a.resetAccount(ctx, identifier)
	if errors.Is(err, ErrResetAccountNotFound) {
		// Don't reveal non-existence — treat as "no reset in progress".
		return ErrResetNotStarted
	}
	if err != nil {
		return err
	}
	if err := a.checkResetCode(ctx, m, code); err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := a.members.SetPasswordHash(ctx, m.ID, string(hash)); err != nil {
		return err
	}
	// Clear the reset state so the code can't be reused.
	if err := a.members.SetPasswordReset(ctx, m.ID, "", ""); err != nil {
		return err
	}
	// Whoever held a session before the reset — possibly the reason for it —
	// is signed out, and a proven reset lifts any sign-in lock.
	if _, err := a.members.BumpTokenVersion(ctx, m.ID); err != nil {
		return err
	}
	if err := a.members.ClearLoginFailures(ctx, m.ID); err != nil {
		return err
	}
	a.loginStrikes.clear(m.ID)
	a.resetStrikes.clear(m.ID)
	a.securityEvent(ctx, logger.EventPasswordReset, logger.KeyMemberID, m.ID, "claimedInvite", m.PasswordHash == "")
	return nil
}

// checkResetCode validates a reset code. A source that has used up its
// maxCodeAttempts guesses is refused without a check; other wrong guesses are
// counted, and the code is thrown away once they reach resetCodeMaxGuesses in
// total — so a stranger's guesses never spend the owner's own attempts.
func (a *AuthService) checkResetCode(ctx context.Context, m *domain.Member, code string) error {
	if m.PasswordResetCodeHash == "" || m.PasswordResetExpiresAt == "" {
		return ErrResetNotStarted
	}
	source := requestSource(ctx)
	if a.resetStrikes.count(m.ID, source, time.Now()) >= maxCodeAttempts {
		return ErrInvalidResetCode
	}
	expiresAt, err := time.Parse(time.RFC3339, m.PasswordResetExpiresAt)
	if err != nil {
		return ErrResetNotStarted
	}
	if time.Now().UTC().After(expiresAt) {
		return ErrResetExpired
	}
	if bcrypt.CompareHashAndPassword([]byte(m.PasswordResetCodeHash), []byte(normalizeVerificationCode(code))) == nil {
		return nil
	}
	a.resetStrikes.add(m.ID, source, time.Now())
	n, err := a.members.RecordPasswordResetFailure(ctx, m.ID)
	if err != nil {
		return err
	}
	if n >= resetCodeMaxGuesses {
		if err := a.members.SetPasswordReset(ctx, m.ID, "", ""); err != nil {
			return err
		}
		a.securityEvent(ctx, logger.EventResetCodeKilled, logger.KeyMemberID, m.ID, "attempts", n)
	}
	return ErrInvalidResetCode
}

// deliverResetCode mirrors notifyOutOfBand: emails and/or WhatsApps the reset
// code to the account's reachable channels, and reports whether any provider
// accepted it. Failures are logged; in dev the handler echoes the code so the
// flow stays testable, and production answers 503 when nothing was delivered.
func (a *AuthService) deliverResetCode(ctx context.Context, m *domain.Member, code string) bool {
	body := fmt.Sprintf("Your Oguaa password reset code is %s. It expires in 10 minutes. Do not share it.", code)
	delivered := false
	if a.email != nil && strings.TrimSpace(m.Email) != "" {
		htmlBody := brandedEmail(emailtmpl.PasswordResetCode(code, passwordResetTTL), body)
		if e := a.email.Send(ctx, m.Email, emailtmpl.SubjectPasswordReset, htmlBody); e != nil {
			a.log.Warn("password-reset email failed", logger.KeyMemberID, m.ID, "err", e)
		} else {
			delivered = true
		}
	}
	if a.wa != nil && strings.TrimSpace(m.Phone) != "" {
		if e := a.wa.SendMessage(ctx, m.Phone, body); e != nil {
			a.log.Warn("password-reset whatsapp failed", logger.KeyMemberID, m.ID, "err", e)
		} else {
			delivered = true
		}
	}
	return delivered
}

// ChangePassword re-verifies the signed-in member's current password, then sets
// a new one (self-service credential rotation). The new password must clear the
// same length floor as sign-up. Every existing session — including the one
// making the request — is revoked; the returned token is a fresh session for
// the caller to continue with.
func (a *AuthService) ChangePassword(ctx context.Context, memberID, currentPassword, newPassword string) (string, error) {
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return "", err
	}
	if m.PasswordHash == "" {
		return "", ErrNoPassword
	}
	if bcrypt.CompareHashAndPassword([]byte(m.PasswordHash), []byte(currentPassword)) != nil {
		return "", ErrCurrentPasswordWrong
	}
	if len(newPassword) < minPasswordLen {
		return "", ErrResetPasswordTooShort
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	if err := a.members.SetPasswordHash(ctx, m.ID, string(hash)); err != nil {
		return "", err
	}
	m.PasswordHash = string(hash)
	token, err := a.rotateSessions(ctx, m)
	if err != nil {
		return "", err
	}
	a.securityEvent(ctx, logger.EventPasswordChanged, logger.KeyMemberID, m.ID)
	return token, nil
}

// ── helpers ──────────────────────────────────────────────────────────────────

// NormalizeIdentifier is the canonical form of a sign-in identifier: trimmed,
// and lower-cased when it is an email. Rate limits key on it.
func NormalizeIdentifier(s string) string { return normalizeIdentifier(s) }

func normalizeIdentifier(s string) string {
	s = strings.TrimSpace(s)
	if strings.Contains(s, "@") {
		return strings.ToLower(s)
	}
	return s
}

// isRepoNotFound reports whether a repository error is a not-found.
func isRepoNotFound(err error) bool {
	var nf *domain.NotFoundError
	return errors.As(err, &nf)
}

func newVerificationCode() (string, error) {
	var n uint32
	if err := binary.Read(crypto_rand.Reader, binary.BigEndian, &n); err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n%1_000_000), nil
}

func normalizeVerificationCode(code string) string {
	var b strings.Builder
	b.Grow(len(code))
	for _, r := range strings.TrimSpace(code) {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// isAdult reports whether someone born on dob ("YYYY-MM-DD") is at least
// minSignupAge as of now. A malformed/empty date is treated as not-adult so the
// gate fails closed (spec §14.4).
func isAdult(dob string, now time.Time) bool {
	born, err := time.Parse(time.DateOnly, strings.TrimSpace(dob))
	if err != nil {
		return false
	}
	return adultOn(born, now)
}

// adultOn reports whether someone born on `born` is at least minSignupAge on `now`.
func adultOn(born, now time.Time) bool {
	years := now.Year() - born.Year()
	// Subtract a year if this year's birthday hasn't happened yet.
	if now.Month() < born.Month() || (now.Month() == born.Month() && now.Day() < born.Day()) {
		years--
	}
	return years >= minSignupAge
}

// newMember builds a fresh member record. The id is random rather than derived
// from the name (ids end up in logs), and the slug is checked to be free.
func (a *AuthService) newMember(ctx context.Context, identifier, displayName string) (*domain.Member, error) {
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = "New member"
	}
	slug, err := UniqueMemberSlug(ctx, a.members, name)
	if err != nil {
		return nil, err
	}
	id, err := newMemberID()
	if err != nil {
		return nil, err
	}
	m := &domain.Member{
		ID:          id,
		Slug:        slug,
		DisplayName: name,
		Initials:    initialsOf(name),
		SchoolIDs:   []string{},
		// Password signups haven't verified a phone; the field stays for a
		// future phone-verification flow.
		PhoneVerified: false,
		Role:          domain.RoleMember,
		JoinedAt:      time.Now().UTC().Format(time.DateOnly),
	}
	if strings.Contains(identifier, "@") {
		m.Email = identifier
	} else {
		m.Phone = identifier
	}
	return m, nil
}

// newMemberID mints a random member id ("usr-" + 16 hex characters).
func newMemberID() (string, error) {
	var b [8]byte
	if _, err := crypto_rand.Read(b[:]); err != nil {
		return "", err
	}
	return fmt.Sprintf("usr-%x", b), nil
}

// memberSlugAttempts bounds how many random suffixes UniqueMemberSlug tries.
const memberSlugAttempts = 10

// UniqueMemberSlug returns a profile slug for name that no member holds yet:
// the slugified name plus a random six-digit suffix, redrawn on a collision.
// Profiles, follows and blocks all resolve members by slug, so two members
// must never share one.
func UniqueMemberSlug(ctx context.Context, members domain.MemberRepository, name string) (string, error) {
	base := slugify(name)
	if base == "" {
		base = "member"
	}
	for range memberSlugAttempts {
		suffix, err := newVerificationCode()
		if err != nil {
			return "", err
		}
		slug := base + "-" + suffix
		existing, err := members.BySlug(ctx, slug)
		if isRepoNotFound(err) || (err == nil && existing == nil) {
			return slug, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", errors.New("could not find a free profile address — please try again")
}

func initialsOf(name string) string {
	parts := strings.Fields(name)
	out := ""
	for i, p := range parts {
		if i >= 2 {
			break
		}
		r, _ := utf8.DecodeRuneInString(p)
		out += strings.ToUpper(string(r))
	}
	if out == "" {
		return "?"
	}
	return out
}
