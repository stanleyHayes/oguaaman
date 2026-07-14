package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/oguaa/backend/internal/domain"
)

// ErrInvalidOTP is returned for a wrong/expired/missing code.
var ErrInvalidOTP = errors.New("invalid or expired code")

// ErrUnderage is returned when a new self-registration is under 18 (spec §14.4).
var ErrUnderage = errors.New("you must be 18 or older to join")

// minSignupAge is the self-registration floor; minors join only via a guardian
// (a deferred flow). See spec §14.4.
const minSignupAge = 18

// OTPSender delivers a code to a phone/email. The dev impl logs it; a real
// provider (Twilio, Hubtel for Ghana, WhatsApp Business) implements this.
type OTPSender interface {
	Send(ctx context.Context, identifier, code string) error
}

type LogOTPSender struct{ Log *slog.Logger }

func (s LogOTPSender) Send(_ context.Context, identifier, code string) error {
	s.Log.Info("OTP issued (dev — no SMS provider configured)", "identifier", identifier, "code", code)
	return nil
}

// AuthService implements passwordless phone/email OTP → JWT sessions (spec §8.1, §9).
type AuthService struct {
	members domain.MemberRepository
	otps    domain.OtpRepository
	sender  OTPSender
	secret  []byte
	ttl     time.Duration
	devMode bool // when true, RequestOTP returns the code (no real delivery in dev)
}

func NewAuthService(members domain.MemberRepository, otps domain.OtpRepository, sender OTPSender, secret string, ttlMin int, devMode bool) *AuthService {
	return &AuthService{
		members: members, otps: otps, sender: sender,
		secret: []byte(secret), ttl: time.Duration(ttlMin) * time.Minute, devMode: devMode,
	}
}

// RequestOTP generates and "sends" a code for the identifier. Returns the code
// itself only in dev mode (so the UI/curl can complete the flow without SMS).
// dateOfBirth ("YYYY-MM-DD") is required for first-time sign-ups and enforces the
// 18+ self-registration gate (spec §14.4); returning members may omit it.
func (a *AuthService) RequestOTP(ctx context.Context, identifier, displayName, dateOfBirth string) (string, error) {
	identifier = normalizeIdentifier(identifier)
	if identifier == "" {
		return "", fmt.Errorf("a phone number or email is required")
	}
	dateOfBirth = strings.TrimSpace(dateOfBirth)
	if err := a.checkSignupAge(ctx, identifier, dateOfBirth); err != nil {
		return "", err
	}
	code := random6()
	o := domain.OTP{
		Identifier:  identifier,
		CodeHash:    sha256hex(code),
		DisplayName: strings.TrimSpace(displayName),
		DateOfBirth: dateOfBirth,
		ExpiresAt:   time.Now().Add(a.ttl).UTC().Format(time.RFC3339),
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	if err := a.otps.Upsert(ctx, o); err != nil {
		return "", err
	}
	if err := a.sender.Send(ctx, identifier, code); err != nil {
		return "", err
	}
	if a.devMode {
		return code, nil
	}
	return "", nil
}

// checkSignupAge enforces the 18+ gate for first-time sign-ups (spec §14.4).
// Returning members already exist and don't re-supply their date of birth.
func (a *AuthService) checkSignupAge(ctx context.Context, identifier, dateOfBirth string) error {
	if _, err := a.members.ByIdentifier(ctx, identifier); err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			if dateOfBirth == "" {
				return fmt.Errorf("please enter your date of birth to join")
			}
			if !isAdult(dateOfBirth, time.Now().UTC()) {
				return ErrUnderage
			}
		}
	}
	return nil
}

// VerifyOTP checks the code, finds or creates the member, marks the phone
// verified, and returns a signed JWT plus the member.
func (a *AuthService) VerifyOTP(ctx context.Context, identifier, code string) (string, *domain.Member, error) {
	identifier = normalizeIdentifier(identifier)
	o, err := a.otps.Get(ctx, identifier)
	if err != nil {
		return "", nil, ErrInvalidOTP
	}
	if o.ExpiresAt < time.Now().UTC().Format(time.RFC3339) {
		return "", nil, ErrInvalidOTP
	}
	if sha256hex(strings.TrimSpace(code)) != o.CodeHash {
		return "", nil, ErrInvalidOTP
	}

	member, err := a.memberFor(ctx, identifier, o)
	if err != nil {
		return "", nil, err
	}

	_ = a.otps.Delete(ctx, identifier)
	token, err := a.issue(member)
	if err != nil {
		return "", nil, err
	}
	return token, member, nil
}

// memberFor resolves the member behind an identifier: it creates the account
// from the OTP's sign-up details on first verification (defence in depth on the
// 18+ gate, spec §14.4), and otherwise enforces the suspension check and marks
// the phone verified.
func (a *AuthService) memberFor(ctx context.Context, identifier string, o *domain.OTP) (*domain.Member, error) {
	member, err := a.members.ByIdentifier(ctx, identifier)
	var nf *domain.NotFoundError
	if errors.As(err, &nf) {
		if o.DateOfBirth == "" || !isAdult(o.DateOfBirth, time.Now().UTC()) {
			return nil, ErrUnderage
		}
		member = newMember(identifier, o.DisplayName, o.DateOfBirth)
		if err := a.members.Insert(ctx, *member); err != nil {
			return nil, err
		}
		return member, nil
	}
	if err != nil {
		return nil, err
	}
	if member.Suspended {
		return nil, fmt.Errorf("this account is suspended")
	}
	if !member.PhoneVerified {
		_ = a.members.SetPhoneVerified(ctx, member.ID, true)
		member.PhoneVerified = true
	}
	return member, nil
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

func sha256hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func random6() string {
	b := make([]byte, 3)
	if _, err := rand.Read(b); err != nil {
		return "000000"
	}
	n := (int(b[0])<<16 | int(b[1])<<8 | int(b[2])) % 1000000
	return fmt.Sprintf("%06d", n)
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
		ID:            id,
		Slug:          base + "-" + fmt.Sprintf("%d", time.Now().UnixNano()%10_000),
		DisplayName:   name,
		Initials:      initialsOf(name),
		SchoolIDs:     []string{},
		PhoneVerified: true,
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
