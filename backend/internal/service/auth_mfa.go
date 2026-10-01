package service

import (
	"context"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/platform/logger"
)

// ── MFA (TOTP — spec §14; authenticator apps) ────────────────────────────────

// mfaRecoveryCount is how many one-time backup codes enrolment issues.
const mfaRecoveryCount = 8

// MFASetup generates a fresh TOTP secret for the member and returns it plus the
// account label for the otpauth:// URL the client renders as a QR. The secret
// waits beside any active one until MFAConfirm proves the new authenticator,
// so starting (or abandoning) setup never switches two-factor off. When
// two-factor is already on, replacing the authenticator needs a current code
// or an unused recovery code (ErrMFACodeRequired / ErrInvalidMFACode).
func (a *AuthService) MFASetup(ctx context.Context, memberID, code string) (secret, account string, err error) {
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return "", "", err
	}
	if m.MFAEnabled {
		if strings.TrimSpace(code) == "" {
			return "", "", ErrMFACodeRequired
		}
		if !a.checkMFACode(ctx, m, code) {
			a.securityEvent(ctx, logger.EventMFAFailed, logger.KeyMemberID, m.ID, "step", "reset")
			return "", "", ErrInvalidMFACode
		}
	}
	secret, err = newTOTPSecret()
	if err != nil {
		return "", "", err
	}
	stored, err := a.sealSecret(secret)
	if err != nil {
		return "", "", err
	}
	if err := a.members.SetPendingMFA(ctx, m.ID, stored); err != nil {
		return "", "", err
	}
	account = m.Email
	if account == "" {
		account = m.Phone
	}
	return secret, account, nil
}

// MFAConfirm verifies the first code from the member's new authenticator,
// makes it the active one (turning two-factor on), and returns the one-time
// recovery codes (shown once, stored as bcrypt hashes). Enrolment revokes every
// earlier session — one that was stolen before two-factor was on must not
// outlive it — and returns a fresh session token for the caller.
func (a *AuthService) MFAConfirm(ctx context.Context, memberID, code string) ([]string, string, error) {
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return nil, "", err
	}
	candidate := m.PendingTOTPSecret
	if candidate == "" && !m.MFAEnabled {
		candidate = m.TOTPSecret // setup started before pending secrets existed
	}
	if candidate == "" {
		return nil, "", ErrMFANotSetup
	}
	secret, err := a.revealSecret(candidate)
	if err != nil {
		a.log.Error("mfa pending secret unreadable", logger.KeyMemberID, m.ID, "err", err)
		return nil, "", ErrMFANotSetup
	}
	if !validTOTP(secret, code, time.Now()) {
		return nil, "", ErrInvalidMFACode
	}
	codes, hashes, err := newRecoveryCodes()
	if err != nil {
		return nil, "", err
	}
	wasEnabled := m.MFAEnabled
	if err := a.members.SetMFA(ctx, m.ID, true, a.reseal(candidate), hashes); err != nil {
		return nil, "", err
	}
	if m.PendingTOTPSecret != "" {
		if err := a.members.SetPendingMFA(ctx, m.ID, ""); err != nil {
			return nil, "", err
		}
	}
	m.MFAEnabled, m.TOTPSecret, m.MFARecoveryHashes, m.PendingTOTPSecret = true, a.reseal(candidate), hashes, ""
	token, err := a.rotateSessions(ctx, m)
	if err != nil {
		return nil, "", err
	}
	event := logger.EventMFAEnabled
	if wasEnabled {
		event = logger.EventMFAReset
	}
	a.securityEvent(ctx, event, logger.KeyMemberID, m.ID, "role", m.Role)
	return codes, token, nil
}

// newRecoveryCodes mints the one-time backup codes and their bcrypt hashes.
func newRecoveryCodes() (codes, hashes []string, err error) {
	codes = make([]string, 0, mfaRecoveryCount)
	hashes = make([]string, 0, mfaRecoveryCount)
	for range mfaRecoveryCount {
		c, err := newRecoveryCode()
		if err != nil {
			return nil, nil, err
		}
		h, err := bcrypt.GenerateFromPassword([]byte(normalizeRecovery(c)), bcrypt.DefaultCost)
		if err != nil {
			return nil, nil, err
		}
		codes = append(codes, c)
		hashes = append(hashes, string(h))
	}
	return codes, hashes, nil
}

// MFALogin completes an MFA-gated sign-in: validates the short-lived challenge
// from Login against the member's outstanding one, checks the TOTP or an unused
// recovery code, and issues the full session token. A challenge completes once;
// after maxCodeAttempts wrong codes it is thrown away and the member must sign
// in again. Wrong codes also count towards the account's sign-in lock, which
// (as in Login) binds only the sources that caused it.
func (a *AuthService) MFALogin(ctx context.Context, challenge, code string) (string, *domain.Member, error) {
	id, nonce, err := a.parseChallenge(challenge)
	if err != nil {
		return "", nil, ErrInvalidChallenge
	}
	m, err := a.members.ByID(ctx, id)
	if err != nil || m == nil || !challengeLive(m, nonce) || a.demoBlocked(m.Email) {
		return "", nil, ErrInvalidChallenge
	}
	if a.loginLockedFor(ctx, m.ID, isLoginLocked(m, time.Now().UTC())) {
		return "", nil, ErrAccountLocked
	}
	if m.Suspended {
		return "", nil, ErrSuspended
	}
	if !m.MFAEnabled || m.TOTPSecret == "" {
		return "", nil, ErrMFANotSetup
	}
	if !a.checkMFACode(ctx, m, code) {
		a.recordMFAFailure(ctx, m)
		return "", nil, ErrInvalidMFACode
	}
	// Clears the failure counters and the challenge nonce: one challenge, one session.
	if err := a.members.ClearLoginFailures(ctx, m.ID); err != nil {
		return "", nil, err
	}
	a.loginStrikes.clear(m.ID)
	m.FailedLogins, m.LoginLockouts, m.LockedUntil = 0, 0, ""
	m.MFAChallengeNonce, m.MFAChallengeFailures = "", 0
	token, err := a.issue(m)
	if err != nil {
		return "", nil, err
	}
	return token, m, nil
}

// recordMFAFailure counts a wrong sign-in code against the challenge (killing
// it at maxCodeAttempts) and against the account's sign-in lock.
func (a *AuthService) recordMFAFailure(ctx context.Context, m *domain.Member) {
	n, err := a.members.RecordMFAChallengeFailure(ctx, m.ID)
	if err != nil {
		a.log.Error("recording a failed two-factor code", logger.KeyMemberID, m.ID, "err", err)
	} else if n >= maxCodeAttempts {
		if err := a.members.SetMFAChallenge(ctx, m.ID, ""); err != nil {
			a.log.Error("invalidating a two-factor challenge", logger.KeyMemberID, m.ID, "err", err)
		}
		a.securityEvent(ctx, logger.EventMFAChallengeKilled, logger.KeyMemberID, m.ID, "attempts", n)
	}
	a.recordLoginFailure(ctx, m, "mfa_code")
}

// MFADisable turns MFA off after re-verifying a current TOTP or recovery code.
// Like enrolment and a password change, it signs out every earlier session,
// the caller's included, and returns a fresh session token for this device.
func (a *AuthService) MFADisable(ctx context.Context, memberID, code string) (string, error) {
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return "", err
	}
	if !m.MFAEnabled {
		return "", ErrMFANotSetup
	}
	if !a.checkMFACode(ctx, m, code) {
		a.securityEvent(ctx, logger.EventMFAFailed, logger.KeyMemberID, m.ID, "step", "disable")
		return "", ErrInvalidMFACode
	}
	if err := a.members.SetMFA(ctx, m.ID, false, "", nil); err != nil {
		return "", err
	}
	if m.PendingTOTPSecret != "" {
		if err := a.members.SetPendingMFA(ctx, m.ID, ""); err != nil {
			return "", err
		}
	}
	m.MFAEnabled, m.TOTPSecret, m.PendingTOTPSecret = false, "", ""
	token, err := a.rotateSessions(ctx, m)
	if err != nil {
		return "", err
	}
	a.securityEvent(ctx, logger.EventMFADisabled, logger.KeyMemberID, m.ID, "role", m.Role)
	return token, nil
}

// checkMFACode accepts a live TOTP, or an unused recovery code (consuming it).
func (a *AuthService) checkMFACode(ctx context.Context, m *domain.Member, code string) bool {
	return a.totpMatches(ctx, m, code) || a.consumeRecoveryCode(ctx, m, code)
}

// totpMatches validates a TOTP against the member's active secret. A secret
// that cannot be decrypted fails closed: it is never validated as an empty key
// (which would accept a code anyone can compute). Recovery codes still work.
func (a *AuthService) totpMatches(ctx context.Context, m *domain.Member, code string) bool {
	secret, err := a.revealSecret(m.TOTPSecret)
	if err != nil {
		a.log.Error("mfa secret decrypt failed", logger.KeyMemberID, m.ID, "err", err)
		a.securityEvent(ctx, logger.EventMFASecretUnreadable, logger.KeyMemberID, m.ID)
		return false
	}
	if !validTOTP(secret, code, time.Now()) {
		return false
	}
	// Migrate a legacy plaintext secret to sealed form on first use.
	if sealed := a.reseal(m.TOTPSecret); sealed != m.TOTPSecret {
		m.TOTPSecret = sealed
		_ = a.members.SetMFA(ctx, m.ID, m.MFAEnabled, sealed, m.MFARecoveryHashes)
	}
	return true
}

// consumeRecoveryCode accepts an unused recovery code and removes it.
func (a *AuthService) consumeRecoveryCode(ctx context.Context, m *domain.Member, code string) bool {
	norm := normalizeRecovery(code)
	if !looksLikeRecoveryCode(norm) {
		return false // skip up to 8 bcrypt comparisons for a code that can't match
	}
	for i, h := range m.MFARecoveryHashes {
		if bcrypt.CompareHashAndPassword([]byte(h), []byte(norm)) == nil {
			remaining := append([]string{}, m.MFARecoveryHashes[:i]...)
			remaining = append(remaining, m.MFARecoveryHashes[i+1:]...)
			m.MFARecoveryHashes = remaining
			_ = a.members.SetMFA(ctx, m.ID, true, a.reseal(m.TOTPSecret), remaining)
			return true
		}
	}
	return false
}

// looksLikeRecoveryCode reports whether a normalised code has the shape
// newRecoveryCode produces: ten characters from the recovery alphabet.
func looksLikeRecoveryCode(norm string) bool {
	if len(norm) != 10 {
		return false
	}
	for _, r := range norm {
		if !strings.ContainsRune(recoveryAlphabet, r) {
			return false
		}
	}
	return true
}
