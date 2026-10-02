package service

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"

	"github.com/oguaa/backend/internal/domain"
)

// ── the researched news desk: queue and worker (spec §2.2) ───────────────────
//
// The RSS pass stores a brief as today and, when the desk allows, queues a
// research job; no AI runs there. A single background worker claims one job a
// minute, researches and writes it with Claude (two calls), runs the quality
// gates, picks a cover and leaves a draft for an editor. Nothing it writes is
// ever published without an editor (D3). The Kimi backup is never used here:
// the desk has its own Anthropic client and no other provider.

// DefaultNewsAllowedDomains is OGUAA_NEWS_ALLOWED_DOMAINS' default.
const DefaultNewsAllowedDomains = "gna.org.gh,graphic.com.gh,myjoyonline.com,citinewsroom.com,3news.com,gbcghanaonline.com,gov.gh,ucc.edu.gh,ec.gov.gh,ghanahealthservice.org,police.gov.gh"

// Defaults of NewsDeskConfig.
const (
	DefaultNewsModel            = "claude-opus-5-5"
	DefaultNewsEffort           = "medium"
	DefaultNewsMaxSearches      = 5
	DefaultNewsMaxFetches       = 4
	DefaultNewsMaxContinuations = 3
	DefaultImageModel           = "gpt-image-2.5-flare-2026-09-08"
	DefaultImageQuality         = "medium"

	defaultSDKRetries   = 2
	defaultCall1Timeout = 4 * time.Minute
	defaultCall2Timeout = 90 * time.Second
	defaultJobTimeout   = 10 * time.Minute
	defaultPollInterval = 60 * time.Second

	jobLock          = 12 * time.Minute
	staleLeadAfter   = 48 * time.Hour
	maxJobAttempts   = 3
	retryAfterFirst  = 30 * time.Minute
	retryAfterSecond = 2 * time.Hour
	// budgetRetryAt is when a job over today's caps tries again (00:05 Accra).
	budgetRetryAt  = 5 * time.Minute
	finishTimeout  = 15 * time.Second
	maxLastErrRune = 300

	// Daily usage counters (spec §2.7).
	keyReports     = "global-news-research"
	keyResearchUSD = "global-news-research-usd"
	keyImages      = "global-news-images"
	keyImagesUSD   = "global-news-images-usd"

	errBudget = "daily_cap_reached"

	// Why the desk's own topic screens blocked a job (BlockedReason; Call 2's
	// blockedCategory values are the others).
	blockedSensitive    = "sensitive_topic"
	blockedElectionMode = "election_mode"
)

// NewsDeskConfig is the desk's environment configuration (spec §2.11).
type NewsDeskConfig struct {
	AnthropicKey string
	// AnthropicBaseURL points the SDK elsewhere (tests); "" = the API.
	AnthropicBaseURL string
	// MaxRetries is the SDK's own retry count; 0 = 2.
	MaxRetries       int
	Model            string // OGUAA_NEWS_MODEL
	StructureModel   string // OGUAA_NEWS_STRUCTURE_MODEL
	Effort           string // OGUAA_NEWS_EFFORT: low | medium | high
	MaxSearches      int    // OGUAA_NEWS_MAX_SEARCHES
	MaxFetches       int    // OGUAA_NEWS_MAX_FETCHES
	MaxContinuations int    // OGUAA_NEWS_MAX_CONTINUATIONS
	// AllowedDomains is computed once at startup (NewsAllowedDomains).
	AllowedDomains []string
	ImageQuality   string // OPENAI_IMAGE_QUALITY
	// Timeouts and the poll interval; zero = the spec's values.
	Call1Timeout, Call2Timeout, JobTimeout, PollInterval time.Duration
}

func (c NewsDeskConfig) withDefaults() NewsDeskConfig {
	c.Model = firstNonEmpty(c.Model, DefaultNewsModel)
	c.StructureModel = firstNonEmpty(c.StructureModel, DefaultNewsModel)
	switch c.Effort {
	case "low", "medium", "high":
	default:
		c.Effort = DefaultNewsEffort
	}
	c.ImageQuality = firstNonEmpty(c.ImageQuality, DefaultImageQuality)
	c.MaxSearches = positiveOr(c.MaxSearches, DefaultNewsMaxSearches)
	c.MaxFetches = positiveOr(c.MaxFetches, DefaultNewsMaxFetches)
	c.MaxContinuations = positiveOr(c.MaxContinuations, DefaultNewsMaxContinuations)
	c.MaxRetries = positiveOr(c.MaxRetries, defaultSDKRetries)
	c.Call1Timeout = durationOr(c.Call1Timeout, defaultCall1Timeout)
	c.Call2Timeout = durationOr(c.Call2Timeout, defaultCall2Timeout)
	c.JobTimeout = durationOr(c.JobTimeout, defaultJobTimeout)
	c.PollInterval = durationOr(c.PollInterval, defaultPollInterval)
	return c
}

func firstNonEmpty(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return strings.TrimSpace(v)
}

func positiveOr(v, def int) int {
	if v <= 0 {
		return def
	}
	return v
}

func durationOr(v, def time.Duration) time.Duration {
	if v <= 0 {
		return def
	}
	return v
}

// NewsAllowedDomains is the fixed allow-list for web_search and web_fetch:
// the hosts of the configured feeds plus the extra comma-separated domains,
// lower-cased, without a scheme, deduplicated and sorted. Compute it once at
// startup. Feeds on localhost are left out.
func NewsAllowedDomains(feedURLs []string, extra string) []string {
	seen := map[string]bool{}
	for _, raw := range feedURLs {
		if u, err := url.Parse(strings.TrimSpace(raw)); err == nil {
			if h := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www."); h != "" && h != "localhost" && h != "127.0.0.1" {
				seen[h] = true
			}
		}
	}
	for _, d := range strings.Split(extra, ",") {
		d = strings.ToLower(strings.TrimSpace(d))
		d = strings.TrimPrefix(strings.TrimPrefix(d, "https://"), "http://")
		d = strings.TrimSuffix(d, "/")
		if d != "" {
			seen[d] = true
		}
	}
	out := make([]string, 0, len(seen))
	for d := range seen {
		out = append(out, d)
	}
	sort.Strings(out)
	return out
}

// NewsDeskDeps wires the desk.
type NewsDeskDeps struct {
	News      domain.NewsRepository
	Jobs      domain.NewsResearchJobRepository
	Usage     domain.AIUsageRepository
	Settings  *SettingsService
	Elections *ElectionsService     // nil: only the manual election-mode switch counts
	Images    domain.ImageGenerator // nil: branded covers only
	Store     domain.ImageStore     // nil: no Cloudinary, branded covers only
	Config    NewsDeskConfig
	Log       *slog.Logger
}

// NewsDesk is the researched news desk: settings, queue, worker and the
// editor workflow.
type NewsDesk struct {
	news      domain.NewsRepository
	jobs      domain.NewsResearchJobRepository
	usage     domain.AIUsageRepository
	settings  *SettingsService
	elections *ElectionsService
	images    domain.ImageGenerator
	store     domain.ImageStore
	claude    *anthropic.Client // nil without ANTHROPIC_API_KEY
	cfg       NewsDeskConfig
	log       *slog.Logger
	now       func() time.Time
}

// NewNewsDesk builds the desk. Without an Anthropic key it still serves
// settings and the editor workflow, but never queues or researches.
func NewNewsDesk(d NewsDeskDeps) *NewsDesk {
	cfg := d.Config.withDefaults()
	log := d.Log
	if log == nil {
		log = slog.Default()
	}
	desk := &NewsDesk{
		news: d.News, jobs: d.Jobs, usage: d.Usage, settings: d.Settings, elections: d.Elections,
		images: d.Images, store: d.Store, cfg: cfg, log: log, now: time.Now,
	}
	if strings.TrimSpace(cfg.AnthropicKey) != "" {
		opts := []option.RequestOption{option.WithAPIKey(cfg.AnthropicKey), option.WithMaxRetries(cfg.MaxRetries)}
		if cfg.AnthropicBaseURL != "" {
			opts = append(opts, option.WithBaseURL(cfg.AnthropicBaseURL))
		}
		client := anthropic.NewClient(opts...)
		desk.claude = &client
	}
	return desk
}

// Researching reports whether the worker can run (an Anthropic key is set).
func (d *NewsDesk) Researching() bool { return d != nil && d.claude != nil }

// Run polls the queue until ctx ends. Start it only when Researching().
func (d *NewsDesk) Run(ctx context.Context) {
	if !d.Researching() {
		return
	}
	ticker := time.NewTicker(d.cfg.PollInterval)
	defer ticker.Stop()
	for {
		d.Tick(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (d *NewsDesk) stamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }
func (d *NewsDesk) today() string            { return d.now().In(calendarZone).Format(time.DateOnly) }

// electionMode reports newsroom election mode (the calendar or the manual switch).
func (d *NewsDesk) electionMode(ctx context.Context) bool {
	if d.elections != nil {
		return d.elections.NewsElectionMode(ctx, d.now())
	}
	return d.Settings(ctx).ElectionModeManual
}

// screenLead is the topic screen (spec §2.1): AI never drafts a lead that
// touches a Tier C topic (the built-in keywords and the steward's extra
// ones), nor a political lead while election mode is on. political adds
// what the caller already knows (the brief's or the draft's flag) to the
// keyword check of the lead. It names why the lead is blocked, "" when AI may
// draft it. The queue, the worker (before any Claude call), Rerun and Approve
// all run it, so a keyword added or election mode switched on after a job was
// queued still applies.
func (d *NewsDesk) screenLead(ctx context.Context, title, teaser string, political bool, s domain.NewsDeskSettings) string {
	if tierCHit(title, teaser, s.ExtraBlockedKeywords) {
		return blockedSensitive
	}
	if (political || politicalText(title, teaser)) && d.electionMode(ctx) {
		return blockedElectionMode
	}
	return ""
}

// ── queueing (from the RSS pass) ─────────────────────────────────────────────

// EnqueueBrief queues long-form research for a stored brief when the desk
// allows it: desk and long-form on, a key set, and the lead clear of the
// topic screen. No AI runs here.
func (d *NewsDesk) EnqueueBrief(ctx context.Context, a domain.NewsArticle, lead newsLead) (bool, error) {
	if !d.Researching() {
		return false, nil
	}
	s := d.Settings(ctx)
	if !s.DeskEnabled || !s.LongformEnabled || d.screenLead(ctx, lead.Title, lead.Teaser, a.Political, s) != "" {
		return false, nil
	}
	now := d.stamp(d.now())
	job := domain.NewsResearchJob{
		ID: newID(domain.PrefixNewsResearchJob), ArticleID: a.ID, LeadURL: lead.URL, LeadSource: lead.Source,
		LeadTitle: lead.Title, LeadTeaser: lead.Teaser, LeadPublishedAt: lead.PublishedAt,
		Status: domain.NewsJobQueued, NextAttemptAt: now, CreatedAt: now, UpdatedAt: now,
	}
	if err := d.jobs.Insert(ctx, job); err != nil {
		if errors.Is(err, domain.ErrNewsJobExists) {
			return false, nil
		}
		return false, err
	}
	if err := d.news.SetResearchStatus(ctx, a.ID, domain.NewsJobQueued); err != nil {
		d.log.Warn("newsdesk: could not mirror research status", "article", a.ID, "err", err)
	}
	return true, nil
}

// ── the worker ───────────────────────────────────────────────────────────────

// Tick claims and processes at most one job. It reports whether it ran one.
func (d *NewsDesk) Tick(ctx context.Context) bool {
	if !d.Researching() {
		return false
	}
	s := d.Settings(ctx)
	if !s.DeskEnabled || !s.LongformEnabled {
		return false
	}
	now := d.now()
	if _, err := d.jobs.RequeueExpired(ctx, d.stamp(now)); err != nil {
		d.log.Warn("newsdesk: requeue of expired jobs failed", "err", err)
	}
	job, err := d.jobs.Claim(ctx, d.stamp(now), d.stamp(now.Add(jobLock)))
	if err != nil {
		d.log.Warn("newsdesk: claim failed", "err", err)
		return false
	}
	if job == nil {
		return false
	}
	jobCtx, cancel := context.WithTimeout(ctx, d.cfg.JobTimeout)
	defer cancel()
	d.finish(ctx, job, d.process(jobCtx, job, s))
	return true
}

// finish records a run's outcome and mirrors the status onto the brief.
func (d *NewsDesk) finish(ctx context.Context, job *domain.NewsResearchJob, o domain.NewsJobOutcome) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), finishTimeout)
	defer cancel()
	o.UpdatedAt = d.stamp(d.now())
	o.LastError = clipRunes(o.LastError, maxLastErrRune)
	if err := d.jobs.Finish(ctx, job.ID, o); err != nil {
		d.log.Error("newsdesk: could not record job outcome", "job", job.ID, "status", o.Status, "err", err)
		return
	}
	if err := d.news.SetResearchStatus(ctx, job.ArticleID, o.Status); err != nil {
		d.log.Warn("newsdesk: could not mirror research status", "article", job.ArticleID, "err", err)
	}
	d.log.Info("newsdesk: job finished", "job", job.ID, "status", o.Status, "attempts", job.Attempts, "reason", o.LastError)
}

// process runs one claimed job through the pipeline and says how it ended.
// The topic screen runs again first, before any Claude call: a keyword
// added, election mode switched on or a rerun since the job was queued must
// still keep the story away from AI.
func (d *NewsDesk) process(ctx context.Context, job *domain.NewsResearchJob, s domain.NewsDeskSettings) domain.NewsJobOutcome {
	if reason := d.screenLead(ctx, job.LeadTitle, job.LeadTeaser, false, s); reason != "" {
		return domain.NewsJobOutcome{Status: domain.NewsJobBlocked, BlockedReason: reason, RefundAttempt: true}
	}
	if d.now().Sub(leadTime(job)) > staleLeadAfter {
		return domain.NewsJobOutcome{Status: domain.NewsJobStale}
	}
	day := d.today()
	if !d.reserve(ctx, day, keyReports, 1, int64(s.MaxReportsPerDay)) {
		return d.budgetRequeue()
	}
	b := &researchBudget{desk: d, jobID: job.ID, day: day, limit: s.MaxResearchMicroUsdPerDay}
	lead := newsLead{URL: job.LeadURL, Source: job.LeadSource, Title: job.LeadTitle, Teaser: job.LeadTeaser, PublishedAt: job.LeadPublishedAt}
	rep, run, out := d.researchWithGates(ctx, job, lead, s, b)
	if out != nil {
		return *out
	}
	meta, run2, err := d.structure(ctx, rep.Body, sourceLines(rep.Sources), b)
	if err != nil {
		return d.failure(ctx, job, err, run, b)
	}
	model := run.Model
	fallback := run.Fallback || run2.Fallback || (model != "" && !strings.HasPrefix(model, d.cfg.Model))
	return d.reportOutcome(ctx, job, s, rep, meta, model, fallback)
}

// reportOutcome turns a gated report and its Call 2 metadata into the job's
// outcome. A sensitive story (Call 2's blockedCategory) and a political one
// while election mode is on (checked now, after the calls) are blocked and
// keep no draft; anything else becomes a ready draft with its cover.
func (d *NewsDesk) reportOutcome(ctx context.Context, job *domain.NewsResearchJob, s domain.NewsDeskSettings, rep assembledReport, meta structureOut, model string, fallback bool) domain.NewsJobOutcome {
	if meta.BlockedCategory != blockedNone {
		return domain.NewsJobOutcome{Status: domain.NewsJobBlocked, BlockedReason: meta.BlockedCategory, Model: model, FallbackUsed: fallback}
	}
	political := meta.Political || politicalText(rep.Body, meta.Title, job.LeadTitle, job.LeadTeaser)
	if political && d.electionMode(ctx) {
		return domain.NewsJobOutcome{Status: domain.NewsJobBlocked, BlockedReason: blockedElectionMode, Model: model, FallbackUsed: fallback}
	}
	draft := &domain.NewsReportDraft{
		Title: meta.Title, Summary: meta.Summary, Body: rep.Body, Sources: rep.Sources, Topics: meta.Topics,
		Political: political, WordCount: rep.WordCount, CitationCoverage: rep.Coverage,
		Flags:         softFlags(rep, meta.UncitedClaims, political, fallback),
		UncitedClaims: meta.UncitedClaims, GeneratedAt: d.stamp(d.now()),
	}
	draft.Cover = d.makeCover(ctx, coverRequest{
		JobID: job.ID, ArticleID: job.ArticleID, Title: meta.Title, Body: rep.Body, Scene: meta.ImageScene,
		Political: political, Sensitive: tierCHit(job.LeadTitle, job.LeadTeaser, s.ExtraBlockedKeywords),
	}, s)
	return domain.NewsJobOutcome{Status: domain.NewsJobReady, Draft: draft, Model: model, FallbackUsed: fallback}
}

// researchWithGates runs Call 1 and the hard gates, regenerating once on a
// copy-overlap or quote failure (metered like every request). A non-nil
// outcome ends the job.
func (d *NewsDesk) researchWithGates(ctx context.Context, job *domain.NewsResearchJob, lead newsLead, s domain.NewsDeskSettings, b *researchBudget) (assembledReport, claudeRun, *domain.NewsJobOutcome) {
	for attempt := 0; ; attempt++ {
		run, err := d.research(ctx, lead, b)
		if err != nil {
			o := d.failure(ctx, job, err, run, b)
			return assembledReport{}, run, &o
		}
		rep := assembleReport(run.Blocks, lead, d.now())
		if rep.NoStory {
			o := domain.NewsJobOutcome{Status: domain.NewsJobNoStory, Model: run.Model, FallbackUsed: run.Fallback}
			return rep, run, &o
		}
		g := checkHardGates(rep, s)
		if g.Failure == "" {
			return rep, run, nil
		}
		if !g.Regenerable || attempt > 0 {
			o := domain.NewsJobOutcome{Status: domain.NewsJobFailed, LastError: g.Failure, Model: run.Model, FallbackUsed: run.Fallback}
			return rep, run, &o
		}
		d.log.Info("newsdesk: regenerating once", "job", job.ID, "gate", g.Failure)
	}
}

// failure turns a classified error into the job's outcome.
func (d *NewsDesk) failure(ctx context.Context, job *domain.NewsResearchJob, err error, run claudeRun, b *researchBudget) domain.NewsJobOutcome {
	var de *deskError
	if !errors.As(err, &de) {
		de = &deskError{kind: errTransient, reason: err.Error()}
	}
	o := domain.NewsJobOutcome{LastError: de.reason, Model: run.Model, FallbackUsed: run.Fallback}
	switch de.kind {
	case errCapped:
		return d.overCap(ctx, job, b)
	case errRefused:
		o.Status, o.RefusalCategory = domain.NewsJobRefused, de.category
		d.log.Warn("newsdesk: Claude refused", "job", job.ID, "category", de.category)
	case errPermanent:
		o.Status = domain.NewsJobFailed
		d.log.Error("newsdesk: permanent API error", "job", job.ID, "err", de.reason)
	default:
		if job.Attempts >= maxJobAttempts {
			o.Status = domain.NewsJobFailed
			return o
		}
		o.Status = domain.NewsJobQueued
		wait := retryAfterFirst
		if job.Attempts >= 2 {
			wait = retryAfterSecond
		}
		o.NextAttemptAt = d.stamp(d.now().Add(wait))
	}
	return o
}

// budgetRequeue puts a job over today's caps back for tomorrow 00:05 Accra,
// without counting the attempt.
func (d *NewsDesk) budgetRequeue() domain.NewsJobOutcome {
	now := d.now().In(calendarZone)
	tomorrow := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, calendarZone).Add(budgetRetryAt)
	return domain.NewsJobOutcome{Status: domain.NewsJobQueued, NextAttemptAt: d.stamp(tomorrow), LastError: errBudget, RefundAttempt: true}
}

// reserve adds amount to today's counter and keeps it only when the total
// stays within limit. A counter that cannot be read refuses (fail closed:
// this is real money).
func (d *NewsDesk) reserve(ctx context.Context, day, key string, amount, limit int64) bool {
	if d.usage == nil {
		return false
	}
	total, err := d.usage.IncrBy(ctx, day, key, amount)
	if err != nil {
		d.log.Warn("newsdesk: usage counter unavailable", "key", key, "err", err)
		return false
	}
	if total > limit {
		d.settle(ctx, day, key, -amount)
		return false
	}
	return true
}

// settle adjusts today's counter by delta (the real cost minus the reservation).
func (d *NewsDesk) settle(ctx context.Context, day, key string, delta int64) {
	if d.usage == nil || delta == 0 {
		return
	}
	if _, err := d.usage.IncrBy(context.WithoutCancel(ctx), day, key, delta); err != nil {
		d.log.Warn("newsdesk: usage counter update failed", "key", key, "err", err)
	}
}

// leadTime is when the lead was published (else when the job was queued).
func leadTime(job *domain.NewsResearchJob) time.Time {
	for _, layout := range []string{time.RFC1123Z, time.RFC1123, time.RFC3339, "Mon, 2 Jan 2006 15:04:05 -0700", "Mon, 2 Jan 2006 15:04:05 MST", time.DateOnly} {
		if t, err := time.Parse(layout, strings.TrimSpace(job.LeadPublishedAt)); err == nil {
			return t
		}
	}
	t, err := time.Parse(time.RFC3339, job.CreatedAt)
	if err != nil {
		return time.Now()
	}
	return t
}

// sourceLines is what Call 2 sees of the sources.
func sourceLines(sources []domain.NewsSource) []sourceLine {
	out := make([]sourceLine, len(sources))
	for i, s := range sources {
		out[i] = sourceLine{Name: s.Name, Title: s.Title, URL: s.URL}
	}
	return out
}
