package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// F114: re-running a day (restart, second instance, admin "run now") sends
// nothing twice — neither the notice nor its email copy.
func TestRunRemembrance_isIdempotent(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{
		{ID: "l-anniv", Type: domain.TypeMemorial, Status: domain.StatusApproved, Title: "Nana Esi", Slug: "nana-esi", OwnerID: "m-keeper",
			Details: map[string]any{"remindersEnabled": true, "diedDate": "2020-07-13"}},
	}}
	notifs := &recNotifs{}
	email := &recEmail{}
	svc := New(Deps{
		Listings: f, Members: reachMembers{m: &domain.Member{ID: "m-a", Email: "a@oguaa.test"}}, Orgs: stubOrgs{}, Places: stubPlaces{},
		Mod: modRepo{f}, Notifs: notifs, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{},
		Follows: recFollows{listings: map[string][]string{"l-anniv": {"m-a"}}},
		Email:   email,
	})

	first, err := svc.RunRemembrance(ctx, "07-13")
	if err != nil || first != 1 {
		t.Fatalf("first run = %d, %v; want 1", first, err)
	}
	second, err := svc.RunRemembrance(ctx, "07-13")
	if err != nil || second != 0 {
		t.Fatalf("second run = %d, %v; want 0", second, err)
	}
	if len(notifs.inserted) != 1 || len(email.sent) != 1 {
		t.Errorf("notices = %d, emails = %d; want exactly one of each", len(notifs.inserted), len(email.sent))
	}
}

// A follower who switched remembrances off gets nothing.
func TestRunRemembrance_respectsOptOut(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{
		{ID: "l-anniv", Type: domain.TypeMemorial, Status: domain.StatusApproved, Title: "Nana Esi", Slug: "nana-esi", OwnerID: "m-keeper",
			Details: map[string]any{"remindersEnabled": true, "diedDate": "2020-07-13"}},
	}}
	notifs := &recNotifs{}
	email := &recEmail{}
	off := prefsWith(func(p *domain.NotificationPrefs) { p.Categories.Remembrances = false })
	svc := New(Deps{
		Listings: f, Members: reachMembers{m: &domain.Member{ID: "m-a", Email: "a@oguaa.test", NotificationPrefs: off}}, Orgs: stubOrgs{}, Places: stubPlaces{},
		Mod: modRepo{f}, Notifs: notifs, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{},
		Follows: recFollows{listings: map[string][]string{"l-anniv": {"m-a"}}},
		Email:   email,
	})
	n, err := svc.RunRemembrance(ctx, "07-13")
	if err != nil || n != 0 || len(notifs.inserted) != 0 || len(email.sent) != 0 {
		t.Errorf("opted-out follower: created=%d notices=%d emails=%d err=%v", n, len(notifs.inserted), len(email.sent), err)
	}
}

// F131: 29 February is observed on 28 February in non-leap years.
func TestRemembranceRun_leapDay(t *testing.T) {
	cases := []struct {
		run  remembranceRun
		date string
		want bool
	}{
		{remembranceRun{"02-28", 2026}, "2024-02-29", true},
		{remembranceRun{"02-28", 2028}, "2024-02-29", false},
		{remembranceRun{"02-29", 2028}, "2024-02-29", true},
		{remembranceRun{"02-28", 2026}, "2020-02-28", true},
		{remembranceRun{"02-28", 2026}, "02-29", true},
		{remembranceRun{"03-01", 2026}, "2024-02-29", false},
		{remembranceRun{"02-28", 2026}, "", false},
		{remembranceRun{"02-28", 2100}, "2000-02-29", true},
	}
	for _, tc := range cases {
		if got := tc.run.observes(tc.date); got != tc.want {
			t.Errorf("%+v.observes(%q) = %v, want %v", tc.run, tc.date, got, tc.want)
		}
	}
}

func TestRunRemembrance_rejectsBadDate(t *testing.T) {
	svc := newTestService(&fakeRepo{})
	var ve *domain.ValidationError
	for _, bad := range []string{"13-45", "7-13", "2026-07-13", "nope!"} {
		if _, err := svc.RunRemembrance(context.Background(), bad); !errors.As(err, &ve) {
			t.Errorf("date %q: err = %v, want a validation error", bad, err)
		}
	}
}

// A member who blocked (or was blocked by) the celebrant gets no birthday note.
func TestBirthdayNotices_skipBlockedFollowers(t *testing.T) {
	ctx := context.Background()
	notifs := &recNotifs{}
	members := allMembers{all: []domain.Member{
		{ID: "m-star", DisplayName: "Ama", Slug: "ama", Birthday: "07-13", BroadcastBirthday: true},
	}}
	svc := New(Deps{
		Listings: &fakeRepo{}, Members: members, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{&fakeRepo{}},
		Notifs: notifs, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{},
		Follows: recFollows{members: map[string][]string{"m-star": {"m-fan", "m-stalker"}}},
		Blocks:  pairBlocks{blocker: "m-star", blocked: "m-stalker"},
	})
	if _, err := svc.RunRemembrance(ctx, "07-13"); err != nil {
		t.Fatalf("run: %v", err)
	}
	if len(notifs.inserted) != 1 || notifs.inserted[0].MemberID != "m-fan" {
		t.Errorf("birthday notices = %+v, want only m-fan", notifs.inserted)
	}
}

// allMembers serves a fixed roster for All (and nil for ByID lookups).
type allMembers struct {
	stubMembers
	all []domain.Member
}

func (a allMembers) All(context.Context) ([]domain.Member, error) { return a.all, nil }
