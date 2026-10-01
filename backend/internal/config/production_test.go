package config

import (
	"strings"
	"testing"
)

// A014/P054: production reports every missing optional key (never fatal).
func TestProductionWarnings(t *testing.T) {
	if w := (Config{}).ProductionWarnings(); w != nil {
		t.Fatalf("dev warnings = %v, want none", w)
	}
	w := Config{Production: true}.ProductionWarnings()
	joined := strings.Join(w, "\n")
	for _, key := range []string{"PAYSTACK_SECRET_KEY", "RESEND_API_KEY", "WHATSAPP_TOKEN"} {
		if !strings.Contains(joined, key) {
			t.Errorf("warnings missing %s: %v", key, w)
		}
	}
	w = Config{Production: true, PaystackSecretKey: "sk_live_x", ResendAPIKey: "re", WhatsAppToken: "t", WhatsAppPhoneID: "p"}.ProductionWarnings()
	if len(w) != 1 || !strings.Contains(w[0], "WHATSAPP_OTP_TEMPLATE") {
		t.Fatalf("warnings = %v, want only the template one", w)
	}
}

// Production always enforces sign-in, whatever AUTH_REQUIRED says.
func TestLoad_productionForcesAuth(t *testing.T) {
	t.Setenv("GO_ENV", "production")
	t.Setenv("AUTH_REQUIRED", "")
	if !load().AuthRequired {
		t.Fatal("production loaded with AuthRequired=false")
	}
	t.Setenv("GO_ENV", "")
	if load().AuthRequired {
		t.Fatal("dev without AUTH_REQUIRED should keep auth off")
	}
}

// P07/P22: production names a test or malformed Paystack key; the key is
// trimmed so a pasted newline can't break the Authorization header.
func TestPaystackMode(t *testing.T) {
	for key, want := range map[string]string{"": PaystackModeNone, "sk_live_abc": PaystackModeLive, "sk_test_abc": PaystackModeTest, "pk_live_abc": PaystackModeUnknown} {
		if got := (Config{PaystackSecretKey: key}).PaystackMode(); got != want {
			t.Errorf("mode(%q) = %q, want %q", key, got, want)
		}
	}
	w := Config{Production: true, PaystackSecretKey: "sk_test_abc", ResendAPIKey: "re", WhatsAppToken: "t", WhatsAppPhoneID: "p", WhatsAppOTPTemplate: "otp"}.ProductionWarnings()
	if len(w) != 1 || !strings.Contains(w[0], "TEST key") {
		t.Fatalf("warnings = %v, want the test-key one", w)
	}
	if w := (Config{PaystackSecretKey: "sk_test_abc"}).ProductionWarnings(); w != nil {
		t.Fatalf("dev with a test key warned: %v", w)
	}
	t.Setenv("PAYSTACK_SECRET_KEY", " sk_live_abc\n")
	if got := load().PaystackSecretKey; got != "sk_live_abc" {
		t.Fatalf("key = %q, want it trimmed", got)
	}
}
