package service

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	_ "embed"
	"encoding/asn1"
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
//   1. parse the chain, which must be exactly those three certificates, with
//      the root byte-for-byte equal to Apple's Root CA G3 embedded below,
//   2. verify it chains to that embedded root — NOT whatever root the token
//      itself supplies, which would be circular,
//   3. require Apple's App Store marker extensions, as Apple's own App Store
//      Server Library does: the leaf must carry the receipt-signing OID
//      1.2.840.113635.100.6.11.1 and the intermediate the WWDR intermediate
//      OID 1.2.840.113635.100.6.2.1. Apple Root CA G3 also anchors CAs that
//      ordinary developers get certificates from (e.g. Apple Pay payment
//      processing keys they generate themselves), so "chains to Apple" alone
//      would let any developer sign receipts,
//   4. verify the ES256 signature over `header.payload` with the leaf key,
//   5. and only then read the payload.

//go:embed applecerts/AppleRootCA-G3.pem
var appleRootCAPEM []byte

// ErrAppleReceiptInvalid is returned for any receipt we could not prove genuine.
// The reason is deliberately not surfaced to the client: a caller probing the
// verifier should not learn which step of the check it failed.
var ErrAppleReceiptInvalid = errors.New("apple receipt could not be verified")

// Apple's certificate marker extensions for App Store signing.
var (
	oidAppStoreReceiptSigner = asn1.ObjectIdentifier{1, 2, 840, 113635, 100, 6, 11, 1}
	oidAppleWWDRIntermediate = asn1.ObjectIdentifier{1, 2, 840, 113635, 100, 6, 2, 1}
)

// AppleEnvironmentSandbox is the environment StoreKit stamps on sandbox
// purchases (App Review, TestFlight, development builds).
const AppleEnvironmentSandbox = "Sandbox"

// hasExtension reports whether a certificate carries the given extension.
func hasExtension(c *x509.Certificate, oid asn1.ObjectIdentifier) bool {
	for _, ext := range c.Extensions {
		if ext.Id.Equal(oid) {
			return true
		}
	}
	return false
}

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
	bundleID string
	root     *x509.Certificate // Apple Root CA - G3 (x5c[2] must be exactly this)
	roots    *x509.CertPool
	// sandboxAppleExpiry makes sandbox grants follow Apple's own (heavily
	// accelerated) sandbox expiry instead of the flat 24-hour review window —
	// for a staging server that exercises renewals. Never needed in production.
	sandboxAppleExpiry bool
	nowFn              func() time.Time // injectable for tests
}

// NewAppleVerifier builds a verifier pinned to bundleID.
//
// Sandbox purchases are always accepted: App Review buys in the sandbox
// against the production server, so refusing them fails review. They carry
// Environment "Sandbox", are flagged and time-limited by IAPService, and are
// never counted as revenue. allowSandbox (APPLE_ALLOW_SANDBOX) no longer gates
// that; it only makes sandbox grants follow Apple's accelerated sandbox expiry
// (a staging aid) instead of the 24-hour window used in production.
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
	return &AppleVerifier{bundleID: bundleID, root: root, roots: pool, sandboxAppleExpiry: allowSandbox, nowFn: time.Now}, nil
}

// jwsHeader is the protected header of a StoreKit JWS.
type jwsHeader struct {
	Alg string   `json:"alg"`
	X5c []string `json:"x5c"`
}

// parseChain decodes the x5c chain. Apple's is always leaf, intermediate,
// root; anything else is not an App Store receipt.
func parseChain(x5c []string) ([]*x509.Certificate, error) {
	if len(x5c) != 3 {
		return nil, ErrAppleReceiptInvalid
	}
	certs := make([]*x509.Certificate, 0, len(x5c))
	for _, raw := range x5c {
		der, err := base64.StdEncoding.DecodeString(raw) // x5c is standard base64, not base64url
		if err != nil {
			return nil, ErrAppleReceiptInvalid
		}
		c, err := x509.ParseCertificate(der)
		if err != nil {
			return nil, ErrAppleReceiptInvalid
		}
		certs = append(certs, c)
	}
	return certs, nil
}

// verifyChain proves the leaf is an App Store receipt-signing certificate
// issued by Apple's WWDR intermediate under the embedded Apple root.
func (v *AppleVerifier) verifyChain(certs []*x509.Certificate) error {
	leaf, intermediate, root := certs[0], certs[1], certs[2]
	if v.root == nil || !bytes.Equal(root.Raw, v.root.Raw) {
		return ErrAppleReceiptInvalid
	}
	if !hasExtension(leaf, oidAppStoreReceiptSigner) || !hasExtension(intermediate, oidAppleWWDRIntermediate) {
		return ErrAppleReceiptInvalid
	}
	intermediates := x509.NewCertPool()
	intermediates.AddCert(intermediate)
	if _, err := leaf.Verify(x509.VerifyOptions{
		Roots:         v.roots, // our embedded Apple root, never the token's
		Intermediates: intermediates,
		CurrentTime:   v.nowFn(),
		KeyUsages:     []x509.ExtKeyUsage{x509.ExtKeyUsageAny},
	}); err != nil {
		return ErrAppleReceiptInvalid
	}
	return nil
}

// verifySignature checks the ES256 signature over header.payload.
func verifySignature(leaf *x509.Certificate, signingInput, signature string) error {
	pub, ok := leaf.PublicKey.(*ecdsa.PublicKey)
	if !ok {
		return ErrAppleReceiptInvalid
	}
	sig, err := b64url(signature)
	if err != nil || len(sig) != 64 { // JWS ES256: raw R||S, 32 bytes each
		return ErrAppleReceiptInvalid
	}
	digest := sha256.Sum256([]byte(signingInput))
	r := new(big.Int).SetBytes(sig[:32])
	s := new(big.Int).SetBytes(sig[32:])
	if !ecdsa.Verify(pub, digest[:], r, s) {
		return ErrAppleReceiptInvalid
	}
	return nil
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
	var header jwsHeader
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, ErrAppleReceiptInvalid
	}
	// Pin the algorithm. Accepting whatever `alg` says is the classic JWT
	// forgery: "none" or an HMAC alg would let the token vouch for itself.
	if header.Alg != "ES256" {
		return nil, ErrAppleReceiptInvalid
	}
	certs, err := parseChain(header.X5c)
	if err != nil {
		return nil, err
	}
	if err := v.verifyChain(certs); err != nil {
		return nil, err
	}
	if err := verifySignature(certs[0], parts[0]+"."+parts[1], parts[2]); err != nil {
		return nil, err
	}
	payloadJSON, err := b64url(parts[1])
	if err != nil {
		return nil, ErrAppleReceiptInvalid
	}
	var tx AppleTransaction
	if err := json.Unmarshal(payloadJSON, &tx); err != nil {
		return nil, ErrAppleReceiptInvalid
	}
	return v.checkPayload(&tx)
}

// checkPayload applies the policy checks that follow a valid signature.
func (v *AppleVerifier) checkPayload(tx *AppleTransaction) (*AppleTransaction, error) {
	// A genuine signature for someone else's app is still not ours to honour.
	if tx.BundleID != v.bundleID {
		return nil, ErrAppleReceiptInvalid
	}
	if tx.Environment != "Production" && tx.Environment != AppleEnvironmentSandbox {
		return nil, ErrAppleReceiptInvalid
	}
	if tx.Revoked() {
		return nil, ErrAppleReceiptInvalid
	}
	if tx.TransactionID == "" || tx.ProductID == "" {
		return nil, ErrAppleReceiptInvalid
	}
	return tx, nil
}

// b64url decodes unpadded base64url, which is what JWS segments use.
func b64url(s string) ([]byte, error) { return base64.RawURLEncoding.DecodeString(s) }
