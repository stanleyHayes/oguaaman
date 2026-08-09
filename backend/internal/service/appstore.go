package service

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
)

// ── Apple StoreKit 2 signed-transaction verification ─────────────────────────
//
// App Store Review Guideline 3.1.1 requires digital content sold inside the iOS
// app to go through In-App Purchase. StoreKit 2 hands the app a JWS — a signed
// transaction — and the ONLY thing that makes it trustworthy is verifying that
// signature server-side. A client that says "I bought Creator Pro" is a claim,
// not a receipt; anyone can post that JSON to the API.
//
// Verification is done locally rather than by calling the App Store Server API,
// because local verification needs no credentials (no issuer id, key id or
// signing key to provision, rotate and leak). Apple documents both as valid.
//
// The JWS header carries an `x5c` chain: leaf, intermediate, root. We
//   1. parse the chain,
//   2. verify it terminates at Apple's Root CA G3 — the copy embedded below,
//      NOT whatever root the token itself supplies, which would be circular,
//   3. verify the ES256 signature over `header.payload` with the leaf key,
//   4. and only then read the payload.

//go:embed applecerts/AppleRootCA-G3.pem
var appleRootCAPEM []byte

// ErrAppleReceiptInvalid is returned for any receipt we could not prove genuine.
// The reason is deliberately not surfaced to the client: a caller probing the
// verifier should not learn which step of the check it failed.
var ErrAppleReceiptInvalid = errors.New("apple receipt could not be verified")

// AppleTransaction is the subset of Apple's JWSTransactionDecodedPayload we act
// on. Field names follow Apple's wire format.
type AppleTransaction struct {
	TransactionID         string `json:"transactionId"`
	OriginalTransactionID string `json:"originalTransactionId"`
	BundleID              string `json:"bundleId"`
	ProductID             string `json:"productId"`
	Type                  string `json:"type"`                  // Auto-Renewable Subscription | Consumable | Non-Consumable | Non-Renewing Subscription
	PurchaseDate          int64  `json:"purchaseDate"`          // ms since epoch
	ExpiresDate           int64  `json:"expiresDate,omitempty"` // ms; subscriptions only
	RevocationDate        int64  `json:"revocationDate,omitempty"`
	Quantity              int    `json:"quantity"`
	InAppOwnershipType    string `json:"inAppOwnershipType"`
	Environment           string `json:"environment"` // Production | Sandbox
	AppAccountToken       string `json:"appAccountToken,omitempty"`
}

// Expiry returns the subscription expiry as a time, or the zero time when the
// product does not expire.
func (t AppleTransaction) Expiry() time.Time {
	if t.ExpiresDate == 0 {
		return time.Time{}
	}
	return time.UnixMilli(t.ExpiresDate).UTC()
}

// Revoked reports whether Apple refunded or revoked the purchase. A revoked
// transaction must never grant an entitlement.
func (t AppleTransaction) Revoked() bool { return t.RevocationDate != 0 }

// AppleVerifier verifies StoreKit 2 signed transactions for one bundle id.
type AppleVerifier struct {
	bundleID  string
	roots     *x509.CertPool
	allowSbox bool
	nowFn     func() time.Time // injectable for tests
}

// NewAppleVerifier builds a verifier pinned to bundleID.
//
// allowSandbox must be false in production. Sandbox transactions are signed by
// the same Apple chain and are otherwise indistinguishable, so accepting them on
// a live server would let anyone with a sandbox tester account mint free
// subscriptions.
func NewAppleVerifier(bundleID string, allowSandbox bool) (*AppleVerifier, error) {
	block, _ := pem.Decode(appleRootCAPEM)
	if block == nil {
		return nil, errors.New("apple root CA: embedded PEM is not decodable")
	}
	root, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("apple root CA: %w", err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(root)
	return &AppleVerifier{bundleID: bundleID, roots: pool, allowSbox: allowSandbox, nowFn: time.Now}, nil
}

// Verify checks a signed transaction and returns its payload.
func (v *AppleVerifier) Verify(jws string) (*AppleTransaction, error) {
	parts := strings.Split(jws, ".")
	if len(parts) != 3 {
		return nil, ErrAppleReceiptInvalid
	}

	headerJSON, err := b64url(parts[0])
	if err != nil {
		return nil, ErrAppleReceiptInvalid
	}
	var header struct {
		Alg string   `json:"alg"`
		X5c []string `json:"x5c"`
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, ErrAppleReceiptInvalid
	}
	// Pin the algorithm. Accepting whatever `alg` says is the classic JWT
	// forgery: "none" or an HMAC alg would let the token vouch for itself.
	if header.Alg != "ES256" || len(header.X5c) == 0 {
		return nil, ErrAppleReceiptInvalid
	}

	certs := make([]*x509.Certificate, 0, len(header.X5c))
	for _, raw := range header.X5c {
		der, dErr := base64.StdEncoding.DecodeString(raw) // x5c is standard base64, not base64url
		if dErr != nil {
			return nil, ErrAppleReceiptInvalid
		}
		c, cErr := x509.ParseCertificate(der)
		if cErr != nil {
			return nil, ErrAppleReceiptInvalid
		}
		certs = append(certs, c)
	}

	leaf := certs[0]
	intermediates := x509.NewCertPool()
	for _, c := range certs[1:] {
		intermediates.AddCert(c)
	}
	if _, err := leaf.Verify(x509.VerifyOptions{
		Roots:         v.roots, // our embedded Apple root, never the token's
		Intermediates: intermediates,
		CurrentTime:   v.nowFn(),
		KeyUsages:     []x509.ExtKeyUsage{x509.ExtKeyUsageAny},
	}); err != nil {
		return nil, ErrAppleReceiptInvalid
	}

	pub, ok := leaf.PublicKey.(*ecdsa.PublicKey)
	if !ok {
		return nil, ErrAppleReceiptInvalid
	}
	sig, err := b64url(parts[2])
	if err != nil || len(sig) != 64 { // JWS ES256: raw R||S, 32 bytes each
		return nil, ErrAppleReceiptInvalid
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	r := new(big.Int).SetBytes(sig[:32])
	s := new(big.Int).SetBytes(sig[32:])
	if !ecdsa.Verify(pub, digest[:], r, s) {
		return nil, ErrAppleReceiptInvalid
	}

	payloadJSON, err := b64url(parts[1])
	if err != nil {
		return nil, ErrAppleReceiptInvalid
	}
	var tx AppleTransaction
	if err := json.Unmarshal(payloadJSON, &tx); err != nil {
		return nil, ErrAppleReceiptInvalid
	}

	// A genuine signature for someone else's app is still not ours to honour.
	if tx.BundleID != v.bundleID {
		return nil, ErrAppleReceiptInvalid
	}
	if tx.Environment == "Sandbox" && !v.allowSbox {
		return nil, ErrAppleReceiptInvalid
	}
	if tx.Revoked() {
		return nil, ErrAppleReceiptInvalid
	}
	if tx.TransactionID == "" || tx.ProductID == "" {
		return nil, ErrAppleReceiptInvalid
	}
	return &tx, nil
}

// b64url decodes unpadded base64url, which is what JWS segments use.
func b64url(s string) ([]byte, error) { return base64.RawURLEncoding.DecodeString(s) }
