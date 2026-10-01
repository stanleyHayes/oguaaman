package service

import (
	"context"
	"crypto/hmac"
	crypto_rand "crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/oguaa/backend/internal/domain"
)

// ErrSessionRevoked is returned by Authenticate for a token issued before the
// member's last password change or reset, or two-factor enrolment.
var ErrSessionRevoked = errors.New("this session has been signed out")

// sessionTTL is how long a session token lives.
const sessionTTL = 30 * 24 * time.Hour

// mfaChallengeTTL bounds the password→code window at sign-in.
const mfaChallengeTTL = 5 * time.Minute

// Claim names used in the tokens this service signs.
const (
	claimSubject        = "sub"
	claimMFA            = "mfa" // "pending" marks a sign-in challenge, never a session
	claimChallenge      = "cn"  // the challenge nonce, matched against the member record
	claimTokenVersion   = "tv"  // the member's TokenVersion when the session was issued
	mfaChallengePending = "pending"
)

// Session is what a verified session token carries.
type Session struct {
	MemberID     string
	TokenVersion int
}

// issue signs a 30-day session token stamped with the member's current token
// version, so bumping the version revokes it.
func (a *AuthService) issue(m *domain.Member) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		claimSubject:      m.ID,
		"role":            m.Role,
		"name":            m.DisplayName,
		claimTokenVersion: m.TokenVersion,
		"iat":             now.Unix(),
		"exp":             now.Add(sessionTTL).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.secret)
}

// rotateSessions revokes every session the member holds and returns a fresh
// one for the caller that triggered the change.
func (a *AuthService) rotateSessions(ctx context.Context, m *domain.Member) (string, error) {
	v, err := a.members.BumpTokenVersion(ctx, m.ID)
	if err != nil {
		return "", err
	}
	m.TokenVersion = v
	return a.issue(m)
}

// ParseToken validates a session JWT and returns the member id (subject).
// MFA challenge tokens (mfa=pending) are explicitly rejected — they are not
// sessions, only a 5-minute pass between the password and code steps. It does
// not check revocation: use Authenticate for that.
func (a *AuthService) ParseToken(token string) (string, error) {
	s, err := a.ParseSession(token)
	if err != nil {
		return "", err
	}
	return s.MemberID, nil
}

// ParseSession validates a session JWT's signature and expiry and returns what
// it carries. Tokens issued before token versions existed carry version 0.
func (a *AuthService) ParseSession(token string) (Session, error) {
	claims, err := a.parseClaims(token)
	if err != nil {
		return Session{}, err
	}
	if _, isChallenge := claims[claimMFA]; isChallenge {
		return Session{}, fmt.Errorf("mfa challenge token is not a session")
	}
	sub, _ := claims[claimSubject].(string)
	if sub == "" {
		return Session{}, fmt.Errorf("no subject")
	}
	version, _ := claims[claimTokenVersion].(float64) // JSON numbers decode as float64
	return Session{MemberID: sub, TokenVersion: int(version)}, nil
}

// Authenticate resolves a session token to its member. It refuses tokens that
// were revoked (a later password change or reset, or two-factor enrolment),
// suspended accounts, and — in production — the seeded demo identities.
func (a *AuthService) Authenticate(ctx context.Context, token string) (*domain.Member, error) {
	s, err := a.ParseSession(token)
	if err != nil {
		return nil, err
	}
	m, err := a.members.ByID(ctx, s.MemberID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, &domain.NotFoundError{Entity: "member"}
	}
	switch {
	case m.Suspended:
		return nil, ErrSuspended
	case s.TokenVersion != m.TokenVersion:
		return nil, ErrSessionRevoked
	case a.demoBlocked(m.Email):
		return nil, ErrInvalidCredentials
	}
	return m, nil
}

// issueMFAChallenge signs the 5-minute token that holds a password-verified
// member between the password step and the code step, and binds it to the
// member record with a fresh nonce: only the latest challenge can be completed,
// once, and it dies after maxCodeAttempts wrong codes. The "mfa" claim makes
// ParseSession reject it, so it can never act as a session.
func (a *AuthService) issueMFAChallenge(ctx context.Context, m *domain.Member) (string, error) {
	var b [16]byte
	if _, err := crypto_rand.Read(b[:]); err != nil {
		return "", err
	}
	nonce := hex.EncodeToString(b[:])
	if err := a.members.SetMFAChallenge(ctx, m.ID, nonce); err != nil {
		return "", err
	}
	m.MFAChallengeNonce, m.MFAChallengeFailures = nonce, 0
	now := time.Now()
	claims := jwt.MapClaims{
		claimSubject:   m.ID,
		claimMFA:       mfaChallengePending,
		claimChallenge: nonce,
		"iat":          now.Unix(),
		"exp":          now.Add(mfaChallengeTTL).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.secret)
}

// ParseMFAChallenge validates a challenge token issued by issueMFAChallenge
// (signature, expiry, type) and returns its member id. Whether the challenge is
// still live is checked against the member record by MFALogin.
func (a *AuthService) ParseMFAChallenge(token string) (string, error) {
	sub, _, err := a.parseChallenge(token)
	return sub, err
}

// ChallengeSubject returns the member id a valid challenge token names, or ""
// — used to key rate limits on the account under attack.
func (a *AuthService) ChallengeSubject(token string) string {
	sub, _, err := a.parseChallenge(token)
	if err != nil {
		return ""
	}
	return sub
}

func (a *AuthService) parseChallenge(token string) (sub, nonce string, err error) {
	claims, err := a.parseClaims(token)
	if err != nil {
		return "", "", err
	}
	if claims[claimMFA] != mfaChallengePending {
		return "", "", fmt.Errorf("not an mfa challenge")
	}
	sub, _ = claims[claimSubject].(string)
	if sub == "" {
		return "", "", fmt.Errorf("no subject")
	}
	nonce, _ = claims[claimChallenge].(string)
	return sub, nonce, nil
}

// challengeLive reports whether a challenge nonce is the member's outstanding one.
func challengeLive(m *domain.Member, nonce string) bool {
	return nonce != "" && m.MFAChallengeNonce != "" && hmac.Equal([]byte(nonce), []byte(m.MFAChallengeNonce))
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
