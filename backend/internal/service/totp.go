package service

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// totpStepSeconds is the RFC 6238 time step every authenticator app uses.
const totpStepSeconds = 30

// newTOTPSecret generates a 160-bit base32 secret (padding stripped) — the size
// authenticator apps (Google Authenticator, 1Password, Aegis…) expect.
func newTOTPSecret() (string, error) {
	buf := make([]byte, 20)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return strings.TrimRight(base32.StdEncoding.EncodeToString(buf), "="), nil
}

// totpCode computes the 6-digit RFC 6238 TOTP for a base32 secret at time t.
func totpCode(secret string, t time.Time) (string, error) {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).
		DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil {
		return "", err
	}
	counter := uint64(t.Unix()) / totpStepSeconds
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], counter)
	mac := hmac.New(sha1.New, key)
	mac.Write(buf[:])
	sum := mac.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	code := uint32(sum[off])&0x7f<<24 |
		uint32(sum[off+1])<<16 |
		uint32(sum[off+2])<<8 |
		uint32(sum[off+3])
	return fmt.Sprintf("%06d", code%1_000_000), nil
}

// validTOTP checks code against the current step and ±1 step (clock drift),
// using constant-time comparison per window.
func validTOTP(secret, code string, t time.Time) bool {
	code = strings.TrimSpace(code)
	if len(code) != 6 {
		return false
	}
	for _, delta := range []int64{-totpStepSeconds, 0, totpStepSeconds} {
		want, err := totpCode(secret, t.Add(time.Duration(delta)*time.Second))
		if err != nil {
			return false
		}
		if hmac.Equal([]byte(want), []byte(code)) {
			return true
		}
	}
	return false
}

// OtpauthURL builds the otpauth:// URL that authenticator apps scan as a QR.
func OtpauthURL(issuer, account, secret string) string {
	return fmt.Sprintf("otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=6&period=%d",
		url.PathEscape(issuer), url.PathEscape(account), secret, url.QueryEscape(issuer), totpStepSeconds)
}

// recoveryAlphabet is unambiguous (no 0/O, 1/I) for hand-typed backup codes.
const recoveryAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// newRecoveryCode returns a code like "ABCDE-23456".
func newRecoveryCode() (string, error) {
	buf := make([]byte, 10)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, 11) // 10 chars + dash
	for i, b := range buf {
		pos := i
		if i >= 5 {
			pos = i + 1 // skip the dash slot
		}
		out[pos] = recoveryAlphabet[int(b)%len(recoveryAlphabet)]
	}
	out[5] = '-'
	return string(out), nil
}

// normalizeRecovery strips spaces/dashes and upper-cases a typed recovery code
// so "abcde-23456", "ABCDE23456" and "abcde 23456" all match.
func normalizeRecovery(code string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(code), "-", ""), " ", ""))
}
