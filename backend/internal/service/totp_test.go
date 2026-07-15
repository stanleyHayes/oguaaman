package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
)

// rfc6238Secret is the RFC 6238 appendix-B SHA1 test secret ("12345678901234567890"
// in ASCII) base32-encoded without padding.
const rfc6238Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

// TestTOTPCode checks the implementation against the RFC 6238 SHA1 vectors
// (8-digit expected values truncated to our 6 digits).
func TestTOTPCode(t *testing.T) {
	cases := []struct {
		at   int64
		want string
	}{
		{59, "287082"},         // 94287082
		{1111111109, "081804"}, // 07081804
		{1111111111, "050471"}, // 14050471
		{1234567890, "005924"}, // 89005924
		{2000000000, "279037"}, // 69279037
	}
	for _, c := range cases {
		got, err := totpCode(rfc6238Secret, time.Unix(c.at, 0))
		if err != nil {
			t.Fatalf("totpCode: %v", err)
		}
		if got != c.want {
			t.Errorf("totpCode(%d) = %s, want %s", c.at, got, c.want)
		}
	}
}

func TestValidTOTP(t *testing.T) {
	now := time.Unix(59, 0)
	code, _ := totpCode(rfc6238Secret, now)
	if !validTOTP(rfc6238Secret, code, now) {
		t.Error("current code rejected")
	}
	if !validTOTP(rfc6238Secret, code, now.Add(30*time.Second)) {
		t.Error("previous-step code rejected (drift window)")
	}
	if validTOTP(rfc6238Secret, code, now.Add(90*time.Second)) {
		t.Error("stale code outside drift window accepted")
	}
	if validTOTP(rfc6238Secret, "000000", now) && code != "000000" {
		t.Error("wrong code accepted")
	}
	if validTOTP(rfc6238Secret, "12345", now) {
		t.Error("short code accepted")
	}
}

func TestNewTOTPSecret(t *testing.T) {
	s, err := newTOTPSecret()
	if err != nil {
		t.Fatal(err)
	}
	if len(s) != 32 {
		t.Errorf("secret length = %d, want 32 (160-bit base32)", len(s))
	}
	if _, err := totpCode(s, time.Now()); err != nil {
		t.Errorf("generated secret not usable: %v", err)
	}
}

func TestRecoveryCodeShape(t *testing.T) {
	c, err := newRecoveryCode()
	if err != nil {
		t.Fatal(err)
	}
	if len(c) != 11 || c[5] != '-' {
		t.Errorf("code %q not XXXXX-XXXXX", c)
	}
	if normalizeRecovery("abcde-23456") != "ABCDE23456" {
		t.Error("normalizeRecovery should strip dash + upper-case")
	}
}

// ── full enrolment + login flow ──────────────────────────────────────────────

type mfaFakeRepo struct {
	domain.MemberRepository // embedded nil — only the overridden methods are used
	m                       *domain.Member
}

func (f *mfaFakeRepo) ByID(context.Context, string) (*domain.Member, error)         { return f.m, nil }
func (f *mfaFakeRepo) ByIdentifier(context.Context, string) (*domain.Member, error) { return f.m, nil }
func (f *mfaFakeRepo) SetMFA(_ context.Context, _ string, enabled bool, secret string, hashes []string) error {
	f.m.MFAEnabled = enabled
	f.m.TOTPSecret = secret
	f.m.MFARecoveryHashes = hashes
	return nil
}

func TestMFAFlow(t *testing.T) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct horse"), bcrypt.MinCost)
	repo := &mfaFakeRepo{m: &domain.Member{
		ID: "m-1", Slug: "ama", DisplayName: "Ama", Email: "ama@oguaa.test",
		Role: domain.RoleMember, PasswordHash: string(hash),
	}}
	svc := NewAuthService(repo, "test-secret")
	ctx := context.Background()

	// 1. Plain login issues a session token before enrolment.
	tok, _, err := svc.Login(ctx, "ama@oguaa.test", "correct horse")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if _, err := svc.ParseToken(tok); err != nil {
		t.Fatalf("pre-MFA session token rejected: %v", err)
	}

	// 2. Setup stores a secret but does not enable MFA.
	secret, account, err := svc.MFASetup(ctx, "m-1")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	if account != "ama@oguaa.test" {
		t.Errorf("account label = %q", account)
	}
	if repo.m.MFAEnabled {
		t.Error("MFA enabled before confirm")
	}

	// 3. Wrong confirm code → ErrInvalidMFACode; right code → recovery codes.
	if _, err := svc.MFAConfirm(ctx, "m-1", "000000"); !errors.Is(err, ErrInvalidMFACode) {
		t.Errorf("bad confirm = %v, want ErrInvalidMFACode", err)
	}
	code, _ := totpCode(secret, time.Now())
	codes, err := svc.MFAConfirm(ctx, "m-1", code)
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	if len(codes) != mfaRecoveryCount || !repo.m.MFAEnabled {
		t.Fatalf("confirm: %d codes, enabled=%v", len(codes), repo.m.MFAEnabled)
	}

	// 4. Login now returns a challenge that ParseToken must reject.
	challenge, m, err := svc.Login(ctx, "ama@oguaa.test", "correct horse")
	if err != nil {
		t.Fatalf("mfa login: %v", err)
	}
	if !m.MFAEnabled {
		t.Fatal("member should be MFA-enabled")
	}
	if _, err := svc.ParseToken(challenge); err == nil {
		t.Error("challenge token accepted as a session")
	}

	// 5. MFALogin: bad code, good TOTP, recovery code (single-use).
	if _, _, err := svc.MFALogin(ctx, challenge, "999999"); !errors.Is(err, ErrInvalidMFACode) {
		t.Errorf("bad code = %v, want ErrInvalidMFACode", err)
	}
	if _, _, err := svc.MFALogin(ctx, "garbage", code); !errors.Is(err, ErrInvalidChallenge) {
		t.Errorf("bad challenge = %v, want ErrInvalidChallenge", err)
	}
	good, _ := totpCode(repo.m.TOTPSecret, time.Now())
	sess, _, err := svc.MFALogin(ctx, challenge, good)
	if err != nil {
		t.Fatalf("mfa verify: %v", err)
	}
	if _, err := svc.ParseToken(sess); err != nil {
		t.Fatalf("post-MFA session rejected: %v", err)
	}
	sess2, _, err := svc.MFALogin(ctx, challenge, codes[0])
	if err != nil || sess2 == "" {
		t.Fatalf("recovery code login: %v", err)
	}
	if _, _, err := svc.MFALogin(ctx, challenge, codes[0]); !errors.Is(err, ErrInvalidMFACode) {
		t.Error("recovery code reused")
	}

	// 6. Disable re-verifies a code, then login goes back to one step.
	if err := svc.MFADisable(ctx, "m-1", "000000"); !errors.Is(err, ErrInvalidMFACode) {
		t.Errorf("bad disable code = %v", err)
	}
	now, _ := totpCode(repo.m.TOTPSecret, time.Now())
	if err := svc.MFADisable(ctx, "m-1", now); err != nil {
		t.Fatalf("disable: %v", err)
	}
	if repo.m.MFAEnabled || repo.m.TOTPSecret != "" {
		t.Error("MFA state not cleared")
	}
	tok2, _, err := svc.Login(ctx, "ama@oguaa.test", "correct horse")
	if err != nil {
		t.Fatalf("post-disable login: %v", err)
	}
	if _, err := svc.ParseToken(tok2); err != nil {
		t.Fatalf("post-disable session rejected: %v", err)
	}
}
