// Package logger provides a small structured logger built on log/slog, with
// contact details masked on the way out and a helper for security events.
package logger

import (
	"log/slog"
	"os"
	"strings"
)

// New returns a JSON structured logger writing to stdout. Attributes that carry
// contact details (email, phone, to, identifier) are masked before they are
// written, so a stray log line can never publish a member's full address or
// number into the retained platform logs.
func New() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level:       slog.LevelInfo,
		ReplaceAttr: RedactAttr,
	}))
}

// contactKeys are attribute keys whose string values are always contact details.
var contactKeys = map[string]bool{"email": true, "phone": true, "to": true, "identifier": true}

// RedactAttr is a slog ReplaceAttr hook that masks contact details.
func RedactAttr(_ []string, a slog.Attr) slog.Attr {
	if contactKeys[strings.ToLower(a.Key)] && a.Value.Kind() == slog.KindString {
		return slog.String(a.Key, MaskContact(a.Value.String()))
	}
	return a
}

// MaskContact masks an email address or phone number, keeping just enough to
// tell entries apart in an investigation: "a***@example.com", "+23324*****12".
func MaskContact(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	if at := strings.LastIndex(v, "@"); at >= 0 {
		first := ""
		if at > 0 {
			first = v[:1]
		}
		return first + "***" + v[at:]
	}
	const keepHead, keepTail = 6, 2
	tail := min(len(v), keepTail)
	if len(v) <= keepHead+keepTail {
		return strings.Repeat("*", len(v)-tail) + v[len(v)-tail:]
	}
	return v[:keepHead] + strings.Repeat("*", len(v)-keepHead-tail) + v[len(v)-tail:]
}
