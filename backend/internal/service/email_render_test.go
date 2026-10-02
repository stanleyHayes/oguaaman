package service

import (
	"context"
	"html"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/platform/emailtmpl"
)

// Every email the services send comes out of the branded renderer, packed
// with its plain-text part.
func TestCodeEmailsAreBranded(t *testing.T) {
	ctx := context.Background()
	m := &domain.Member{ID: "m-1", Email: "ama@example.com"}
	mail := &recEmail{}
	auth := NewAuthService(nil, "test-secret").WithNotifiers(mail, nil)

	if !auth.deliverVerificationCode(ctx, m, "482913") || !auth.deliverResetCode(ctx, m, "730154") {
		t.Fatal("a configured email channel must count as delivered")
	}
	wants := []struct{ subject, code, heading string }{
		{emailtmpl.SubjectVerificationCode, "482913", "Your verification code"},
		{emailtmpl.SubjectPasswordReset, "730154", "Reset your password"},
	}
	if len(mail.sent) != len(wants) {
		t.Fatalf("sends = %d, want %d", len(mail.sent), len(wants))
	}
	for i, w := range wants {
		got := mail.sent[i]
		if got.subject != w.subject {
			t.Errorf("subject = %q, want %q", got.subject, w.subject)
		}
		e := emailtmpl.Prepare(got.html, got.subject)
		if !emailtmpl.IsBranded(got.html) || !strings.Contains(e.HTML, ">"+w.code+"</td>") || !strings.Contains(e.HTML, w.heading) {
			t.Errorf("%s: not the branded code email: %q", w.subject, got.html)
		}
		if !strings.Contains(e.Text, w.code) {
			t.Errorf("%s: text part lacks the code: %q", w.subject, e.Text)
		}
	}
}

func TestNotificationEmailIsBranded(t *testing.T) {
	email := &recHeaderEmail{}
	svc := newOutboundSvc(&domain.Member{ID: "m-1", Email: "keeper@oguaa.test"}, email, nil)
	svc.ConfigureOutbound("https://oguaa.gh", "https://api.oguaa.gh", "test-secret")

	svc.notifyOutOfBandAs(context.Background(), "m-1", "remembrance", "Today we remember <Nana Esi>", "It is 4 years.", "/memoriam/nana-esi")

	if len(email.sent) != 1 {
		t.Fatalf("sends = %d", len(email.sent))
	}
	e := emailtmpl.Prepare(email.sent[0].html, email.sent[0].subject)
	for _, want := range []string{
		">" + html.EscapeString("Today we remember <Nana Esi>") + "</h1>",
		">" + emailtmpl.OpenInOguaa + "</a>",
		`class="btn" href="https://oguaa.gh/memoriam/nana-esi"`,
		`href="https://oguaa.gh/me"`, ">Manage notifications</a>",
		">Unsubscribe from remembrance notifications</a>",
		"Remembrance", "Oguaa is operated by Dev Track (BN843072020)", `href="mailto:hello@oguaaman.com"`,
	} {
		if !strings.Contains(e.HTML, want) {
			t.Errorf("notification html is missing %q", want)
		}
	}
	for _, want := range []string{"Open in Oguaa: https://oguaa.gh/memoriam/nana-esi", "Manage notifications: https://oguaa.gh/me", "Unsubscribe from remembrance notifications: https://api.oguaa.gh/api/notifications/unsubscribe?token="} {
		if !strings.Contains(e.Text, want) {
			t.Errorf("notification text is missing %q: %q", want, e.Text)
		}
	}
}
