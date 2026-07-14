package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// timelineStub returns a deliberately unsorted timeline.
type timelineStub struct{ entries []domain.TimelineEntry }

func (s timelineStub) All(context.Context) ([]domain.TimelineEntry, error) { return s.entries, nil }
func (timelineStub) InsertMany(context.Context, []domain.TimelineEntry) error {
	return nil
}

// heritageOrgs answers ByKind with a mixed roster (verified + unverified,
// other kinds only if the wrong kind is asked for).
type heritageOrgs struct{ stubOrgs }

func (heritageOrgs) ByKind(_ context.Context, kind string) ([]domain.Organization, error) {
	if kind != "heritage" {
		return nil, nil
	}
	return []domain.Organization{
		{ID: "h-castle", Slug: "cape-coast-castle", Kind: "heritage", Name: "Cape Coast Castle", Verified: true, History: "The whitewashed fortress."},
		{ID: "h-draft", Slug: "draft-site", Kind: "heritage", Name: "Unverified Site", Verified: false},
	}, nil
}

func newHistoryService() *Service {
	f := &fakeRepo{listings: []domain.Listing{
		{ID: "p-1", Type: domain.TypePerson, Status: domain.StatusApproved, Title: "Elder", CreatedAt: "2026-01-01"},
		{ID: "p-2", Type: domain.TypePerson, Status: domain.StatusApproved, Title: "Youth", CreatedAt: "2026-05-01"},
		{ID: "p-3", Type: domain.TypePerson, Status: domain.StatusPending, Title: "Unreviewed", CreatedAt: "2026-06-01"},
		{ID: "m-1", Type: domain.TypeMemory, Status: domain.StatusApproved, Title: "Old memory", CreatedAt: "2026-02-01"},
		{ID: "m-2", Type: domain.TypeMemory, Status: domain.StatusPending, Title: "Pending memory", CreatedAt: "2026-06-01"},
	}}
	tl := timelineStub{entries: []domain.TimelineEntry{
		{ID: "tl-1979", Year: "1979", Title: "UNESCO World Heritage"},
		{ID: "tl-1482", Year: "1482", Title: "The Portuguese reach the Gold Coast"},
		{ID: "tl-1876", Year: "1876", Title: "Mfantsipim is founded"},
	}}
	return New(Deps{Listings: f, Members: stubMembers{}, Orgs: heritageOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: stubNotifs{}, Follows: stubFollows{}, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: tl})
}

func TestHistory_timelineSortedAscending(t *testing.T) {
	view, err := newHistoryService().History(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"1482", "1876", "1979"}
	if len(view.Timeline) != len(want) {
		t.Fatalf("timeline len = %d, want %d", len(view.Timeline), len(want))
	}
	for i, y := range want {
		if view.Timeline[i].Year != y {
			t.Errorf("timeline[%d].Year = %q, want %q", i, view.Timeline[i].Year, y)
		}
	}
}

func TestHistory_heritageFilteredToVerifiedHeritageKind(t *testing.T) {
	view, err := newHistoryService().History(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(view.Heritage) != 1 {
		t.Fatalf("heritage len = %d, want 1 (unverified excluded)", len(view.Heritage))
	}
	h := view.Heritage[0]
	if h.Kind != "heritage" || !h.Verified || h.ID != "h-castle" {
		t.Errorf("heritage[0] = %+v, want the verified heritage org h-castle", h)
	}
}

func TestHistory_payloadShape(t *testing.T) {
	view, err := newHistoryService().History(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if view == nil {
		t.Fatal("view is nil")
	}
	// Only approved people and memories make the hub.
	if len(view.People) != 2 {
		t.Errorf("people len = %d, want 2 approved", len(view.People))
	}
	if view.People[0].Title != "Youth" {
		t.Errorf("people[0] = %q, want newest approved first (Youth)", view.People[0].Title)
	}
	if len(view.Memories) != 1 || view.Memories[0].Title != "Old memory" {
		t.Errorf("memories = %+v, want only the approved memory", view.Memories)
	}
	for _, p := range view.People {
		if p.Status != domain.StatusApproved {
			t.Errorf("person %q has status %q, want approved", p.Title, p.Status)
		}
	}
}
