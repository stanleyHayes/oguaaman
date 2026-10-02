package http

import (
	"bytes"
	"context"
	"encoding/json"
	"image/png"
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

// ── news desk routes (spec §4.1, tests 14 and 15) ────────────────────────────

// deskNews is an in-memory domain.NewsRepository.
type deskNews struct {
	mu   sync.Mutex
	rows []domain.NewsArticle
}

func (r *deskNews) find(match func(domain.NewsArticle) bool) (*domain.NewsArticle, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, a := range r.rows {
		if match(a) {
			out := a
			return &out, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "article"}
}
func (r *deskNews) set(a domain.NewsArticle) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.rows {
		if r.rows[i].ID == a.ID {
			r.rows[i] = a
		}
	}
}
func (r *deskNews) Insert(_ context.Context, a domain.NewsArticle) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rows = append(r.rows, a)
	return nil
}
func (r *deskNews) Update(_ context.Context, a domain.NewsArticle) error { r.set(a); return nil }
func (r *deskNews) Get(_ context.Context, id string) (*domain.NewsArticle, error) {
	return r.find(func(a domain.NewsArticle) bool { return a.ID == id })
}
func (r *deskNews) BySlug(_ context.Context, slug string) (*domain.NewsArticle, error) {
	return r.find(func(a domain.NewsArticle) bool { return a.Slug == slug })
}
func (r *deskNews) All(context.Context) ([]domain.NewsArticle, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]domain.NewsArticle{}, r.rows...), nil
}
func (r *deskNews) Published(ctx context.Context) ([]domain.NewsArticle, error) {
	all, _ := r.All(ctx)
	out := []domain.NewsArticle{}
	for _, a := range all {
		if a.Status == domain.NewsPublished {
			out = append(out, a)
		}
	}
	return out, nil
}
func (r *deskNews) ByAuthor(context.Context, string) ([]domain.NewsArticle, error) { return nil, nil }
func (r *deskNews) SetPublished(context.Context, string, string, string) error     { return nil }
func (r *deskNews) Delete(context.Context, string) error                           { return nil }
func (r *deskNews) EraseAuthor(context.Context, string, string) error              { return nil }
func (r *deskNews) ApplyReport(_ context.Context, a domain.NewsArticle) error {
	cur, err := r.Get(context.Background(), a.ID)
	if err != nil {
		return err
	}
	a.Slug = cur.Slug
	r.set(a)
	return nil
}
func (r *deskNews) SetResearchStatus(_ context.Context, id, status string) error {
	if a, err := r.Get(context.Background(), id); err == nil {
		a.ResearchStatus = status
		r.set(*a)
	}
	return nil
}
func (r *deskNews) AddCorrection(_ context.Context, id string, c domain.NewsCorrection, at string) error {
	a, err := r.Get(context.Background(), id)
	if err != nil {
		return err
	}
	a.Corrections, a.UpdatedAt = append(a.Corrections, c), at
	r.set(*a)
	return nil
}

// deskJobs is an in-memory domain.NewsResearchJobRepository holding ready jobs.
type deskJobs struct {
	mu   sync.Mutex
	rows map[string]domain.NewsResearchJob
}

func (j *deskJobs) Insert(_ context.Context, job domain.NewsResearchJob) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.rows[job.ID] = job
	return nil
}
func (j *deskJobs) Get(_ context.Context, id string) (*domain.NewsResearchJob, error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	job, ok := j.rows[id]
	if !ok {
		return nil, &domain.NotFoundError{Entity: "research job"}
	}
	return &job, nil
}
func (j *deskJobs) ByArticle(_ context.Context, articleID string) (*domain.NewsResearchJob, error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	for _, job := range j.rows {
		if job.ArticleID == articleID {
			return &job, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "research job"}
}
func (j *deskJobs) List(context.Context, domain.NewsJobFilter) ([]domain.NewsResearchJob, int64, error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	out := []domain.NewsResearchJob{}
	for _, job := range j.rows {
		out = append(out, job)
	}
	return out, int64(len(out)), nil
}
func (j *deskJobs) Claim(context.Context, string, string) (*domain.NewsResearchJob, error) {
	return nil, nil
}
func (j *deskJobs) RequeueExpired(context.Context, string) (int64, error)         { return 0, nil }
func (j *deskJobs) Finish(context.Context, string, domain.NewsJobOutcome) error   { return nil }
func (j *deskJobs) AddCost(context.Context, string, int64, int64) error           { return nil }
func (j *deskJobs) Rerun(context.Context, string, []string, string) (bool, error) { return false, nil }
func (j *deskJobs) SetCover(context.Context, string, domain.NewsCoverDraft, string) (bool, error) {
	return false, nil
}
func (j *deskJobs) Review(_ context.Context, id string, r domain.NewsJobReview) (bool, error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	job, ok := j.rows[id]
	if !ok || job.Status != domain.NewsJobReady {
		return false, nil
	}
	job.Status, job.ReviewedByName = r.Status, r.ReviewedByName
	j.rows[id] = job
	return true, nil
}
func (j *deskJobs) ReopenReview(_ context.Context, id, _ string) (bool, error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	job, ok := j.rows[id]
	if !ok || job.Status != domain.NewsJobApproved {
		return false, nil
	}
	job.Status, job.ReviewedByName = domain.NewsJobReady, ""
	j.rows[id] = job
	return true, nil
}

const (
	deskSlug   = "kotokuraba-market-reopens-123"
	deskAPIURL = "https://api.oguaaman.com"
)

type deskEnv struct {
	h    *Handler
	mux  *http.ServeMux
	news *deskNews
	jobs *deskJobs
}

// newDeskEnv wires a handler with one automated published brief (no cover)
// that has a ready research draft.
func newDeskEnv(t *testing.T) *deskEnv {
	t.Helper()
	news := &deskNews{rows: []domain.NewsArticle{{
		ID: "news-1", Slug: deskSlug, Title: "Kotokuraba market reopens", Body: "Brief.", Status: domain.NewsPublished,
		PublishedAt: "2026-10-01T08:00:00Z", Automated: true, Tier: domain.NewsTierBrief, SourceName: "Ghana News Agency",
		Tags: []string{"Automated"},
	}, {ID: "news-2", Slug: "draft-story", Title: "Draft", Status: domain.NewsDraft, Automated: true}}}
	jobs := &deskJobs{rows: map[string]domain.NewsResearchJob{"nrj-1": {
		ID: "nrj-1", ArticleID: "news-1", Status: domain.NewsJobReady, LeadURL: "https://www.gna.org.gh/x",
		Draft: &domain.NewsReportDraft{
			Title: "Kotokuraba market trades again", Summary: "Repairs are done.", Body: "Traders are back [1]. Costs were GH₵1.2m [2].",
			Sources: []domain.NewsSource{{Name: "Ghana News Agency", URL: "https://www.gna.org.gh/x", Original: true}, {Name: "Daily Graphic", URL: "https://www.graphic.com.gh/y"}},
			Topics:  []string{"business"}, Cover: domain.NewsCoverDraft{Kind: domain.CoverKindBranded, Alt: "Oguaa Newsroom graphic: x"},
		},
	}}}
	desk := service.NewNewsDesk(service.NewsDeskDeps{News: news, Jobs: jobs, Settings: service.NewSettingsService(nil, nil)})
	h := &Handler{svc: service.New(service.Deps{News: news}), authRequired: true, limiter: newRateLimiter(), uploadBase: deskAPIURL, log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	h.WithNewsDesk(NewsDeskDeps{Desk: desk})
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/news", h.News)
	mux.HandleFunc("GET /api/news/{slug}", h.NewsArticle)
	mux.HandleFunc("GET /api/admin/news/{id}", h.AdminNewsGet)
	h.RegisterNewsDeskRoutes(mux)
	return &deskEnv{h: h, mux: mux, news: news, jobs: jobs}
}

func (e *deskEnv) do(t *testing.T, method, path, body string, as *domain.Member) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if as != nil {
		req = asMember(req, as)
	}
	w := httptest.NewRecorder()
	e.mux.ServeHTTP(w, req)
	return w
}

var (
	editorMember  = &domain.Member{ID: "m-ed", DisplayName: "Kofi Mensah", Role: domain.RoleEditor}
	plainMember   = &domain.Member{ID: "m-x", DisplayName: "Ama", Role: domain.RoleMember}
	stewardMember = &domain.Member{ID: "m-st", DisplayName: "Nana", Role: domain.RoleSteward}
)

// Test 15: the public list and article give an automated article without a
// cover its branded URL; the admin read returns the stored empty value.
func TestPublicNewsGetsBrandedCover(t *testing.T) {
	e := newDeskEnv(t)
	want := deskAPIURL + "/api/news/" + deskSlug + "/cover.png?v="
	var one domain.NewsArticle
	if w := e.do(t, http.MethodGet, "/api/news/"+deskSlug, "", nil); w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &one) != nil {
		t.Fatalf("article = %d %s", w.Code, w.Body.String())
	}
	if !strings.HasPrefix(one.CoverImageURL, want) || len(one.CoverImageURL) != len(want)+8 || one.CoverImageKind != domain.CoverKindBranded {
		t.Fatalf("public cover = %q / %q", one.CoverImageURL, one.CoverImageKind)
	}
	var list []domain.NewsArticle
	if w := e.do(t, http.MethodGet, "/api/news", "", nil); json.Unmarshal(w.Body.Bytes(), &list) != nil || len(list) != 1 || list[0].CoverImageURL != one.CoverImageURL {
		t.Fatalf("list = %s", w.Body.String())
	}
	var admin domain.NewsArticle
	w := e.do(t, http.MethodGet, "/api/admin/news/news-1", "", editorMember)
	if json.Unmarshal(w.Body.Bytes(), &admin) != nil || admin.CoverImageURL != "" || admin.CoverImageKind != "" {
		t.Fatalf("admin must see the stored value: %s", w.Body.String())
	}
}

func TestNewsCoverPNG(t *testing.T) {
	e := newDeskEnv(t)
	w := e.do(t, http.MethodGet, "/api/news/"+deskSlug+"/cover.png", "", nil)
	if w.Code != http.StatusOK || w.Header().Get("Content-Type") != "image/png" || w.Header().Get("Cache-Control") != "public, max-age=86400" {
		t.Fatalf("cover = %d %v", w.Code, w.Header())
	}
	img, err := png.Decode(bytes.NewReader(w.Body.Bytes()))
	if err != nil || img.Bounds().Dx() != 1600 || img.Bounds().Dy() != 900 {
		t.Fatalf("png = %v, %v", img, err)
	}
	if w := e.do(t, http.MethodGet, "/api/news/draft-story/cover.png", "", nil); w.Code != http.StatusNotFound {
		t.Fatalf("draft cover = %d", w.Code)
	}
}

// Test 14 (HTTP): roles, the checklist error shape, the publish and no slug change.
func TestApproveEndpoint(t *testing.T) {
	e := newDeskEnv(t)
	path := "/api/admin/news/news-1/research/approve"
	body := `{"title":"Kotokuraba market trades again","summary":"Repairs are done.","body":"Traders are back [1]. Costs were GH₵1.2m [2].","cover":"keep",
	"checklist":{"factsMatchSources":true,"noUnattributedAllegations":true,"quotesAccurate":true,"rightOfReplyConsidered":true}}`
	if w := e.do(t, http.MethodPost, path, body, plainMember); w.Code != http.StatusForbidden {
		t.Fatalf("member approve = %d", w.Code)
	}
	bad := strings.Replace(body, `"quotesAccurate":true`, `"quotesAccurate":false`, 1)
	w := e.do(t, http.MethodPost, path, bad, editorMember)
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"error":"checklist_incomplete"`) || !strings.Contains(w.Body.String(), `"field":"quotesAccurate"`) {
		t.Fatalf("checklist = %d %s", w.Code, w.Body.String())
	}
	markers := strings.Replace(body, "[2]", "[3]", 1)
	if w := e.do(t, http.MethodPost, path, markers, editorMember); !strings.Contains(w.Body.String(), `"error":"invalid_markers"`) {
		t.Fatalf("markers = %d %s", w.Code, w.Body.String())
	}
	w = e.do(t, http.MethodPost, path, body, editorMember)
	if w.Code != http.StatusOK {
		t.Fatalf("approve = %d %s", w.Code, w.Body.String())
	}
	a, _ := e.news.Get(context.Background(), "news-1")
	if a.Slug != deskSlug || a.Tier != domain.NewsTierReport || a.Status != domain.NewsPublished || a.ReviewedByName != "Kofi Mensah" ||
		a.PublishedAt != "2026-10-01T08:00:00Z" || a.CoverImageKind != domain.CoverKindBranded || len(a.Sources) != 2 {
		t.Fatalf("article = %+v", a)
	}
	if w := e.do(t, http.MethodPost, path, body, editorMember); w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), `"error":"job_not_ready"`) {
		t.Fatalf("second approve = %d %s", w.Code, w.Body.String())
	}
}

// Approving an AI-assisted political report while election mode is on is
// refused with a code and a message the console can show; the draft stays
// ready and the brief untouched.
func TestApproveRefusedInElectionMode(t *testing.T) {
	e := newDeskEnv(t)
	settings := service.NewSettingsService(&adSettingsStore{docs: map[string][]byte{}}, nil)
	s := service.DefaultNewsDeskSettings()
	s.ElectionModeManual = true
	if err := settings.Save(context.Background(), service.SettingsChange{Key: domain.SettingsKeyNewsDesk, Doc: &s, ActorName: "Nana", Reason: "election week"}); err != nil {
		t.Fatal(err)
	}
	e.h.WithNewsDesk(NewsDeskDeps{Desk: service.NewNewsDesk(service.NewsDeskDeps{News: e.news, Jobs: e.jobs, Settings: settings})})
	e.jobs.rows["nrj-1"].Draft.Political = true

	body := `{"title":"Kotokuraba market trades again","summary":"Repairs are done.","body":"Traders are back [1]. Costs were GH₵1.2m [2].","cover":"keep",
	"checklist":{"factsMatchSources":true,"noUnattributedAllegations":true,"quotesAccurate":true,"balancedIfPolitical":true,"rightOfReplyConsidered":true}}`
	w := e.do(t, http.MethodPost, "/api/admin/news/news-1/research/approve", body, editorMember)
	if w.Code != http.StatusConflict || !containsAllStr(w.Body.String(), `"error":"election_mode"`, `"message":"Election mode is on`) {
		t.Fatalf("approve in election mode = %d %s", w.Code, w.Body.String())
	}
	if a, _ := e.news.Get(context.Background(), "news-1"); e.jobs.rows["nrj-1"].Status != domain.NewsJobReady || a.Tier != domain.NewsTierBrief {
		t.Fatalf("a refused approve changed state: job %s, article %+v", e.jobs.rows["nrj-1"].Status, a)
	}
}

func TestResearchQueueAndSettingsRoutes(t *testing.T) {
	e := newDeskEnv(t)
	w := e.do(t, http.MethodGet, "/api/admin/news/research?status=ready", "", editorMember)
	if w.Code != http.StatusOK || !containsAllStr(w.Body.String(), `"items":[`, `"perPage":20`, `"today":{"reports":0`) {
		t.Fatalf("queue = %d %s", w.Code, w.Body.String())
	}
	if w := e.do(t, http.MethodGet, "/api/admin/news/news-2/research", "", editorMember); w.Code != http.StatusNotFound {
		t.Fatalf("no job = %d", w.Code)
	}
	if w := e.do(t, http.MethodGet, "/api/admin/news/news-1/research", "", editorMember); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"draft":{`) {
		t.Fatalf("job = %d %s", w.Code, w.Body.String())
	}
	w = e.do(t, http.MethodGet, "/api/admin/settings/news-desk", "", editorMember)
	if w.Code != http.StatusOK || !containsAllStr(w.Body.String(), `"deskEnabled":true`, `"longformEnabled":false`, `"electionModeActive":false`, `"keys":{"anthropic":false`) {
		t.Fatalf("settings = %d %s", w.Code, w.Body.String())
	}
	if w := e.do(t, http.MethodPut, "/api/admin/settings/news-desk", `{"version":0,"reason":"test"}`, editorMember); w.Code != http.StatusForbidden {
		t.Fatalf("editor PUT = %d", w.Code)
	}
	if w := e.do(t, http.MethodPost, "/api/admin/news/news-1/research/rerun", "", editorMember); w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "desk_disabled") {
		t.Fatalf("rerun without a key = %d %s", w.Code, w.Body.String())
	}
	if w := e.do(t, http.MethodPost, "/api/admin/news/news-1/corrections", `{"note":"Fixed the cost figure."}`, editorMember); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"corrections":[{`) {
		t.Fatalf("correction = %d %s", w.Code, w.Body.String())
	}
	if w := e.do(t, http.MethodPost, "/api/admin/news/news-1/research/cover", `{"action":"paint"}`, stewardMember); w.Code != http.StatusBadRequest {
		t.Fatalf("bad cover action = %d", w.Code)
	}
}

func containsAllStr(s string, parts ...string) bool {
	for _, p := range parts {
		if !strings.Contains(s, p) {
			return false
		}
	}
	return true
}
