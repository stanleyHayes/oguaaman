package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/platform/emailtmpl"
)

// outboundConfig is what out-of-band messages need to be useful outside the app.
type outboundConfig struct {
	portalURL string // citizen portal origin: relative links are made absolute on it
	apiURL    string // public API origin: where the one-click unsubscribe endpoint lives
	unsubKey  []byte // HMAC key for unsubscribe links, derived from the server secret
}

// ConfigureOutbound sets the portal origin (for absolute links), the public
// API origin (for the unsubscribe endpoint; empty in dev → the portal, which
// proxies /api) and the server secret the unsubscribe links are signed with
// (a key is derived from it, so the raw secret signs nothing here).
func (s *Service) ConfigureOutbound(portalURL, apiURL, secret string) {
	s.outbound.portalURL = strings.TrimRight(strings.TrimSpace(portalURL), "/")
	s.outbound.apiURL = strings.TrimRight(strings.TrimSpace(apiURL), "/")
	if s.outbound.apiURL == "" {
		s.outbound.apiURL = s.outbound.portalURL
	}
	s.outbound.unsubKey = nil
	if secret != "" {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte("oguaa/notifications/unsubscribe/v1"))
		s.outbound.unsubKey = mac.Sum(nil)
	}
}

// notifyOutOfBand mirrors a notice to email/WhatsApp as a service ("account")
// message. Kept for callers that predate message categories; code that knows
// the notification kind should use notifyOutOfBandAs.
func (s *Service) notifyOutOfBand(ctx context.Context, memberID, title, body, link string) {
	s.deliverOutOfBand(ctx, memberID, domain.CategoryAccount, title, body, link)
}

// notifyOutOfBandAs mirrors a notice of the given notification kind.
func (s *Service) notifyOutOfBandAs(ctx context.Context, memberID, kind, title, body, link string) {
	s.deliverOutOfBand(ctx, memberID, notificationCategory(kind), title, body, link)
}

// deliverOutOfBand sends one notice by email and/or WhatsApp, honouring the
// member's preferences (K14): the category must be on (safety, account and
// transaction always are) and so must the channel. WhatsApp also needs a
// VERIFIED number (a typed-in number may be someone else's) and, for product
// news, Ghana daytime. Links are made absolute, every email carries the
// settings line and a signed unsubscribe link (also named in RFC 8058
// one-click headers when the sender can set them), and failures are logged by
// member id only — never an email address or phone number.
func (s *Service) deliverOutOfBand(ctx context.Context, memberID, category, title, body, link string) {
	if memberID == "" {
		return
	}
	m, err := s.members.ByID(ctx, memberID)
	if err != nil || m == nil {
		if s.log != nil {
			s.log.Warn("outbound notify skipped: member lookup failed", "memberId", memberID, "err", err)
		}
		return
	}
	prefs := m.NotificationPreferences()
	link = s.absoluteLink(link)
	if s.email != nil && strings.TrimSpace(m.Email) != "" && prefs.Allows(category, domain.ChannelEmail) {
		if e := s.sendNotificationEmail(ctx, m, category, title, s.outboundEmailHTML(m.ID, category, title, body, link)); e != nil && s.log != nil {
			s.log.Warn("outbound email failed", "memberId", memberID, "err", e)
		}
	}
	if s.canWhatsApp(m, prefs, category, time.Now()) {
		if e := s.wa.SendMessage(ctx, m.Phone, whatsAppText(title, body, link)); e != nil && s.log != nil {
			s.log.Warn("outbound whatsapp failed", "memberId", memberID, "err", e)
		}
	}
}

// sendNotificationEmail sends a notification email with RFC 8058 one-click
// unsubscribe headers when the link can be signed and the sender can set
// headers, so mail clients POST the unsubscribe instead of opening the link.
func (s *Service) sendNotificationEmail(ctx context.Context, m *domain.Member, category, title, htmlBody string) error {
	hs, ok := s.email.(HeaderEmailSender)
	u := s.unsubscribeURL(m.ID, category)
	if !ok || u == "" {
		return s.email.Send(ctx, m.Email, title, htmlBody)
	}
	return hs.SendWithHeaders(ctx, m.Email, title, htmlBody, map[string]string{
		"List-Unsubscribe":      "<" + u + ">",
		"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
	})
}

// unsubscribeURL is the signed one-click unsubscribe endpoint for (member,
// category), or "" when links can't be signed or the API origin is unknown.
func (s *Service) unsubscribeURL(memberID, category string) string {
	tok := s.UnsubscribeToken(memberID, category)
	if tok == "" || s.outbound.apiURL == "" {
		return ""
	}
	return s.outbound.apiURL + "/api/notifications/unsubscribe?token=" + url.QueryEscape(tok)
}

// canWhatsApp reports whether a WhatsApp copy may go to the member now.
func (s *Service) canWhatsApp(m *domain.Member, prefs domain.NotificationPrefs, category string, now time.Time) bool {
	if s.wa == nil || strings.TrimSpace(m.Phone) == "" || !m.PhoneVerified {
		return false
	}
	if !prefs.Allows(category, domain.ChannelWhatsApp) {
		return false
	}
	return category != domain.CategoryProduct || inLocalSendWindow(now)
}

// inLocalSendWindow is 08:00–19:00 in Ghana (UTC+0 all year, no DST) — the
// only hours a promotional WhatsApp message may go out.
func inLocalSendWindow(now time.Time) bool {
	h := now.UTC().Hour()
	return h >= 8 && h < 19
}

// absoluteLink turns an in-app path ("/memoriam/x") into a portal URL so it is
// clickable in an email or WhatsApp message.
func (s *Service) absoluteLink(link string) string {
	link = strings.TrimSpace(link)
	if link == "" || isWebURL(link) {
		return link
	}
	if strings.HasPrefix(link, "/") && s.outbound.portalURL != "" {
		return s.outbound.portalURL + link
	}
	return link
}

func isWebURL(u string) bool {
	l := strings.ToLower(u)
	return strings.HasPrefix(l, "https://") || strings.HasPrefix(l, "http://")
}

// NotificationEmail renders the email a notification of the given kind sends
// to memberID: the branded layout with the notice, an "Open in Oguaa" button
// when there is a link, and the footer that says why the member gets it and
// how to stop it. The result is packed for an EmailSender (see
// emailtmpl.Email.Pack); cmd/emailpreview uses it to show the real thing.
func (s *Service) NotificationEmail(memberID, kind, title, body, link string) string {
	return s.outboundEmailHTML(memberID, notificationCategory(kind), title, body, s.absoluteLink(link))
}

// outboundEmailHTML renders a notification email for (member, category).
func (s *Service) outboundEmailHTML(memberID, category, title, body, link string) string {
	n := emailtmpl.Notification{
		Kicker: categoryKicker(category), Title: title, Body: body, Link: link,
		Reason: notificationReason(category), Hint: notificationSettingsHint,
		UnsubscribeURL: s.unsubscribeURL(memberID, category), UnsubscribeLabel: unsubscribeLabel(category),
	}
	if s.outbound.portalURL != "" {
		n.ManageURL = s.outbound.portalURL + "/me"
	}
	return brandedEmail(emailtmpl.NotificationMessage(n), body)
}

// notificationSettingsHint tells the member where notification emails are
// switched off.
const notificationSettingsHint = "Turn these emails off in the Oguaa app under Settings › Notifications."

// notificationReason says why the member gets a notification email.
func notificationReason(category string) string {
	if category == domain.CategoryProduct {
		return "You're getting this because you asked for news about Oguaa."
	}
	return "You're getting this because you have an Oguaa account."
}

// categoryKicker is the small label above a notification email's heading.
func categoryKicker(category string) string {
	switch category {
	case domain.CategorySafety:
		return "Safety alert"
	case domain.CategoryTransaction:
		return "Payments and bookings"
	case domain.CategoryCommunity:
		return "Community"
	case domain.CategoryRemembrances:
		return "Remembrance"
	case domain.CategoryProduct:
		return "News from Oguaa"
	}
	return "Your account"
}

// unsubscribeLabel names what the footer's one-click link switches off: an
// optional category as a whole, or — for service messages — email.
func unsubscribeLabel(category string) string {
	switch category {
	case domain.CategoryCommunity:
		return "Unsubscribe from community notifications"
	case domain.CategoryRemembrances:
		return "Unsubscribe from remembrance notifications"
	case domain.CategoryProduct:
		return "Unsubscribe from Oguaa news"
	}
	return "Unsubscribe from Oguaa notification emails"
}

// whatsAppOptOut tells the recipient how to stop WhatsApp messages. (There is
// no inbound WhatsApp handler, so it must not promise a "reply STOP".)
const whatsAppOptOut = "To stop these messages, open the Oguaa app: Settings › Notifications."

func whatsAppText(title, body, link string) string {
	msg := title + "\n\n" + body
	if link != "" {
		msg += "\n\n" + link
	}
	return msg + "\n\n" + whatsAppOptOut
}

func reminderTitle(name string, birthday bool) string {
	if birthday {
		return fmt.Sprintf("Today we remember %s's birthday", name)
	}
	return "Today we remember " + name
}
