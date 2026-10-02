package service

import (
	"context"
	"crypto/sha1" //nolint:gosec // a cache-busting version, not a security hash
	"encoding/hex"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── the editor workflow (spec §2.9) ──────────────────────────────────────────
//
// An editor approves a ready draft (which upgrades the brief in place under
// the same slug and publishes it, without a push), rejects it, reruns a
// failed job, swaps its cover, or appends a public correction.

// Editor-workflow sentinels (HTTP 409/429/503 with these codes).
var (
	ErrJobNotReady       = errors.New("job_not_ready")
	ErrJobNotRerunnable  = errors.New("job_not_rerunnable")
	ErrDeskDisabled      = errors.New("desk_disabled")
	ErrImageCapReached   = errors.New("image_cap_reached")
	ErrImagesUnavailable = errors.New("images_unavailable")
	// ErrTopicBlocked refuses to research or publish a story whose lead
	// touches a topic AI never drafts (spec §2.1).
	ErrTopicBlocked = errors.New("topic_blocked")
	// ErrElectionMode refuses to research or publish an AI-assisted political
	// story while newsroom election mode is on.
	ErrElectionMode = errors.New("election_mode")
)

// Approve validation codes (InvalidFieldError.Code).
const (
	CodeChecklistIncomplete = "checklist_incomplete"
	CodeInvalidTitle        = "invalid_title"
	CodeInvalidSummary      = "invalid_summary"
	CodeInvalidMarkers      = "invalid_markers"
	CodeInvalidCover        = "invalid_cover"
	CodeInvalidReason       = "invalid_reason"
	CodeInvalidNote         = "invalid_note"
	CodeInvalidAction       = "invalid_action"

	maxReportTitle   = 90
	maxReportSummary = 220
	minNoteRunes     = 5
	maxNoteRunes     = 500
	jobsPerPage      = 20

	coverKeep    = "keep"
	coverBranded = "branded"
	coverRegen   = "regenerate"

	tagAIAssisted       = "AI-assisted"
	tagElectionCoverage = "Election coverage"
	defaultReviewerName = "Oguaa editor"

	reportLabelTemplate = "AI-assisted report: drafted by AI from the sources listed below and reviewed by {name} before publication. Oguaa, operated by Dev Track, is responsible for this article."
	politicalLabel      = " This is election coverage: an editor checked it for balance."
)

// rerunnableStatuses are the job statuses an editor may rerun.
var rerunnableStatuses = []string{domain.NewsJobFailed, domain.NewsJobRejected, domain.NewsJobNoStory, domain.NewsJobRefused}

// NewsReviewChecklist is the editor's six confirmations.
type NewsReviewChecklist struct {
	FactsMatchSources         bool `json:"factsMatchSources"`
	NoUnattributedAllegations bool `json:"noUnattributedAllegations"`
	QuotesAccurate            bool `json:"quotesAccurate"`
	BalancedIfPolitical       bool `json:"balancedIfPolitical"`
	ImageCompliant            bool `json:"imageCompliant"`
	RightOfReplyConsidered    bool `json:"rightOfReplyConsidered"`
}

// NewsApproveInput is the approve body.
type NewsApproveInput struct {
	Title     string              `json:"title"`
	Summary   string              `json:"summary"`
	Body      string              `json:"body"`
	Cover     string              `json:"cover"` // keep | branded
	Checklist NewsReviewChecklist `json:"checklist"`
}

// NewsDeskToday is today's spend against the caps.
type NewsDeskToday struct {
	Reports          int64 `json:"reports"`
	ResearchMicroUSD int64 `json:"researchMicroUsd"`
	Images           int64 `json:"images"`
	ImageMicroUSD    int64 `json:"imageMicroUsd"`
}

// NewsJobPage is one page of the research queue.
type NewsJobPage struct {
	Items   []domain.NewsResearchJob `json:"items"`
	Total   int64                    `json:"total"`
	Page    int                      `json:"page"`
	PerPage int                      `json:"perPage"`
	Today   NewsDeskToday            `json:"today"`
}

// Jobs lists the research queue (newest first) with today's spend.
func (d *NewsDesk) Jobs(ctx context.Context, status string, page int) (NewsJobPage, error) {
	if status != "" && !domain.ValidNewsJobStatus(status) {
		return NewsJobPage{}, invalidField("invalid_status", "status", "Choose a research job status.")
	}
	page = max(page, 1)
	items, total, err := d.jobs.List(ctx, domain.NewsJobFilter{Status: status, Skip: (page - 1) * jobsPerPage, Limit: jobsPerPage})
	if err != nil {
		return NewsJobPage{}, err
	}
	if items == nil {
		items = []domain.NewsResearchJob{}
	}
	return NewsJobPage{Items: items, Total: total, Page: page, PerPage: jobsPerPage, Today: d.todaySpend(ctx)}, nil
}

// todaySpend reads today's counters (zero when unavailable).
func (d *NewsDesk) todaySpend(ctx context.Context) NewsDeskToday {
	var t NewsDeskToday
	if d.usage == nil {
		return t
	}
	day := d.today()
	read := func(key string) int64 {
		n, err := d.usage.Count(ctx, day, key)
		if err != nil {
			return 0
		}
		return int64(n)
	}
	t.Reports, t.ResearchMicroUSD = read(keyReports), read(keyResearchUSD)
	t.Images, t.ImageMicroUSD = read(keyImages), read(keyImagesUSD)
	return t
}

// JobForArticle returns the newest research job of an article.
func (d *NewsDesk) JobForArticle(ctx context.Context, articleID string) (*domain.NewsResearchJob, error) {
	return d.jobs.ByArticle(ctx, articleID)
}

// Approve publishes a ready draft over its brief (D4) after checking the
// editor's checklist and edits. No push notification is sent.
func (d *NewsDesk) Approve(ctx context.Context, articleID string, in NewsApproveInput, by AuditActor) (*domain.NewsArticle, error) {
	job, err := d.jobs.ByArticle(ctx, articleID)
	if err != nil {
		return nil, err
	}
	if job.Status != domain.NewsJobReady || job.Draft == nil {
		return nil, ErrJobNotReady
	}
	in.Title, in.Summary, in.Body = strings.TrimSpace(in.Title), strings.TrimSpace(in.Summary), strings.TrimSpace(in.Body)
	if err := d.publishable(ctx, job, in); err != nil {
		return nil, err
	}
	useAI, err := checkApproval(in, job.Draft)
	if err != nil {
		return nil, err
	}
	a, err := d.news.Get(ctx, articleID)
	if err != nil {
		return nil, err
	}
	now := d.stamp(d.now())
	reviewer := strings.TrimSpace(by.Name)
	if reviewer == "" {
		reviewer = defaultReviewerName
	}
	// Claim the job first (ready → approved, atomically), so two editors can
	// never both publish and a concurrent reject wins cleanly; then write the
	// article. If the write fails the claim is given back, so the editor can
	// approve again instead of being left with an approved job and a brief.
	ok, err := d.jobs.Review(ctx, job.ID, domain.NewsJobReview{Status: domain.NewsJobApproved, ReviewedByName: reviewer, ReviewedAt: now})
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrJobNotReady
	}
	applyReport(a, in, job.Draft, useAI, by.ID, reviewer, now)
	if err := d.news.ApplyReport(ctx, *a); err != nil {
		d.reopen(ctx, job.ID, err)
		return nil, err
	}
	return a, nil
}

// reopen puts a job whose approved report could not be written back to
// ready (best effort, with its own deadline: the request may be gone).
func (d *NewsDesk) reopen(ctx context.Context, jobID string, cause error) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), finishTimeout)
	defer cancel()
	ok, err := d.jobs.ReopenReview(ctx, jobID, d.stamp(d.now()))
	if err != nil || !ok {
		d.log.Error("newsdesk: approval not written and the job could not be reopened", "job", jobID, "cause", cause, "err", err)
		return
	}
	d.log.Warn("newsdesk: approval not written; the draft is ready again", "job", jobID, "cause", cause)
}

// publishable refuses a draft the topic rules no longer allow: its lead now
// touches a Tier C topic (a keyword added since it was drafted), or the story
// is political (the draft's flag, its lead or the editor's text) while
// election mode is on.
func (d *NewsDesk) publishable(ctx context.Context, job *domain.NewsResearchJob, in NewsApproveInput) error {
	political := job.Draft.Political || politicalText(in.Title, in.Summary, in.Body)
	return screenError(d.screenLead(ctx, job.LeadTitle, job.LeadTeaser, political, d.Settings(ctx)))
}

// screenError is the editor-facing error for a topic-screen verdict.
func screenError(reason string) error {
	switch reason {
	case blockedSensitive:
		return ErrTopicBlocked
	case blockedElectionMode:
		return ErrElectionMode
	}
	return nil
}

// checkApproval validates the approve body; it reports whether the AI cover is kept.
func checkApproval(in NewsApproveInput, draft *domain.NewsReportDraft) (bool, error) {
	cover := in.Cover
	if cover == "" {
		cover = coverKeep
	}
	if cover != coverKeep && cover != coverBranded {
		return false, invalidField(CodeInvalidCover, "cover", "Choose keep or branded.")
	}
	useAI := cover == coverKeep && draft.Cover.Kind == domain.CoverKindAI && draft.Cover.URL != ""
	if field := missingChecklistItem(in.Checklist, draft.Political, useAI); field != "" {
		return false, invalidField(CodeChecklistIncomplete, field, "Confirm every checklist item before publishing.")
	}
	if n := runeLen(in.Title); n < 1 || n > maxReportTitle {
		return false, invalidField(CodeInvalidTitle, "title", "The headline must be 1 to 90 characters.")
	}
	if n := runeLen(in.Summary); n < 1 || n > maxReportSummary {
		return false, invalidField(CodeInvalidSummary, "summary", "The summary must be 1 to 220 characters.")
	}
	if in.Body == "" || !markersValid(in.Body, len(draft.Sources)) {
		return false, invalidField(CodeInvalidMarkers, "body", "Every [n] in the body must match a numbered source.")
	}
	return useAI, nil
}

// missingChecklistItem names the first unchecked item that applies.
func missingChecklistItem(c NewsReviewChecklist, political, aiCover bool) string {
	switch {
	case !c.FactsMatchSources:
		return "factsMatchSources"
	case !c.NoUnattributedAllegations:
		return "noUnattributedAllegations"
	case !c.QuotesAccurate:
		return "quotesAccurate"
	case political && !c.BalancedIfPolitical:
		return "balancedIfPolitical"
	case aiCover && !c.ImageCompliant:
		return "imageCompliant"
	case !c.RightOfReplyConsidered:
		return "rightOfReplyConsidered"
	}
	return ""
}

// applyReport writes the approved report onto the brief (slug unchanged).
func applyReport(a *domain.NewsArticle, in NewsApproveInput, draft *domain.NewsReportDraft, useAI bool, reviewerID, reviewer, now string) {
	a.Title, a.Summary, a.Body = in.Title, in.Summary, in.Body
	a.Sources, a.Topics, a.Political = draft.Sources, draft.Topics, draft.Political
	a.Tags = appendTags(a.Tags, tagAIAssisted)
	if draft.Political {
		a.Tags = appendTags(a.Tags, tagElectionCoverage)
	}
	a.Tier = domain.NewsTierReport
	if useAI {
		a.CoverImageURL, a.CoverImageKind = draft.Cover.URL, domain.CoverKindAI
		a.CoverImageAlt, a.CoverImageCredit = draft.Cover.Alt, draft.Cover.Credit
	} else {
		a.CoverImageURL, a.CoverImageKind = "", domain.CoverKindBranded
		a.CoverImageAlt, a.CoverImageCredit = brandedAltPrefix+in.Title, ""
	}
	a.ReviewedByID, a.ReviewedByName, a.ReviewedAt = reviewerID, reviewer, now
	a.AutomationLabel = reportLabel(reviewer, draft.Political)
	a.Status = domain.NewsPublished
	if a.PublishedAt == "" {
		a.PublishedAt = now
	}
	a.UpdatedAt = now
	a.ResearchStatus = domain.NewsJobApproved
}

// reportLabel is the AutomationLabel of an approved report.
func reportLabel(reviewer string, political bool) string {
	label := strings.Replace(reportLabelTemplate, "{name}", reviewer, 1)
	if political {
		label += politicalLabel
	}
	return label
}

func appendTags(tags []string, tag string) []string {
	for _, t := range tags {
		if strings.EqualFold(t, tag) {
			return tags
		}
	}
	return append(append([]string{}, tags...), tag)
}

// Reject turns a ready draft down; the brief is untouched.
func (d *NewsDesk) Reject(ctx context.Context, articleID, reason string, by AuditActor) (*domain.NewsResearchJob, error) {
	reason = strings.TrimSpace(reason)
	if n := runeLen(reason); n < minNoteRunes || n > maxNoteRunes {
		return nil, invalidField(CodeInvalidReason, "reason", "Say why (5 to 500 characters).")
	}
	job, err := d.jobs.ByArticle(ctx, articleID)
	if err != nil {
		return nil, err
	}
	reviewer := firstNonEmpty(by.Name, defaultReviewerName)
	ok, err := d.jobs.Review(ctx, job.ID, domain.NewsJobReview{
		Status: domain.NewsJobRejected, ReviewedByName: reviewer, ReviewedAt: d.stamp(d.now()), RejectReason: reason,
	})
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrJobNotReady
	}
	d.mirror(ctx, articleID, domain.NewsJobRejected)
	return d.jobs.Get(ctx, job.ID)
}

// Rerun queues a failed, rejected, no-story or refused job again (attempts
// reset; it counts against the caps). A reasoning_extraction refusal is
// never rerun, and nor is a lead the topic screen now blocks (the job keeps
// its status, so a political story can be rerun once election mode ends).
func (d *NewsDesk) Rerun(ctx context.Context, articleID string) (*domain.NewsResearchJob, error) {
	s := d.Settings(ctx)
	if !d.Researching() || !s.DeskEnabled || !s.LongformEnabled {
		return nil, ErrDeskDisabled
	}
	job, err := d.jobs.ByArticle(ctx, articleID)
	if err != nil {
		return nil, err
	}
	if job.RefusalCategory == "reasoning_extraction" || !slices.Contains(rerunnableStatuses, job.Status) {
		return nil, ErrJobNotRerunnable
	}
	political := job.Draft != nil && job.Draft.Political
	if err := screenError(d.screenLead(ctx, job.LeadTitle, job.LeadTeaser, political, s)); err != nil {
		return nil, err
	}
	ok, err := d.jobs.Rerun(ctx, job.ID, rerunnableStatuses, d.stamp(d.now()))
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrJobNotRerunnable
	}
	d.mirror(ctx, articleID, domain.NewsJobQueued)
	return d.jobs.Get(ctx, job.ID)
}

// Cover regenerates the illustration of a ready draft (one image call,
// subject to the caps and the decision order) or switches it to branded.
func (d *NewsDesk) Cover(ctx context.Context, articleID, action string) (*domain.NewsResearchJob, error) {
	if action != coverRegen && action != coverBranded {
		return nil, invalidField(CodeInvalidAction, "action", "Choose regenerate or branded.")
	}
	job, err := d.jobs.ByArticle(ctx, articleID)
	if err != nil {
		return nil, err
	}
	if job.Status != domain.NewsJobReady || job.Draft == nil {
		return nil, ErrJobNotReady
	}
	draft := job.Draft
	cover := brandedCover(draft.Title, "", draft.Cover.Prompt)
	if action == coverRegen {
		s := d.Settings(ctx)
		req := coverRequest{
			JobID: job.ID, ArticleID: articleID, Title: draft.Title, Body: draft.Body, Scene: sceneFromPrompt(draft.Cover.Prompt),
			Political: draft.Political, Sensitive: tierCHit(job.LeadTitle, job.LeadTeaser, s.ExtraBlockedKeywords),
		}
		if err := d.coverAvailable(ctx, req, s); err != nil {
			return nil, err
		}
		cover = d.makeCover(ctx, req, s)
		if cover.SkippedReason == CoverSkipCap {
			return nil, ErrImageCapReached
		}
	}
	ok, err := d.jobs.SetCover(ctx, job.ID, cover, d.stamp(d.now()))
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrJobNotReady
	}
	return d.jobs.Get(ctx, job.ID)
}

// coverAvailable refuses a regenerate the server cannot serve at all.
func (d *NewsDesk) coverAvailable(ctx context.Context, r coverRequest, s domain.NewsDeskSettings) error {
	switch d.coverSkip(ctx, r, s) {
	case CoverSkipDisabled, CoverSkipNoKey, CoverSkipNoCloudinary:
		return ErrImagesUnavailable
	}
	return nil
}

// AddCorrection appends a dated public correction to an article.
func (d *NewsDesk) AddCorrection(ctx context.Context, articleID, note string) (*domain.NewsArticle, error) {
	note = strings.Join(strings.Fields(note), " ")
	if n := runeLen(note); n < minNoteRunes || n > maxNoteRunes {
		return nil, invalidField(CodeInvalidNote, "note", "Write the correction in 5 to 500 characters.")
	}
	now := d.stamp(d.now())
	if err := d.news.AddCorrection(ctx, articleID, domain.NewsCorrection{At: now, Note: note}, now); err != nil {
		return nil, err
	}
	return d.news.Get(ctx, articleID)
}

// mirror copies a job status onto its article (best effort).
func (d *NewsDesk) mirror(ctx context.Context, articleID, status string) {
	if err := d.news.SetResearchStatus(ctx, articleID, status); err != nil {
		d.log.Warn("newsdesk: could not mirror research status", "article", articleID, "err", err)
	}
}

// BrandedCoverURL is the public URL of an article's branded cover:
// base + "/api/news/" + slug + "/cover.png?v=" + first8(sha1(title)).
func BrandedCoverURL(base, slug, title string) string {
	return strings.TrimRight(base, "/") + "/api/news/" + slug + "/cover.png?v=" + titleVersion(title)
}

// CoverDate formats a timestamp as the cover's date line ("2 Oct 2026").
func CoverDate(ts string) string {
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return ""
	}
	return strconv.Itoa(t.In(calendarZone).Day()) + t.In(calendarZone).Format(" Jan 2006")
}

// titleVersion is the first 8 hex characters of sha1(title): it changes the
// cover URL whenever the headline (and so the rendered cover) changes.
func titleVersion(title string) string {
	sum := sha1.Sum([]byte(title))
	return hex.EncodeToString(sum[:])[:8]
}

// WithBrandedCover applies the public serialisation rule (spec §2.3): an
// automated article without a cover image is given its branded cover URL.
// Only the public handlers use it, so nothing round-trips the computed URL.
func WithBrandedCover(a domain.NewsArticle, base string) domain.NewsArticle {
	if !a.Automated || a.CoverImageURL != "" {
		return a
	}
	a.CoverImageURL = BrandedCoverURL(base, a.Slug, a.Title)
	a.CoverImageKind = domain.CoverKindBranded
	if a.CoverImageAlt == "" {
		a.CoverImageAlt = brandedAltPrefix + a.Title
	}
	return a
}
