package config

import "testing"

// A connect failure is exactly when someone pastes a log into a chat asking for
// help, so the URI must never carry credentials.
func TestRedactedMongoURIRemovesCredentials(t *testing.T) {
	cases := map[string]string{
		"mongodb+srv://user:s3cret@cluster0.abc.mongodb.net/db?x=1": "mongodb+srv://<redacted>@cluster0.abc.mongodb.net/db?x=1",
		"mongodb://localhost:27017":                                "mongodb://localhost:27017",
		"mongodb://u:p@a@host/db":                                  "mongodb://<redacted>@host/db",
		"garbage":                                                  "(malformed uri)",
	}
	for in, want := range cases {
		if got := RedactedMongoURI(in); got != want {
			t.Errorf("RedactedMongoURI(%q) = %q, want %q", in, got, want)
		}
	}
	if got := RedactedMongoURI("mongodb+srv://user:s3cret@h/db"); got == "" || contains(got, "s3cret") {
		t.Errorf("password survived redaction: %q", got)
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
