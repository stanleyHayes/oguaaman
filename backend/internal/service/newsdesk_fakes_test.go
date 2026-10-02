package service

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/anthropics/anthropic-sdk-go"

	"github.com/oguaa/backend/internal/domain"
)

// ── fakes for the news desk tests ────────────────────────────────────────────

// memJobs is an in-memory domain.NewsResearchJobRepository.
type memJobs struct {
	mu   sync.Mutex
	rows map[string]domain.NewsResearchJob
}

func newMemJobs() *memJobs { return &memJobs{rows: map[string]domain.NewsResearchJob{}} }

func (m *memJobs) Insert(_ context.Context, j domain.NewsResearchJob) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.rows {
		if r.LeadURL == j.LeadURL {
			return domain.ErrNewsJobExists
		}
	}
	m.rows[j.ID] = j
	return nil
}

func (m *memJobs) Get(_ context.Context, id string) (*domain.NewsResearchJob, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.rows[id]
	if !ok {
		return nil, &domain.NotFoundError{Entity: "research job"}
	}
	return &j, nil
}

func (m *memJobs) ByArticle(_ context.Context, articleID string) (*domain.NewsResearchJob, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, j := range m.rows {
		if j.ArticleID == articleID {
			return &j, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "research job"}
}

func (m *memJobs) List(_ context.Context, f domain.NewsJobFilter) ([]domain.NewsResearchJob, int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []domain.NewsResearchJob
	for _, j := range m.rows {
		if f.Status == "" || j.Status == f.Status {
			out = append(out, j)
		}
	}
	sort.Slice(out, func(a, b int) bool { return out[a].CreatedAt > out[b].CreatedAt })
	total := int64(len(out))
	if f.Skip < len(out) {
		out = out[f.Skip:min(len(out), f.Skip+f.Limit)]
	} else {
		out = nil
	}
	return out, total, nil
}

func (m *memJobs) Claim(_ context.Context, now, lockedUntil string) (*domain.NewsResearchJob, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var best *domain.NewsResearchJob
	for _, j := range m.rows {
		if j.Status == domain.NewsJobQueued && (j.NextAttemptAt == "" || j.NextAttemptAt <= now) && (best == nil || j.CreatedAt < best.CreatedAt) {
			jj := j
			best = &jj
		}
	}
	if best == nil {
		return nil, nil
	}
	best.Status, best.LockedUntil, best.UpdatedAt = domain.NewsJobRunning, lockedUntil, now
	best.Attempts++
	m.rows[best.ID] = *best
	out := *best
	return &out, nil
}

func (m *memJobs) RequeueExpired(_ context.Context, now string) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var n int64
	for id, j := range m.rows {
		if j.Status == domain.NewsJobRunning && j.LockedUntil < now {
			j.Status, j.NextAttemptAt, j.LockedUntil = domain.NewsJobQueued, now, ""
			m.rows[id] = j
			n++
		}
	}
	return n, nil
}

func (m *memJobs) Finish(_ context.Context, id string, o domain.NewsJobOutcome) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.rows[id]
	if !ok || j.Status != domain.NewsJobRunning {
		return nil
	}
	j.Status, j.NextAttemptAt, j.LastError = o.Status, o.NextAttemptAt, o.LastError
	j.RefusalCategory, j.BlockedReason, j.FallbackUsed, j.UpdatedAt = o.RefusalCategory, o.BlockedReason, o.FallbackUsed, o.UpdatedAt
	j.LockedUntil = ""
	if o.Model != "" {
		j.Model = o.Model
	}
	if o.Draft != nil {
		j.Draft = o.Draft
	}
	if o.RefundAttempt {
		j.Attempts--
	}
	m.rows[id] = j
	return nil
}

func (m *memJobs) AddCost(_ context.Context, id string, claude, image int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	j := m.rows[id]
	j.CostMicroUSD += claude
	j.ImageMicroUSD += image
	m.rows[id] = j
	return nil
}

func (m *memJobs) SetCover(_ context.Context, id string, c domain.NewsCoverDraft, at string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.rows[id]
	if !ok || j.Status != domain.NewsJobReady || j.Draft == nil {
		return false, nil
	}
	d := *j.Draft
	d.Cover = c
	j.Draft, j.UpdatedAt = &d, at
	m.rows[id] = j
	return true, nil
}

func (m *memJobs) Review(_ context.Context, id string, r domain.NewsJobReview) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.rows[id]
	if !ok || j.Status != domain.NewsJobReady {
		return false, nil
	}
	j.Status, j.ReviewedByName, j.ReviewedAt, j.RejectReason = r.Status, r.ReviewedByName, r.ReviewedAt, r.RejectReason
	m.rows[id] = j
	return true, nil
}

func (m *memJobs) ReopenReview(_ context.Context, id, at string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.rows[id]
	if !ok || j.Status != domain.NewsJobApproved {
		return false, nil
	}
	j.Status, j.ReviewedByName, j.ReviewedAt, j.UpdatedAt = domain.NewsJobReady, "", "", at
	m.rows[id] = j
	return true, nil
}

func (m *memJobs) Rerun(_ context.Context, id string, from []string, now string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.rows[id]
	if !ok || !slices.Contains(from, j.Status) {
		return false, nil
	}
	j.Status, j.Attempts, j.NextAttemptAt, j.UpdatedAt = domain.NewsJobQueued, 0, now, now
	j.LastError, j.RefusalCategory, j.BlockedReason, j.RejectReason = "", "", "", ""
	m.rows[id] = j
	return true, nil
}

// only returns the single stored job.
func (m *memJobs) only(t *testing.T) domain.NewsResearchJob {
	t.Helper()
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.rows) != 1 {
		t.Fatalf("want exactly one job, have %d", len(m.rows))
	}
	for _, j := range m.rows {
		return j
	}
	return domain.NewsResearchJob{}
}

// spyImages is a domain.ImageGenerator that records prompts.
type spyImages struct {
	mu      sync.Mutex
	prompts []string
	err     error
}

func (s *spyImages) Generate(_ context.Context, r domain.ImageRequest) (domain.ImageResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.prompts = append(s.prompts, r.Prompt)
	if s.err != nil {
		return domain.ImageResult{}, s.err
	}
	return domain.ImageResult{Data: []byte("RIFFwebp"), MIME: "image/webp", Model: "gpt-image-2.5-flare-2026-09-08", InputTokens: 100, OutputTokens: 1000}, nil
}
func (s *spyImages) Provider() string { return "openai" }
func (s *spyImages) calls() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.prompts)
}

// memStore is a domain.ImageStore that records uploads.
type memStore struct {
	mu      sync.Mutex
	uploads []domain.StoredImageInput
}

func (m *memStore) StoreImage(_ context.Context, in domain.StoredImageInput) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.uploads = append(m.uploads, in)
	return "https://res.cloudinary.com/demo/image/upload/v1/" + in.Folder + "/" + in.PublicID + ".webp", nil
}

// ── the Claude stub ──────────────────────────────────────────────────────────

// stubReply is one canned API answer.
type stubReply struct {
	status int
	body   string
	delay  time.Duration
}

// stubCall is one request the stub received.
type stubCall struct {
	body   map[string]any
	raw    string
	header http.Header
}

// claudeStub replays replies in order (the last one repeats).
type claudeStub struct {
	mu      sync.Mutex
	replies []stubReply
	calls   []stubCall
	srv     *httptest.Server
}

func newClaudeStub(t *testing.T, replies ...stubReply) *claudeStub {
	t.Helper()
	s := &claudeStub{replies: replies}
	s.srv = httptest.NewServer(http.HandlerFunc(s.serve))
	t.Cleanup(s.srv.Close)
	return s
}

func (s *claudeStub) serve(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(r.Body)
	var body map[string]any
	_ = json.Unmarshal(raw, &body)
	s.mu.Lock()
	s.calls = append(s.calls, stubCall{body: body, raw: string(raw), header: r.Header.Clone()})
	reply := s.replies[min(len(s.calls), len(s.replies))-1]
	s.mu.Unlock()
	if reply.delay > 0 {
		select {
		case <-time.After(reply.delay):
		case <-r.Context().Done():
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("retry-after-ms", "1")
	status := reply.status
	if status == 0 {
		status = http.StatusOK
	}
	w.WriteHeader(status)
	_, _ = w.Write([]byte(reply.body))
}

func (s *claudeStub) callCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.calls)
}

func (s *claudeStub) call(i int) stubCall {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.calls[i]
}

// fixture reads testdata/newsdesk/<name>.json.
func fixture(t *testing.T, name string) stubReply {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "newsdesk", name+".json"))
	if err != nil {
		t.Fatal(err)
	}
	return stubReply{body: string(raw)}
}

func errorReply(status int) stubReply {
	return stubReply{status: status, body: `{"type":"error","error":{"type":"api_error","message":"stub error"}}`}
}

// ── research responses ───────────────────────────────────────────────────────

const (
	leadURL       = "https://www.gna.org.gh/news/kotokuraba-market-reopens"
	leadPageTitle = "Kotokuraba market reopens - Ghana News Agency"
	leadPageText  = "Traders returned to Kotokuraba market on Monday after the Cape Coast Metropolitan Assembly completed planned renovation works on drains, walkways and roofs."
	graphicURL    = "https://www.graphic.com.gh/news/general-news/kotokuraba-refurbished.html"
	graphicTitle  = "Kotokuraba refurbished at GH₵1.2m - Graphic Online"
	graphicCited  = "The project cost about GH₵1.2 million from the District Assemblies Common Fund."
	citiURL       = "https://citinewsroom.com/2026/10/kotokuraba-traders-rent/"
	citiTitle     = "Kotokuraba traders want rent kept at 2025 rates | Citi Newsroom"
	citiCited     = "Traders want rent for the new stalls to stay at 2025 rates."
	fetchedAt     = "2026-10-02T08:00:00Z"
)

// cite is one citation on a paragraph: fetch (the lead page) or a search result.
type cite struct{ kind, url, title, text string }

var (
	citeLead    = cite{kind: "fetch", text: "Traders returned to Kotokuraba market on Monday"}
	citeGraphic = cite{kind: "search", url: graphicURL, title: graphicTitle, text: graphicCited}
	citeCiti    = cite{kind: "search", url: citiURL, title: citiTitle, text: citiCited}
)

// para is one paragraph of the written article and its citations.
type para struct {
	text  string
	cites []cite
}

var reportParas = []string{
	"Kotokuraba market in Cape Coast opened its stalls again on Monday morning, bringing an end to several weeks in which vendors sold their goods from temporary spots along the nearby streets. Officials of the Cape Coast Metropolitan Assembly explained that the closure had allowed contractors to replace worn drainage channels, lay fresh concrete walkways and repair roofing above the central hall, work that had been postponed twice during the rainy season because of supply delays.",
	"According to the Daily Graphic, the refurbishment programme cost the assembly roughly GH₵1.2 million, drawn mostly from its common fund allocation for the year. The newspaper reported that engineers inspected each section before handing it back, and that extinguishers have now been mounted at every entrance. Traders interviewed by the paper said the new walkways should make it easier for shoppers carrying heavy loads to move between the fish, vegetable and textile sections without slipping.",
	"Citi Newsroom spoke with market women who welcomed the return but raised concerns about the cost of renting the improved stalls. Several sellers told the station that they hoped the assembly would keep fees at last year's level until business recovers. The station also noted that a committee made up of trader representatives and assembly staff will meet monthly to review cleanliness, waste collection and the allocation of the remaining empty spaces inside the building.",
	"The assembly has asked shoppers and vendors to report broken fittings through the market office near the main gate. Further maintenance on the car park and the lorry station beside the market is scheduled for early next year, subject to funding. Residents who depend on Kotokuraba for daily groceries said the reopening had already reduced the long walks many of them had been making to smaller markets in Abura and Pedu during the closure period.",
}

// goodParas is a well-sourced article from three publishers.
func goodParas() []para {
	return []para{
		{reportParas[0], []cite{citeLead}},
		{reportParas[1], []cite{citeGraphic}},
		{reportParas[2], []cite{citeCiti}},
		{reportParas[3], []cite{citeLead, citeGraphic}},
	}
}

// researchReply builds a Call 1 answer: a web_fetch of the lead, a
// web_search, then the article as cited text blocks.
func researchReply(paras []para) stubReply {
	blocks := []map[string]any{
		{"type": "server_tool_use", "id": "srvtoolu_f1", "name": "web_fetch", "input": map[string]any{"url": leadURL}},
		{"type": "web_fetch_tool_result", "tool_use_id": "srvtoolu_f1", "content": map[string]any{
			"type": "web_fetch_result", "url": leadURL, "retrieved_at": fetchedAt,
			"content": map[string]any{"type": "document", "title": leadPageTitle, "citations": map[string]any{"enabled": true},
				"source": map[string]any{"type": "text", "media_type": "text/plain", "data": leadPageText}},
		}},
		{"type": "server_tool_use", "id": "srvtoolu_s1", "name": "web_search", "input": map[string]any{"query": "Kotokuraba market"}},
		{"type": "web_search_tool_result", "tool_use_id": "srvtoolu_s1", "content": []map[string]any{
			{"type": "web_search_result", "url": graphicURL, "title": graphicTitle, "encrypted_content": "x", "page_age": nil},
			{"type": "web_search_result", "url": citiURL, "title": citiTitle, "encrypted_content": "y", "page_age": nil},
		}},
	}
	for _, p := range paras {
		var cs []map[string]any
		for _, c := range p.cites {
			if c.kind == "fetch" {
				cs = append(cs, map[string]any{"type": "char_location", "document_index": 0, "document_title": leadPageTitle,
					"start_char_index": 0, "end_char_index": 46, "cited_text": c.text, "file_id": nil})
				continue
			}
			cs = append(cs, map[string]any{"type": "web_search_result_location", "url": c.url, "title": c.title, "encrypted_index": "e", "cited_text": c.text})
		}
		blocks = append(blocks, map[string]any{"type": "text", "text": p.text, "citations": cs},
			map[string]any{"type": "text", "text": "\n\n", "citations": nil})
	}
	return messageReply("end_turn", blocks)
}

func messageReply(stop string, blocks []map[string]any) stubReply {
	msg := map[string]any{
		"id": "msg_research", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
		"content": blocks, "stop_reason": stop, "stop_sequence": nil, "stop_details": nil,
		"usage": map[string]any{"input_tokens": 1000, "output_tokens": 2000, "cache_creation_input_tokens": 0,
			"cache_read_input_tokens": 0, "server_tool_use": map[string]any{"web_search_requests": 2, "web_fetch_requests": 1}},
	}
	raw, _ := json.Marshal(msg)
	return stubReply{body: string(raw)}
}

// ── the desk under test ──────────────────────────────────────────────────────

type deskFixture struct {
	desk     *NewsDesk
	news     *researchNewsRepo
	jobs     *memJobs
	usage    *memUsage
	settings *SettingsService
	images   *spyImages
	store    *memStore
	claude   *claudeStub
	article  domain.NewsArticle
}

// newDeskFixture builds a desk whose Claude is the stub, with long-form on
// and one queued job for a stored brief. mutate adjusts the settings.
func newDeskFixture(t *testing.T, mutate func(*domain.NewsDeskSettings), replies ...stubReply) *deskFixture {
	t.Helper()
	f := &deskFixture{news: &researchNewsRepo{}, jobs: newMemJobs(), usage: newMemUsage(), images: &spyImages{}, store: &memStore{}}
	f.settings = NewSettingsService(newMemSettings(), quietLog())
	s := DefaultNewsDeskSettings()
	s.LongformEnabled, s.ImagesEnabled = true, true
	if mutate != nil {
		mutate(&s)
	}
	if err := f.settings.Save(context.Background(), SettingsChange{Key: domain.SettingsKeyNewsDesk, Doc: &s, ActorName: "Test", Reason: "test setup"}); err != nil {
		t.Fatal(err)
	}
	f.claude = newClaudeStub(t, replies...)
	f.desk = NewNewsDesk(NewsDeskDeps{
		News: f.news, Jobs: f.jobs, Usage: f.usage, Settings: f.settings, Images: f.images, Store: f.store, Log: quietLog(),
		Config: NewsDeskConfig{AnthropicKey: "test-key", AnthropicBaseURL: f.claude.srv.URL, MaxRetries: 1,
			AllowedDomains: NewsAllowedDomains([]string{"https://www.gna.org.gh/feed"}, DefaultNewsAllowedDomains)},
	})
	now := time.Now().UTC().Format(time.RFC3339)
	f.article = domain.NewsArticle{ID: "news-abc123", Slug: "kotokuraba-market-reopens-123", Title: "Kotokuraba market reopens",
		Summary: "Traders are back.", Body: "Brief.", Status: domain.NewsPublished, PublishedAt: now, Automated: true,
		Tier: domain.NewsTierBrief, Tags: []string{"Automated", "Cape Coast"}, SourceName: "Ghana News Agency", SourceURL: leadURL}
	f.news.rows = append(f.news.rows, f.article)
	ok, err := f.desk.EnqueueBrief(context.Background(), f.article, newsLead{URL: leadURL, Source: "Ghana News Agency",
		Title: "Kotokuraba market reopens", Teaser: "Traders returned to Kotokuraba after planned works.", PublishedAt: now})
	if err != nil || !ok {
		t.Fatalf("enqueue = %v, %v", ok, err)
	}
	return f
}

// run processes the queued job once.
func (f *deskFixture) run(t *testing.T) domain.NewsResearchJob {
	t.Helper()
	if !f.desk.Tick(context.Background()) {
		t.Fatal("the worker claimed no job")
	}
	return f.jobs.only(t)
}

// articleNow is the stored brief.
func (f *deskFixture) articleNow(t *testing.T) domain.NewsArticle {
	t.Helper()
	a, err := f.news.Get(context.Background(), f.article.ID)
	if err != nil {
		t.Fatal(err)
	}
	return *a
}

func hasString(list []string, v string) bool { return slices.Contains(list, v) }

func containsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if !strings.Contains(s, p) {
			return false
		}
	}
	return true
}

// decodeBlocks parses a reply's content blocks as the SDK would.
func decodeBlocks(t *testing.T, r stubReply) []anthropic.BetaContentBlockUnion {
	t.Helper()
	var msg anthropic.BetaMessage
	if err := json.Unmarshal([]byte(r.body), &msg); err != nil {
		t.Fatal(err)
	}
	return msg.Content
}
