package service

import (
	"context"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// recNotifs records inserted notifications instead of dropping them.
type recNotifs struct {
	stubNotifs
	inserted []domain.Notification
}

func (r *recNotifs) Insert(_ context.Context, n domain.Notification) error {
	r.inserted = append(r.inserted, n)
	return nil
}

// recFollows serves fixed follow graphs for listings and members.
type recFollows struct {
	stubFollows
	listings map[string][]string
	members  map[string][]string
}

func (r recFollows) Followers(_ context.Context, id string) ([]string, error) {
	return r.listings[id], nil
}
func (r recFollows) MemberFollowers(_ context.Context, id string) ([]string, error) {
	return r.members[id], nil
}

func TestRunRemembrance(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{
		// Passing anniversary today, reminders on → notify.
		{ID: "l-anniv", Type: domain.TypeMemorial, Status: domain.StatusApproved, Title: "Nana Esi", Slug: "nana-esi", OwnerID: "m-keeper",
			Details: map[string]any{"remindersEnabled": true, "diedDate": "2020-07-13"}},
		// Anniversary today but reminders switched off → silent.
		{ID: "l-off", Type: domain.TypeMemorial, Status: domain.StatusApproved, Title: "Quiet One", Slug: "quiet-one", OwnerID: "m-keeper",
			Details: map[string]any{"remindersEnabled": false, "diedDate": "2020-07-13"}},
		// Anniversary today, flag absent (legacy listing) → silent.
		{ID: "l-legacy", Type: domain.TypeMemorial, Status: domain.StatusApproved, Title: "Legacy One", Slug: "legacy-one", OwnerID: "m-keeper",
			Details: map[string]any{"diedDate": "2020-07-13"}},
		// Birthday observed and today → notify (birthday wording).
		{ID: "l-bday", Type: domain.TypeMemorial, Status: domain.StatusApproved, Title: "Birthday One", Slug: "birthday-one", OwnerID: "m-keeper",
			Details: map[string]any{"remindersEnabled": true, "observeBirthday": true, "birthday": "1940-07-13", "diedDate": "2020-01-01"}},
		// Birthday today but not observed → silent.
		{ID: "l-bdayoff", Type: domain.TypeMemorial, Status: domain.StatusApproved, Title: "Unobserved", Slug: "unobserved", OwnerID: "m-keeper",
			Details: map[string]any{"remindersEnabled": true, "observeBirthday": false, "birthday": "1940-07-13", "diedDate": "2020-01-01"}},
		// Pending memorials never notify, even with a matching date.
		{ID: "l-pending", Type: domain.TypeMemorial, Status: domain.StatusPending, Title: "Pending One", Slug: "pending-one", OwnerID: "m-keeper",
			Details: map[string]any{"remindersEnabled": true, "diedDate": "2020-07-13"}},
	}}
	notifs := &recNotifs{}
	svc := New(Deps{
		Listings: f, Members: stubMembers{}, Orgs: stubOrgs{}, Places: stubPlaces{},
		Mod: modRepo{f}, Notifs: notifs, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{},
		Follows: recFollows{
			listings: map[string][]string{"l-anniv": {"m-a"}, "l-bday": {"m-c"}},
			members:  map[string][]string{"m-keeper": {"m-a", "m-b"}},
		},
	})

	n, err := svc.RunRemembrance(ctx, "07-13")
	if err != nil {
		t.Fatalf("RunRemembrance: %v", err)
	}
	// l-anniv → {m-a} ∪ {m-a, m-b} = 2; l-bday → {m-c} ∪ {m-a, m-b} = 3.
	if n != 5 || len(notifs.inserted) != 5 {
		t.Fatalf("notices = %d (inserted %d), want 5", n, len(notifs.inserted))
	}

	var annivBody, bdayBody string
	recipients := map[string]int{}
	for _, nt := range notifs.inserted {
		if nt.Kind != "remembrance" {
			t.Errorf("kind = %q, want remembrance", nt.Kind)
		}
		recipients[nt.MemberID]++
		switch nt.Link {
		case "/memoriam/nana-esi":
			annivBody = nt.Body
		case "/memoriam/birthday-one":
			bdayBody = nt.Body
		}
	}
	if recipients["m-a"] != 2 || recipients["m-b"] != 2 || recipients["m-c"] != 1 {
		t.Errorf("recipients = %v, want m-a:2 m-b:2 m-c:1", recipients)
	}
	if !strings.Contains(annivBody, "passing") {
		t.Errorf("anniversary body = %q, want passing wording", annivBody)
	}
	if !strings.Contains(bdayBody, "birthday") {
		t.Errorf("birthday body = %q, want birthday wording", bdayBody)
	}
}

func TestSubmitMemorialDefaultsRemembranceFlags(t *testing.T) {
	ctx := context.Background()
	svc := newTestService(&fakeRepo{})

	// Absent flags are defaulted: remember the passing anniversary, don't
	// observe the birthday (spec §8.11).
	l, err := svc.Submit(ctx, SubmitInput{Type: domain.TypeMemorial, Title: "Nana Default", OwnerID: "m-test",
		Details: map[string]any{"diedDate": "2020-01-01"}})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if l.Details["remindersEnabled"] != true || l.Details["observeBirthday"] != false {
		t.Fatalf("defaults wrong: %+v", l.Details)
	}

	// Explicit keeper choices are respected — switching reminders off at
	// creation must stick.
	l, err = svc.Submit(ctx, SubmitInput{Type: domain.TypeMemorial, Title: "Nana Quiet", OwnerID: "m-test",
		Details: map[string]any{"diedDate": "2020-01-01", "remindersEnabled": false, "observeBirthday": true}})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if l.Details["remindersEnabled"] != false || l.Details["observeBirthday"] != true {
		t.Fatalf("explicit flags overridden: %+v", l.Details)
	}
}
