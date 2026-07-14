package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// lfMembers stubs the member repo but returns real members (for fan-out tests).
type lfMembers struct {
	stubMembers
	members []domain.Member
}

func (m lfMembers) All(context.Context) ([]domain.Member, error) { return m.members, nil }

// lfNotifs records the notifications the service writes.
type lfNotifs struct {
	stubNotifs
	inserted []domain.Notification
}

func (n *lfNotifs) Insert(_ context.Context, ntf domain.Notification) error {
	n.inserted = append(n.inserted, ntf)
	return nil
}

func lostFoundTestService() (*Service, *fakeRepo) {
	f := &fakeRepo{listings: []domain.Listing{
		{ID: "lf-1", Slug: "lost-black-samsung-phone-at-victoria-park", Type: domain.TypeLostFound, Status: domain.StatusApproved, OwnerID: "m-7", Title: "Lost: black Samsung phone at Victoria Park",
			Details: map[string]any{
				"kind": "lost_item", "lfStatus": "open", "contact": "m-7",
			}},
	}}
	return newTestService(f), f
}

func TestSubmitLostFound_validatesKindAndRequired(t *testing.T) {
	svc, _ := lostFoundTestService()
	ctx := context.Background()
	m := &domain.Member{ID: "m-9", Role: domain.RoleMember}

	if _, err := svc.SubmitLostFound(ctx, m, LostFoundInput{Title: "Keys", Kind: "spaceship", Description: "d", Contact: "c"}); err == nil {
		t.Error("expected an error for an unknown kind")
	}
	if _, err := svc.SubmitLostFound(ctx, m, LostFoundInput{Title: "Keys", Kind: "found_item", Contact: "c"}); err == nil {
		t.Error("expected an error when the description is missing")
	}
	if _, err := svc.SubmitLostFound(ctx, m, LostFoundInput{Title: "Keys", Kind: "found_item", Description: "d"}); err == nil {
		t.Error("expected an error when the contact is missing")
	}
	if _, err := svc.SubmitLostFound(ctx, nil, LostFoundInput{Title: "Keys", Kind: "found_item", Description: "d", Contact: "c"}); err == nil {
		t.Error("expected an error with no signed-in member")
	}
}

func TestSubmitLostFound_autoPublishes(t *testing.T) {
	svc, _ := lostFoundTestService()
	m := &domain.Member{ID: "m-9", Role: domain.RoleMember, TownID: "aboom"}
	l, err := svc.SubmitLostFound(context.Background(), m, LostFoundInput{
		Title: "Lost: brown goat answers to 'Aponkye'", Kind: "lost_item",
		Description:      "A brown goat with a red collar, last seen near the old well.",
		LastSeenLocation: "Aboom", LastSeenDate: "2026-07-10", Contact: "024 000 0000",
	})
	if err != nil {
		t.Fatalf("valid notice failed: %v", err)
	}
	if l.Type != domain.TypeLostFound {
		t.Errorf("type = %q, want lostfound", l.Type)
	}
	if l.Status != domain.StatusApproved {
		t.Errorf("status = %q, want approved (notices auto-publish)", l.Status)
	}
	if l.PublishedAt == "" {
		t.Error("publishedAt should be set on auto-publish")
	}
	if got := asString(l.Details, "lfStatus"); got != "open" {
		t.Errorf("lfStatus = %q, want open", got)
	}
	if got := asString(l.Details, "lastSeenDate"); got != "2026-07-10" {
		t.Errorf("lastSeenDate = %q, want 2026-07-10", got)
	}
	if l.OwnerID != "m-9" || l.TownID != "aboom" {
		t.Errorf("owner/town not attributed: %+v", l)
	}
}

func TestResolveLostFound_ownerAllowed(t *testing.T) {
	svc, f := lostFoundTestService()
	owner := &domain.Member{ID: "m-7", Role: domain.RoleMember}

	if err := svc.ResolveLostFound(context.Background(), "lf-1", owner, "reunited"); err != nil {
		t.Fatalf("owner resolve failed: %v", err)
	}
	if got := asString(f.listings[0].Details, "lfStatus"); got != "reunited" {
		t.Errorf("lfStatus = %q, want reunited", got)
	}
}

func TestResolveLostFound_curatorAllowed(t *testing.T) {
	svc, f := lostFoundTestService()
	curator := &domain.Member{ID: "m-c", Role: domain.RoleCurator}

	if err := svc.ResolveLostFound(context.Background(), "lf-1", curator, "closed"); err != nil {
		t.Fatalf("curator resolve failed: %v", err)
	}
	if got := asString(f.listings[0].Details, "lfStatus"); got != "closed" {
		t.Errorf("lfStatus = %q, want closed", got)
	}
}

func TestResolveLostFound_rejectsStranger(t *testing.T) {
	svc, f := lostFoundTestService()
	stranger := &domain.Member{ID: "m-9", Role: domain.RoleMember}

	err := svc.ResolveLostFound(context.Background(), "lf-1", stranger, "reunited")
	var fb *domain.ForbiddenError
	if err == nil || !isForbidden(err, &fb) {
		t.Errorf("expected ForbiddenError for a stranger, got %v", err)
	}
	if got := asString(f.listings[0].Details, "lfStatus"); got != "open" {
		t.Errorf("lfStatus = %q, want unchanged open", got)
	}
}

func TestResolveLostFound_validatesStatus(t *testing.T) {
	svc, _ := lostFoundTestService()
	owner := &domain.Member{ID: "m-7", Role: domain.RoleMember}
	if err := svc.ResolveLostFound(context.Background(), "lf-1", owner, "teleported"); err == nil {
		t.Error("expected an error for a status outside the lifecycle")
	}
}

func TestSubmitLostFound_missingPersonNotifiesCurators(t *testing.T) {
	f := &fakeRepo{}
	notifs := &lfNotifs{}
	members := lfMembers{members: []domain.Member{
		{ID: "m-c", Role: domain.RoleCurator},
		{ID: "m-s", Role: domain.RoleSteward},
		{ID: "m-9", Role: domain.RoleMember},
	}}
	svc := New(Deps{Listings: f, Members: members, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: notifs, Follows: stubFollows{}, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}})
	m := &domain.Member{ID: "m-9", Role: domain.RoleMember}

	if _, err := svc.SubmitLostFound(context.Background(), m, LostFoundInput{
		Title: "Missing: 9-year-old Kofi", Kind: "missing_person",
		Description: "Last seen near Wesley Methodist, Bakaano.", Contact: "024 000 0000",
	}); err != nil {
		t.Fatalf("missing-person notice failed: %v", err)
	}
	if len(notifs.inserted) != 2 {
		t.Fatalf("expected curator+steward to be notified, got %d notifications", len(notifs.inserted))
	}
	seen := map[string]bool{}
	for _, n := range notifs.inserted {
		seen[n.MemberID] = true
	}
	if !seen["m-c"] || !seen["m-s"] || seen["m-9"] {
		t.Errorf("notifications went to the wrong members: %v", seen)
	}
}

func TestSubmitLostFound_lostItemDoesNotNotifyCurators(t *testing.T) {
	f := &fakeRepo{}
	notifs := &lfNotifs{}
	members := lfMembers{members: []domain.Member{{ID: "m-c", Role: domain.RoleCurator}}}
	svc := New(Deps{Listings: f, Members: members, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: notifs, Follows: stubFollows{}, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}})
	m := &domain.Member{ID: "m-9", Role: domain.RoleMember}

	if _, err := svc.SubmitLostFound(context.Background(), m, LostFoundInput{
		Title: "Lost keys", Kind: "lost_item", Description: "A bunch of keys.", Contact: "024 000 0000",
	}); err != nil {
		t.Fatalf("lost-item notice failed: %v", err)
	}
	if len(notifs.inserted) != 0 {
		t.Errorf("lost items should not fan out to curators, got %d notifications", len(notifs.inserted))
	}
}
