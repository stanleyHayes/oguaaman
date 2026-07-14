package service

import "testing"

func TestSafeURL(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", ""},
		{"   ", ""},
		{"https://example.com/x.pdf", "https://example.com/x.pdf"},
		{"http://example.com", "http://example.com"},
		{"  https://example.com  ", "https://example.com"},
		{"mailto:head@school.edu.gh", "mailto:head@school.edu.gh"},
		{"tel:+233200000000", "tel:+233200000000"},
		{"files/prospectus.pdf", "files/prospectus.pdf"}, // relative, no scheme
		{"/uploads/x.pdf", "/uploads/x.pdf"},
		{"#section", "#section"},
		// Dangerous schemes must be dropped (stored-XSS defense-in-depth).
		{"javascript:alert(1)", ""},
		{"JavaScript:alert(1)", ""},
		{"  javascript:alert(1)", ""},
		{"data:text/html;base64,PHNjcmlwdD4=", ""},
		{"vbscript:msgbox(1)", ""},
	}
	for _, c := range cases {
		if got := safeURL(c.in); got != c.want {
			t.Errorf("safeURL(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
