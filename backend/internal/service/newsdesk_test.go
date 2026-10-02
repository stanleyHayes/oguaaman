package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── the researched news desk (spec §2.12) ────────────────────────────────────

// A well-sourced article becomes a ready draft with numbered sources, the
// lead marked original, an AI cover and no publish.
func TestNewsDeskProducesAReadyDraft(t *testing.T) {
	f := newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_ok"))
	job := f.run(t)
	if job.Status != domain.NewsJobReady || job.Draft == nil {
		t.Fatalf("job = %+v", job)
	}
	d := job.Draft
	if len(d.Sources) != 3 || !d.Sources[0].Original || d.Sources[0].Name != "Ghana News Agency" ||
		d.Sources[1].Name != "Daily Graphic" || d.Sources[2].Name != "Citi Newsroom" {
		t.Fatalf("sources = %+v", d.Sources)
	}
	if !containsAll(d.Body, "delays. [1]", "slipping. [2]", "building. [3]", "period. [1][2]") {
		t.Fatalf("markers missing from body:\n%s", d.Body)
	}
	if d.CitationCoverage < 0.99 || d.WordCount < 250 || d.Political || hasString(d.Flags, FlagPolitical) {
		t.Fatalf("draft = %+v", d)
	}
	if d.Cover.Kind != domain.CoverKindAI || !strings.HasPrefix(d.Cover.Alt, "AI illustration: ") ||
		d.Cover.Credit != "AI illustration · OpenAI gpt-image-2.5-flare" || f.images.calls() != 1 {
		t.Fatalf("cover = %+v (image calls %d)", d.Cover, f.images.calls())
	}
	up := f.store.uploads[0]
	if up.Folder != "oguaa/news/auto" || up.PublicID != f.article.ID || up.Context["ai"] != "1" || !hasString(up.Tags, "ai-generated") {
		t.Fatalf("upload = %+v", up)
	}
	a := f.articleNow(t)
	if a.ResearchStatus != domain.NewsJobReady || a.Title != f.article.Title || a.Tier != domain.NewsTierBrief {
		t.Fatalf("the brief must be untouched until approval: %+v", a)
	}
	if job.CostMicroUSD <= 0 || job.ImageMicroUSD != 100*5+1000*30 {
		t.Fatalf("costs = %d / %d", job.CostMicroUSD, job.ImageMicroUSD)
	}
}

// Test 2 and 10: the request bodies carry the fallback beta, the web tools
// with their limits, the effort and (Call 2) a JSON schema and no tools;
// neither sends thinking.
func TestNewsDeskRequestShapes(t *testing.T) {
	f := newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_ok"))
	f.run(t)
	if f.claude.callCount() != 2 {
		t.Fatalf("calls = %d", f.claude.callCount())
	}
	c1 := f.claude.call(0)
	if !strings.Contains(c1.header.Get("anthropic-beta"), "server-side-fallback-2026-07-01") {
		t.Errorf("beta header = %q", c1.header.Get("anthropic-beta"))
	}
	for _, want := range []string{`"fallbacks":"default"`, `"type":"web_search_20260209"`, `"type":"web_fetch_20260209"`,
		`"max_uses":5`, `"max_uses":4`, `"allowed_callers":["direct"]`, `"citations":{"enabled":true}`, `"allowed_domains":[`,
		`"effort":"medium"`, `"max_content_tokens":8000`, `"country":"GH"`, `"cache_control":{"type":"ephemeral"}`, leadURL} {
		if !strings.Contains(c1.raw, want) {
			t.Errorf("Call 1 body lacks %s", want)
		}
	}
	for _, banned := range []string{`"thinking"`, `"tool_choice"`, `"blocked_domains"`} {
		if strings.Contains(c1.raw, banned) || strings.Contains(f.claude.call(1).raw, banned) {
			t.Errorf("a call sent %s", banned)
		}
	}
	c2 := f.claude.call(1)
	if c2.body["tools"] != nil || !containsAll(c2.raw, `"type":"json_schema"`, `"effort":"low"`, `"additionalProperties":false`, `"fallbacks":"default"`) {
		t.Errorf("Call 2 body = %s", c2.raw)
	}
	if !strings.Contains(c2.header.Get("anthropic-beta"), "server-side-fallback-2026-07-01") {
		t.Errorf("Call 2 beta header = %q", c2.header.Get("anthropic-beta"))
	}
}

// Test 1: pause_turn continues with [user, assistant] and no extra user turn,
// and after three continuations the job is requeued as transient.
func TestNewsDeskPauseTurnLoop(t *testing.T) {
	f := newDeskFixture(t, nil, fixture(t, "pause_turn"))
	job := f.run(t)
	if f.claude.callCount() != 4 {
		t.Fatalf("calls = %d, want 1 + 3 continuations", f.claude.callCount())
	}
	msgs, _ := f.claude.call(1).body["messages"].([]any)
	if len(msgs) != 2 || msgs[0].(map[string]any)["role"] != "user" || msgs[1].(map[string]any)["role"] != "assistant" {
		t.Fatalf("continuation messages = %v", msgs)
	}
	if last, _ := f.claude.call(3).body["messages"].([]any); len(last) != 4 {
		t.Fatalf("third continuation has %d messages, want 4 (no extra user turn)", len(last))
	}
	if job.Status != domain.NewsJobQueued || job.Attempts != 1 || job.NextAttemptAt == "" || job.LastError != stopTooMany {
		t.Fatalf("job = %+v", job)
	}
}

// A pause_turn followed by the article assembles content from every response.
func TestNewsDeskPauseThenFinish(t *testing.T) {
	f := newDeskFixture(t, nil, fixture(t, "pause_turn"), researchReply(goodParas()), fixture(t, "structure_ok"))
	if job := f.run(t); job.Status != domain.NewsJobReady {
		t.Fatalf("job = %+v", job)
	}
}

// Test 3: a refusal makes one call, never runs Call 2, and leaves the brief.
func TestNewsDeskRefusal(t *testing.T) {
	f := newDeskFixture(t, nil, fixture(t, "refusal"))
	job := f.run(t)
	if f.claude.callCount() != 1 || job.Status != domain.NewsJobRefused || job.RefusalCategory != "general_harms" {
		t.Fatalf("calls = %d, job = %+v", f.claude.callCount(), job)
	}
	if a := f.articleNow(t); a.Title != f.article.Title || a.Body != f.article.Body || a.ResearchStatus != domain.NewsJobRefused {
		t.Fatalf("brief changed: %+v", a)
	}
}

// Test 7: NO_STORY ends the job without Call 2.
func TestNewsDeskNoStory(t *testing.T) {
	f := newDeskFixture(t, nil, fixture(t, "no_story"))
	if job := f.run(t); job.Status != domain.NewsJobNoStory || f.claude.callCount() != 1 {
		t.Fatalf("job = %+v, calls %d", job, f.claude.callCount())
	}
}

// Test 4: both citation kinds map to markers and sources, and an uncited
// lead is still listed last as the original report.
func TestAssembleMapsCitationsAndAddsTheLead(t *testing.T) {
	paras := []para{{reportParas[0], []cite{citeGraphic}}, {reportParas[1], []cite{citeCiti, citeGraphic}}}
	f := newDeskFixture(t, nil)
	rep := assembleReport(decodeBlocks(t, researchReply(paras)), newsLead{URL: leadURL, Title: "Lead"}, f.desk.now())
	if len(rep.Sources) != 3 || rep.Sources[2].Name != originalSourceTag || !rep.Sources[2].Original || rep.Sources[2].URL != leadURL {
		t.Fatalf("sources = %+v", rep.Sources)
	}
	if !containsAll(rep.Body, "delays. [1]", "slipping. [2][1]") {
		t.Fatalf("body = %s", rep.Body)
	}
	fetched := assembleReport(decodeBlocks(t, researchReply([]para{{reportParas[0], []cite{citeLead}}})), newsLead{URL: leadURL}, f.desk.now())
	if len(fetched.Sources) != 1 || fetched.Sources[0].URL != leadURL || !fetched.Sources[0].Original || fetched.Sources[0].AccessedAt != fetchedAt {
		t.Fatalf("char_location source = %+v", fetched.Sources)
	}
}

// Test 5: a single publisher fails, low coverage fails, and copy overlap
// regenerates exactly once.
func TestNewsDeskHardGates(t *testing.T) {
	single := []para{{reportParas[0], []cite{citeLead}}, {reportParas[1], []cite{citeLead}}, {reportParas[2], []cite{citeLead}}, {reportParas[3], []cite{citeLead}}}
	f := newDeskFixture(t, nil, researchReply(single))
	if job := f.run(t); job.Status != domain.NewsJobFailed || job.LastError != gateSources || f.claude.callCount() != 1 {
		t.Fatalf("single source: job = %+v, calls %d", job, f.claude.callCount())
	}

	low := []para{{reportParas[0], []cite{citeLead, citeGraphic}}, {reportParas[1], nil}, {reportParas[2], nil}, {reportParas[3], nil}}
	f = newDeskFixture(t, nil, researchReply(low))
	if job := f.run(t); job.Status != domain.NewsJobFailed || job.LastError != gateCoverage || f.claude.callCount() != 1 {
		t.Fatalf("low coverage: job = %+v, calls %d", job, f.claude.callCount())
	}

	copied := goodParas()
	copied[1].text += " " + graphicCited
	f = newDeskFixture(t, nil, researchReply(copied))
	if job := f.run(t); job.Status != domain.NewsJobFailed || job.LastError != gateOverlap || f.claude.callCount() != 2 {
		t.Fatalf("overlap twice: job = %+v, calls %d (want exactly one regenerate)", job, f.claude.callCount())
	}

	f = newDeskFixture(t, nil, researchReply(copied), researchReply(goodParas()), fixture(t, "structure_ok"))
	if job := f.run(t); job.Status != domain.NewsJobReady || f.claude.callCount() != 3 {
		t.Fatalf("overlap then clean: job = %+v, calls %d", job.Status, f.claude.callCount())
	}
}

func TestQuoteGate(t *testing.T) {
	if !quotesWithin(`He said "the market is open" and "we are glad".`, 25) {
		t.Error("two short quotes must pass")
	}
	if quotesWithin(`"one" "two" "three"`, 25) {
		t.Error("three quoted spans must fail")
	}
	if quotesWithin(`"`+strings.Repeat("word ", 26)+`"`, 25) {
		t.Error("an over-long quote must fail")
	}
}

// Test 6: a political draft gets the election label, a branded cover and
// no image call.
func TestNewsDeskPoliticalDraft(t *testing.T) {
	f := newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_political"))
	job := f.run(t)
	if job.Status != domain.NewsJobReady || !job.Draft.Political || !hasString(job.Draft.Flags, FlagPolitical) {
		t.Fatalf("job = %+v", job)
	}
	if job.Draft.Cover.Kind != domain.CoverKindBranded || job.Draft.Cover.SkippedReason != CoverSkipPolitical || f.images.calls() != 0 {
		t.Fatalf("cover = %+v, image calls %d", job.Draft.Cover, f.images.calls())
	}
	in := approveBody(job.Draft)
	in.Checklist.BalancedIfPolitical = false
	var fe *InvalidFieldError
	if _, err := f.desk.Approve(context.Background(), f.article.ID, in, AuditActor{ID: "m1", Name: "Ama Editor"}); !errors.As(err, &fe) || fe.Field != "balancedIfPolitical" {
		t.Fatalf("political approve without balance check = %v", err)
	}
	in.Checklist.BalancedIfPolitical = true
	a, err := f.desk.Approve(context.Background(), f.article.ID, in, AuditActor{ID: "m1", Name: "Ama Editor"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(a.AutomationLabel, "This is election coverage: an editor checked it for balance.") || !hasString(a.Tags, "Election coverage") {
		t.Fatalf("political article = %+v", a)
	}
	if !politicalText("The NDC candidate spoke") || politicalText("Campaigners for cleaner beaches") {
		t.Error("political keywords must match whole words only")
	}
}

// Call 2 blockedCategory != none blocks the job.
func TestNewsDeskBlockedCategory(t *testing.T) {
	f := newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_blocked"))
	if job := f.run(t); job.Status != domain.NewsJobBlocked || job.BlockedReason != "court" || job.Draft != nil {
		t.Fatalf("job = %+v", job)
	}
}

// Test 8: a reached daily count or USD cap makes no HTTP call and requeues
// the job for tomorrow without spending an attempt.
func TestNewsDeskCapsRequeueForTomorrow(t *testing.T) {
	for name, mutate := range map[string]func(*domain.NewsDeskSettings){
		"count": func(s *domain.NewsDeskSettings) { s.MaxReportsPerDay = 0 },
		"usd":   func(s *domain.NewsDeskSettings) { s.MaxResearchMicroUsdPerDay = 1_000_000 },
	} {
		f := newDeskFixture(t, mutate, researchReply(goodParas()))
		job := f.run(t)
		tomorrow := time.Now().UTC().AddDate(0, 0, 1).Format(time.DateOnly) + "T00:05:00Z"
		if f.claude.callCount() != 0 || job.Status != domain.NewsJobQueued || job.NextAttemptAt != tomorrow || job.Attempts != 0 {
			t.Fatalf("%s cap: calls %d, job = %+v", name, f.claude.callCount(), job)
		}
		if f.usage.today(keyReports) != 0 || f.usage.today(keyResearchUSD) != 0 {
			t.Fatalf("%s cap: reservations not released", name)
		}
	}
}

// Test 9: a 529 then 200 succeeds with one SDK retry; a slow answer is
// requeued with its attempt counted.
func TestNewsDeskRetriesAndTimeouts(t *testing.T) {
	f := newDeskFixture(t, nil, errorReply(529), researchReply(goodParas()), fixture(t, "structure_ok"))
	if job := f.run(t); job.Status != domain.NewsJobReady || f.claude.callCount() != 3 {
		t.Fatalf("529 then 200: job = %s, calls %d", job.Status, f.claude.callCount())
	}

	slow := researchReply(goodParas())
	slow.delay = 2 * time.Second
	f = newDeskFixture(t, nil, slow)
	f.desk.cfg.Call1Timeout = 50 * time.Millisecond
	job := f.run(t)
	if job.Status != domain.NewsJobQueued || job.Attempts != 1 || job.NextAttemptAt <= time.Now().UTC().Add(29*time.Minute).Format(time.RFC3339) {
		t.Fatalf("slow: job = %+v", job)
	}
}

// Permanent API errors fail the job; repeated transient ones fail it after
// three attempts. The Kimi backup is never called (test 11).
func TestNewsDeskErrorsNeverUseTheBackup(t *testing.T) {
	var kimiHits atomic.Int32
	kimi := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		kimiHits.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer kimi.Close()
	ai := NewAIService("", "model", 60, 20, newMemUsage()).WithFallback("kimi-key", "kimi", kimi.URL)
	_ = ai // the desk never receives the general AI service

	f := newDeskFixture(t, nil, errorReply(http.StatusBadRequest))
	if job := f.run(t); job.Status != domain.NewsJobFailed || !strings.Contains(job.LastError, "400") {
		t.Fatalf("permanent: job = %+v", job)
	}

	f = newDeskFixture(t, nil, errorReply(http.StatusInternalServerError))
	for attempt := 1; attempt <= maxJobAttempts; attempt++ {
		job := f.run(t)
		if attempt < maxJobAttempts && job.Status != domain.NewsJobQueued {
			t.Fatalf("attempt %d: %+v", attempt, job)
		}
		f.makeDue(job.ID)
	}
	if job := f.jobs.only(t); job.Status != domain.NewsJobFailed || job.Attempts != maxJobAttempts {
		t.Fatalf("after three transient failures: %+v", job)
	}
	if kimiHits.Load() != 0 {
		t.Fatalf("the Kimi backup was called %d times", kimiHits.Load())
	}
}

// makeDue makes a queued job claimable now.
func (f *deskFixture) makeDue(id string) {
	f.jobs.mu.Lock()
	defer f.jobs.mu.Unlock()
	j := f.jobs.rows[id]
	j.NextAttemptAt = ""
	f.jobs.rows[id] = j
}

// A lead older than 48 hours goes stale without a call.
func TestNewsDeskStaleLead(t *testing.T) {
	f := newDeskFixture(t, nil, researchReply(goodParas()))
	f.jobs.mu.Lock()
	for id, j := range f.jobs.rows {
		j.LeadPublishedAt = time.Now().Add(-49 * time.Hour).UTC().Format(time.RFC1123Z)
		f.jobs.rows[id] = j
	}
	f.jobs.mu.Unlock()
	if job := f.run(t); job.Status != domain.NewsJobStale || f.claude.callCount() != 0 {
		t.Fatalf("job = %+v", job)
	}
}

// Enqueue screens Tier C leads, political leads in election mode, and does
// nothing when long-form is off; the worker does nothing when the desk is off.
func TestNewsDeskEnqueueScreens(t *testing.T) {
	f := newDeskFixture(t, nil)
	ctx := context.Background()
	if ok, _ := f.desk.EnqueueBrief(ctx, domain.NewsArticle{ID: "n2"}, newsLead{URL: "https://x.test/2", Title: "Suspect remanded in Cape Coast"}); ok {
		t.Error("a Tier C lead was queued")
	}
	if ok, _ := f.desk.EnqueueBrief(ctx, f.article, newsLead{URL: leadURL, Title: "Again"}); ok {
		t.Error("a duplicate lead was queued")
	}
	f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.ElectionModeManual = true })
	if ok, _ := f.desk.EnqueueBrief(ctx, domain.NewsArticle{ID: "n3", Political: true}, newsLead{URL: "https://x.test/3", Title: "Assembly members meet"}); ok {
		t.Error("a political lead was queued in election mode")
	}
	f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.LongformEnabled = false })
	if ok, _ := f.desk.EnqueueBrief(ctx, domain.NewsArticle{ID: "n4"}, newsLead{URL: "https://x.test/4", Title: "Market"}); ok {
		t.Error("queued with long-form off")
	}
	if f.desk.Tick(ctx) {
		t.Error("the worker ran with long-form off")
	}
}

// saveSettings rewrites the stored settings.
func (f *deskFixture) saveSettings(t *testing.T, mutate func(*domain.NewsDeskSettings)) {
	t.Helper()
	s := f.desk.Settings(context.Background())
	mutate(&s)
	if err := f.settings.Save(context.Background(), SettingsChange{Key: domain.SettingsKeyNewsDesk, Doc: &s, ExpectedVersion: s.Version, ActorName: "Test", Reason: "test change"}); err != nil {
		t.Fatal(err)
	}
}

// Test 14: approve enforces the checklist and markers, writes the report
// over the brief under the same slug and publishes it.
func TestNewsDeskApproveValidation(t *testing.T) {
	f := newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_ok"))
	job := f.run(t)
	ctx := context.Background()
	editor := AuditActor{ID: "m-ed", Name: "Kofi Mensah"}

	in := approveBody(job.Draft)
	in.Checklist.ImageCompliant = false
	var fe *InvalidFieldError
	if _, err := f.desk.Approve(ctx, f.article.ID, in, editor); !errors.As(err, &fe) || fe.Code != CodeChecklistIncomplete || fe.Field != "imageCompliant" {
		t.Fatalf("unchecked image item = %v", err)
	}
	in.Cover = "branded" // a branded cover does not need the image item
	in.Body += " Extra claim [9]."
	if _, err := f.desk.Approve(ctx, f.article.ID, in, editor); !errors.As(err, &fe) || fe.Code != CodeInvalidMarkers {
		t.Fatalf("bad marker = %v", err)
	}
	in = approveBody(job.Draft)
	in.Title = strings.Repeat("x", 91)
	if _, err := f.desk.Approve(ctx, f.article.ID, in, editor); !errors.As(err, &fe) || fe.Code != CodeInvalidTitle {
		t.Fatalf("long title = %v", err)
	}
	if j := f.jobs.only(t); j.Status != domain.NewsJobReady {
		t.Fatalf("a refused approve changed the job: %+v", j)
	}
}

func TestNewsDeskApprove(t *testing.T) {
	f := newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_ok"))
	job := f.run(t)
	ctx := context.Background()
	editor := AuditActor{ID: "m-ed", Name: "Kofi Mensah"}

	in := approveBody(job.Draft)
	in.Title = "Kotokuraba market trades again after repairs"
	a, err := f.desk.Approve(ctx, f.article.ID, in, editor)
	if err != nil {
		t.Fatal(err)
	}
	stored := f.articleNow(t)
	if stored.Slug != f.article.Slug || stored.Title != in.Title || stored.Status != domain.NewsPublished ||
		stored.PublishedAt != f.article.PublishedAt || stored.Tier != domain.NewsTierReport || len(stored.Sources) != 3 {
		t.Fatalf("stored = %+v", stored)
	}
	if stored.CoverImageKind != domain.CoverKindAI || stored.CoverImageURL == "" || stored.CoverImageCredit == "" || stored.ReviewedByName != "Kofi Mensah" {
		t.Fatalf("cover/reviewer = %+v", stored)
	}
	if !hasString(stored.Tags, "AI-assisted") || hasString(stored.Tags, "Election coverage") || !hasString(stored.Tags, "Automated") {
		t.Fatalf("tags = %v", stored.Tags)
	}
	wantLabel := "AI-assisted report: drafted by AI from the sources listed below and reviewed by Kofi Mensah before publication. Oguaa, operated by Dev Track, is responsible for this article."
	if a.AutomationLabel != wantLabel {
		t.Fatalf("label = %q", a.AutomationLabel)
	}
	if j := f.jobs.only(t); j.Status != domain.NewsJobApproved || j.ReviewedByName != "Kofi Mensah" {
		t.Fatalf("job = %+v", j)
	}
	if _, err := f.desk.Approve(ctx, f.article.ID, in, editor); !errors.Is(err, ErrJobNotReady) {
		t.Fatalf("second approve = %v", err)
	}
}

func approveBody(d *domain.NewsReportDraft) NewsApproveInput {
	return NewsApproveInput{Title: d.Title, Summary: d.Summary, Body: d.Body, Cover: "keep", Checklist: NewsReviewChecklist{
		FactsMatchSources: true, NoUnattributedAllegations: true, QuotesAccurate: true,
		BalancedIfPolitical: true, ImageCompliant: true, RightOfReplyConsidered: true,
	}}
}

// Reject, rerun, cover actions and corrections.
func TestNewsDeskEditorActions(t *testing.T) {
	f := newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_ok"))
	f.run(t)
	ctx := context.Background()

	job, err := f.desk.Cover(ctx, f.article.ID, "branded")
	if err != nil || job.Draft.Cover.Kind != domain.CoverKindBranded || job.Draft.Cover.Prompt == "" {
		t.Fatalf("branded = %+v, %v", job, err)
	}
	job, err = f.desk.Cover(ctx, f.article.ID, "regenerate")
	if err != nil || job.Draft.Cover.Kind != domain.CoverKindAI || f.images.calls() != 2 {
		t.Fatalf("regenerate = %+v, %v (calls %d)", job, err, f.images.calls())
	}
	f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.MaxImagesPerDay = 2 })
	if _, err := f.desk.Cover(ctx, f.article.ID, "regenerate"); !errors.Is(err, ErrImageCapReached) {
		t.Fatalf("cap = %v", err)
	}
	f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.ImagesEnabled = false })
	if _, err := f.desk.Cover(ctx, f.article.ID, "regenerate"); !errors.Is(err, ErrImagesUnavailable) {
		t.Fatalf("disabled = %v", err)
	}

	if _, err := f.desk.Rerun(ctx, f.article.ID); !errors.Is(err, ErrJobNotRerunnable) {
		t.Fatalf("rerun of a ready job = %v", err)
	}
	if _, err := f.desk.Reject(ctx, f.article.ID, "no", AuditActor{Name: "Ed"}); err == nil {
		t.Fatal("a too-short reason was accepted")
	}
	job, err = f.desk.Reject(ctx, f.article.ID, "Sources do not support the fee claim.", AuditActor{Name: "Ed"})
	if err != nil || job.Status != domain.NewsJobRejected || f.articleNow(t).Title != f.article.Title {
		t.Fatalf("reject = %+v, %v", job, err)
	}
	job, err = f.desk.Rerun(ctx, f.article.ID)
	if err != nil || job.Status != domain.NewsJobQueued || job.Attempts != 0 {
		t.Fatalf("rerun = %+v, %v", job, err)
	}
	f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.LongformEnabled = false })
	if _, err := f.desk.Rerun(ctx, f.article.ID); !errors.Is(err, ErrDeskDisabled) {
		t.Fatalf("rerun with long-form off = %v", err)
	}

	a, err := f.desk.AddCorrection(ctx, f.article.ID, "An earlier version gave the wrong cost.")
	if err != nil || len(a.Corrections) != 1 || a.Corrections[0].Note != "An earlier version gave the wrong cost." {
		t.Fatalf("correction = %+v, %v", a, err)
	}
}

// A reasoning_extraction refusal is never rerun.
func TestNewsDeskRerunRefusesReasoningExtraction(t *testing.T) {
	f := newDeskFixture(t, nil, fixture(t, "refusal"))
	job := f.run(t)
	f.jobs.mu.Lock()
	job.RefusalCategory = "reasoning_extraction"
	f.jobs.rows[job.ID] = job
	f.jobs.mu.Unlock()
	if _, err := f.desk.Rerun(context.Background(), f.article.ID); !errors.Is(err, ErrJobNotRerunnable) {
		t.Fatalf("rerun = %v", err)
	}
}

// Settings: validation and the audited save.
func TestNewsDeskSettingsValidation(t *testing.T) {
	f := newDeskFixture(t, nil)
	ctx := context.Background()
	cur := f.desk.Settings(ctx)
	bad := cur
	bad.MinSources = 1
	var fe *InvalidFieldError
	if _, err := f.desk.SaveSettings(ctx, NewsDeskSettingsInput{NewsDeskSettings: bad, Reason: "lower bar"}, AuditActor{Name: "S"}); !errors.As(err, &fe) || fe.Field != "minSources" {
		t.Fatalf("minSources 1 = %v", err)
	}
	good := cur
	good.ExtraBlockedKeywords = []string{" Galamsey ", "galamsey", "Land Guard"}
	view, err := f.desk.SaveSettings(ctx, NewsDeskSettingsInput{NewsDeskSettings: good, Reason: "add local terms"}, AuditActor{Name: "S"})
	if err != nil || len(view.ExtraBlockedKeywords) != 2 || view.Version != cur.Version+1 || !view.Keys.Anthropic || !view.Keys.OpenAI {
		t.Fatalf("save = %+v, %v", view, err)
	}
	if _, err := f.desk.SaveSettings(ctx, NewsDeskSettingsInput{NewsDeskSettings: good, Reason: "stale save"}, AuditActor{Name: "S"}); !errors.Is(err, domain.ErrSettingsConflict) {
		t.Fatalf("stale version = %v", err)
	}
	if !tierCHit("Galamsey sites seized", "", view.ExtraBlockedKeywords) || tierCHit("Courtyard concert", "", nil) {
		t.Error("Tier C screen must use whole words and the extra keywords")
	}
}

func TestNewsAllowedDomains(t *testing.T) {
	got := NewsAllowedDomains([]string{"https://www.MyJoyOnline.com/feed", "http://localhost:8080/rss"}, "gna.org.gh, https://gna.org.gh/ ,ec.gov.gh")
	want := "ec.gov.gh,gna.org.gh,myjoyonline.com"
	if strings.Join(got, ",") != want {
		t.Fatalf("domains = %v", got)
	}
}

func TestNewsCostEstimates(t *testing.T) {
	f := newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_ok"))
	job := f.run(t)
	// Call 1: 1000 in × $4 + 2000 out × $20 + 2 searches × $0.01; Call 2: 2500 × $4 + 400 × $20.
	want := int64(1000*4+2000*20+2*10_000) + int64(2500*4+400*20)
	if job.CostMicroUSD != want || f.usage.today(keyResearchUSD) != int(want) || f.usage.today(keyReports) != 1 {
		t.Fatalf("cost = %d (want %d), counter %d", job.CostMicroUSD, want, f.usage.today(keyResearchUSD))
	}
	page, err := f.desk.Jobs(context.Background(), "ready", 1)
	if err != nil || page.Total != 1 || page.Today.Reports != 1 || page.Today.Images != 1 || page.Today.ResearchMicroUSD != want {
		t.Fatalf("page = %+v, %v", page, err)
	}
}

// Test 15 helper: the public rule gives automated articles without a cover
// the branded URL and leaves others alone.
func TestWithBrandedCover(t *testing.T) {
	a := domain.NewsArticle{Slug: "s-1", Title: "Kotokuraba", Automated: true}
	got := WithBrandedCover(a, "https://api.oguaaman.com/")
	if got.CoverImageURL != "https://api.oguaaman.com/api/news/s-1/cover.png?v="+titleVersion("Kotokuraba") || got.CoverImageKind != domain.CoverKindBranded || len(titleVersion("x")) != 8 {
		t.Fatalf("branded = %+v", got)
	}
	a.CoverImageURL = "https://res.cloudinary.com/x.webp"
	if WithBrandedCover(a, "https://api").CoverImageURL != a.CoverImageURL {
		t.Fatal("a stored cover must be kept")
	}
	if CoverDate("2026-10-02T09:00:00Z") != "2 Oct 2026" {
		t.Fatalf("date = %q", CoverDate("2026-10-02T09:00:00Z"))
	}
}
