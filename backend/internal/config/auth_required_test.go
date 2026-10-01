package config

import "testing"

// A027: production never runs with sign-in switched off, even if AUTH_REQUIRED
// is missing or false.
func TestAuthRequiredForcedInProduction(t *testing.T) {
	cases := []struct {
		env, flag string
		want      bool
	}{
		{"", "", false},
		{"", "true", true},
		{"development", "false", false},
		{"production", "", true},
		{"production", "false", true},
		{"production", "true", true},
	}
	for _, c := range cases {
		t.Setenv("GO_ENV", c.env)
		t.Setenv("AUTH_REQUIRED", c.flag)
		if got := authRequired(); got != c.want {
			t.Errorf("GO_ENV=%q AUTH_REQUIRED=%q: authRequired() = %v, want %v", c.env, c.flag, got, c.want)
		}
	}
}
