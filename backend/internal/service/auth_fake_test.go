package service

import (
	"context"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
)

// authRepo is a stateful in-memory MemberRepository for the auth tests. Reads
// return copies, as a database would, so a test only passes when the service
// actually persists what it relies on.
type authRepo struct {
	stubMembers
	byID     map[string]*domain.Member
	inserted []domain.Member
}

func newAuthRepo(members ...*domain.Member) *authRepo {
	r := &authRepo{byID: map[string]*domain.Member{}}
	for _, m := range members {
		r.byID[m.ID] = m
	}
	return r
}

func (r *authRepo) get(id string) *domain.Member { return r.byID[id] }

func (r *authRepo) copyOf(m *domain.Member) *domain.Member {
	cp := *m
	return &cp
}

func (r *authRepo) ByID(_ context.Context, id string) (*domain.Member, error) {
	if m, ok := r.byID[id]; ok {
		return r.copyOf(m), nil
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}

func (r *authRepo) ByIdentifier(_ context.Context, identifier string) (*domain.Member, error) {
	for _, m := range r.byID {
		if identifier != "" && (m.Email == identifier || m.Phone == identifier) {
			return r.copyOf(m), nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}

func (r *authRepo) BySlug(_ context.Context, slug string) (*domain.Member, error) {
	for _, m := range r.byID {
		if m.Slug == slug {
			return r.copyOf(m), nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}

func (r *authRepo) Insert(_ context.Context, m domain.Member) error {
	r.inserted = append(r.inserted, m)
	r.byID[m.ID] = &m
	return nil
}

func (r *authRepo) SetPasswordHash(_ context.Context, id, hash string) error {
	r.byID[id].PasswordHash = hash
	return nil
}

func (r *authRepo) SetPasswordReset(_ context.Context, id, codeHash, expiresAt string) error {
	m := r.byID[id]
	m.PasswordResetCodeHash, m.PasswordResetExpiresAt, m.PasswordResetAttempts = codeHash, expiresAt, 0
	return nil
}

func (r *authRepo) RecordPasswordResetFailure(_ context.Context, id string) (int, error) {
	r.byID[id].PasswordResetAttempts++
	return r.byID[id].PasswordResetAttempts, nil
}

func (r *authRepo) SetAdultVerified(_ context.Context, id, at string) error {
	r.byID[id].AdultVerifiedAt = at
	return nil
}

func (r *authRepo) SetConsent(_ context.Context, id string, c domain.Consent) error {
	m := r.byID[id]
	m.Consent = &c
	m.ConsentHistory = append(m.ConsentHistory, c)
	return nil
}

func (r *authRepo) BumpTokenVersion(_ context.Context, id string) (int, error) {
	r.byID[id].TokenVersion++
	return r.byID[id].TokenVersion, nil
}

func (r *authRepo) RecordLoginFailure(_ context.Context, id string) (int, error) {
	r.byID[id].FailedLogins++
	return r.byID[id].FailedLogins, nil
}

func (r *authRepo) LockLogin(_ context.Context, id, until string) error {
	m := r.byID[id]
	m.LockedUntil, m.FailedLogins = until, 0
	m.LoginLockouts++
	return nil
}

func (r *authRepo) ClearLoginFailures(_ context.Context, id string) error {
	m := r.byID[id]
	m.FailedLogins, m.LoginLockouts, m.LockedUntil = 0, 0, ""
	m.MFAChallengeNonce, m.MFAChallengeFailures = "", 0
	return nil
}

func (r *authRepo) SetMFAChallenge(_ context.Context, id, nonce string) error {
	m := r.byID[id]
	m.MFAChallengeNonce, m.MFAChallengeFailures = nonce, 0
	return nil
}

func (r *authRepo) RecordMFAChallengeFailure(_ context.Context, id string) (int, error) {
	r.byID[id].MFAChallengeFailures++
	return r.byID[id].MFAChallengeFailures, nil
}

func (r *authRepo) SetPendingMFA(_ context.Context, id, secret string) error {
	r.byID[id].PendingTOTPSecret = secret
	return nil
}

func (r *authRepo) SetMFA(_ context.Context, id string, enabled bool, secret string, hashes []string) error {
	m := r.byID[id]
	m.MFAEnabled, m.TOTPSecret, m.MFARecoveryHashes = enabled, secret, hashes
	return nil
}

func (r *authRepo) SetSuspended(_ context.Context, id string, suspended bool) error {
	r.byID[id].Suspended = suspended
	return nil
}

// ReserveErasureID mirrors the Mongo set-if-absent.
func (r *authRepo) ReserveErasureID(_ context.Context, id, candidate string) (string, error) {
	m, ok := r.byID[id]
	if !ok {
		return "", &domain.NotFoundError{Entity: "member"}
	}
	if m.ErasureID == "" {
		m.ErasureID = candidate
	}
	return m.ErasureID, nil
}

// Anonymize mirrors the Mongo tombstone: a locked "Former member" record under
// tombstoneID whose token version is past every one issued; the original
// record goes when the tombstone moves to a new id.
func (r *authRepo) Anonymize(_ context.Context, id, tombstoneID string) error {
	old, ok := r.byID[id]
	if !ok {
		return &domain.NotFoundError{Entity: "member"}
	}
	if tombstoneID == "" {
		tombstoneID = id
	}
	delete(r.byID, id)
	r.byID[tombstoneID] = &domain.Member{ID: tombstoneID, Slug: "former-0123456789abcdef",
		DisplayName: "Former member", Role: domain.RoleMember, Suspended: true,
		TokenVersion: old.TokenVersion + 1, ErasureID: tombstoneID, ErasedAt: "2026-09-30T00:00:00Z"}
	return nil
}

func (r *authRepo) SetCreatorTypes(_ context.Context, id string, types []string) error {
	r.byID[id].CreatorTypes = types
	return nil
}

func (r *authRepo) SetCreatorPlanIntent(_ context.Context, id, slug string) error {
	r.byID[id].CreatorPlanIntent = slug
	return nil
}

// testPassword is the password every fixture account signs in with.
const testPassword = "correct horse battery"

// memberWithPassword returns an adult, consenting member with testPassword.
func memberWithPassword(t *testing.T, id, email, role string) *domain.Member {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(testPassword), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	return &domain.Member{
		ID: id, Slug: id, DisplayName: "Member " + id, Email: email, Role: role,
		PasswordHash: string(hash), AdultVerifiedAt: "2026-01-01T00:00:00Z",
		Consent: &domain.Consent{TermsVersion: domain.CurrentTermsVersion, PrivacyVersion: domain.CurrentPrivacyVersion},
	}
}

// adultSignup is a valid, consenting sign-up request.
func adultSignup(identifier string) RegisterInput {
	return RegisterInput{
		Identifier: identifier, DisplayName: "Kwame Mensah", DateOfBirth: "1990-04-12",
		Password: "a-strong-password", AcceptTerms: true, TermsVersion: domain.CurrentTermsVersion, Platform: "ios",
	}
}
