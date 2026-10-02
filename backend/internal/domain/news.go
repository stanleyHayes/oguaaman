package domain

import (
	"context"
	"errors"
)

// News lifecycle.
const (
	NewsDraft     = "draft"
	NewsPublished = "published"
)

// Publishing tiers and cover kinds of automated news (spec §2.1, §2.3).
const (
	NewsTierBrief  = "brief"
	NewsTierReport = "report"

	CoverKindAI      = "ai"
	CoverKindBranded = "branded"
	CoverKindUpload  = "upload"
)

// NewsArticle — an editorial post (spec §8.12 editorial). Body is Markdown,
// rendered on the client. Authored and published by curators/stewards.
type NewsArticle struct {
	ID                string   `json:"id" bson:"_id"`
	Slug              string   `json:"slug" bson:"slug"`
	Title             string   `json:"title" bson:"title"`
	Summary           string   `json:"summary,omitempty" bson:"summary,omitempty"`
	Body              string   `json:"body" bson:"body"` // Markdown
	CoverColor        string   `json:"coverColor,omitempty" bson:"coverColor,omitempty"`
	CoverImageURL     string   `json:"coverImageUrl,omitempty" bson:"coverImageUrl,omitempty"`
	Tags              []string `json:"tags,omitempty" bson:"tags,omitempty"`
	AuthorID          string   `json:"authorId" bson:"authorId"`
	AuthorName        string   `json:"authorName" bson:"authorName"`
	Status            string   `json:"status" bson:"status"`
	CreatedAt         string   `json:"createdAt" bson:"createdAt"`
	UpdatedAt         string   `json:"updatedAt" bson:"updatedAt"`
	PublishedAt       string   `json:"publishedAt,omitempty" bson:"publishedAt,omitempty"`
	Automated         bool     `json:"automated,omitempty" bson:"automated,omitempty"`
	AutomationLabel   string   `json:"automationLabel,omitempty" bson:"automationLabel,omitempty"`
	SourceName        string   `json:"sourceName,omitempty" bson:"sourceName,omitempty"`
	SourceURL         string   `json:"sourceUrl,omitempty" bson:"sourceUrl,omitempty"`
	SourcePublishedAt string   `json:"sourcePublishedAt,omitempty" bson:"sourcePublishedAt,omitempty"`
	SourceAuthor      string   `json:"sourceAuthor,omitempty" bson:"sourceAuthor,omitempty"` // original reporter from the feed: "By {author} for {source}"

	// Researched news desk (spec §2.3). All optional; manual articles leave them empty.
	Tier             string           `json:"tier,omitempty" bson:"tier,omitempty"`                         // "" (manual) | brief | report
	Sources          []NewsSource     `json:"sources,omitempty" bson:"sources,omitempty"`                   // report only; numbered 1..n, matches [n] in body
	Topics           []string         `json:"topics,omitempty" bson:"topics,omitempty"`                     // section 2.4 topic enum
	Political        bool             `json:"political,omitempty" bson:"political,omitempty"`               // election coverage
	CoverImageKind   string           `json:"coverImageKind,omitempty" bson:"coverImageKind,omitempty"`     // ai | branded | upload
	CoverImageAlt    string           `json:"coverImageAlt,omitempty" bson:"coverImageAlt,omitempty"`       // alt text of the cover
	CoverImageCredit string           `json:"coverImageCredit,omitempty" bson:"coverImageCredit,omitempty"` // "AI illustration · OpenAI gpt-image-2.5-flare"
	ReviewedByID     string           `json:"-" bson:"reviewedById,omitempty"`                              // the approving editor (private)
	ReviewedByName   string           `json:"reviewedByName,omitempty" bson:"reviewedByName,omitempty"`     // public reviewer byline [A11]
	ReviewedAt       string           `json:"reviewedAt,omitempty" bson:"reviewedAt,omitempty"`             // when the report was approved
	ResearchStatus   string           `json:"-" bson:"researchStatus,omitempty"`                            // mirror of the research job status, for admin filters
	Corrections      []NewsCorrection `json:"corrections,omitempty" bson:"corrections,omitempty"`           // dated, public corrections
}

// NewsSource is one numbered source of a researched report.
type NewsSource struct {
	Name        string `json:"name" bson:"name"` // publisher, e.g. "Ghana News Agency"
	Title       string `json:"title,omitempty" bson:"title,omitempty"`
	URL         string `json:"url" bson:"url"` // https only
	Author      string `json:"author,omitempty" bson:"author,omitempty"`
	PublishedAt string `json:"publishedAt,omitempty" bson:"publishedAt,omitempty"`
	AccessedAt  string `json:"accessedAt,omitempty" bson:"accessedAt,omitempty"`
	Original    bool   `json:"original,omitempty" bson:"original,omitempty"` // the feed lead
}

// NewsCorrection is one dated public correction to an article.
type NewsCorrection struct {
	At   string `json:"at" bson:"at"`
	Note string `json:"note" bson:"note"` // ≤ 500 chars, plain text
}

// NewsRepository persists editorial articles (spec §8.12).
type NewsRepository interface {
	Insert(ctx context.Context, a NewsArticle) error
	Update(ctx context.Context, a NewsArticle) error
	Get(ctx context.Context, id string) (*NewsArticle, error)
	BySlug(ctx context.Context, slug string) (*NewsArticle, error)
	All(ctx context.Context) ([]NewsArticle, error)                       // admin: drafts + published
	Published(ctx context.Context) ([]NewsArticle, error)                 // public
	ByAuthor(ctx context.Context, authorID string) ([]NewsArticle, error) // a writer's own posts, all statuses
	SetPublished(ctx context.Context, id, status, at string) error
	Delete(ctx context.Context, id string) error
	// EraseAuthor serves an author's right to erasure: it rewrites the byline on
	// every article by authorID to displayName and deletes the author's
	// unpublished drafts, so they can never be published under their name.
	EraseAuthor(ctx context.Context, authorID, displayName string) error
	// ApplyReport writes an approved research report onto the article in
	// place (spec §2.9, D4): title, summary, body, sources, topics, political,
	// tags, tier, the cover fields, the reviewer, the automation label,
	// status, publishedAt and updatedAt. The slug never changes.
	ApplyReport(ctx context.Context, a NewsArticle) error
	// SetResearchStatus mirrors the research job's status onto the article.
	SetResearchStatus(ctx context.Context, id, status string) error
	// AddCorrection appends a dated correction and sets updatedAt.
	AddCorrection(ctx context.Context, id string, c NewsCorrection, updatedAt string) error
}

// ── research jobs (spec §2.2, §2.3) ──────────────────────────────────────────

// PrefixNewsResearchJob starts every research-job id.
const PrefixNewsResearchJob = "nrj-"

// Research job statuses.
const (
	NewsJobQueued   = "queued"
	NewsJobRunning  = "running"
	NewsJobReady    = "ready"
	NewsJobApproved = "approved"
	NewsJobRejected = "rejected"
	NewsJobFailed   = "failed"
	NewsJobRefused  = "refused"
	NewsJobNoStory  = "no_story"
	NewsJobBlocked  = "blocked"
	NewsJobStale    = "stale"
)

// ValidNewsJobStatus reports whether s is a research job status.
func ValidNewsJobStatus(s string) bool {
	switch s {
	case NewsJobQueued, NewsJobRunning, NewsJobReady, NewsJobApproved, NewsJobRejected,
		NewsJobFailed, NewsJobRefused, NewsJobNoStory, NewsJobBlocked, NewsJobStale:
		return true
	}
	return false
}

// NewsResearchJob is one long-form research run for an automated brief.
type NewsResearchJob struct {
	ID              string           `json:"id" bson:"_id"`
	ArticleID       string           `json:"articleId" bson:"articleId"`
	LeadURL         string           `json:"leadUrl" bson:"leadUrl"` // unique index
	LeadSource      string           `json:"leadSource" bson:"leadSource"`
	LeadTitle       string           `json:"leadTitle" bson:"leadTitle"`
	LeadTeaser      string           `json:"leadTeaser" bson:"leadTeaser"`
	LeadPublishedAt string           `json:"leadPublishedAt,omitempty" bson:"leadPublishedAt,omitempty"`
	Status          string           `json:"status" bson:"status"` // queued|running|ready|approved|rejected|failed|refused|no_story|blocked|stale
	Attempts        int              `json:"attempts" bson:"attempts"`
	NextAttemptAt   string           `json:"nextAttemptAt,omitempty" bson:"nextAttemptAt,omitempty"`
	LockedUntil     string           `json:"-" bson:"lockedUntil,omitempty"`
	LastError       string           `json:"lastError,omitempty" bson:"lastError,omitempty"`
	RefusalCategory string           `json:"refusalCategory,omitempty" bson:"refusalCategory,omitempty"`
	BlockedReason   string           `json:"blockedReason,omitempty" bson:"blockedReason,omitempty"`
	Model           string           `json:"model,omitempty" bson:"model,omitempty"` // the model that actually answered
	FallbackUsed    bool             `json:"fallbackUsed,omitempty" bson:"fallbackUsed,omitempty"`
	CostMicroUSD    int64            `json:"costMicroUsd" bson:"costMicroUsd"` // Claude, all attempts
	ImageMicroUSD   int64            `json:"imageMicroUsd" bson:"imageMicroUsd"`
	Draft           *NewsReportDraft `json:"draft,omitempty" bson:"draft,omitempty"`
	ReviewedByName  string           `json:"reviewedByName,omitempty" bson:"reviewedByName,omitempty"`
	ReviewedAt      string           `json:"reviewedAt,omitempty" bson:"reviewedAt,omitempty"`
	RejectReason    string           `json:"rejectReason,omitempty" bson:"rejectReason,omitempty"`
	CreatedAt       string           `json:"createdAt" bson:"createdAt"`
	UpdatedAt       string           `json:"updatedAt" bson:"updatedAt"`
}

// NewsReportDraft is the report a research job produced, waiting for an editor.
type NewsReportDraft struct {
	Title            string         `json:"title" bson:"title"`     // ≤ 90 chars
	Summary          string         `json:"summary" bson:"summary"` // ≤ 220 chars
	Body             string         `json:"body" bson:"body"`       // Markdown, [n] markers, no title line, no source list
	Sources          []NewsSource   `json:"sources" bson:"sources"`
	Topics           []string       `json:"topics" bson:"topics"` // 1–3 of the section 2.4 enum
	Political        bool           `json:"political" bson:"political"`
	WordCount        int            `json:"wordCount" bson:"wordCount"`
	CitationCoverage float64        `json:"citationCoverage" bson:"citationCoverage"` // 0..1
	Flags            []string       `json:"flags" bson:"flags"`                       // section 2.6 soft flags
	UncitedClaims    []string       `json:"uncitedClaims" bson:"uncitedClaims"`
	Cover            NewsCoverDraft `json:"cover" bson:"cover"`
	GeneratedAt      string         `json:"generatedAt" bson:"generatedAt"`
}

// NewsCoverDraft is the cover chosen for a report draft.
type NewsCoverDraft struct {
	Kind          string `json:"kind" bson:"kind"`                   // ai | branded
	URL           string `json:"url,omitempty" bson:"url,omitempty"` // Cloudinary secure_url when ai
	Alt           string `json:"alt" bson:"alt"`
	Credit        string `json:"credit,omitempty" bson:"credit,omitempty"`
	Model         string `json:"model,omitempty" bson:"model,omitempty"`
	Prompt        string `json:"prompt,omitempty" bson:"prompt,omitempty"`               // admin-only (job endpoints are admin-only)
	SkippedReason string `json:"skippedReason,omitempty" bson:"skippedReason,omitempty"` // why no AI image (section 2.8)
}

// NewsJobOutcome is how one worker run of a job ended: a terminal status, a
// requeue (Status queued with NextAttemptAt), or a ready draft.
type NewsJobOutcome struct {
	Status          string
	NextAttemptAt   string
	LastError       string
	RefusalCategory string
	BlockedReason   string
	Model           string
	FallbackUsed    bool
	Draft           *NewsReportDraft
	UpdatedAt       string
	// RefundAttempt gives back the attempt Claim counted, for a run that
	// never reached Claude (a budget requeue).
	RefundAttempt bool
}

// NewsJobReview is an editor's decision on a ready job.
type NewsJobReview struct {
	Status         string // approved | rejected
	ReviewedByName string
	ReviewedAt     string
	RejectReason   string
}

// NewsJobFilter selects a page of jobs for the research queue.
type NewsJobFilter struct {
	Status string // "" = every status
	Skip   int
	Limit  int
}

// ErrNewsJobExists is returned by Insert when a job for the lead already exists.
var ErrNewsJobExists = errors.New("news research job already exists")

// NewsResearchJobRepository persists research jobs (collection news_research_jobs).
type NewsResearchJobRepository interface {
	// Insert adds a job; ErrNewsJobExists when one for its leadUrl exists.
	Insert(ctx context.Context, j NewsResearchJob) error
	Get(ctx context.Context, id string) (*NewsResearchJob, error)
	// ByArticle returns the newest job for an article, NotFoundError if none.
	ByArticle(ctx context.Context, articleID string) (*NewsResearchJob, error)
	// List returns one page of jobs, newest first, and the total that match.
	List(ctx context.Context, f NewsJobFilter) ([]NewsResearchJob, int64, error)
	// Claim atomically takes the oldest queued job due at now (nextAttemptAt
	// unset or <= now): status running, lockedUntil, attempts+1. nil when none.
	Claim(ctx context.Context, now, lockedUntil string) (*NewsResearchJob, error)
	// RequeueExpired puts running jobs whose lock expired before now back in
	// the queue and reports how many.
	RequeueExpired(ctx context.Context, now string) (int64, error)
	// Finish records how a run ended (only while the job is running).
	Finish(ctx context.Context, id string, o NewsJobOutcome) error
	// AddCost adds Claude and image spend (micro-USD) to the job.
	AddCost(ctx context.Context, id string, claudeMicroUSD, imageMicroUSD int64) error
	// SetCover replaces the cover of a ready draft; false when not ready.
	SetCover(ctx context.Context, id string, c NewsCoverDraft, updatedAt string) (bool, error)
	// Review moves a ready job to approved/rejected; false when not ready.
	Review(ctx context.Context, id string, r NewsJobReview) (bool, error)
	// ReopenReview moves an approved job back to ready and clears its
	// reviewer, for an approval whose article could not be written; false
	// when the job is not approved.
	ReopenReview(ctx context.Context, id, updatedAt string) (bool, error)
	// Rerun puts a job in one of fromStatuses back in the queue with
	// attempts=0; false when it is in none of them.
	Rerun(ctx context.Context, id string, fromStatuses []string, now string) (bool, error)
}

// NewsDeskSettings is the newsroom's settings document (platform_settings/news_desk, spec §2.10).
// There is deliberately no field that auto-publishes AI-written text (D3).
type NewsDeskSettings struct {
	DeskEnabled               bool     `json:"deskEnabled" bson:"deskEnabled"`                             // default true; master kill switch (RSS pass + worker)
	BriefAutoPublish          bool     `json:"briefAutoPublish" bson:"briefAutoPublish"`                   // default true; political briefs always held
	LongformEnabled           bool     `json:"longformEnabled" bson:"longformEnabled"`                     // default false
	ImagesEnabled             bool     `json:"imagesEnabled" bson:"imagesEnabled"`                         // default false
	ElectionModeManual        bool     `json:"electionModeManual" bson:"electionModeManual"`               // default false; OR'd with the calendar
	MaxReportsPerDay          int      `json:"maxReportsPerDay" bson:"maxReportsPerDay"`                   // default 4; 0..20
	MaxResearchMicroUsdPerDay int64    `json:"maxResearchMicroUsdPerDay" bson:"maxResearchMicroUsdPerDay"` // default 8_000_000; 0..50_000_000
	MaxImagesPerDay           int      `json:"maxImagesPerDay" bson:"maxImagesPerDay"`                     // default 10; 0..50
	MaxImageMicroUsdPerDay    int64    `json:"maxImageMicroUsdPerDay" bson:"maxImageMicroUsdPerDay"`       // default 1_500_000; 0..10_000_000
	MinSources                int      `json:"minSources" bson:"minSources"`                               // default 2; 2..5
	MaxQuoteWords             int      `json:"maxQuoteWords" bson:"maxQuoteWords"`                         // default 25; 10..30
	ExtraBlockedKeywords      []string `json:"extraBlockedKeywords" bson:"extraBlockedKeywords"`           // ≤ 100 items, each 2..40 chars
	Version                   int      `json:"version" bson:"version"`
	UpdatedAt                 string   `json:"updatedAt" bson:"updatedAt"`
	UpdatedByName             string   `json:"updatedByName" bson:"updatedByName"`
}
