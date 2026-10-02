package http

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// elRepo is an in-memory domain.ElectionRepository.
type elRepo struct {
	mu   sync.Mutex
	rows map[string]domain.Election
}

func (r *elRepo) Insert(_ context.Context, e domain.Election) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rows[e.ID] = e
	return nil
}
func (r *elRepo) Update(_ context.Context, e domain.Election) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.rows[e.ID]; !ok {
		return &domain.NotFoundError{Entity: "election"}
	}
	r.rows[e.ID] = e
	return nil
}
func (r *elRepo) Delete(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.rows[id]; !ok {
		return &domain.NotFoundError{Entity: "election"}
	}
	delete(r.rows, id)
	return nil
}
func (r *elRepo) Get(_ context.Context, id string) (*domain.Election, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	e, ok := r.rows[id]
	if !ok {
		return nil, &domain.NotFoundError{Entity: "election"}
	}
	return &e, nil
}
func (r *elRepo) All(context.Context) ([]domain.Election, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []domain.Election{}
	for _, e := range r.rows {
		out = append(out, e)
	}
	return out, nil
}

// auditRepo is a settings repository that only keeps audit rows.
type auditRepo struct {
	mu   sync.Mutex
	rows []domain.SettingsAudit
}

func (a *auditRepo) Get(context.Context, string, any) (bool, error) { return false, nil }
func (a *auditRepo) Put(_ context.Context, _ string, _ any, _ int, row domain.SettingsAudit) error {
	return a.AppendAudit(context.Background(), row)
}
func (a *auditRepo) AppendAudit(_ context.Context, row domain.SettingsAudit) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.rows = append(a.rows, row)
	return nil
}
func (a *auditRepo) Audit(_ context.Context, key string, limit int) ([]domain.SettingsAudit, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := []domain.SettingsAudit{}
	for i := len(a.rows) - 1; i >= 0 && len(out) < limit; i-- {
		if a.rows[i].Key == key {
			out = append(out, a.rows[i])
		}
	}
	return out, nil
}

// usedElections makes every election look referenced by live campaigns.
type usedElections struct{}

func (usedElections) LiveCampaignsForElection(context.Context, string) (int, error) { return 1, nil }

type foundationsFixture struct {
	mux       *http.ServeMux
	elections *service.ElectionsService
	audit     *auditRepo
}

func newFoundationsFixture(t *testing.T) *foundationsFixture {
	t.Helper()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	audit := &auditRepo{}
	settings := service.NewSettingsService(audit, log)
	elections := service.NewElectionsService(&elRepo{rows: map[string]domain.Election{}}, settings, log)
	h := &Handler{authRequired: true, log: log, limiter: newRateLimiter()}
	h.WithFoundations(FoundationsDeps{Settings: settings, Elections: elections})
	mux := http.NewServeMux()
	h.RegisterFoundationRoutes(mux)
	return &foundationsFixture{mux: mux, elections: elections, audit: audit}
}

var (
	elSteward = &domain.Member{ID: "m-st", DisplayName: "Nana Essien", Role: domain.RoleSteward}
	elCurator = &domain.Member{ID: "m-cu", DisplayName: "Efua Arthur", Role: domain.RoleCurator}
	elMember  = &domain.Member{ID: "m-me", DisplayName: "Kofi", Role: domain.RoleMember}
)

func (f *foundationsFixture) do(method, path, body string, m *domain.Member) *httptest.ResponseRecorder {
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	w := httptest.NewRecorder()
	f.mux.ServeHTTP(w, as(httptest.NewRequest(method, path, rd), m))
	return w
}

const electionBody = `{"name":"2028 General Election","kind":"general","scope":"national","pollDate":"2028-12-07","id":"ignored","createdAt":"x"}`

func TestElectionRoutesCreateListUpdateDelete(t *testing.T) {
	f := newFoundationsFixture(t)
	w := f.do(http.MethodPost, "/api/admin/elections", electionBody, elSteward)
	if w.Code != http.StatusCreated {
		t.Fatalf("create → %d %s", w.Code, w.Body)
	}
	var e domain.Election
	_ = json.Unmarshal(w.Body.Bytes(), &e)
	if e.ID == "ignored" || e.BlackoutStart != "2028-12-06T00:00:00Z" || e.CreatedAt == "x" {
		t.Fatalf("created = %+v", e)
	}

	w = f.do(http.MethodGet, "/api/elections?upcoming=1", "", nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), e.ID) || w.Header().Get("Cache-Control") == "" {
		t.Fatalf("public upcoming → %d %s", w.Code, w.Body)
	}
	if w = f.do(http.MethodGet, "/api/admin/elections", "", elCurator); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), e.ID) {
		t.Fatalf("admin list → %d %s", w.Code, w.Body)
	}

	upd := strings.Replace(electionBody, `"pollDate"`, `"blackoutEnd":"2028-12-08T18:00:00Z","reason":"results declared","pollDate"`, 1)
	if w = f.do(http.MethodPut, "/api/admin/elections/"+e.ID, upd, elSteward); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "2028-12-08T18:00:00Z") {
		t.Fatalf("update → %d %s", w.Code, w.Body)
	}
	if w = f.do(http.MethodPut, "/api/admin/elections/elc-nope", electionBody, elSteward); w.Code != http.StatusNotFound || !strings.Contains(w.Body.String(), `"not_found"`) {
		t.Fatalf("update missing → %d %s", w.Code, w.Body)
	}

	if w = f.do(http.MethodDelete, "/api/admin/elections/"+e.ID+"?reason=duplicate", "", elSteward); w.Code != http.StatusNoContent {
		t.Fatalf("delete → %d %s", w.Code, w.Body)
	}
	w = f.do(http.MethodGet, "/api/admin/settings/audit?key=elections&limit=10", "", elCurator)
	var rows []map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &rows)
	if w.Code != http.StatusOK || len(rows) != 3 || rows[0]["reason"] != "duplicate" || rows[0]["actorName"] != "Nana Essien" {
		t.Fatalf("audit → %d %s", w.Code, w.Body)
	}
	if _, leaked := rows[0]["actorId"]; leaked {
		t.Error("the audit API must not expose actor ids")
	}
}

func TestElectionRouteErrors(t *testing.T) {
	f := newFoundationsFixture(t)
	w := f.do(http.MethodPost, "/api/admin/elections", `{"name":"2028 General Election","kind":"mayoral","scope":"national","pollDate":"2028-12-07"}`, elSteward)
	var body map[string]string
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if w.Code != http.StatusBadRequest || body["error"] != "invalid_election" || body["field"] != "kind" || body["message"] == "" {
		t.Fatalf("invalid kind → %d %s", w.Code, w.Body)
	}
	if w = f.do(http.MethodPost, "/api/admin/elections", `{not json`, elSteward); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "invalid_json") {
		t.Fatalf("bad json → %d %s", w.Code, w.Body)
	}
	created := f.do(http.MethodPost, "/api/admin/elections", electionBody, elSteward)
	var e domain.Election
	_ = json.Unmarshal(created.Body.Bytes(), &e)
	f.elections.SetCampaigns(usedElections{})
	if w = f.do(http.MethodDelete, "/api/admin/elections/"+e.ID, "", elSteward); w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "election_in_use") {
		t.Fatalf("delete in use → %d %s", w.Code, w.Body)
	}
	if w = f.do(http.MethodGet, "/api/admin/settings/audit?key=passwords", "", elCurator); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"field":"key"`) {
		t.Fatalf("bad audit key → %d %s", w.Code, w.Body)
	}
}

func TestElectionRoutesAreRoleGuarded(t *testing.T) {
	f := newFoundationsFixture(t)
	cases := []struct {
		method, path, body string
		m                  *domain.Member
	}{
		{http.MethodPost, "/api/admin/elections", electionBody, elCurator}, // steward only
		{http.MethodPut, "/api/admin/elections/x", electionBody, elCurator},
		{http.MethodDelete, "/api/admin/elections/x", "", elCurator},
		{http.MethodGet, "/api/admin/elections", "", elMember},
		{http.MethodGet, "/api/admin/settings/audit?key=ads", "", elMember},
		{http.MethodGet, "/api/admin/elections", "", nil},
	}
	for _, c := range cases {
		if w := f.do(c.method, c.path, c.body, c.m); w.Code != http.StatusForbidden {
			t.Errorf("%s %s as %v → %d, want 403", c.method, c.path, c.m, w.Code)
		}
	}
	if w := f.do(http.MethodGet, "/api/elections", "", nil); w.Code != http.StatusOK {
		t.Errorf("the public calendar → %d", w.Code)
	}
}

func TestElectionRoutesWithoutTheCalendarWired(t *testing.T) {
	h := &Handler{authRequired: true, log: slog.New(slog.NewTextHandler(io.Discard, nil)), limiter: newRateLimiter()}
	mux := http.NewServeMux()
	h.RegisterFoundationRoutes(mux)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/elections?upcoming=1", nil))
	if w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatalf("public → %d %s, want []", w.Code, w.Body)
	}
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, as(httptest.NewRequest(http.MethodGet, "/api/admin/elections", nil), elSteward))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("admin → %d", w.Code)
	}
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, as(httptest.NewRequest(http.MethodGet, "/api/admin/settings/audit?key=ads", nil), elSteward))
	if w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatalf("audit without settings → %d %s", w.Code, w.Body)
	}
}
