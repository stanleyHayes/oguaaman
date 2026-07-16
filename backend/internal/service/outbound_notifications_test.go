package service

import (
	"context"
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

func TestNotifyOutOfBandMirrorsToReachableChannels(t *testing.T) {
	ctx := context.Background()
	email, wa := &recEmail{}, &recWA{}
	svc := newOutboundSvc(&domain.Member{ID: "m-1", Email: "keeper@oguaa.test", Phone: "+233240000001"}, email, wa)

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
	if len(wa.sent) != 1 || wa.sent[0].phone != "+233240000001" {
		t.Fatalf("whatsapp sends = %+v", wa.sent)
	}
	if !strings.Contains(wa.sent[0].body, "Today we remember Nana Esi") || !strings.Contains(wa.sent[0].body, "/memoriam/nana-esi") {
		t.Errorf("whatsapp body = %q", wa.sent[0].body)
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
