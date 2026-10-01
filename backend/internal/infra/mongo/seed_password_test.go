package mongo

import "testing"

// P075 / A027: the documented demo password is never used in production.
func TestSeedPasswordNeverDefaultsInProduction(t *testing.T) {
	t.Setenv("SEED_PASSWORD", "")
	t.Setenv("GO_ENV", "production")
	if pw, err := SeedPassword(); err == nil || pw != "" {
		t.Fatalf("production without SEED_PASSWORD: got %q, %v; want no password and an error", pw, err)
	}
	t.Setenv("SEED_PASSWORD", "a-real-secret")
	if pw, err := SeedPassword(); err != nil || pw != "a-real-secret" {
		t.Fatalf("SEED_PASSWORD not honoured: %q, %v", pw, err)
	}
	t.Setenv("SEED_PASSWORD", "")
	t.Setenv("GO_ENV", "")
	if pw, err := SeedPassword(); err != nil || pw != devSeedPassword {
		t.Fatalf("development default: %q, %v", pw, err)
	}
}
