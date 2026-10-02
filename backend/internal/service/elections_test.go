package service

import (
	"context"
	"errors"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/oguaa/backend/internal/domain"
)

// memElections is a domain.ElectionRepository in memory.
type memElections struct {
	mu   sync.Mutex
	rows map[string]domain.Election
	all  int   // All calls
	fail error // returned by All when set
}

func newMemElections() *memElections { return &memElections{rows: map[string]domain.Election{}} }

func (m *memElections) Insert(_ context.Context, e domain.Election) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rows[e.ID] = e
	return nil
}

func (m *memElections) Update(_ context.Context, e domain.Election) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.rows[e.ID]; !ok {
		return &domain.NotFoundError{Entity: "election"}
	}
	m.rows[e.ID] = e
	return nil
}

func (m *memElections) Delete(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.rows[id]; !ok {
		return &domain.NotFoundError{Entity: "election"}
	}
	delete(m.rows, id)
	return nil
}

func (m *memElections) Get(_ context.Context, id string) (*domain.Election, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.rows[id]
	if !ok {
		return nil, &domain.NotFoundError{Entity: "election"}
	}
	return &e, nil
}

func (m *memElections) All(context.Context) ([]domain.Election, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.all++
	if m.fail != nil {
		return nil, m.fail
	}
	out := make([]domain.Election, 0, len(m.rows))
	for _, e := range m.rows {
		out = append(out, e)
	}
	slices.SortFunc(out, func(a, b domain.Election) int { return strings.Compare(b.PollDate, a.PollDate) })
	return out, nil
}

func (m *memElections) setFail(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.fail = err
}

// liveCampaigns is a fake ElectionCampaigns.
type liveCampaigns map[string]int

func (l liveCampaigns) LiveCampaignsForElection(_ context.Context, id string) (int, error) {
	return l[id], nil
}

type electionsFixture struct {
	svc      *ElectionsService
	repo     *memElections
	settings *memSettings
	clk      *settingsClock
}

func newElectionsFixture() *electionsFixture {
	settingsRepo := newMemSettings()
	settings := NewSettingsService(settingsRepo, quietLog())
	repo := newMemElections()
	svc := NewElectionsService(repo, settings, quietLog())
	clk := &settingsClock{t: time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)}
	svc.now, settings.now = clk.now, clk.now
	return &electionsFixture{svc: svc, repo: repo, settings: settingsRepo, clk: clk}
}

var calendarSteward = AuditActor{ID: "m1", Name: "Nana Essien"}

func generalElection() ElectionInput {
	return ElectionInput{Name: "2028 General Election", Kind: domain.ElectionGeneral, Scope: domain.ElectionScopeNational, PollDate: "2028-12-07"}
}

func TestCreateElectionFillsTheDefaultWindows(t *testing.T) {
	f := newElectionsFixture()
	e, err := f.svc.Create(context.Background(), generalElection(), calendarSteward)
	if err != nil {
		t.Fatal(err)
	}
	want := domain.Election{
		PollDate: "2028-12-07", PoliticalAdsFrom: "2028-09-08",
		BlackoutStart: "2028-12-06T00:00:00Z", BlackoutEnd: "2028-12-09T00:00:00Z",
		NewsModeFrom: "2028-11-07", NewsModeTo: "2028-12-10",
	}
	if e.PoliticalAdsFrom != want.PoliticalAdsFrom || e.BlackoutStart != want.BlackoutStart || e.BlackoutEnd != want.BlackoutEnd ||
		e.NewsModeFrom != want.NewsModeFrom || e.NewsModeTo != want.NewsModeTo {
		t.Fatalf("windows = %+v", e)
	}
	if !strings.HasPrefix(e.ID, domain.PrefixElection) || e.CreatedAt != "2026-10-02T09:00:00Z" || e.CreatedAt != e.UpdatedAt {
		t.Errorf("bookkeeping = %+v", e)
	}
	if len(f.settings.audit) != 1 || f.settings.audit[0].Key != "elections" || f.settings.audit[0].Before != "null" ||
		f.settings.audit[0].ActorName != "Nana Essien" || !strings.Contains(f.settings.audit[0].After, `"pollDate":"2028-12-07"`) {
		t.Fatalf("audit = %+v", f.settings.audit)
	}
}

func TestElectionValidation(t *testing.T) {
	cases := map[string]struct {
		edit  func(*ElectionInput)
		field string
	}{
		"short name":          {func(in *ElectionInput) { in.Name = "GE" }, "name"},
		"unknown kind":        {func(in *ElectionInput) { in.Kind = "mayoral" }, "kind"},
		"unknown scope":       {func(in *ElectionInput) { in.Scope = "district" }, "scope"},
		"no area":             {func(in *ElectionInput) { in.Scope = domain.ElectionScopeConstituency }, "areas"},
		"bad poll date":       {func(in *ElectionInput) { in.PollDate = "07/12/2028" }, "pollDate"},
		"blackout backwards":  {func(in *ElectionInput) { in.BlackoutEnd = "2028-12-05T00:00:00Z" }, "blackoutEnd"},
		"bad blackout time":   {func(in *ElectionInput) { in.BlackoutStart = "2028-12-06" }, "blackoutStart"},
		"ads open too late":   {func(in *ElectionInput) { in.PoliticalAdsFrom = "2028-12-06" }, "politicalAdsFrom"},
		"news mode after":     {func(in *ElectionInput) { in.NewsModeFrom = "2028-12-08" }, "newsModeFrom"},
		"news mode ends soon": {func(in *ElectionInput) { in.NewsModeTo = "2028-12-06" }, "newsModeTo"},
		"bad results time":    {func(in *ElectionInput) { in.ResultsDeclaredAt = "soon" }, "resultsDeclaredAt"},
		"long notes":          {func(in *ElectionInput) { in.Notes = strings.Repeat("n", 1001) }, "notes"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			f := newElectionsFixture()
			in := generalElection()
			c.edit(&in)
			_, err := f.svc.Create(context.Background(), in, calendarSteward)
			var fe *InvalidFieldError
			if !errors.As(err, &fe) || fe.Code != CodeInvalidElection || fe.Field != c.field {
				t.Fatalf("err = %v, want invalid_election on %s", err, c.field)
			}
			if len(f.repo.rows) != 0 || len(f.settings.audit) != 0 {
				t.Error("a refused election must not be stored or audited")
			}
		})
	}
}

func TestElectionAreasAreCleaned(t *testing.T) {
	f := newElectionsFixture()
	in := ElectionInput{Name: "Cape Coast North by-election", Kind: domain.ElectionParliamentaryBy, Scope: domain.ElectionScopeConstituency,
		Areas: []string{"  Cape Coast   North ", "Cape Coast North", ""}, PollDate: "2027-03-02",
		BlackoutStart: "2027-03-01T06:00:00+00:00", ResultsDeclaredAt: "2027-03-03T18:30:00Z"}
	e, err := f.svc.Create(context.Background(), in, calendarSteward)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(e.Areas, []string{"Cape Coast North"}) || e.BlackoutStart != "2027-03-01T06:00:00Z" || e.ResultsDeclaredAt != "2027-03-03T18:30:00Z" {
		t.Fatalf("election = %+v", e)
	}
}

func TestInBlackoutAndUpcoming(t *testing.T) {
	f := newElectionsFixture()
	ctx := context.Background()
	ge, _ := f.svc.Create(ctx, generalElection(), calendarSteward)
	by := ElectionInput{Name: "Cape Coast North by-election", Kind: domain.ElectionParliamentaryBy, Scope: domain.ElectionScopeConstituency,
		Areas: []string{"Cape Coast North"}, PollDate: "2026-11-10"}
	_, _ = f.svc.Create(ctx, by, calendarSteward)
	past := ElectionInput{Name: "2024 General Election", Kind: domain.ElectionGeneral, Scope: domain.ElectionScopeNational, PollDate: "2024-12-07"}
	_, _ = f.svc.Create(ctx, past, calendarSteward)

	at := func(s string) time.Time { t, _ := time.Parse(time.RFC3339, s); return t }
	if in, _ := f.svc.InBlackout(ctx, at("2028-12-05T23:59:59Z")); in {
		t.Error("the blackout starts at 00:00 the day before the poll")
	}
	in, e := f.svc.InBlackout(ctx, at("2028-12-06T00:00:00Z"))
	if !in || e == nil || e.ID != ge.ID {
		t.Fatalf("InBlackout at start = %v %v", in, e)
	}
	if in, _ := f.svc.InBlackout(ctx, at("2028-12-09T00:00:00Z")); in {
		t.Error("the blackout end is exclusive")
	}

	up, err := f.svc.Upcoming(ctx, "2026-10-02")
	if err != nil || len(up) != 2 || up[0].PollDate != "2026-11-10" || up[1].PollDate != "2028-12-07" {
		t.Fatalf("upcoming = %+v, %v", up, err)
	}
	if up, _ := f.svc.Upcoming(ctx, "2026-11-10"); len(up) != 2 {
		t.Error("an election polling today is still upcoming")
	}
}

func TestNewsElectionMode(t *testing.T) {
	f := newElectionsFixture()
	ctx := context.Background()
	_, _ = f.svc.Create(ctx, generalElection(), calendarSteward)
	day := func(s string) time.Time { t, _ := time.Parse(time.RFC3339, s+"T12:00:00Z"); return t }
	for d, want := range map[string]bool{"2028-11-06": false, "2028-11-07": true, "2028-12-10": true, "2028-12-11": false} {
		if got := f.svc.NewsElectionMode(ctx, day(d)); got != want {
			t.Errorf("NewsElectionMode(%s) = %v, want %v", d, got, want)
		}
	}
	f.settings.docs[domain.SettingsKeyNewsDesk] = bson.M{"electionModeManual": true, "version": 1}
	f.clk.advance(time.Minute) // past the settings cache
	_ = f.svc.NewsElectionMode(ctx, day("2027-01-01"))
	f.svc.settings.refreshes.Wait()
	if !f.svc.NewsElectionMode(ctx, day("2027-01-01")) {
		t.Error("the manual switch turns election mode on outside any window")
	}
}

func TestUpdateKeepsCreatedAtAndAuditsBeforeAndAfter(t *testing.T) {
	f := newElectionsFixture()
	ctx := context.Background()
	e, _ := f.svc.Create(ctx, generalElection(), calendarSteward)
	f.clk.advance(time.Hour)
	in := generalElection()
	in.BlackoutEnd = "2028-12-08T18:00:00Z"
	in.Reason = "EC declared results on the 8th"
	u, err := f.svc.Update(ctx, e.ID, in, calendarSteward)
	if err != nil {
		t.Fatal(err)
	}
	if u.CreatedAt != e.CreatedAt || u.UpdatedAt != "2026-10-02T10:00:00Z" || u.BlackoutEnd != "2028-12-08T18:00:00Z" {
		t.Fatalf("updated = %+v", u)
	}
	last := f.settings.audit[len(f.settings.audit)-1]
	if !strings.Contains(last.Before, "2028-12-09T00:00:00Z") || !strings.Contains(last.After, "2028-12-08T18:00:00Z") || last.Reason != in.Reason {
		t.Fatalf("audit = %+v", last)
	}
	if _, err := f.svc.Update(ctx, "elc-missing", in, calendarSteward); !electionNotFound(err) {
		t.Errorf("missing election err = %v", err)
	}
}

func TestDeleteIsRefusedWhileCampaignsUseTheElection(t *testing.T) {
	f := newElectionsFixture()
	ctx := context.Background()
	e, _ := f.svc.Create(ctx, generalElection(), calendarSteward)
	f.svc.SetCampaigns(liveCampaigns{e.ID: 2})
	if err := f.svc.Delete(ctx, e.ID, calendarSteward, ""); !errors.Is(err, ErrElectionInUse) {
		t.Fatalf("err = %v, want ErrElectionInUse", err)
	}
	f.svc.SetCampaigns(liveCampaigns{})
	if err := f.svc.Delete(ctx, e.ID, calendarSteward, "entered twice"); err != nil {
		t.Fatal(err)
	}
	last := f.settings.audit[len(f.settings.audit)-1]
	if last.After != "null" || !strings.Contains(last.Before, e.ID) {
		t.Fatalf("delete audit = %+v", last)
	}
	if all, _ := f.svc.All(ctx); len(all) != 0 {
		t.Error("the election should be gone")
	}
}

func TestCalendarCacheSurvivesAnOutageAndSeesWrites(t *testing.T) {
	f := newElectionsFixture()
	ctx := context.Background()
	_, _ = f.svc.Create(ctx, generalElection(), calendarSteward)
	if up, _ := f.svc.Upcoming(ctx, "2026-10-02"); len(up) != 1 {
		t.Fatal("first read")
	}
	reads := f.repo.all
	_, _ = f.svc.InBlackout(ctx, f.clk.now())
	if f.repo.all != reads {
		t.Error("a fresh calendar is served from the cache")
	}
	f.repo.setFail(errors.New("mongo down"))
	f.clk.advance(time.Minute)
	_, _ = f.svc.Upcoming(ctx, "2026-10-02")
	f.svc.refreshes.Wait()
	if up, err := f.svc.Upcoming(ctx, "2026-10-02"); err != nil || len(up) != 1 {
		t.Fatalf("the last good calendar must be kept: %v %v", up, err)
	}

	// Cold failure: no calendar at all → not in blackout for the scheduler
	// (nothing is ended and refunded), but blackout-or-unknown for serving
	// (political ads stay off the page), and Upcoming errors.
	cold := newElectionsFixture()
	cold.repo.setFail(errors.New("mongo down"))
	if in, _ := cold.svc.InBlackout(ctx, time.Now()); in {
		t.Error("an unreadable calendar must not report a blackout")
	}
	if !cold.svc.BlackoutOrUnknown(ctx, time.Now()) {
		t.Error("serving must treat an unreadable calendar as a possible blackout")
	}
	if !cold.svc.NewsElectionMode(ctx, time.Now()) {
		t.Error("the news desk must assume election mode when the calendar can't be read")
	}
	if _, err := cold.svc.Upcoming(ctx, "2026-10-02"); err == nil {
		t.Error("Upcoming should report a cold read failure")
	}
	// A calendar read once is used through a later outage, both ways.
	if f.svc.BlackoutOrUnknown(ctx, f.clk.now()) {
		t.Error("a readable calendar with no blackout now must not hold political ads")
	}
}

func TestBlackoutOrUnknownFollowsTheCalendar(t *testing.T) {
	f := newElectionsFixture()
	ctx := context.Background()
	_, _ = f.svc.Create(ctx, generalElection(), calendarSteward)
	at := func(s string) time.Time { t, _ := time.Parse(time.RFC3339, s); return t }
	for when, want := range map[string]bool{
		"2028-12-05T23:59:59Z": false, "2028-12-06T00:00:00Z": true, "2028-12-08T23:59:59Z": true, "2028-12-09T00:00:00Z": false,
	} {
		if got := f.svc.BlackoutOrUnknown(ctx, at(when)); got != want {
			t.Errorf("BlackoutOrUnknown(%s) = %v, want %v", when, got, want)
		}
	}
}

func electionNotFound(err error) bool {
	var nf *domain.NotFoundError
	return errors.As(err, &nf)
}
