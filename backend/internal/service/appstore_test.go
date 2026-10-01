package service

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
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

// fakeCA is a root → intermediate → leaf chain shaped like Apple's: the
// intermediate carries the WWDR marker OID and the leaf the App Store
// receipt-signing OID (each can be left out to model a non-App-Store cert).
type fakeCA struct {
	rootCert         *x509.Certificate
	rootKey          *ecdsa.PrivateKey
	intermediateCert *x509.Certificate
	intermediateKey  *ecdsa.PrivateKey
	leafCert         *x509.Certificate
	leafKey          *ecdsa.PrivateKey
}

type fakeCAOptions struct {
	leafWithoutReceiptOID      bool
	intermediateWithoutWWDROID bool
}

// appleMarker is an Apple marker extension (its value is ASN.1 NULL).
func appleMarker(oid asn1.ObjectIdentifier) []pkix.Extension {
	return []pkix.Extension{{Id: oid, Value: []byte{0x05, 0x00}}}
}

func mustKey(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("key: %v", err)
	}
	return k
}

func mustCert(t *testing.T, tmpl, parent *x509.Certificate, pub *ecdsa.PublicKey, signer *ecdsa.PrivateKey) *x509.Certificate {
	t.Helper()
	der, err := x509.CreateCertificate(rand.Reader, tmpl, parent, pub, signer)
	if err != nil {
		t.Fatalf("cert %s: %v", tmpl.Subject.CommonName, err)
	}
	c, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse %s: %v", tmpl.Subject.CommonName, err)
	}
	return c
}

func newFakeCA(t *testing.T) *fakeCA { return newFakeCAWith(t, fakeCAOptions{}) }

func newFakeCAWith(t *testing.T, opts fakeCAOptions) *fakeCA {
	t.Helper()
	notBefore, notAfter := time.Now().Add(-time.Hour), time.Now().Add(24*time.Hour)
	rootKey := mustKey(t)
	rootTmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "Not Apple Root CA - G3"},
		NotBefore: notBefore, NotAfter: notAfter, IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign,
	}
	rootCert := mustCert(t, rootTmpl, rootTmpl, &rootKey.PublicKey, rootKey)

	intermediateKey := mustKey(t)
	intermediateTmpl := &x509.Certificate{
		SerialNumber: big.NewInt(2), Subject: pkix.Name{CommonName: "Not Apple WWDR CA - G6"},
		NotBefore: notBefore, NotAfter: notAfter, IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign,
	}
	if !opts.intermediateWithoutWWDROID {
		intermediateTmpl.ExtraExtensions = appleMarker(oidAppleWWDRIntermediate)
	}
	intermediateCert := mustCert(t, intermediateTmpl, rootCert, &intermediateKey.PublicKey, rootKey)

	leafKey := mustKey(t)
	leafTmpl := &x509.Certificate{
		SerialNumber: big.NewInt(3), Subject: pkix.Name{CommonName: "Not Apple Leaf"},
		NotBefore: notBefore, NotAfter: notAfter, KeyUsage: x509.KeyUsageDigitalSignature,
	}
	if !opts.leafWithoutReceiptOID {
		leafTmpl.ExtraExtensions = appleMarker(oidAppStoreReceiptSigner)
	}
	leafCert := mustCert(t, leafTmpl, intermediateCert, &leafKey.PublicKey, intermediateKey)
	return &fakeCA{rootCert: rootCert, rootKey: rootKey, intermediateCert: intermediateCert, intermediateKey: intermediateKey, leafCert: leafCert, leafKey: leafKey}
}

// chain is the x5c the fake CA presents: leaf, intermediate, root.
func (c *fakeCA) chain() []*x509.Certificate {
	return []*x509.Certificate{c.leafCert, c.intermediateCert, c.rootCert}
}

// signJWS produces a structurally perfect ES256 JWS with the CA's x5c chain.
func (c *fakeCA) signJWS(t *testing.T, payload AppleTransaction) string {
	t.Helper()
	return c.signJWSWithChain(t, payload, c.chain())
}

func (c *fakeCA) signJWSWithChain(t *testing.T, payload AppleTransaction, chain []*x509.Certificate) string {
	t.Helper()
	x5c := make([]string, 0, len(chain))
	for _, cert := range chain {
		x5c = append(x5c, base64.StdEncoding.EncodeToString(cert.Raw))
	}
	hb, _ := json.Marshal(map[string]any{"alg": "ES256", "x5c": x5c})
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
	if v.roots == nil || v.root == nil {
		t.Fatal("no root pool built")
	}
	if got := len(v.roots.Subjects()); got != 1 { //nolint:staticcheck // reading our own pool
		t.Errorf("root pool holds %d certs, want exactly 1", got)
	}
	if v.root.Subject.CommonName != "Apple Root CA - G3" {
		t.Errorf("pinned root is %q", v.root.Subject.CommonName)
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

// Everything below is exercised against a chain we control, pinned as if it
// were Apple's root, so each check is isolated from the others.
func policyVerifier(t *testing.T, ca *fakeCA, sandbox bool) *AppleVerifier {
	t.Helper()
	v := verifier(t, sandbox)
	v.root = ca.rootCert
	v.roots = x509.NewCertPool()
	v.roots.AddCert(ca.rootCert)
	return v
}

// Tampering with the payload after signing must break the signature.
func TestTamperedPayloadBreaksSignature(t *testing.T) {
	ca := newFakeCA(t)
	jws := ca.signJWS(t, AppleTransaction{TransactionID: "1", ProductID: "cheap", BundleID: "gh.oguaa.app", Environment: "Production"})
	parts := strings.Split(jws, ".")
	swapped, _ := json.Marshal(AppleTransaction{TransactionID: "1", ProductID: "expensive", BundleID: "gh.oguaa.app", Environment: "Production"})
	parts[1] = base64.RawURLEncoding.EncodeToString(swapped)
	if _, err := policyVerifier(t, ca, false).Verify(strings.Join(parts, ".")); err == nil {
		t.Fatal("a payload swapped after signing was accepted")
	}
}

// F047: a certificate that chains to Apple's root but is not an App Store
// receipt-signing certificate (e.g. an Apple Pay key a developer generated)
// must not be able to sign receipts.
func TestLeafWithoutAppStoreReceiptOIDIsRejected(t *testing.T) {
	ca := newFakeCAWith(t, fakeCAOptions{leafWithoutReceiptOID: true})
	jws := ca.signJWS(t, AppleTransaction{TransactionID: "1", ProductID: "p", BundleID: "gh.oguaa.app", Environment: "Production"})
	if _, err := policyVerifier(t, ca, false).Verify(jws); err == nil {
		t.Fatal("a leaf without the App Store receipt-signing OID was accepted")
	}
}

func TestIntermediateWithoutWWDROIDIsRejected(t *testing.T) {
	ca := newFakeCAWith(t, fakeCAOptions{intermediateWithoutWWDROID: true})
	jws := ca.signJWS(t, AppleTransaction{TransactionID: "1", ProductID: "p", BundleID: "gh.oguaa.app", Environment: "Production"})
	if _, err := policyVerifier(t, ca, false).Verify(jws); err == nil {
		t.Fatal("an intermediate without the WWDR OID was accepted")
	}
}

// The chain must be exactly leaf, intermediate and the pinned root.
func TestChainMustBeLeafIntermediateAndThePinnedRoot(t *testing.T) {
	ca := newFakeCA(t)
	other := newFakeCA(t)
	tx := AppleTransaction{TransactionID: "1", ProductID: "p", BundleID: "gh.oguaa.app", Environment: "Production"}
	for name, chain := range map[string][]*x509.Certificate{
		"two certificates":    {ca.leafCert, ca.intermediateCert},
		"four certificates":   {ca.leafCert, ca.intermediateCert, ca.rootCert, ca.rootCert},
		"someone else's root": {ca.leafCert, ca.intermediateCert, other.rootCert},
	} {
		if _, err := policyVerifier(t, ca, false).Verify(ca.signJWSWithChain(t, tx, chain)); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
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

// F058/A009: App Review buys in the sandbox against the production server, so
// sandbox receipts are accepted (IAPService flags and time-limits them).
func TestSandboxReceiptIsAcceptedAndFlagged(t *testing.T) {
	ca := newFakeCA(t)
	jws := ca.signJWS(t, AppleTransaction{TransactionID: "1", ProductID: "p", BundleID: "gh.oguaa.app", Environment: AppleEnvironmentSandbox})
	for _, allow := range []bool{false, true} {
		got, err := policyVerifier(t, ca, allow).Verify(jws)
		if err != nil {
			t.Fatalf("allowSandbox=%v: a sandbox receipt was refused: %v", allow, err)
		}
		if got.Environment != AppleEnvironmentSandbox {
			t.Fatalf("environment=%q", got.Environment)
		}
	}
	unknown := ca.signJWS(t, AppleTransaction{TransactionID: "1", ProductID: "p", BundleID: "gh.oguaa.app", Environment: "Xcode"})
	if _, err := policyVerifier(t, ca, false).Verify(unknown); err == nil {
		t.Fatal("an unknown environment was accepted")
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
