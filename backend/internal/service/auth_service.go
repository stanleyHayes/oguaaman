package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

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

// minSignupAge is the self-registration floor; minors join only via a guardian
// (a deferred flow). See spec §14.4.
const minSignupAge = 18

// minPasswordLen is the floor for password sign-up.
const minPasswordLen = 8

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
	token, err := a.issue(member)
	if err != nil {
		return "", nil, err
	}
	return token, member, nil
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

// ParseToken validates a JWT and returns the member id (subject).
func (a *AuthService) ParseToken(token string) (string, error) {
	parsed, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return a.secret, nil
	})
	if err != nil || !parsed.Valid {
		return "", fmt.Errorf("invalid token")
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return "", fmt.Errorf("invalid claims")
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return "", fmt.Errorf("no subject")
	}
	return sub, nil
}

// ── helpers ──────────────────────────────────────────────────────────────────

func normalizeIdentifier(s string) string {
	s = strings.TrimSpace(s)
	if strings.Contains(s, "@") {
		return strings.ToLower(s)
	}
	return s
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
		out += strings.ToUpper(p[:1])
	}
	if out == "" {
		return "?"
	}
	return out
}
