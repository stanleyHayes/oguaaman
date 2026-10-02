package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── the election calendar (spec §1.2) ────────────────────────────────────────
//
// One calendar serves both features: political-ad windows and blackouts (ads)
// and the newsroom's "election mode" (news desk). The hot reads — InBlackout
// on every ad served, NewsElectionMode on every research job — go through a
// 30-second cache that, like settings, never waits on a slow database. Writes
// are steward-only and each one leaves a settings-audit row keyed "elections".

// calendarZone is Africa/Accra: GMT all year, no daylight saving. A fixed zone keeps
// the calendar maths independent of the host's tz database.
var calendarZone = time.FixedZone("GMT", 0)

const (
	electionDateLayout = time.DateOnly

	// Default windows around the poll date (spec §1.2, [A12]).
	defaultPoliticalAdsDays = 90 // political ads from pollDate-90d
	defaultBlackoutLeadDays = 1  // blackout from (pollDate-1d) 00:00
	defaultBlackoutTailDays = 2  // to (pollDate+2d) 00:00
	defaultNewsModeLeadDays = 30 // newsroom election mode from pollDate-30d
	defaultNewsModeTailDays = 3  // to pollDate+3d

	minElectionName  = 3
	maxElectionName  = 120
	maxElectionAreas = 50
	minAreaName      = 2
	maxAreaName      = 80
	maxElectionNotes = 1000

	// CodeInvalidElection is the InvalidFieldError code of a rejected calendar entry.
	CodeInvalidElection = "invalid_election"
)

// ErrElectionInUse refuses to delete an election that live ad campaigns
// reference. HTTP 409 election_in_use.
var ErrElectionInUse = errors.New("election_in_use")

// ElectionCampaigns tells the calendar whether ad campaigns depend on an
// election. The ads service implements it; until it is wired, deletes are
// not blocked (no campaign can exist without the ads feature).
type ElectionCampaigns interface {
	// LiveCampaignsForElection counts the campaigns in status approved,
	// scheduled, active or paused that reference electionID.
	LiveCampaignsForElection(ctx context.Context, electionID string) (int, error)
}

// ElectionInput is the body of a create or update: an Election without id,
// createdAt or updatedAt. Empty window fields are computed from PollDate.
type ElectionInput struct {
	Name              string   `json:"name"`
	Kind              string   `json:"kind"`
	Scope             string   `json:"scope"`
	Areas             []string `json:"areas"`
	PollDate          string   `json:"pollDate"`
	PoliticalAdsFrom  string   `json:"politicalAdsFrom"`
	BlackoutStart     string   `json:"blackoutStart"`
	BlackoutEnd       string   `json:"blackoutEnd"`
	NewsModeFrom      string   `json:"newsModeFrom"`
	NewsModeTo        string   `json:"newsModeTo"`
	ResultsDeclaredAt string   `json:"resultsDeclaredAt"`
	Notes             string   `json:"notes"`
	// Reason is an optional note for the audit trail.
	Reason string `json:"reason"`
}

// AuditActor is the staff member making a change (for audit rows).
type AuditActor struct {
	ID   string
	Name string
}

// ElectionsService owns the calendar.
type ElectionsService struct {
	repo      domain.ElectionRepository
	settings  *SettingsService
	campaigns ElectionCampaigns
	log       *slog.Logger
	now       func() time.Time

	mu         sync.Mutex
	cached     []domain.Election
	cachedAt   time.Time
	haveCache  bool
	refreshing bool
	refreshes  sync.WaitGroup
}

// NewElectionsService builds the calendar service. settings may be nil (no
// audit rows, no manual newsroom election mode).
func NewElectionsService(repo domain.ElectionRepository, settings *SettingsService, log *slog.Logger) *ElectionsService {
	if log == nil {
		log = slog.Default()
	}
	return &ElectionsService{repo: repo, settings: settings, log: log, now: time.Now}
}

// SetCampaigns wires the ads service so deletes can be refused while
// campaigns depend on an election.
func (s *ElectionsService) SetCampaigns(c ElectionCampaigns) { s.campaigns = c }

// ── reads ────────────────────────────────────────────────────────────────────

// All returns the whole calendar, latest poll first, straight from the store.
func (s *ElectionsService) All(ctx context.Context) ([]domain.Election, error) {
	out, err := s.repo.All(ctx)
	if out == nil {
		out = []domain.Election{}
	}
	return out, err
}

// Get returns one election.
func (s *ElectionsService) Get(ctx context.Context, id string) (*domain.Election, error) {
	return s.repo.Get(ctx, id)
}

// Upcoming returns the elections whose poll is on or after today
// (YYYY-MM-DD), soonest first.
func (s *ElectionsService) Upcoming(ctx context.Context, today string) ([]domain.Election, error) {
	all, err := s.calendar(ctx)
	if err != nil {
		return nil, err
	}
	out := []domain.Election{}
	for _, e := range all {
		if e.PollDate >= today {
			out = append(out, e)
		}
	}
	slices.SortStableFunc(out, func(a, b domain.Election) int { return strings.Compare(a.PollDate, b.PollDate) })
	return out, nil
}

// InBlackout reports whether at falls inside any election's blackout
// (BlackoutStart <= at < BlackoutEnd), and which. When the calendar cannot be
// read at all it reports false: a database outage must not complete and
// refund every political campaign. Serving reads it the other way round;
// see BlackoutOrUnknown.
func (s *ElectionsService) InBlackout(ctx context.Context, at time.Time) (bool, *domain.Election) {
	all, err := s.calendar(ctx)
	if err != nil {
		return false, nil
	}
	return blackoutAt(all, at)
}

// BlackoutOrUnknown reports whether political ads must be kept off the page
// at at: an election blackout, or a calendar that cannot be read at all, in
// which case nobody can say there is no blackout (serving fails closed).
// Only a cold read can fail; once read, the last good calendar is used.
func (s *ElectionsService) BlackoutOrUnknown(ctx context.Context, at time.Time) bool {
	all, err := s.calendar(ctx)
	if err != nil {
		return true
	}
	in, _ := blackoutAt(all, at)
	return in
}

// blackoutAt finds the election whose blackout at falls in.
func blackoutAt(all []domain.Election, at time.Time) (bool, *domain.Election) {
	for i := range all {
		start, err1 := time.Parse(time.RFC3339, all[i].BlackoutStart)
		end, err2 := time.Parse(time.RFC3339, all[i].BlackoutEnd)
		if err1 != nil || err2 != nil {
			continue
		}
		if !at.Before(start) && at.Before(end) {
			e := all[i]
			return true, &e
		}
	}
	return false, nil
}

// newsModeSettings is the one news-desk field the calendar needs. It is read
// through the settings cache like the news desk's own struct.
type newsModeSettings struct {
	ElectionModeManual bool `json:"electionModeManual" bson:"electionModeManual"`
}

// NewsElectionMode reports whether the newsroom is in election mode at at:
// any election with NewsModeFrom <= date(at) <= NewsModeTo, or the news
// desk's manual switch.
func (s *ElectionsService) NewsElectionMode(ctx context.Context, at time.Time) bool {
	manual, _ := LoadSettings(ctx, s.settings, domain.SettingsKeyNewsDesk, func() newsModeSettings { return newsModeSettings{} })
	if manual.ElectionModeManual {
		return true
	}
	all, err := s.calendar(ctx)
	if err != nil {
		// The calendar can't be read at all (only before its first load):
		// assume election mode, so no political story is drafted by AI or
		// illustrated unchecked. It costs nothing but a short delay.
		return true
	}
	day := at.In(calendarZone).Format(electionDateLayout)
	for _, e := range all {
		if e.NewsModeFrom <= day && day <= e.NewsModeTo {
			return true
		}
	}
	return false
}

// calendar is the cached calendar: fresh within settingsCacheTTL, otherwise
// the stale copy while one background refresh runs. Only a cold read can
// fail.
func (s *ElectionsService) calendar(ctx context.Context) ([]domain.Election, error) {
	s.mu.Lock()
	if s.haveCache {
		out := s.cached
		if s.now().Sub(s.cachedAt) >= settingsCacheTTL && !s.refreshing {
			s.refreshing = true
			s.refreshes.Add(1)
			go s.refresh()
		}
		s.mu.Unlock()
		return out, nil
	}
	s.mu.Unlock()
	rctx, cancel := context.WithTimeout(ctx, settingsReadTimeout)
	defer cancel()
	all, err := s.repo.All(rctx)
	if err != nil {
		s.log.Warn("elections: calendar read failed", "err", err)
		return nil, err
	}
	s.remember(all)
	return all, nil
}

func (s *ElectionsService) refresh() {
	defer s.refreshes.Done()
	ctx, cancel := context.WithTimeout(context.Background(), settingsReadTimeout)
	defer cancel()
	all, err := s.repo.All(ctx)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.refreshing = false
	if err != nil {
		s.log.Warn("elections: calendar refresh failed, keeping the last good copy", "err", err)
		s.cachedAt = s.now().Add(settingsRetryAfterError - settingsCacheTTL)
		return
	}
	s.cached, s.cachedAt, s.haveCache = all, s.now(), true
}

func (s *ElectionsService) remember(all []domain.Election) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cached, s.cachedAt, s.haveCache = all, s.now(), true
}

// forget drops the cache after a write so the next read sees it.
func (s *ElectionsService) forget() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cached, s.haveCache = nil, false
}

// ── writes (steward) ─────────────────────────────────────────────────────────

// Create adds an election to the calendar.
func (s *ElectionsService) Create(ctx context.Context, in ElectionInput, by AuditActor) (*domain.Election, error) {
	e, err := buildElection(in)
	if err != nil {
		return nil, err
	}
	now := s.now().UTC().Format(time.RFC3339)
	e.ID, e.CreatedAt, e.UpdatedAt = newID(domain.PrefixElection), now, now
	if err := s.repo.Insert(ctx, e); err != nil {
		return nil, err
	}
	s.forget()
	s.audit(ctx, nil, &e, by, in.Reason)
	return &e, nil
}

// Update replaces an election's fields. Changing the blackout of an election
// with live political campaigns is allowed: the ads scheduler follows it.
func (s *ElectionsService) Update(ctx context.Context, id string, in ElectionInput, by AuditActor) (*domain.Election, error) {
	prev, err := s.repo.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	e, err := buildElection(in)
	if err != nil {
		return nil, err
	}
	e.ID, e.CreatedAt, e.UpdatedAt = prev.ID, prev.CreatedAt, s.now().UTC().Format(time.RFC3339)
	if err := s.repo.Update(ctx, e); err != nil {
		return nil, err
	}
	s.forget()
	s.audit(ctx, prev, &e, by, in.Reason)
	return &e, nil
}

// Delete removes an election no live campaign references.
func (s *ElectionsService) Delete(ctx context.Context, id string, by AuditActor, reason string) error {
	prev, err := s.repo.Get(ctx, id)
	if err != nil {
		return err
	}
	if s.campaigns != nil {
		n, err := s.campaigns.LiveCampaignsForElection(ctx, id)
		if err != nil {
			return err
		}
		if n > 0 {
			return ErrElectionInUse
		}
	}
	if err := s.repo.Delete(ctx, id); err != nil {
		return err
	}
	s.forget()
	s.audit(ctx, prev, nil, by, reason)
	return nil
}

// audit records a calendar change. The change itself has already happened,
// so a failed audit write is logged, not returned.
func (s *ElectionsService) audit(ctx context.Context, before, after *domain.Election, by AuditActor, reason string) {
	var b, a any
	if before != nil {
		b = before
	}
	if after != nil {
		a = after
	}
	if err := s.settings.Record(ctx, domain.SettingsKeyElections, b, a, by.ID, by.Name, reason); err != nil {
		s.log.Error("elections: audit write failed", "err", err)
	}
}

// ── validation and defaults ──────────────────────────────────────────────────

// buildElection validates in and fills the default windows from the poll date.
func buildElection(in ElectionInput) (domain.Election, error) {
	e := domain.Election{
		Name: strings.TrimSpace(in.Name), Kind: strings.TrimSpace(in.Kind), Scope: strings.TrimSpace(in.Scope),
		Notes: strings.TrimSpace(in.Notes),
	}
	if err := validateElectionLabels(&e, in.Areas); err != nil {
		return e, err
	}
	poll, err := time.ParseInLocation(electionDateLayout, strings.TrimSpace(in.PollDate), calendarZone)
	if err != nil {
		return e, invalidElection("pollDate", "Give the poll date as YYYY-MM-DD.")
	}
	e.PollDate = poll.Format(electionDateLayout)
	if err := fillElectionWindows(&e, in, poll); err != nil {
		return e, err
	}
	if err := checkElectionWindows(e); err != nil {
		return e, err
	}
	return e, nil
}

// validateElectionLabels checks the name, kind, scope, areas and notes.
func validateElectionLabels(e *domain.Election, areas []string) error {
	if n := runeLen(e.Name); n < minElectionName || n > maxElectionName {
		return invalidElection("name", fmt.Sprintf("Name the election (%d to %d characters).", minElectionName, maxElectionName))
	}
	if !domain.ValidElectionKind(e.Kind) {
		return invalidElection("kind", "Choose general, parliamentary_by, party_primary, district_assembly or referendum.")
	}
	if !domain.ValidElectionScope(e.Scope) {
		return invalidElection("scope", "Choose national, region or constituency.")
	}
	cleaned, err := cleanAreas(areas)
	if err != nil {
		return err
	}
	if e.Scope != domain.ElectionScopeNational && len(cleaned) == 0 {
		return invalidElection("areas", "Name the region or constituency this election covers.")
	}
	e.Areas = cleaned
	if runeLen(e.Notes) > maxElectionNotes {
		return invalidElection("notes", fmt.Sprintf("Keep notes under %d characters.", maxElectionNotes))
	}
	return nil
}

// cleanAreas trims, de-duplicates and bounds the area names.
func cleanAreas(areas []string) ([]string, error) {
	var out []string
	for _, a := range areas {
		a = strings.Join(strings.Fields(a), " ")
		if a == "" || slices.Contains(out, a) {
			continue
		}
		if n := runeLen(a); n < minAreaName || n > maxAreaName {
			return nil, invalidElection("areas", fmt.Sprintf("Each area name needs %d to %d characters.", minAreaName, maxAreaName))
		}
		out = append(out, a)
	}
	if len(out) > maxElectionAreas {
		return nil, invalidElection("areas", fmt.Sprintf("List at most %d areas.", maxElectionAreas))
	}
	return out, nil
}

// fillElectionWindows parses the given window fields and computes the empty
// ones from the poll date.
func fillElectionWindows(e *domain.Election, in ElectionInput, poll time.Time) error {
	var err error
	day := func(n int) time.Time { return poll.AddDate(0, 0, n) }
	if e.PoliticalAdsFrom, err = dateOr(in.PoliticalAdsFrom, day(-defaultPoliticalAdsDays), "politicalAdsFrom"); err != nil {
		return err
	}
	if e.NewsModeFrom, err = dateOr(in.NewsModeFrom, day(-defaultNewsModeLeadDays), "newsModeFrom"); err != nil {
		return err
	}
	if e.NewsModeTo, err = dateOr(in.NewsModeTo, day(defaultNewsModeTailDays), "newsModeTo"); err != nil {
		return err
	}
	if e.BlackoutStart, err = instantOr(in.BlackoutStart, day(-defaultBlackoutLeadDays), "blackoutStart"); err != nil {
		return err
	}
	if e.BlackoutEnd, err = instantOr(in.BlackoutEnd, day(defaultBlackoutTailDays), "blackoutEnd"); err != nil {
		return err
	}
	if v := strings.TrimSpace(in.ResultsDeclaredAt); v != "" {
		t, perr := time.Parse(time.RFC3339, v)
		if perr != nil {
			return invalidElection("resultsDeclaredAt", "Give the time results were declared as an RFC 3339 timestamp.")
		}
		e.ResultsDeclaredAt = t.UTC().Format(time.RFC3339)
	}
	return nil
}

// checkElectionWindows enforces the ordering rules of spec §1.2.
func checkElectionWindows(e domain.Election) error {
	start, _ := time.Parse(time.RFC3339, e.BlackoutStart)
	end, _ := time.Parse(time.RFC3339, e.BlackoutEnd)
	switch {
	case !start.Before(end):
		return invalidElection("blackoutEnd", "The blackout must end after it starts.")
	case e.PoliticalAdsFrom >= start.In(calendarZone).Format(electionDateLayout):
		return invalidElection("politicalAdsFrom", "Political ads must open before the blackout starts.")
	case e.NewsModeFrom > e.PollDate:
		return invalidElection("newsModeFrom", "Election mode must start on or before the poll date.")
	case e.NewsModeTo < e.PollDate:
		return invalidElection("newsModeTo", "Election mode must run until at least the poll date.")
	}
	return nil
}

// dateOr parses a YYYY-MM-DD field, or formats def when it is empty.
func dateOr(v string, def time.Time, field string) (string, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return def.Format(electionDateLayout), nil
	}
	t, err := time.ParseInLocation(electionDateLayout, v, calendarZone)
	if err != nil {
		return "", invalidElection(field, "Give this date as YYYY-MM-DD.")
	}
	return t.Format(electionDateLayout), nil
}

// instantOr parses an RFC 3339 field into UTC, or uses midnight Accra of def
// when it is empty.
func instantOr(v string, def time.Time, field string) (string, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return time.Date(def.Year(), def.Month(), def.Day(), 0, 0, 0, 0, calendarZone).UTC().Format(time.RFC3339), nil
	}
	t, err := time.Parse(time.RFC3339, v)
	if err != nil {
		return "", invalidElection(field, "Give this time as an RFC 3339 timestamp, for example 2028-12-06T00:00:00Z.")
	}
	return t.UTC().Format(time.RFC3339), nil
}

func invalidElection(field, message string) *InvalidFieldError {
	return invalidField(CodeInvalidElection, field, message)
}
