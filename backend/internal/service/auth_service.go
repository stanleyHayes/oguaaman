package service

import (
	"context"
	crypto_rand "crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
)

// ErrUnderage is returned when a new self-registration is under 18 (spec §14.4).
var ErrUnderage = errors.New("you must be 18 or older to join")

// ErrInvalidCredentials is returned for an unknown identifier or wrong password.
var ErrInvalidCredentials = errors.New("invalid identifier or password")

// ErrIdentifierTaken is returned when registering an identifier whose account
// already has a password.
var ErrIdentifierTaken = errors.New("an account already exists for that identifier")

// ErrNoPassword is returned when the account exists but has no password yet —
// pre-password accounts are claimed through the Join/Register flow.
var ErrNoPassword = errors.New("this account has no password yet")

// ErrSuspended is returned when a suspended account tries to sign in.
var ErrSuspended = errors.New("this account is suspended")

// ErrInvalidMFACode is returned when a TOTP/recovery code doesn't match.
var ErrInvalidMFACode = errors.New("that code didn't work — check your authenticator app and try again")

// ErrMFANotSetup is returned when MFA is touched before enrolment.
var ErrMFANotSetup = errors.New("two-factor authentication isn't set up on this account")

// ErrInvalidChallenge is returned for an expired/forged MFA login challenge.
var ErrInvalidChallenge = errors.New("your sign-in challenge expired — please sign in again")

// ErrPhoneVerificationNotSetup is returned when a verification code is checked
// before one was issued.
var ErrPhoneVerificationNotSetup = errors.New("phone verification hasn't been started on this account")

// ErrPhoneVerificationExpired is returned when the verification code has timed out.
var ErrPhoneVerificationExpired = errors.New("that verification code expired — please request a new one")

// ErrInvalidPhoneVerificationCode is returned when the verification code doesn't match.
var ErrInvalidPhoneVerificationCode = errors.New("that verification code didn't work")

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

// AuthService implements password-based sign-in → JWT sessions (spec §8.1, §9).
type AuthService struct {
	members domain.MemberRepository
	plans   domain.PlanRepository
	secret  []byte
	otp     OTPSender // nil = return code in response (dev mode)
	// email/wa deliver password-reset codes out-of-band (mirrors notifyOutOfBand).
	// Either may be nil; in dev the code is echoed by the handler instead.
	email EmailSender
	wa    MessageSender
	log   *slog.Logger
}

// OTPSender delivers a one-time code to a phone number out-of-band.
// Implement with infra/whatsapp.Client for production.
type OTPSender interface {
	SendOTP(ctx context.Context, phone, code string) error
}

func NewAuthService(members domain.MemberRepository, secret string) *AuthService {
	return &AuthService{members: members, secret: []byte(secret), log: slog.Default()}
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

// Register signs up a new member — or lets a pre-existing passwordless account
// (e.g. an invited one) claim itself — and returns a signed JWT plus the member.
// dateOfBirth ("YYYY-MM-DD") is required for first-time sign-ups and enforces the
// 18+ self-registration gate (spec §14.4). creatorTypes may name the creator
// kinds the member joins with (Creator Platform plan §3); empty = plain citizen.
// creatorPlanIntent is validated against the active catalog and defaults to
// Starter for creators. It never grants paid entitlement.
func (a *AuthService) Register(ctx context.Context, identifier, displayName, dateOfBirth, password string, creatorTypes []string, creatorPlanIntent string) (string, *domain.Member, error) {
	identifier = normalizeIdentifier(identifier)
	if identifier == "" {
		return "", nil, fmt.Errorf("a phone number or email is required")
	}
	if len(password) < minPasswordLen {
		return "", nil, fmt.Errorf("password must be at least %d characters", minPasswordLen)
	}
	types, err := cleanCreatorTypes(creatorTypes)
	if err != nil {
		return "", nil, err
	}
	planIntent, err := a.resolveCreatorPlanIntent(ctx, types, creatorPlanIntent)
	if err != nil {
		return "", nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", nil, err
	}

	member, err := a.members.ByIdentifier(ctx, identifier)
	var nf *domain.NotFoundError
	switch {
	case errors.As(err, &nf):
		member, err = a.registerNew(ctx, identifier, displayName, strings.TrimSpace(dateOfBirth), string(hash))
	case err != nil:
		return "", nil, err
	case member.PasswordHash != "":
		return "", nil, ErrIdentifierTaken
	default:
		member, err = a.claimAccount(ctx, member, displayName, strings.TrimSpace(dateOfBirth), string(hash))
	}
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

// resolveCreatorPlanIntent validates a creator's onboarding preference before
// any account is inserted or claimed. Citizens carry no plan intent. An active
// paid plan may be remembered, but no entitlement is created here.
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
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
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
			return nil, fmt.Errorf("unknown creator type %q", t)
		}
		if !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	return out, nil
}

// registerNew creates a brand-new account, enforcing the 18+ gate.
func (a *AuthService) registerNew(ctx context.Context, identifier, displayName, dateOfBirth, hash string) (*domain.Member, error) {
	if dateOfBirth == "" {
		return nil, fmt.Errorf("please enter your date of birth to join")
	}
	if !isAdult(dateOfBirth, time.Now().UTC()) {
		return nil, ErrUnderage
	}
	member := newMember(identifier, displayName, dateOfBirth)
	member.PasswordHash = hash
	if err := a.members.Insert(ctx, *member); err != nil {
		return nil, err
	}
	return member, nil
}

// claimAccount sets a first password on a pre-existing passwordless account
// (e.g. an invited one), filling in name/DOB when supplied.
func (a *AuthService) claimAccount(ctx context.Context, member *domain.Member, displayName, dateOfBirth, hash string) (*domain.Member, error) {
	if dateOfBirth != "" && !isAdult(dateOfBirth, time.Now().UTC()) {
		return nil, ErrUnderage
	}
	if name := strings.TrimSpace(displayName); name != "" && name != member.DisplayName {
		if err := a.members.SetProfile(ctx, member.ID, name, initialsOf(name), member.Bio); err != nil {
			return nil, err
		}
		member.DisplayName = name
		member.Initials = initialsOf(name)
	}
	if dateOfBirth != "" && dateOfBirth != member.DateOfBirth {
		if err := a.members.SetDateOfBirth(ctx, member.ID, dateOfBirth); err != nil {
			return nil, err
		}
		member.DateOfBirth = dateOfBirth
	}
	if err := a.members.SetPasswordHash(ctx, member.ID, hash); err != nil {
		return nil, err
	}
	member.PasswordHash = hash
	return member, nil
}

// Login authenticates an existing member and returns a signed JWT plus the member.
func (a *AuthService) Login(ctx context.Context, identifier, password string) (string, *domain.Member, error) {
	identifier = normalizeIdentifier(identifier)
	member, err := a.members.ByIdentifier(ctx, identifier)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			return "", nil, ErrInvalidCredentials
		}
		return "", nil, err
	}
	if member.Suspended {
		return "", nil, ErrSuspended
	}
	if member.PasswordHash == "" {
		return "", nil, ErrNoPassword
	}
	if bcrypt.CompareHashAndPassword([]byte(member.PasswordHash), []byte(password)) != nil {
		return "", nil, ErrInvalidCredentials
	}
	// MFA enrolment turns the password step into a challenge: the client must
	// complete MFALogin with a TOTP/recovery code before a full session issues.
	if member.MFAEnabled {
		challenge, err := a.issueMFAChallenge(member)
		if err != nil {
			return "", nil, err
		}
		return challenge, member, nil
	}
	token, err := a.issue(member)
	if err != nil {
		return "", nil, err
	}
	return token, member, nil
}

// StartPhoneVerification generates a short-lived verification code, stores its
// hash on the member record, and delivers it via WhatsApp when an OTPSender is
// configured. In dev mode (no sender) the code is returned for display.
func (a *AuthService) StartPhoneVerification(ctx context.Context, memberID string) (*domain.Member, string, string, error) {
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return nil, "", "", err
	}
	if m.PhoneVerified {
		return m, "", "", nil
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

	// Deliver OTP via WhatsApp when a sender is configured.
	// In dev/sim mode (no sender) the code is returned in the response.
	if a.otp != nil && m.Phone != "" {
		if serr := a.otp.SendOTP(ctx, m.Phone, code); serr == nil {
			// Code delivered out-of-band — suppress it from the response.
			return m, "", expiresAt, nil
		} else {
			// Delivery failed; fall through so the caller still gets a code.
			// This is a degraded-mode fallback — log so ops can investigate.
			a.log.Warn("WhatsApp OTP delivery failed; falling back to in-response code", "err", serr)
		}
	}
	return m, code, expiresAt, nil
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

// StartPasswordReset issues a short-lived password-reset code for the account
// matching identifier (the same lookup Login uses), stores its bcrypt hash, and
// delivers it out-of-band via email/WhatsApp. To avoid leaking whether an
// account exists, an unknown identifier returns ErrResetAccountNotFound, which
// the handler maps to the same generic success. The plaintext code is returned
// so the handler can echo it in dev (mirrors the phone-verification flow).
func (a *AuthService) StartPasswordReset(ctx context.Context, identifier string) (*domain.Member, string, error) {
	identifier = normalizeIdentifier(identifier)
	m, err := a.members.ByIdentifier(ctx, identifier)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			return nil, "", ErrResetAccountNotFound
		}
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
	a.deliverResetCode(ctx, m, code)
	return m, code, nil
}

// ConfirmPasswordReset checks a reset code and, when it matches and hasn't
// expired, sets a new password and clears the reset state. It never issues a
// session — the member signs in fresh with the new password.
func (a *AuthService) ConfirmPasswordReset(ctx context.Context, identifier, code, newPassword string) error {
	identifier = normalizeIdentifier(identifier)
	m, err := a.members.ByIdentifier(ctx, identifier)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			// Don't reveal non-existence — treat as "no reset in progress".
			return ErrResetNotStarted
		}
		return err
	}
	if m.PasswordResetCodeHash == "" || m.PasswordResetExpiresAt == "" {
		return ErrResetNotStarted
	}
	expiresAt, err := time.Parse(time.RFC3339, m.PasswordResetExpiresAt)
	if err != nil {
		return ErrResetNotStarted
	}
	if time.Now().UTC().After(expiresAt) {
		return ErrResetExpired
	}
	if bcrypt.CompareHashAndPassword([]byte(m.PasswordResetCodeHash), []byte(normalizeVerificationCode(code))) != nil {
		return ErrInvalidResetCode
	}
	if len(newPassword) < minPasswordLen {
		return ErrResetPasswordTooShort
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
	return nil
}

// deliverResetCode mirrors notifyOutOfBand: emails and/or WhatsApps the reset
// code to the account's reachable channels. Failures are logged, not fatal —
// in dev the handler echoes the code so the flow stays testable.
func (a *AuthService) deliverResetCode(ctx context.Context, m *domain.Member, code string) {
	body := fmt.Sprintf("Your Oguaa password reset code is %s. It expires in 10 minutes. Do not share it.", code)
	if a.email != nil && strings.TrimSpace(m.Email) != "" {
		htmlBody := "<p>" + html.EscapeString(body) + "</p>"
		if e := a.email.Send(ctx, m.Email, "Your Oguaa password reset code", htmlBody); e != nil {
			a.log.Warn("password-reset email failed", "memberId", m.ID, "err", e)
		}
	}
	if a.wa != nil && strings.TrimSpace(m.Phone) != "" {
		if e := a.wa.SendMessage(ctx, m.Phone, body); e != nil {
			a.log.Warn("password-reset whatsapp failed", "memberId", m.ID, "err", e)
		}
	}
}

// DeleteAccount verifies the member's password, then anonymises the account
// (Act 843 right to erasure, spec §14.2): personal data is wiped and the
// account is suspended, ending all access. Published content stays live under
// a "Former member" owner.
func (a *AuthService) DeleteAccount(ctx context.Context, memberID, password string) error {
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return err
	}
	if m.PasswordHash == "" || bcrypt.CompareHashAndPassword([]byte(m.PasswordHash), []byte(password)) != nil {
		return ErrInvalidCredentials
	}
	return a.members.Anonymize(ctx, m.ID)
}

// ChangePassword re-verifies the signed-in member's current password, then sets
// a new one (self-service credential rotation). The new password must clear the
// same length floor as sign-up. It does not rotate the session — the caller's
// existing JWT stays valid.
func (a *AuthService) ChangePassword(ctx context.Context, memberID, currentPassword, newPassword string) error {
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return err
	}
	if m.PasswordHash == "" {
		return ErrNoPassword
	}
	if bcrypt.CompareHashAndPassword([]byte(m.PasswordHash), []byte(currentPassword)) != nil {
		return ErrCurrentPasswordWrong
	}
	if len(newPassword) < minPasswordLen {
		return ErrResetPasswordTooShort
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := a.members.SetPasswordHash(ctx, m.ID, string(hash)); err != nil {
		return err
	}
	m.PasswordHash = string(hash)
	return nil
}

// ── MFA (TOTP — spec §14; authenticator apps) ────────────────────────────────

// mfaChallengeTTL bounds the password→code window at sign-in.
const mfaChallengeTTL = 5 * time.Minute

// mfaRecoveryCount is how many one-time backup codes enrolment issues.
const mfaRecoveryCount = 8

// MFASetup generates a fresh TOTP secret for the member (not yet enabled —
// MFAConfirm turns it on) and returns the secret plus the account label for
// the otpauth:// URL the client renders as a QR.
func (a *AuthService) MFASetup(ctx context.Context, memberID string) (secret, account string, err error) {
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return "", "", err
	}
	secret, err = newTOTPSecret()
	if err != nil {
		return "", "", err
	}
	if err := a.members.SetMFA(ctx, m.ID, false, secret, nil); err != nil {
		return "", "", err
	}
	account = m.Email
	if account == "" {
		account = m.Phone
	}
	return secret, account, nil
}

// MFAConfirm verifies the first code from the member's authenticator, enables
// MFA, and returns the one-time recovery codes (shown once, stored as bcrypt
// hashes).
func (a *AuthService) MFAConfirm(ctx context.Context, memberID, code string) ([]string, error) {
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return nil, err
	}
	if m.TOTPSecret == "" {
		return nil, ErrMFANotSetup
	}
	if !validTOTP(m.TOTPSecret, code, time.Now()) {
		return nil, ErrInvalidMFACode
	}
	codes := make([]string, 0, mfaRecoveryCount)
	hashes := make([]string, 0, mfaRecoveryCount)
	for range mfaRecoveryCount {
		c, err := newRecoveryCode()
		if err != nil {
			return nil, err
		}
		h, err := bcrypt.GenerateFromPassword([]byte(normalizeRecovery(c)), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		codes = append(codes, c)
		hashes = append(hashes, string(h))
	}
	if err := a.members.SetMFA(ctx, m.ID, true, m.TOTPSecret, hashes); err != nil {
		return nil, err
	}
	return codes, nil
}

// MFALogin completes an MFA-gated sign-in: validates the short-lived challenge
// from Login, checks the TOTP or an unused recovery code, and issues the full
// session token.
func (a *AuthService) MFALogin(ctx context.Context, challenge, code string) (string, *domain.Member, error) {
	id, err := a.ParseMFAChallenge(challenge)
	if err != nil {
		return "", nil, ErrInvalidChallenge
	}
	m, err := a.members.ByID(ctx, id)
	if err != nil {
		return "", nil, ErrInvalidChallenge
	}
	if m.Suspended {
		return "", nil, ErrSuspended
	}
	if !m.MFAEnabled || m.TOTPSecret == "" {
		return "", nil, ErrMFANotSetup
	}
	if !a.checkMFACode(ctx, m, code) {
		return "", nil, ErrInvalidMFACode
	}
	token, err := a.issue(m)
	if err != nil {
		return "", nil, err
	}
	return token, m, nil
}

// MFADisable turns MFA off after re-verifying a current TOTP or recovery code.
func (a *AuthService) MFADisable(ctx context.Context, memberID, code string) error {
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return err
	}
	if !m.MFAEnabled {
		return ErrMFANotSetup
	}
	if !a.checkMFACode(ctx, m, code) {
		return ErrInvalidMFACode
	}
	return a.members.SetMFA(ctx, m.ID, false, "", nil)
}

// checkMFACode accepts a live TOTP, or an unused recovery code (consuming it).
func (a *AuthService) checkMFACode(ctx context.Context, m *domain.Member, code string) bool {
	if validTOTP(m.TOTPSecret, code, time.Now()) {
		return true
	}
	norm := normalizeRecovery(code)
	if norm == "" {
		return false
	}
	for i, h := range m.MFARecoveryHashes {
		if bcrypt.CompareHashAndPassword([]byte(h), []byte(norm)) == nil {
			remaining := append([]string{}, m.MFARecoveryHashes[:i]...)
			remaining = append(remaining, m.MFARecoveryHashes[i+1:]...)
			_ = a.members.SetMFA(ctx, m.ID, true, m.TOTPSecret, remaining)
			return true
		}
	}
	return false
}

// issueMFAChallenge signs the 5-minute token that holds a password-verified
// member between the password step and the code step. The "mfa" claim makes
// ParseToken reject it, so it can never act as a session.
func (a *AuthService) issueMFAChallenge(m *domain.Member) (string, error) {
	claims := jwt.MapClaims{
		"sub": m.ID,
		"mfa": "pending",
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(mfaChallengeTTL).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.secret)
}

// ParseMFAChallenge validates a challenge token issued by issueMFAChallenge.
func (a *AuthService) ParseMFAChallenge(token string) (string, error) {
	claims, err := a.parseClaims(token)
	if err != nil {
		return "", err
	}
	if claims["mfa"] != "pending" {
		return "", fmt.Errorf("not an mfa challenge")
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return "", fmt.Errorf("no subject")
	}
	return sub, nil
}

func (a *AuthService) issue(m *domain.Member) (string, error) {
	claims := jwt.MapClaims{
		"sub":  m.ID,
		"role": m.Role,
		"name": m.DisplayName,
		"iat":  time.Now().Unix(),
		"exp":  time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.secret)
}

// ParseToken validates a session JWT and returns the member id (subject).
// MFA challenge tokens (mfa=pending) are explicitly rejected — they are not
// sessions, only a 5-minute pass between the password and code steps.
func (a *AuthService) ParseToken(token string) (string, error) {
	claims, err := a.parseClaims(token)
	if err != nil {
		return "", err
	}
	if _, isChallenge := claims["mfa"]; isChallenge {
		return "", fmt.Errorf("mfa challenge token is not a session")
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return "", fmt.Errorf("no subject")
	}
	return sub, nil
}

// parseClaims verifies signature + expiry and returns the token claims.
func (a *AuthService) parseClaims(token string) (jwt.MapClaims, error) {
	parsed, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return a.secret, nil
	})
	if err != nil || !parsed.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid claims")
	}
	return claims, nil
}

// ── helpers ──────────────────────────────────────────────────────────────────

func normalizeIdentifier(s string) string {
	s = strings.TrimSpace(s)
	if strings.Contains(s, "@") {
		return strings.ToLower(s)
	}
	return s
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
	born, err := time.Parse("2006-01-02", strings.TrimSpace(dob))
	if err != nil {
		return false
	}
	years := now.Year() - born.Year()
	// Subtract a year if this year's birthday hasn't happened yet.
	if now.Month() < born.Month() || (now.Month() == born.Month() && now.Day() < born.Day()) {
		years--
	}
	return years >= minSignupAge
}

func newMember(identifier, displayName, dateOfBirth string) *domain.Member {
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = "New member"
	}
	isEmail := strings.Contains(identifier, "@")
	base := slugify(name)
	if base == "" {
		base = "member"
	}
	id := "usr-" + base + "-" + fmt.Sprintf("%d", time.Now().UnixNano()%1_000_000)
	m := &domain.Member{
		ID:          id,
		Slug:        base + "-" + fmt.Sprintf("%d", time.Now().UnixNano()%10_000),
		DisplayName: name,
		Initials:    initialsOf(name),
		SchoolIDs:   []string{},
		// Password signups haven't verified a phone; the field stays for a
		// future phone-verification flow.
		PhoneVerified: false,
		Role:          domain.RoleMember,
		JoinedAt:      time.Now().UTC().Format("2006-01-02"),
		DateOfBirth:   strings.TrimSpace(dateOfBirth),
		// Seed the (broadcastable) birthday from the sign-up date of birth so
		// the member's /me birthday field is pre-filled rather than empty.
		// Broadcast stays off by default — it's the member's to opt into.
		Birthday: strings.TrimSpace(dateOfBirth),
	}
	if isEmail {
		m.Email = identifier
	} else {
		m.Phone = identifier
	}
	return m
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
