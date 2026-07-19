package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"strings"
)

// mfaEncPrefix marks a stored TOTP secret as AES-GCM sealed. Values without it
// are legacy plaintext (pre-encryption enrolments) and still validate, so the
// change is backward-compatible; they are re-sealed on their next write.
const mfaEncPrefix = "enc:v1:"

// mfaCipher seals TOTP secrets at rest with AES-256-GCM. A nil *mfaCipher means
// encryption is disabled (no key configured): secrets are stored as plaintext,
// exactly as before this feature. The 32-byte AES key is derived from the
// configured key string via SHA-256, so any sufficiently-random secret works
// (including Render's generateValue) without a strict length/format rule.
type mfaCipher struct{ aead cipher.AEAD }

// newMFACipher builds a cipher from the configured key string. An empty key
// returns (nil, nil) — encryption disabled.
func newMFACipher(key string) (*mfaCipher, error) {
	if strings.TrimSpace(key) == "" {
		return nil, nil
	}
	sum := sha256.Sum256([]byte(key))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &mfaCipher{aead: aead}, nil
}

// seal encrypts a plaintext secret → "enc:v1:<base64(nonce|ciphertext)>".
func (c *mfaCipher) seal(plain string) (string, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ct := c.aead.Seal(nonce, nonce, []byte(plain), nil)
	return mfaEncPrefix + base64.StdEncoding.EncodeToString(ct), nil
}

// open decrypts a value produced by seal.
func (c *mfaCipher) open(stored string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, mfaEncPrefix))
	if err != nil {
		return "", err
	}
	ns := c.aead.NonceSize()
	if len(raw) < ns {
		return "", errors.New("mfa: ciphertext too short")
	}
	return decodeToString(c.aead, raw[:ns], raw[ns:])
}

func decodeToString(aead cipher.AEAD, nonce, ct []byte) (string, error) {
	pt, err := aead.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(pt), nil
}

// isSealed reports whether a stored secret carries the encryption marker.
func isSealed(stored string) bool { return strings.HasPrefix(stored, mfaEncPrefix) }
