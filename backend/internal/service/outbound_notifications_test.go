package service

import (
	"bytes"
	"context"
	"errors"
	"html"
	"log/slog"
	"net/url"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// reachMembers serves one fixed member for out-of-band delivery lookups.
type reachMembers struct {
	stubMembers
	m *domain.Member
}

func (r reachMembers) ByID(context.Context, string) (*domain.Member, error) { return r.m, nil }

type sentMail struct{ to, subject, html string }
type sentMsg struct{ phone, body string }

type recEmail struct{ sent []sentMail }

func (r *recEmail) Send(_ context.Context, to, subject, html string) error {
	r.sent = append(r.sent, sentMail{to, subject, html})
	return nil
}

// recHeaderEmail is a sender that can set message headers (like the Resend
// client); it records the headers of each such send.
type recHeaderEmail struct {
	recEmail
	headers []map[string]string
}

func (r *recHeaderEmail) SendWithHeaders(ctx context.Context, to, subject, html string, headers map[string]string) error {
	r.headers = append(r.headers, headers)
	return r.Send(ctx, to, subject, html)
}

type recWA struct{ sent []sentMsg }

func (r *recWA) SendMessage(_ context.Context, phone, body string) error {
	r.sent = append(r.sent, sentMsg{phone, body})
	return nil
}

func newOutboundSvc(m *domain.Member, email EmailSender, wa MessageSender) *Service {
	return New(Deps{
		Listings: &fakeRepo{}, Members: reachMembers{m: m}, Orgs: stubOrgs{}, Places: stubPlaces{},
		Mod: modRepo{&fakeRepo{}}, Notifs: stubNotifs{}, Claims: stubClaims{}, News: stubNews{},
		Reports: stubReports{}, Timeline: stubTimeline{}, Follows: stubFollows{},
		Email: email, WhatsApp: wa,
	})
}

// prefsWith returns the default preferences changed by edit.
func prefsWith(edit func(*domain.NotificationPrefs)) *domain.NotificationPrefs {
	p := domain.DefaultNotificationPrefs()
	edit(&p)
	return &p
}

func whatsAppOn(p *domain.NotificationPrefs) { p.Channels.WhatsApp = true }

func TestNotifyOutOfBandMirrorsToReachableChannels(t *testing.T) {
	ctx := context.Background()
	email, wa := &recEmail{}, &recWA{}
	svc := newOutboundSvc(&domain.Member{
		ID: "m-1", Email: "keeper@oguaa.test", Phone: "+233240000001", PhoneVerified: true,
		NotificationPrefs: prefsWith(whatsAppOn),
	}, email, wa)

	svc.notifyOutOfBand(ctx, "m-1", "Today we remember Nana Esi", "It is 4 years since <Nana> passed.", "/memoriam/nana-esi")

	if len(email.sent) != 1 || email.sent[0].to != "keeper@oguaa.test" || email.sent[0].subject != "Today we remember Nana Esi" {
		t.Fatalf("email sends = %+v", email.sent)
	}
	if !strings.Contains(email.sent[0].html, "/memoriam/nana-esi") {
		t.Errorf("email html missing link: %q", email.sent[0].html)
	}
	if strings.Contains(email.sent[0].html, "<Nana>") {
		t.Errorf("email html not escaped: %q", email.sent[0].html)
	}
	if !strings.Contains(email.sent[0].html, "Settings › Notifications") {
		t.Errorf("email must say how to turn these off: %q", email.sent[0].html)
	}
	if len(wa.sent) != 1 || wa.sent[0].phone != "+233240000001" {
		t.Fatalf("whatsapp sends = %+v", wa.sent)
	}
	body := wa.sent[0].body
	if !strings.Contains(body, "Today we remember Nana Esi") || !strings.Contains(body, "/memoriam/nana-esi") || !strings.Contains(body, whatsAppOptOut) {
		t.Errorf("whatsapp body = %q", body)
	}
}

func TestNotifyOutOfBandSkipsUnreachableMembers(t *testing.T) {
	ctx := context.Background()
	email, wa := &recEmail{}, &recWA{}

	// No contact channels → silence.
	svc := newOutboundSvc(&domain.Member{ID: "m-2"}, email, wa)
	svc.notifyOutOfBand(ctx, "m-2", "Title", "Body", "/me")
	if len(email.sent) != 0 || len(wa.sent) != 0 {
		t.Fatalf("unreachable member got mail=%+v wa=%+v", email.sent, wa.sent)
	}

	// Unknown member (lookup miss) → silence, no panic.
	svc = newOutboundSvc(nil, email, wa)
	svc.notifyOutOfBand(ctx, "m-ghost", "Title", "Body", "/me")
	if len(email.sent) != 0 || len(wa.sent) != 0 {
		t.Fatalf("ghost member got mail=%+v wa=%+v", email.sent, wa.sent)
	}

	// Empty memberID short-circuits before any lookup.
	svc.notifyOutOfBand(ctx, "", "Title", "Body", "/me")
	if len(email.sent) != 0 || len(wa.sent) != 0 {
		t.Fatalf("empty memberID got mail=%+v wa=%+v", email.sent, wa.sent)
	}
}

// F129: WhatsApp needs a VERIFIED number and an opt-in (off by default).
func TestNotifyOutOfBand_whatsAppNeedsVerifiedPhoneAndOptIn(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name   string
		member domain.Member
		want   int
	}{
		{"default prefs (WhatsApp off)", domain.Member{ID: "m", Phone: "+233240000002", PhoneVerified: true}, 0},
		{"opted in but unverified", domain.Member{ID: "m", Phone: "+233240000002", NotificationPrefs: prefsWith(whatsAppOn)}, 0},
		{"opted in and verified", domain.Member{ID: "m", Phone: "+233240000002", PhoneVerified: true, NotificationPrefs: prefsWith(whatsAppOn)}, 1},
	}
	for _, tc := range cases {
		wa := &recWA{}
		m := tc.member
		svc := newOutboundSvc(&m, nil, wa)
		svc.notifyOutOfBandAs(ctx, "m", "org-invite", "Title", "Body", "")
		if len(wa.sent) != tc.want {
			t.Errorf("%s: whatsapp sends = %d, want %d", tc.name, len(wa.sent), tc.want)
		}
	}
}

// K14: a category the member switched off sends nothing out of band; a channel
// switched off stops that channel even for service messages; product news is
// opt-in.
func TestNotifyOutOfBand_honoursCategoryAndChannel(t *testing.T) {
	ctx := context.Background()
	send := func(prefs *domain.NotificationPrefs, kind string) int {
		email := &recEmail{}
		svc := newOutboundSvc(&domain.Member{ID: "m", Email: "m@oguaa.test", NotificationPrefs: prefs}, email, nil)
		svc.notifyOutOfBandAs(ctx, "m", kind, "Title", "Body", "")
		return len(email.sent)
	}
	noRemembrances := prefsWith(func(p *domain.NotificationPrefs) { p.Categories.Remembrances = false })
	if n := send(noRemembrances, "remembrance"); n != 0 {
		t.Errorf("remembrances off: %d emails, want 0", n)
	}
	if n := send(noRemembrances, "approved"); n != 1 {
		t.Errorf("account messages ignore category opt-outs: %d emails, want 1", n)
	}
	noEmail := prefsWith(func(p *domain.NotificationPrefs) { p.Channels.Email = false })
	if n := send(noEmail, "ticket"); n != 0 {
		t.Errorf("email channel off: %d emails, want 0", n)
	}
	if n := send(nil, "product"); n != 0 {
		t.Errorf("product news is opt-in: %d emails, want 0", n)
	}
	if n := send(prefsWith(func(p *domain.NotificationPrefs) { p.Categories.Product = true }), "product"); n != 1 {
		t.Errorf("opted-in product news: %d emails, want 1", n)
	}
}

// F128 + P080: links are absolute, and every email carries the settings line
// and a signed one-click unsubscribe link that names the member + category.
func TestNotifyOutOfBand_absoluteLinkAndSignedUnsubscribe(t *testing.T) {
	ctx := context.Background()
	email := &recEmail{}
	svc := newOutboundSvc(&domain.Member{ID: "m-1", Email: "keeper@oguaa.test"}, email, nil)
	svc.ConfigureOutbound("https://oguaa.gh/", "https://api.oguaa.gh", "test-secret")

	svc.notifyOutOfBandAs(ctx, "m-1", "remembrance", "Today we remember Nana Esi", "Da yie.", "/memoriam/nana-esi")

	if len(email.sent) != 1 {
		t.Fatalf("email sends = %d", len(email.sent))
	}
	page := email.sent[0].html
	if !strings.Contains(page, `href="https://oguaa.gh/memoriam/nana-esi"`) {
		t.Errorf("link not absolute/clickable: %q", page)
	}
	const marker = "https://api.oguaa.gh/api/notifications/unsubscribe?token="
	i := strings.Index(page, marker)
	if i < 0 {
		t.Fatalf("no unsubscribe link: %q", page)
	}
	raw := page[i+len(marker):]
	raw = raw[:strings.IndexByte(raw, '"')]
	tok, err := url.QueryUnescape(strings.ReplaceAll(raw, "&amp;", "&"))
	if err != nil {
		t.Fatalf("token: %v", err)
	}
	memberID, category, ok := svc.parseUnsubscribeToken(tok)
	if !ok || memberID != "m-1" || category != domain.CategoryRemembrances {
		t.Errorf("token parses to (%q, %q, %v)", memberID, category, ok)
	}
}

// R23: notification emails carry RFC 8058 one-click headers that name the
// same signed link as the footer, so mail clients POST the unsubscribe; with
// no signing key there is no link to name and the email goes out plain.
func TestNotifyOutOfBand_listUnsubscribeHeaders(t *testing.T) {
	ctx := context.Background()
	email := &recHeaderEmail{}
	svc := newOutboundSvc(&domain.Member{ID: "m-1", Email: "keeper@oguaa.test"}, email, nil)
	svc.ConfigureOutbound("https://oguaa.gh", "https://api.oguaa.gh", "test-secret")

	svc.notifyOutOfBandAs(ctx, "m-1", "birthday", "Title", "Body", "")

	if len(email.headers) != 1 || len(email.sent) != 1 {
		t.Fatalf("header sends = %d, sends = %d; want 1, 1", len(email.headers), len(email.sent))
	}
	link := "https://api.oguaa.gh/api/notifications/unsubscribe?token=" + url.QueryEscape(svc.UnsubscribeToken("m-1", domain.CategoryCommunity))
	h := email.headers[0]
	if h["List-Unsubscribe"] != "<"+link+">" {
		t.Errorf("List-Unsubscribe = %q, want <%s>", h["List-Unsubscribe"], link)
	}
	if h["List-Unsubscribe-Post"] != "List-Unsubscribe=One-Click" {
		t.Errorf("List-Unsubscribe-Post = %q, want List-Unsubscribe=One-Click", h["List-Unsubscribe-Post"])
	}
	if !strings.Contains(email.sent[0].html, `href="`+html.EscapeString(link)+`"`) {
		t.Errorf("the footer link and the header must name the same URL: %q", email.sent[0].html)
	}

	email = &recHeaderEmail{}
	svc = newOutboundSvc(&domain.Member{ID: "m-1", Email: "keeper@oguaa.test"}, email, nil)
	svc.notifyOutOfBandAs(ctx, "m-1", "birthday", "Title", "Body", "")
	if len(email.sent) != 1 || len(email.headers) != 0 {
		t.Errorf("unsigned: sends = %d, header sends = %d; want 1, 0", len(email.sent), len(email.headers))
	}
}

type failEmail struct{}

func (failEmail) Send(context.Context, string, string, string) error {
	return errors.New("upstream 500")
}

type failWA struct{}

func (failWA) SendMessage(context.Context, string, string) error { return errors.New("upstream 500") }

// F130: delivery failures are logged by member id — never the address or number.
func TestNotifyOutOfBand_logsNoContactDetails(t *testing.T) {
	var buf bytes.Buffer
	svc := newOutboundSvc(&domain.Member{
		ID: "m-9", Email: "private@oguaa.test", Phone: "+233249999999", PhoneVerified: true,
		NotificationPrefs: prefsWith(whatsAppOn),
	}, failEmail{}, failWA{})
	svc.log = slog.New(slog.NewTextHandler(&buf, nil))

	svc.notifyOutOfBand(context.Background(), "m-9", "Title", "Body", "")

	out := buf.String()
	if strings.Contains(out, "private@oguaa.test") || strings.Contains(out, "+233249999999") {
		t.Errorf("contact details leaked into logs: %s", out)
	}
	if !strings.Contains(out, "m-9") {
		t.Errorf("failures should still be attributable by member id: %s", out)
	}
}

func TestInLocalSendWindow(t *testing.T) {
	day := func(h int) bool {
		return inLocalSendWindow(mustParseTime(t, "2026-09-30T00:00:00Z").Add(timeHours(h)))
	}
	if day(7) || !day(8) || !day(18) || day(19) || day(23) {
		t.Error("promotional WhatsApp window must be 08:00–19:00 Ghana time")
	}
}
