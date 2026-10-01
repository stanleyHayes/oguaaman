package service

import (
	"testing"
	"time"
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
	// An empty key yields codes anyone can compute: never valid (F029).
	emptyKeyCode, err := totpCode("", now)
	if err != nil {
		t.Fatalf("totpCode with empty key: %v", err)
	}
	if validTOTP("", emptyKeyCode, now) || validTOTP("   ", emptyKeyCode, now) {
		t.Error("blank secret validated a code")
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
