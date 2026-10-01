package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// enrolMFA runs setup + confirm and returns the plaintext secret and the
// recovery codes.
func enrolMFA(t *testing.T, auth *AuthService, memberID, code string) (string, []string) {
	t.Helper()
	ctx := context.Background()
	secret, _, err := auth.MFASetup(ctx, memberID, code)
	if err != nil {
		t.Fatalf("MFASetup: %v", err)
	}
	now, _ := totpCode(secret, time.Now())
	codes, token, err := auth.MFAConfirm(ctx, memberID, now)
	if err != nil {
		t.Fatalf("MFAConfirm: %v", err)
	}
	if token == "" {
		t.Fatal("MFAConfirm returned no fresh session")
	}
	return secret, codes
}

// otherCode returns a six-digit code that is not currently valid for secret.
func otherCode(secret string) string {
	for _, c := range []string{"000000", "111111", "222222", "333333"} {
		if !validTOTP(secret, c, time.Now()) {
			return c
		}
	}
	return "444444"
}

func TestMFAFlow(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember))
	auth := NewAuthService(repo, "test-secret")

	// 1. Plain login issues a session token before enrolment.
	tok, _, err := auth.Login(ctx, "ama@example.com", testPassword)
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if _, err := auth.ParseToken(tok); err != nil {
		t.Fatalf("pre-MFA session token rejected: %v", err)
	}

	// 2. Setup parks a pending secret; MFA stays off until confirmed.
	secret, account, err := auth.MFASetup(ctx, "m-1", "")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	if account != "ama@example.com" || repo.get("m-1").MFAEnabled || repo.get("m-1").PendingTOTPSecret == "" {
		t.Fatalf("after setup: account=%q stored=%+v", account, repo.get("m-1"))
	}

	// 3. Wrong confirm code → ErrInvalidMFACode; right code → recovery codes + fresh session.
	if _, _, err := auth.MFAConfirm(ctx, "m-1", otherCode(secret)); !errors.Is(err, ErrInvalidMFACode) {
		t.Errorf("bad confirm = %v, want ErrInvalidMFACode", err)
	}
	code, _ := totpCode(secret, time.Now())
	codes, fresh, err := auth.MFAConfirm(ctx, "m-1", code)
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	stored := repo.get("m-1")
	if len(codes) != mfaRecoveryCount || !stored.MFAEnabled || stored.PendingTOTPSecret != "" {
		t.Fatalf("confirm: %d codes, stored=%+v", len(codes), stored)
	}
	// Enrolment signs out the pre-MFA session (it may have been stolen).
	if _, err := auth.Authenticate(ctx, tok); !errors.Is(err, ErrSessionRevoked) {
		t.Errorf("pre-MFA session after enrolment = %v, want ErrSessionRevoked", err)
	}
	if _, err := auth.Authenticate(ctx, fresh); err != nil {
		t.Errorf("fresh session rejected: %v", err)
	}

	// 4. Login now returns a challenge that is not a session.
	challenge, m, err := auth.Login(ctx, "ama@example.com", testPassword)
	if err != nil || !m.MFAEnabled {
		t.Fatalf("mfa login: %v", err)
	}
	if _, err := auth.ParseToken(challenge); err == nil {
		t.Error("challenge token accepted as a session")
	}

	// 5. MFALogin: bad code, forged challenge, good TOTP — then the challenge is spent.
	if _, _, err := auth.MFALogin(ctx, challenge, otherCode(secret)); !errors.Is(err, ErrInvalidMFACode) {
		t.Errorf("bad code = %v, want ErrInvalidMFACode", err)
	}
	if _, _, err := auth.MFALogin(ctx, "garbage", code); !errors.Is(err, ErrInvalidChallenge) {
		t.Errorf("bad challenge = %v, want ErrInvalidChallenge", err)
	}
	good, _ := totpCode(secret, time.Now())
	sess, _, err := auth.MFALogin(ctx, challenge, good)
	if err != nil {
		t.Fatalf("mfa verify: %v", err)
	}
	if _, err := auth.Authenticate(ctx, sess); err != nil {
		t.Fatalf("post-MFA session rejected: %v", err)
	}
	if _, _, err := auth.MFALogin(ctx, challenge, good); !errors.Is(err, ErrInvalidChallenge) {
		t.Errorf("reused challenge = %v, want ErrInvalidChallenge", err)
	}

	// 6. A recovery code completes a new challenge, once.
	challenge2, _, _ := auth.Login(ctx, "ama@example.com", testPassword)
	if _, _, err := auth.MFALogin(ctx, challenge2, codes[0]); err != nil {
		t.Fatalf("recovery code login: %v", err)
	}
	challenge3, _, _ := auth.Login(ctx, "ama@example.com", testPassword)
	if _, _, err := auth.MFALogin(ctx, challenge3, codes[0]); !errors.Is(err, ErrInvalidMFACode) {
		t.Error("recovery code reused")
	}

	// 7. Disable re-verifies a code, then login goes back to one step.
	if _, err := auth.MFADisable(ctx, "m-1", otherCode(secret)); !errors.Is(err, ErrInvalidMFACode) {
		t.Errorf("bad disable code = %v", err)
	}
	now, _ := totpCode(secret, time.Now())
	fresh, err = auth.MFADisable(ctx, "m-1", now)
	if err != nil {
		t.Fatalf("disable: %v", err)
	}
	// R31: turning two-factor off signs out every earlier session too.
	if _, err := auth.Authenticate(ctx, sess); !errors.Is(err, ErrSessionRevoked) {
		t.Errorf("session from before the disable = %v, want ErrSessionRevoked", err)
	}
	if _, err := auth.Authenticate(ctx, fresh); err != nil {
		t.Errorf("fresh session after disable rejected: %v", err)
	}
	if repo.get("m-1").MFAEnabled || repo.get("m-1").TOTPSecret != "" {
		t.Error("MFA state not cleared")
	}
	tok2, _, err := auth.Login(ctx, "ama@example.com", testPassword)
	if err != nil {
		t.Fatalf("post-disable login: %v", err)
	}
	if _, err := auth.Authenticate(ctx, tok2); err != nil {
		t.Fatalf("post-disable session rejected: %v", err)
	}
}

// F022: starting setup again must not switch two-factor off or wipe the
// recovery codes, and replacing the authenticator needs proof of the old one.
func TestMFASetupNeverDisablesActiveMFA(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleSteward))
	auth := NewAuthService(repo, "secret")
	oldSecret, codes := enrolMFA(t, auth, "m-1", "")
	before := *repo.get("m-1")

	if _, _, err := auth.MFASetup(ctx, "m-1", ""); !errors.Is(err, ErrMFACodeRequired) {
		t.Fatalf("setup without a code = %v, want ErrMFACodeRequired", err)
	}
	if _, _, err := auth.MFASetup(ctx, "m-1", otherCode(oldSecret)); !errors.Is(err, ErrInvalidMFACode) {
		t.Fatalf("setup with a wrong code = %v, want ErrInvalidMFACode", err)
	}
	after := repo.get("m-1")
	if !after.MFAEnabled || after.TOTPSecret != before.TOTPSecret || len(after.MFARecoveryHashes) != mfaRecoveryCount {
		t.Fatalf("active MFA changed by a refused setup: %+v", after)
	}
	// Password alone still only gets a challenge.
	if _, m, err := auth.Login(ctx, "ama@example.com", testPassword); err != nil || !m.MFAEnabled {
		t.Fatalf("login after refused setup: mfa=%v err=%v", m != nil && m.MFAEnabled, err)
	}

	// With a recovery code the member may re-enrol; the old authenticator keeps
	// working until the new one is confirmed.
	newSecret, _, err := auth.MFASetup(ctx, "m-1", codes[1])
	if err != nil {
		t.Fatalf("re-enrol with a recovery code: %v", err)
	}
	oldNow, _ := totpCode(oldSecret, time.Now())
	if !auth.checkMFACode(ctx, repo.get("m-1"), oldNow) {
		t.Fatal("old authenticator stopped working before the new one was confirmed")
	}
	newNow, _ := totpCode(newSecret, time.Now())
	if _, _, err := auth.MFAConfirm(ctx, "m-1", newNow); err != nil {
		t.Fatalf("confirm new authenticator: %v", err)
	}
	if !auth.checkMFACode(ctx, repo.get("m-1"), newNow) || repo.get("m-1").PendingTOTPSecret != "" {
		t.Fatal("new authenticator not active after confirm")
	}
}

// F029: a sealed secret that can't be decrypted (rotated or lost key) fails
// closed — the empty-key code anyone can compute is refused — while recovery
// codes still let the member in to re-enrol.
func TestMFAFailsClosedWhenSecretUnreadable(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleSteward))
	sealer := NewAuthService(repo, "secret").WithMFAEncryption("original-key")
	_, codes := enrolMFA(t, sealer, "m-1", "")
	if !isSealed(repo.get("m-1").TOTPSecret) {
		t.Fatal("secret not sealed")
	}

	for name, auth := range map[string]*AuthService{
		"rotated key": NewAuthService(repo, "secret").WithMFAEncryption("rotated-key"),
		"missing key": NewAuthService(repo, "secret"),
	} {
		if _, err := auth.revealSecret(repo.get("m-1").TOTPSecret); err == nil {
			t.Fatalf("%s: revealSecret succeeded", name)
		}
		emptyKeyCode, _ := totpCode("", time.Now())
		challenge, _, err := auth.Login(ctx, "ama@example.com", testPassword)
		if err != nil {
			t.Fatalf("%s: login: %v", name, err)
		}
		if _, _, err := auth.MFALogin(ctx, challenge, emptyKeyCode); !errors.Is(err, ErrInvalidMFACode) {
			t.Fatalf("%s: empty-key code = %v, want ErrInvalidMFACode", name, err)
		}
	}
	auth := NewAuthService(repo, "secret").WithMFAEncryption("rotated-key")
	challenge, _, _ := auth.Login(ctx, "ama@example.com", testPassword)
	if _, _, err := auth.MFALogin(ctx, challenge, codes[0]); err != nil {
		t.Fatalf("recovery code with an unreadable secret: %v", err)
	}
}

// F024: a sign-in challenge dies after five wrong codes, and the failures
// count towards the account lock.
func TestMFAChallengeDiesAfterFiveWrongCodes(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember))
	auth := NewAuthService(repo, "secret")
	secret, _ := enrolMFA(t, auth, "m-1", "")

	challenge, _, err := auth.Login(ctx, "ama@example.com", testPassword)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < maxCodeAttempts; i++ {
		if _, _, err := auth.MFALogin(ctx, challenge, otherCode(secret)); !errors.Is(err, ErrInvalidMFACode) {
			t.Fatalf("wrong code %d = %v", i+1, err)
		}
	}
	good, _ := totpCode(secret, time.Now())
	if _, _, err := auth.MFALogin(ctx, challenge, good); !errors.Is(err, ErrInvalidChallenge) {
		t.Fatalf("right code on a dead challenge = %v, want ErrInvalidChallenge", err)
	}
	if repo.get("m-1").FailedLogins != maxCodeAttempts {
		t.Fatalf("failedLogins = %d, want %d", repo.get("m-1").FailedLogins, maxCodeAttempts)
	}
	// Only the latest challenge is live.
	first, _, _ := auth.Login(ctx, "ama@example.com", testPassword)
	second, _, _ := auth.Login(ctx, "ama@example.com", testPassword)
	if _, _, err := auth.MFALogin(ctx, first, good); !errors.Is(err, ErrInvalidChallenge) {
		t.Fatalf("superseded challenge = %v, want ErrInvalidChallenge", err)
	}
	if _, _, err := auth.MFALogin(ctx, second, good); err != nil {
		t.Fatalf("latest challenge: %v", err)
	}
}

// TestMFAEncryptionAtRest verifies that with a key configured the stored TOTP
// secret is sealed (not the raw base32), still validates, and that a legacy
// plaintext secret both validates and is migrated to sealed form on next write.
func TestMFAEncryptionAtRest(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "kojo@example.com", domain.RoleMember))
	auth := NewAuthService(repo, "test-secret").WithMFAEncryption("a-strong-mfa-key")

	secret, _ := enrolMFA(t, auth, "m-1", "")
	stored := repo.get("m-1").TOTPSecret
	if !isSealed(stored) || stored == secret {
		t.Fatalf("stored secret not sealed: %q", stored)
	}

	// Legacy plaintext secret: still validates, then re-seals on a write.
	repo.get("m-1").TOTPSecret = rfc6238Secret // no marker → legacy
	legacyCode, _ := totpCode(rfc6238Secret, time.Now())
	if !auth.checkMFACode(ctx, repo.get("m-1"), legacyCode) {
		t.Fatal("legacy plaintext secret rejected")
	}
	if !isSealed(repo.get("m-1").TOTPSecret) {
		t.Fatalf("legacy secret not migrated to sealed on write: %q", repo.get("m-1").TOTPSecret)
	}
}

// A recovery-code-shaped check never runs bcrypt for a TOTP-shaped guess.
func TestLooksLikeRecoveryCode(t *testing.T) {
	c, _ := newRecoveryCode()
	if !looksLikeRecoveryCode(normalizeRecovery(c)) {
		t.Errorf("generated code %q not recognised", c)
	}
	for _, bad := range []string{"123456", "", "ABCDE-2345", "abcde23456!"} {
		if looksLikeRecoveryCode(normalizeRecovery(bad)) {
			t.Errorf("%q recognised as a recovery code", bad)
		}
	}
}
