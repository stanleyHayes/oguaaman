package service

import (
	"context"
	"fmt"
	"html"
	"strings"
)

// notifyOutOfBand mirrors an in-app notification to email/WhatsApp when the
// member has reachable contact channels configured.
func (s *Service) notifyOutOfBand(ctx context.Context, memberID, title, body, link string) {
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

	portalLink := strings.TrimSpace(link)
	if portalLink != "" && !strings.HasPrefix(portalLink, "http://") && !strings.HasPrefix(portalLink, "https://") {
		portalLink = "See details: " + portalLink
	}

	if s.email != nil && strings.TrimSpace(m.Email) != "" {
		htmlBody := "<p>" + html.EscapeString(body) + "</p>"
		if portalLink != "" {
			htmlBody += "<p>" + html.EscapeString(portalLink) + "</p>"
		}
		if e := s.email.Send(ctx, m.Email, title, htmlBody); e != nil && s.log != nil {
			s.log.Warn("outbound email failed", "memberId", memberID, "email", m.Email, "err", e)
		}
	}
	if s.wa != nil && strings.TrimSpace(m.Phone) != "" {
		msg := title + "\n\n" + body
		if portalLink != "" {
			msg += "\n\n" + portalLink
		}
		if e := s.wa.SendMessage(ctx, m.Phone, msg); e != nil && s.log != nil {
			s.log.Warn("outbound whatsapp failed", "memberId", memberID, "phone", m.Phone, "err", e)
		}
	}
}

func reminderTitle(name string, birthday bool) string {
	if birthday {
		return fmt.Sprintf("Today we remember %s's birthday", name)
	}
	return "Today we remember " + name
}
