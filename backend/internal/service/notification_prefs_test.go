package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

func mustParseTime(t *testing.T, v string) time.Time {
	t.Helper()
	tm, err := time.Parse(time.RFC3339, v)
	if err != nil {
		t.Fatal(err)
	}
	return tm
}

func timeHours(h int) time.Duration { return time.Duration(h) * time.Hour }

// prefsMembers keeps members in a map and records preference writes.
type prefsMembers struct {
	stubMembers
	byID map[string]*domain.Member
}

func (p *prefsMembers) ByID(_ context.Context, id string) (*domain.Member, error) {
	if m, ok := p.byID[id]; ok {
		return m, nil
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}

func (p *prefsMembers) SetNotificationPrefs(_ context.Context, id string, prefs domain.NotificationPrefs) error {
	if m, ok := p.byID[id]; ok {
		stored := prefs
		m.NotificationPrefs = &stored
	}
	return nil
}

func prefsSvc(members domain.MemberRepository, notifs domain.NotificationRepository) *Service {
	f := &fakeRepo{}
	return New(Deps{
		Listings: f, Members: members, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f},
		Notifs: notifs, Follows: stubFollows{}, Claims: stubClaims{}, News: stubNews{},
		Reports: stubReports{}, Timeline: stubTimeline{},
	})
}

func boolp(v bool) *bool { return &v }

// K14 defaults: everything that serves the member on; product news and
// WhatsApp off until the member opts in.
func TestDefaultNotificationPrefs(t *testing.T) {
	p := domain.DefaultNotificationPrefs()
	if !p.Categories.Safety || !p.Categories.Community || !p.Categories.Remembrances || p.Categories.Product {
		t.Errorf("categories = %+v", p.Categories)
	}
	if !p.Channels.Push || !p.Channels.Email || p.Channels.WhatsApp {
		t.Errorf("channels = %+v", p.Channels)
	}
	var none *domain.Member
	if none.NotificationPreferences() != p {
		t.Error("a nil member reads the defaults")
	}
}

// A PUT is partial, safety can't be switched off by category, and product
// consent is timestamped both ways.
func TestUpdateNotificationPreferences_partialSafetyLockedConsentStamped(t *testing.T) {
	members := &prefsMembers{byID: map[string]*domain.Member{"m-1": {ID: "m-1"}}}
	svc := prefsSvc(members, stubNotifs{})

	got, err := svc.UpdateNotificationPreferences(context.Background(), "m-1", NotificationPrefsUpdate{
		Safety: boolp(false), Community: boolp(false), Product: boolp(true),
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if !got.Categories.Safety || got.Categories.Community || !got.Categories.Remembrances || !got.Categories.Product {
		t.Errorf("categories = %+v", got.Categories)
	}
	if got.Channels != domain.DefaultNotificationPrefs().Channels {
		t.Errorf("channels were not sent and must keep their values: %+v", got.Channels)
	}
	if got.ProductConsentAt == "" {
		t.Error("opting in to product news must be timestamped")
	}
	stored := members.byID["m-1"].NotificationPreferences()
	if stored.Categories != got.Categories {
		t.Errorf("stored %+v, returned %+v", stored.Categories, got.Categories)
	}

	got, err = svc.UpdateNotificationPreferences(context.Background(), "m-1", NotificationPrefsUpdate{Product: boolp(false), WhatsApp: boolp(true)})
	if err != nil {
		t.Fatalf("second update: %v", err)
	}
	if got.Categories.Product || got.ProductWithdrawnAt == "" || !got.Channels.WhatsApp || got.Categories.Community {
		t.Errorf("after withdrawal: %+v", got)
	}
}

// One-click unsubscribe: an optional category is switched off; a service
// category switches the email channel off; a forged token does nothing.
func TestUnsubscribe(t *testing.T) {
	ctx := context.Background()
	members := &prefsMembers{byID: map[string]*domain.Member{"m-1": {ID: "m-1"}}}
	svc := prefsSvc(members, stubNotifs{})
	svc.ConfigureOutbound("https://oguaa.gh", "", "secret-1")

	res, err := svc.Unsubscribe(ctx, svc.UnsubscribeToken("m-1", domain.CategoryCommunity))
	if err != nil || res.Category != domain.CategoryCommunity {
		t.Fatalf("community unsubscribe: %+v %v", res, err)
	}
	p := members.byID["m-1"].NotificationPreferences()
	if p.Categories.Community || !p.Channels.Email {
		t.Errorf("community off, email still on; got %+v", p)
	}

	res, err = svc.Unsubscribe(ctx, svc.UnsubscribeToken("m-1", domain.CategoryAccount))
	if err != nil || res.Category != "" {
		t.Fatalf("account unsubscribe: %+v %v", res, err)
	}
	if members.byID["m-1"].NotificationPreferences().Channels.Email {
		t.Error("unsubscribing from a service email must switch the email channel off")
	}

	good := svc.UnsubscribeToken("m-2", domain.CategoryProduct)
	for _, bad := range []string{"", "garbage", good + "x", "bS0x." + good[len(good)-10:]} {
		if _, err := svc.Unsubscribe(ctx, bad); !errors.Is(err, ErrInvalidUnsubscribe) {
			t.Errorf("token %q: err = %v, want ErrInvalidUnsubscribe", bad, err)
		}
	}
	other := prefsSvc(members, stubNotifs{})
	other.ConfigureOutbound("", "", "another-secret")
	if _, err := other.Unsubscribe(ctx, good); !errors.Is(err, ErrInvalidUnsubscribe) {
		t.Errorf("a token signed with another key must be refused, got %v", err)
	}
}

// R23: checking a link — what the confirmation page a GET shows does — says
// what it would switch off and writes nothing; a forged link is refused.
func TestCheckUnsubscribe_changesNothing(t *testing.T) {
	members := &prefsMembers{byID: map[string]*domain.Member{"m-1": {ID: "m-1"}}}
	svc := prefsSvc(members, stubNotifs{})
	svc.ConfigureOutbound("https://oguaa.gh", "", "secret-1")

	for category, want := range map[string]string{
		domain.CategoryCommunity:    domain.CategoryCommunity,
		domain.CategoryRemembrances: domain.CategoryRemembrances,
		domain.CategoryProduct:      domain.CategoryProduct,
		domain.CategoryAccount:      "", // service mail: the email channel as a whole
		domain.CategorySafety:       "",
	} {
		res, err := svc.CheckUnsubscribe(svc.UnsubscribeToken("m-1", category))
		if err != nil || res.Category != want {
			t.Errorf("%s: %+v %v, want category %q", category, res, err, want)
		}
	}
	if p := members.byID["m-1"].NotificationPrefs; p != nil {
		t.Errorf("checking a link stored preferences: %+v", *p)
	}
	if _, err := svc.CheckUnsubscribe("garbage"); !errors.Is(err, ErrInvalidUnsubscribe) {
		t.Errorf("forged token: err = %v, want ErrInvalidUnsubscribe", err)
	}
}

// The in-app gate drops optional categories the member switched off, never
// safety/account/transaction notices, and product news without an opt-in.
func TestNotificationGate(t *testing.T) {
	ctx := context.Background()
	members := &prefsMembers{byID: map[string]*domain.Member{
		"m-1": {ID: "m-1", NotificationPrefs: prefsWith(func(p *domain.NotificationPrefs) { p.Categories.Community = false })},
		"m-2": {ID: "m-2"},
	}}
	inner := &recNotifs{}
	gate := gateNotifications(inner, members)
	for _, n := range []domain.Notification{
		{ID: "1", MemberID: "m-1", Kind: "birthday"},    // community, off → dropped
		{ID: "2", MemberID: "m-1", Kind: "incident"},    // safety → kept
		{ID: "3", MemberID: "m-1", Kind: "approved"},    // account → kept
		{ID: "4", MemberID: "m-2", Kind: "product"},     // product, not opted in → dropped
		{ID: "5", MemberID: "m-2", Kind: "remembrance"}, // default on → kept
		{ID: "6", MemberID: "m-1", Kind: "ticket"},      // transaction → kept
	} {
		_ = gate.Insert(ctx, n)
	}
	kept := map[string]bool{}
	for _, n := range inner.inserted {
		kept[n.ID] = true
	}
	for id, want := range map[string]bool{"1": false, "2": true, "3": true, "4": false, "5": true, "6": true} {
		if kept[id] != want {
			t.Errorf("notice %s kept = %v, want %v", id, kept[id], want)
		}
	}
	if gateNotifications(nil, members) != nil {
		t.Error("a nil store must stay nil so callers' nil checks keep working")
	}
}

func TestNotificationCategory(t *testing.T) {
	cases := map[string]string{
		"incident": domain.CategorySafety, "directive": domain.CategorySafety, "lostfound": domain.CategorySafety,
		"approved": domain.CategoryAccount, "org-invite": domain.CategoryAccount, "report": domain.CategoryAccount,
		"ticket": domain.CategoryTransaction, "agent-job": domain.CategoryTransaction, "donation": domain.CategoryTransaction,
		"birthday": domain.CategoryCommunity, "review": domain.CategoryCommunity,
		"remembrance": domain.CategoryRemembrances, "product": domain.CategoryProduct,
		"something-new": domain.CategoryAccount,
	}
	for kind, want := range cases {
		if got := notificationCategory(kind); got != want {
			t.Errorf("notificationCategory(%q) = %q, want %q", kind, got, want)
		}
	}
	known := map[string]bool{
		domain.CategorySafety: true, domain.CategoryAccount: true, domain.CategoryTransaction: true,
		domain.CategoryCommunity: true, domain.CategoryRemembrances: true, domain.CategoryProduct: true,
	}
	for kind, c := range notificationKindCategory {
		if !known[c] {
			t.Errorf("kind %q maps to unknown category %q", kind, c)
		}
	}
}
