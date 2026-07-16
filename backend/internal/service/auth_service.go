package service

import (
	crypto_rand "crypto/rand"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
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

// minSignupAge is the self-registration floor; minors join only via a guardian
// (a deferred flow). See spec §14.4.
const minSignupAge = 18

// minPasswordLen is the floor for password sign-up.
const minPasswordLen = 8

// phoneVerificationTTL bounds the contact-verification window.
const phoneVerificationTTL = 10 * time.Minute

// AuthService implements password-based sign-in → JWT sessions (spec §8.1, §9).
type AuthService struct {
	members domain.MemberRepository
	secret  []byte
}

func NewAuthService(members domain.MemberRepository, secret string) *AuthService {
	return &AuthService{members: members, secret: []byte(secret)}
}

// Register signs up a new member — or lets a pre-existing passwordless account
// (e.g. an invited one) claim itself — and returns a signed JWT plus the member.
// dateOfBirth ("YYYY-MM-DD") is required for first-time sign-ups and enforces the
// 18+ self-registration gate (spec §14.4). creatorTypes may name the creator
// kinds the member joins with (Creator Platform plan §3); empty = plain citizen.
func (a *AuthService) Register(ctx context.Context, identifier, displayName, dateOfBirth, password string, creatorTypes []string) (string, *domain.Member, error) {
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
	}

	token, err := a.issue(member)
	if err != nil {
		return "", nil, err
	}
	return token, member, nil
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
// hash on the member record, and returns the code so the caller can deliver it
// out-of-band (or display it in dev mode where no SMS/WhatsApp provider exists).
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
