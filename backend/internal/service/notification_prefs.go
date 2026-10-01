package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── notification preferences (contract K14): read/update, the in-app gate and
// the signed one-click unsubscribe ─────────────────────────────────────────────

// NotificationPrefsUpdate is a partial change to a member's preferences: a nil
// field keeps its current value.
type NotificationPrefsUpdate struct {
	Safety, Community, Remembrances, Product *bool
	Push, Email, WhatsApp                    *bool
}

// NotificationPreferences returns the member's preferences (the defaults when
// they never chose: product news and WhatsApp off, everything else on).
func (s *Service) NotificationPreferences(ctx context.Context, memberID string) (domain.NotificationPrefs, error) {
	m, err := s.members.ByID(ctx, memberID)
	if err != nil {
		return domain.NotificationPrefs{}, err
	}
	return m.NotificationPreferences(), nil
}

// UpdateNotificationPreferences applies a partial change and stores the
// result. Safety alerts can't be switched off by category (only the push,
// email or WhatsApp channel can), so categories.safety always reads true.
// Switching product news on or off is timestamped: the consent record for
// marketing messages.
func (s *Service) UpdateNotificationPreferences(ctx context.Context, memberID string, in NotificationPrefsUpdate) (domain.NotificationPrefs, error) {
	m, err := s.members.ByID(ctx, memberID)
	if err != nil {
		return domain.NotificationPrefs{}, err
	}
	cur := m.NotificationPreferences()
	next := applyPrefsUpdate(cur, in, time.Now().UTC())
	if err := s.members.SetNotificationPrefs(ctx, memberID, next); err != nil {
		return domain.NotificationPrefs{}, err
	}
	if s.log != nil && next.Categories.Product != cur.Categories.Product {
		s.log.Info("consent: product news", "memberId", memberID, "optedIn", next.Categories.Product)
	}
	return next, nil
}

// applyPrefsUpdate returns cur with the sent switches applied.
func applyPrefsUpdate(cur domain.NotificationPrefs, in NotificationPrefsUpdate, now time.Time) domain.NotificationPrefs {
	next := cur
	set := func(dst *bool, v *bool) {
		if v != nil {
			*dst = *v
		}
	}
	set(&next.Categories.Community, in.Community)
	set(&next.Categories.Remembrances, in.Remembrances)
	set(&next.Categories.Product, in.Product)
	set(&next.Channels.Push, in.Push)
	set(&next.Channels.Email, in.Email)
	set(&next.Channels.WhatsApp, in.WhatsApp)
	next.Categories.Safety = true // not optional by category; in.Safety is ignored
	stamp := now.Format(time.RFC3339)
	next.UpdatedAt = stamp
	switch {
	case next.Categories.Product && !cur.Categories.Product:
		next.ProductConsentAt = stamp
	case !next.Categories.Product && cur.Categories.Product:
		next.ProductWithdrawnAt = stamp
	}
	return next
}

// prefsGatedNotifs is the in-app half of K14. It wraps the notification store
// so every in-app notice — whichever feature inserts it — is dropped when it
// belongs to an optional category (community, remembrances, product) that the
// recipient switched off. Safety, account and transaction notices always pass
// without a member lookup.
type prefsGatedNotifs struct {
	domain.NotificationRepository
	members domain.MemberRepository
}

// gateNotifications wraps a notification store with the preference gate.
func gateNotifications(inner domain.NotificationRepository, members domain.MemberRepository) domain.NotificationRepository {
	if inner == nil {
		return nil
	}
	return prefsGatedNotifs{NotificationRepository: inner, members: members}
}

func (g prefsGatedNotifs) Insert(ctx context.Context, n domain.Notification) error {
	if !g.allows(ctx, n) {
		return nil // the member switched this kind of notice off
	}
	return g.NotificationRepository.Insert(ctx, n)
}

func (g prefsGatedNotifs) InsertOnce(ctx context.Context, n domain.Notification) (bool, error) {
	if !g.allows(ctx, n) {
		return false, nil
	}
	return g.NotificationRepository.InsertOnce(ctx, n)
}

func (g prefsGatedNotifs) allows(ctx context.Context, n domain.Notification) bool {
	category := notificationCategory(n.Kind)
	if !domain.CategoryIsOptional(category) {
		return true
	}
	var m *domain.Member
	if g.members != nil {
		m, _ = g.members.ByID(ctx, n.MemberID)
	}
	return m.NotificationPreferences().AllowsCategory(category)
}

// ErrInvalidUnsubscribe is returned for a malformed or forged unsubscribe link.
var ErrInvalidUnsubscribe = errors.New("this unsubscribe link is not valid")

// UnsubscribeResult says what an unsubscribe link switches off: Category is
// the optional category, or "" when it is email as a whole.
type UnsubscribeResult struct {
	Category string
}

// UnsubscribeToken signs (member, category) for a one-click unsubscribe link:
// base64url(payload) "." base64url(HMAC-SHA256). It is "" when no signing key
// is configured (the email then carries only the settings line).
func (s *Service) UnsubscribeToken(memberID, category string) string {
	if len(s.outbound.unsubKey) == 0 || memberID == "" {
		return ""
	}
	payload := memberID + "|" + category
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." +
		base64.RawURLEncoding.EncodeToString(s.unsubscribeMAC(payload))
}

func (s *Service) unsubscribeMAC(payload string) []byte {
	mac := hmac.New(sha256.New, s.outbound.unsubKey)
	mac.Write([]byte("unsubscribe|v1|" + payload))
	return mac.Sum(nil)
}

// parseUnsubscribeToken verifies a token and returns what it names.
func (s *Service) parseUnsubscribeToken(token string) (memberID, category string, ok bool) {
	if len(s.outbound.unsubKey) == 0 {
		return "", "", false
	}
	enc, sig, found := strings.Cut(strings.TrimSpace(token), ".")
	if !found {
		return "", "", false
	}
	payload, err := base64.RawURLEncoding.DecodeString(enc)
	if err != nil {
		return "", "", false
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil || !hmac.Equal(got, s.unsubscribeMAC(string(payload))) {
		return "", "", false
	}
	i := strings.LastIndexByte(string(payload), '|')
	if i <= 0 {
		return "", "", false
	}
	return string(payload[:i]), string(payload[i+1:]), true
}

// CheckUnsubscribe verifies an unsubscribe link and says what it would switch
// off, changing nothing — the confirmation page a plain GET (or a mail
// scanner pre-fetching the link) sees.
func (s *Service) CheckUnsubscribe(token string) (UnsubscribeResult, error) {
	_, category, ok := s.parseUnsubscribeToken(token)
	if !ok {
		return UnsubscribeResult{}, ErrInvalidUnsubscribe
	}
	res, _ := unsubscribeUpdate(category)
	return res, nil
}

// unsubscribeUpdate maps an unsubscribe link's category to what it switches
// off: an optional category, or — for service messages — the email channel.
func unsubscribeUpdate(category string) (UnsubscribeResult, NotificationPrefsUpdate) {
	off := false
	var update NotificationPrefsUpdate
	res := UnsubscribeResult{}
	switch category {
	case domain.CategoryCommunity:
		update.Community, res.Category = &off, category
	case domain.CategoryRemembrances:
		update.Remembrances, res.Category = &off, category
	case domain.CategoryProduct:
		update.Product, res.Category = &off, category
	default:
		update.Email = &off
	}
	return res, update
}

// Unsubscribe applies a one-click unsubscribe from a notification email (a
// POST: the confirmation form, or an RFC 8058 List-Unsubscribe-Post client).
// An optional category (community, remembrances, product) is switched off;
// for service messages (safety, account, transaction — not optional by
// category) the email channel is switched off instead. Idempotent; an erased
// account is a no-op success.
func (s *Service) Unsubscribe(ctx context.Context, token string) (UnsubscribeResult, error) {
	memberID, category, ok := s.parseUnsubscribeToken(token)
	if !ok {
		return UnsubscribeResult{}, ErrInvalidUnsubscribe
	}
	res, update := unsubscribeUpdate(category)
	_, err := s.UpdateNotificationPreferences(ctx, memberID, update)
	var nf *domain.NotFoundError
	if errors.As(err, &nf) {
		return res, nil // the account is gone: nothing more will be sent
	}
	return res, err
}
