package http

import "testing"

// The sitemap is advertised to Google. Serving localhost URLs would be a valid
// 200 that quietly poisons the index, so the guard must reject every local form.
func TestPublishableBaseRejectsLocalAndEmpty(t *testing.T) {
	for base, want := range map[string]bool{
		"https://citizen.oguaaman.com": true,
		"http://citizen.oguaaman.com":  true,
		"":                             false,
		"http://localhost:5173":        false, // the config default
		"https://localhost":            false,
		"http://127.0.0.1:5173":        false,
		"http://0.0.0.0:5173":          false,
		"http://[::1]:5173":            false,
		"citizen.oguaaman.com":         false, // no scheme
	} {
		if got := publishableBase(base); got != want {
			t.Errorf("publishableBase(%q) = %v, want %v", base, got, want)
		}
	}
}
