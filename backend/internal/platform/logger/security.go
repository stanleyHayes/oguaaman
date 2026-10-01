package logger

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"strings"
)

// Security event names. Alerting rules key on these (type=security, event=…),
// so treat them as a stable vocabulary: add new ones, never rename.
const (
	EventLoginFailed         = "login_failed"
	EventLoginLocked         = "login_locked"
	EventLoginBlockedDemo    = "login_blocked_demo_identity"
	EventMFAFailed           = "mfa_failed"
	EventMFAChallengeKilled  = "mfa_challenge_invalidated"
	EventMFAEnabled          = "mfa_enabled"
	EventMFAReset            = "mfa_reset"
	EventMFADisabled         = "mfa_disabled"
	EventMFASecretUnreadable = "mfa_secret_unreadable"
	EventPasswordChanged     = "password_changed"
	EventPasswordReset       = "password_reset"
	EventResetCodeKilled     = "password_reset_code_invalidated"
	EventRoleChanged         = "role_changed"
	EventSuspensionChanged   = "suspension_changed"
	EventStaffMFARequired    = "staff_mfa_required"
)

// KeyMemberID is the attribute key for the member a log line or event is about.
const KeyMemberID = "memberId"

type (
	clientIPKey struct{}
	actorKey    struct{}
)

// WithClientIP returns a context carrying the caller's IP address, which
// Security then attaches to every event logged under it.
func WithClientIP(ctx context.Context, ip string) context.Context {
	if ip == "" {
		return ctx
	}
	return context.WithValue(ctx, clientIPKey{}, ip)
}

// ClientIP returns the IP stored by WithClientIP ("" when none).
func ClientIP(ctx context.Context) string {
	ip, _ := ctx.Value(clientIPKey{}).(string)
	return ip
}

// WithActor returns a context carrying the signed-in member making the
// request, which Security then attaches to every event logged under it.
func WithActor(ctx context.Context, memberID string) context.Context {
	if memberID == "" {
		return ctx
	}
	return context.WithValue(ctx, actorKey{}, memberID)
}

// Actor returns the member id stored by WithActor ("" when none).
func Actor(ctx context.Context) string {
	id, _ := ctx.Value(actorKey{}).(string)
	return id
}

// Security logs a security event as {"type":"security","event":<event>,…} at
// WARN, adding the caller's IP and the acting member when the context carries
// them. Callers pass only pseudonymous attributes: member ids, HashIdentifier
// output — never raw emails, phone numbers, passwords or codes.
func Security(ctx context.Context, log *slog.Logger, event string, args ...any) {
	if log == nil {
		log = slog.Default()
	}
	attrs := make([]any, 0, len(args)+8)
	attrs = append(attrs, "type", "security", "event", event)
	if ip := ClientIP(ctx); ip != "" {
		attrs = append(attrs, "ip", ip)
	}
	if actor := Actor(ctx); actor != "" {
		attrs = append(attrs, "actorId", actor)
	}
	attrs = append(attrs, args...)
	log.WarnContext(ctx, "security event", attrs...)
}

// HashIdentifier returns a short keyed hash (HMAC-SHA256, 16 hex chars) of a
// sign-in identifier, so events about the same email or phone can be
// correlated without the log ever holding the identifier itself. The key must
// be secret: phone numbers are few enough that an unkeyed hash is reversible.
func HashIdentifier(key []byte, identifier string) string {
	identifier = strings.ToLower(strings.TrimSpace(identifier))
	if identifier == "" {
		return ""
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(identifier))
	return hex.EncodeToString(mac.Sum(nil))[:16]
}
