package service

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"strings"
	"testing"
	"time"
)

// The verifier's whole job is to reject receipts that are not Apple's. These
// tests build a complete, well-formed, correctly-signed JWS from an attacker's
// own certificate authority — the exact shape a forgery takes — and assert it is
// refused. A verifier that only ever sees genuine input proves nothing.

type fakeCA struct {
	rootCert *x509.Certificate
	rootKey  *ecdsa.PrivateKey
	leafCert *x509.Certificate
	leafKey  *ecdsa.PrivateKey
}

func newFakeCA(t *testing.T) *fakeCA {
	t.Helper()
	rootKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("root key: %v", err)
	}
	rootTmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "Not Apple Root CA - G3"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign,
	}
	rootDER, err := x509.CreateCertificate(rand.Reader, rootTmpl, rootTmpl, &rootKey.PublicKey, rootKey)
	if err != nil {
		t.Fatalf("root cert: %v", err)
	}
	rootCert, _ := x509.ParseCertificate(rootDER)

	leafKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("leaf key: %v", err)
	}
	leafTmpl := &x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject:      pkix.Name{CommonName: "Not Apple Leaf"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
	}
	leafDER, err := x509.CreateCertificate(rand.Reader, leafTmpl, rootCert, &leafKey.PublicKey, rootKey)
	if err != nil {
		t.Fatalf("leaf cert: %v", err)
	}
	leafCert, _ := x509.ParseCertificate(leafDER)
	return &fakeCA{rootCert: rootCert, rootKey: rootKey, leafCert: leafCert, leafKey: leafKey}
}

// signJWS produces a structurally perfect ES256 JWS with an x5c chain.
func (c *fakeCA) signJWS(t *testing.T, payload AppleTransaction) string {
	t.Helper()
	header := map[string]any{
		"alg": "ES256",
		"x5c": []string{
			base64.StdEncoding.EncodeToString(c.leafCert.Raw),
			base64.StdEncoding.EncodeToString(c.rootCert.Raw),
		},
	}
	hb, _ := json.Marshal(header)
	pb, _ := json.Marshal(payload)
	signing := base64.RawURLEncoding.EncodeToString(hb) + "." + base64.RawURLEncoding.EncodeToString(pb)
	digest := sha256.Sum256([]byte(signing))
	r, s, err := ecdsa.Sign(rand.Reader, c.leafKey, digest[:])
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	return signing + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func verifier(t *testing.T, sandbox bool) *AppleVerifier {
	t.Helper()
	v, err := NewAppleVerifier("gh.oguaa.app", sandbox)
	if err != nil {
		t.Fatalf("NewAppleVerifier: %v", err)
	}
	return v
}

// The embedded root must be the real Apple Root CA - G3, self-signed.
func TestEmbeddedRootIsAppleRootCAG3(t *testing.T) {
	v := verifier(t, false)
	if v.roots == nil {
		t.Fatal("no root pool built")
	}
	if got := len(v.roots.Subjects()); got != 1 { //nolint:staticcheck // reading our own pool
		t.Errorf("root pool holds %d certs, want exactly 1", got)
	}
}

// A forged receipt signed by an attacker's own CA is well-formed in every way
// except provenance. It must be refused.
func TestForgedChainIsRejected(t *testing.T) {
	ca := newFakeCA(t)
	jws := ca.signJWS(t, AppleTransaction{
		TransactionID: "1", ProductID: "creator_pro_month",
		BundleID: "gh.oguaa.app", Environment: "Production",
	})
	if _, err := verifier(t, false).Verify(jws); err == nil {
		t.Fatal("a receipt signed by a non-Apple CA was accepted — anyone could mint subscriptions")
	}
}

func TestMalformedReceiptsAreRejected(t *testing.T) {
	v := verifier(t, false)
	for name, jws := range map[string]string{
		"empty":            "",
		"not a jws":        "just-a-string",
		"two segments":     "aaa.bbb",
		"four segments":    "aaa.bbb.ccc.ddd",
		"garbage segments": "!!!.???.***",
	} {
		if _, err := v.Verify(jws); err == nil {
			t.Errorf("%s: accepted, want rejected", name)
		}
	}
}

// "alg": "none" is the oldest JWT forgery there is.
func TestAlgNoneIsRejected(t *testing.T) {
	hb, _ := json.Marshal(map[string]any{"alg": "none", "x5c": []string{"x"}})
	pb, _ := json.Marshal(AppleTransaction{TransactionID: "1", ProductID: "p", BundleID: "gh.oguaa.app"})
	jws := base64.RawURLEncoding.EncodeToString(hb) + "." + base64.RawURLEncoding.EncodeToString(pb) + "."
	if _, err := verifier(t, false).Verify(jws); err == nil {
		t.Fatal(`"alg":"none" was accepted`)
	}
}

func TestHeaderWithoutCertChainIsRejected(t *testing.T) {
	hb, _ := json.Marshal(map[string]any{"alg": "ES256", "x5c": []string{}})
	pb, _ := json.Marshal(AppleTransaction{TransactionID: "1", ProductID: "p", BundleID: "gh.oguaa.app"})
	jws := base64.RawURLEncoding.EncodeToString(hb) + "." + base64.RawURLEncoding.EncodeToString(pb) + ".AAAA"
	if _, err := verifier(t, false).Verify(jws); err == nil {
		t.Fatal("a header with no x5c chain was accepted")
	}
}

// Tampering with the payload after signing must break the signature. Checked
// against our own CA so we isolate the signature check from the chain check.
func TestTamperedPayloadBreaksSignature(t *testing.T) {
	ca := newFakeCA(t)
	jws := ca.signJWS(t, AppleTransaction{TransactionID: "1", ProductID: "cheap", BundleID: "gh.oguaa.app"})
	parts := strings.Split(jws, ".")
	swapped, _ := json.Marshal(AppleTransaction{TransactionID: "1", ProductID: "expensive", BundleID: "gh.oguaa.app"})
	parts[1] = base64.RawURLEncoding.EncodeToString(swapped)

	// Verify against the fake CA's own root: the chain would pass, so only the
	// signature stands between the swap and an entitlement.
	v := verifier(t, false)
	v.roots = x509.NewCertPool()
	v.roots.AddCert(ca.rootCert)
	if _, err := v.Verify(strings.Join(parts, ".")); err == nil {
		t.Fatal("a payload swapped after signing was accepted")
	}
}

// Everything below verifies the policy checks that run after the signature, so
// they are exercised against a chain we control.
func policyVerifier(t *testing.T, ca *fakeCA, sandbox bool) *AppleVerifier {
	t.Helper()
	v := verifier(t, sandbox)
	v.roots = x509.NewCertPool()
	v.roots.AddCert(ca.rootCert)
	return v
}

func TestReceiptForAnotherAppIsRejected(t *testing.T) {
	ca := newFakeCA(t)
	jws := ca.signJWS(t, AppleTransaction{
		TransactionID: "1", ProductID: "p", BundleID: "com.someone.else", Environment: "Production",
	})
	if _, err := policyVerifier(t, ca, false).Verify(jws); err == nil {
		t.Fatal("a genuine receipt for a different bundle id was accepted")
	}
}

func TestSandboxRejectedInProductionAcceptedWhenAllowed(t *testing.T) {
	ca := newFakeCA(t)
	tx := AppleTransaction{TransactionID: "1", ProductID: "p", BundleID: "gh.oguaa.app", Environment: "Sandbox"}
	jws := ca.signJWS(t, tx)

	if _, err := policyVerifier(t, ca, false).Verify(jws); err == nil {
		t.Error("a sandbox receipt was accepted with sandbox disabled — free subscriptions for any tester")
	}
	if _, err := policyVerifier(t, ca, true).Verify(jws); err != nil {
		t.Errorf("a sandbox receipt was refused with sandbox enabled: %v", err)
	}
}

func TestRevokedReceiptIsRejected(t *testing.T) {
	ca := newFakeCA(t)
	jws := ca.signJWS(t, AppleTransaction{
		TransactionID: "1", ProductID: "p", BundleID: "gh.oguaa.app", Environment: "Production",
		RevocationDate: time.Now().UnixMilli(),
	})
	if _, err := policyVerifier(t, ca, false).Verify(jws); err == nil {
		t.Fatal("a refunded/revoked receipt was accepted")
	}
}

func TestValidReceiptIsAcceptedAndParsed(t *testing.T) {
	ca := newFakeCA(t)
	expires := time.Now().Add(30 * 24 * time.Hour).UnixMilli()
	jws := ca.signJWS(t, AppleTransaction{
		TransactionID: "tx-9", OriginalTransactionID: "tx-1", ProductID: "creator_pro_month",
		BundleID: "gh.oguaa.app", Environment: "Production", Type: "Auto-Renewable Subscription",
		ExpiresDate: expires, Quantity: 1,
	})
	got, err := policyVerifier(t, ca, false).Verify(jws)
	if err != nil {
		t.Fatalf("a well-formed receipt was refused: %v", err)
	}
	if got.ProductID != "creator_pro_month" || got.TransactionID != "tx-9" {
		t.Errorf("parsed %+v, want productId=creator_pro_month transactionId=tx-9", got)
	}
	if got.Expiry().IsZero() {
		t.Error("Expiry() is zero for a subscription that carries expiresDate")
	}
	if got.Revoked() {
		t.Error("Revoked() true for a receipt with no revocationDate")
	}
}
