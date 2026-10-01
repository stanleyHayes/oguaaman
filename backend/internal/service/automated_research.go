package service

import (
	"context"
	"encoding/xml"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

const automatedAuthorID = "system-automated-research"

// ResearchSource is an explicitly trusted RSS/Atom source. Alert sources must
// additionally identify the verified authority whose official feed they mirror.
type ResearchSource struct {
	Name, URL               string
	Alert                   bool
	OrgID, OrgSlug, OrgName string
	// LicenceRef records the licence or written permission under which Oguaa
	// may republish this news source's summaries. Without it, items whose feed
	// marks them "all rights reserved" are skipped.
	LicenceRef string
}

// Automated news copy limits: only a short summary of the source's own teaser
// is stored — never its full text — plus a link back to the full story.
const (
	automatedSummaryWords = 60
	automatedCardChars    = 220
	maxFeedAuthorChars    = 120
)

// AutomatedResearchService ingests trusted feeds. It never crawls arbitrary
// user URLs: operators own the allowlist, which is the SSRF and provenance
// boundary for this background worker.
type AutomatedResearchService struct {
	news       domain.NewsRepository
	directives domain.DirectiveRepository
	sources    []ResearchSource
	client     *http.Client
	now        func() time.Time
	ai         *AIService
}

func NewAutomatedResearchService(news domain.NewsRepository, directives domain.DirectiveRepository, sources []ResearchSource) *AutomatedResearchService {
	client := &http.Client{Timeout: 15 * time.Second}
	client.CheckRedirect = func(req *http.Request, _ []*http.Request) error {
		if !allowedFeedURL(req.URL) {
			return fmt.Errorf("feed redirect must use https")
		}
		return nil
	}
	return &AutomatedResearchService{news: news, directives: directives, sources: sources, client: client, now: time.Now}
}

// WithAI enables grounded summarisation of fetched source text. Simulated
// output is ignored so an unconfigured provider can never invent public copy.
func (s *AutomatedResearchService) WithAI(ai *AIService) *AutomatedResearchService {
	s.ai = ai
	return s
}

type feedDocument struct {
	Channel struct {
		Items     []feedItem `xml:"item"`
		Copyright string     `xml:"copyright"`
		Rights    string     `xml:"rights"`  // dc:rights
		License   string     `xml:"license"` // media:license
	} `xml:"channel"`
	Rights  string     `xml:"rights"` // Atom feed-level rights
	Entries []feedItem `xml:"entry"`
}

// channelRights joins every channel/feed-level rights statement.
func (d feedDocument) channelRights() string {
	return strings.Join([]string{d.Channel.Copyright, d.Channel.Rights, d.Channel.License, d.Rights}, " ")
}

type feedItem struct {
	Title       string `xml:"title"`
	Description string `xml:"description"`
	Summary     string `xml:"summary"`
	Content     string `xml:"content"`
	Published   string `xml:"pubDate"`
	Updated     string `xml:"updated"`
	Creator     string `xml:"creator"` // dc:creator
	Author      struct {
		Name string `xml:"name"`      // Atom <author><name>
		Text string `xml:",chardata"` // RSS <author>email (Name)</author>
	} `xml:"author"`
	Rights  string `xml:"rights"`  // dc:rights / Atom rights
	License string `xml:"license"` // media:license
	// ChannelRights carries the feed-level rights statement onto each item
	// (set after decoding, not read from the item XML).
	ChannelRights string `xml:"-"`
	Links         []struct {
		Href string `xml:"href,attr"`
		Rel  string `xml:"rel,attr"`
		Text string `xml:",chardata"`
	} `xml:"link"`
}

// ResearchRun counts one pass. HeldNews are AI-summarised stories saved as
// drafts for an editor instead of being published.
type ResearchRun struct{ Sources, Seen, PublishedNews, HeldNews, PublishedAlerts, Skipped int }

// countNews records one stored story as held (a draft) or published.
func (r *ResearchRun) countNews(held bool) {
	if held {
		r.HeldNews++
		return
	}
	r.PublishedNews++
}

func (s *AutomatedResearchService) Run(ctx context.Context) (ResearchRun, error) {
	var result ResearchRun
	newsRows, err := s.news.All(ctx)
	if err != nil {
		return result, err
	}
	knownNews := map[string]bool{}
	for _, row := range newsRows {
		if row.SourceURL != "" {
			knownNews[row.SourceURL] = true
		}
	}
	directiveRows, err := s.directives.List(ctx, domain.DirectiveFilters{IncludeAllStatuses: true})
	if err != nil {
		return result, err
	}
	knownAlerts := map[string]bool{}
	for _, row := range directiveRows {
		if row.SourceURL != "" {
			knownAlerts[row.SourceURL] = true
		}
	}

	var failures []string
	for _, source := range s.sources {
		result.Sources++
		items, fetchErr := s.fetch(ctx, source)
		if fetchErr != nil {
			failures = append(failures, source.Name+": "+fetchErr.Error())
			continue
		}
		for _, item := range items {
			result.Seen++
			if err := s.ingestItem(ctx, source, item, knownNews, knownAlerts, &result); err != nil {
				failures = append(failures, source.Name+": "+err.Error())
			}
		}
	}
	if len(failures) > 0 {
		sort.Strings(failures)
		return result, fmt.Errorf("research source failures: %s", strings.Join(failures, "; "))
	}
	return result, nil
}

// ingestItem publishes one relevant, not-yet-seen feed item as an alert or a
// news summary, updating the run counters.
func (s *AutomatedResearchService) ingestItem(ctx context.Context, source ResearchSource, item feedItem, knownNews, knownAlerts map[string]bool, result *ResearchRun) error {
	link := itemURL(item)
	if link == "" || !relevant(item) {
		result.Skipped++
		return nil
	}
	if source.Alert {
		if knownAlerts[link] || source.OrgID == "" || source.OrgName == "" {
			result.Skipped++
			return nil
		}
		if err := s.insertAlert(ctx, source, item, link); err != nil {
			return err
		}
		knownAlerts[link] = true
		result.PublishedAlerts++
		return nil
	}
	if knownNews[link] {
		result.Skipped++
		return nil
	}
	stored, held, err := s.insertNews(ctx, source, item, link)
	if err != nil {
		return err
	}
	if !stored {
		result.Skipped++
		return nil
	}
	knownNews[link] = true
	result.countNews(held)
	return nil
}

func (s *AutomatedResearchService) fetch(ctx context.Context, source ResearchSource) ([]feedItem, error) {
	u, err := url.Parse(source.URL)
	if err != nil || !allowedFeedURL(u) {
		return nil, fmt.Errorf("source must use https")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source.URL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Oguaa-Automated-Research/1.0")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("feed returned %d", resp.StatusCode)
	}
	var doc feedDocument
	if err := xml.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&doc); err != nil {
		return nil, err
	}
	items := append(doc.Channel.Items, doc.Entries...)
	rights := doc.channelRights()
	for i := range items {
		items[i].ChannelRights = rights
	}
	return items, nil
}

func allowedFeedURL(u *url.URL) bool {
	return u != nil && (u.Scheme == "https" || ((u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1") && u.Scheme == "http"))
}

// insertNews stores a short summary of a news item — never the source's full
// text. The summary comes from the feed's own teaser (<description>/<summary>,
// never <content:encoded>/<content>), optionally rewritten by the AI summariser,
// and is capped at about 60 words. The article credits the source and, when the
// feed names one, the original author, and links to the full story. Items whose
// feed reserves all rights are skipped unless the operator recorded a licence
// for the source. An AI-written summary of reporting about real people is held
// as a draft for an editor (G118) instead of being published unread.
// It reports whether an article was stored, and whether it was held.
func (s *AutomatedResearchService) insertNews(ctx context.Context, source ResearchSource, item feedItem, link string) (stored, held bool, err error) {
	if source.LicenceRef == "" && rightsReserved(item.Rights, item.License, item.ChannelRights) {
		return false, false, nil
	}
	title := cleanText(item.Title)
	teaser := cleanText(first(item.Description, item.Summary))
	if title == "" || teaser == "" {
		return false, false, nil
	}
	summary := truncateWords(teaser, automatedSummaryWords)
	label := "Automated summary of a trusted public source"
	if s.ai != nil {
		// The desk has its own AI budget, separate from members' (F119).
		if result, err := s.ai.GenerateForSystem(ctx, "summarize", summary); err == nil && !result.Simulated && strings.TrimSpace(result.Result) != "" {
			summary = truncateWords(cleanText(result.Result), automatedSummaryWords)
			label = "AI-generated summary of a trusted public source"
			held = true
		}
	}
	author := feedAuthor(item)
	now := s.now().UTC()
	stamp := now.Format(time.RFC3339)
	a := domain.NewsArticle{
		ID: newID(domain.PrefixNews), Slug: slugify(title) + fmt.Sprintf("-%d", now.UnixNano()%100000),
		Title: title, Summary: truncate(summary, automatedCardChars),
		Body:       automatedNewsBody(summary, author, source.Name, link),
		CoverColor: "#123F2D", Tags: []string{"Automated", "Cape Coast"},
		AuthorID: automatedAuthorID, AuthorName: "Oguaa automated desk",
		Status: domain.NewsPublished, CreatedAt: stamp, UpdatedAt: stamp, PublishedAt: stamp,
		Automated: true, AutomationLabel: label,
		SourceName: source.Name, SourceURL: link, SourceAuthor: author,
		SourcePublishedAt: first(item.Published, item.Updated),
	}
	if held {
		a.Status, a.PublishedAt = domain.NewsDraft, ""
	}
	if err := s.news.Insert(ctx, a); err != nil {
		return false, false, err
	}
	return true, held, nil
}

// automatedNewsBody renders the stored Markdown: the short summary, the
// original byline when known, and the link to the full story at the source.
func automatedNewsBody(summary, author, sourceName, link string) string {
	var b strings.Builder
	b.WriteString(escapeMarkdown(summary))
	if author != "" {
		b.WriteString("\n\nBy " + escapeMarkdown(author) + " for " + escapeMarkdown(sourceName) + ".")
	}
	b.WriteString("\n\n[Read the full story at " + escapeMarkdown(sourceName) + "](" + markdownURL.Replace(link) + ")")
	return b.String()
}

// rightsReserved reports whether any rights statement reserves all rights.
func rightsReserved(statements ...string) bool {
	for _, st := range statements {
		if strings.Contains(strings.ToLower(st), "all rights reserved") {
			return true
		}
	}
	return false
}

// feedAuthor returns the item's credited author: <dc:creator>, Atom
// <author><name>, or the name part of an RSS "email (Name)" <author>. A bare
// email address is never stored.
func feedAuthor(item feedItem) string {
	if v := cleanText(first(item.Creator, item.Author.Name)); v != "" {
		return truncate(v, maxFeedAuthorChars)
	}
	raw := cleanText(item.Author.Text)
	if open, end := strings.Index(raw, "("), strings.LastIndex(raw, ")"); open >= 0 && end > open {
		return truncate(strings.TrimSpace(raw[open+1:end]), maxFeedAuthorChars)
	}
	if strings.Contains(raw, "@") {
		return ""
	}
	return truncate(raw, maxFeedAuthorChars)
}

// truncateWords keeps at most n words, adding an ellipsis when it cuts.
func truncateWords(v string, n int) string {
	words := strings.Fields(v)
	if len(words) <= n {
		return strings.Join(words, " ")
	}
	return strings.Join(words[:n], " ") + "…"
}

var (
	markdownSpecial = strings.NewReplacer(`\`, `\\`, "[", `\[`, "]", `\]`)
	markdownURL     = strings.NewReplacer(" ", "%20", "(", "%28", ")", "%29")
)

// escapeMarkdown neutralises link syntax in feed-supplied text so a feed cannot
// inject its own links into the rendered article (raw HTML is never rendered).
func escapeMarkdown(v string) string { return markdownSpecial.Replace(v) }

func (s *AutomatedResearchService) insertAlert(ctx context.Context, source ResearchSource, item feedItem, link string) error {
	now := s.now().UTC()
	title := cleanText(item.Title)
	body := cleanText(first(item.Content, item.Description, item.Summary))
	if title == "" || body == "" {
		return nil
	}
	d := &domain.Directive{ID: fmt.Sprintf("dir-auto-%d", now.UnixNano()), Slug: slugify(title) + fmt.Sprintf("-%d", now.UnixNano()%100000), Title: title, Body: truncate(body, 1000), Severity: domain.DirectiveSeverityMedium, Kind: domain.DirectiveKindAdvisory, Action: "Follow the linked authority source for the latest official instructions.", TownID: "oguaa", IssuedByOrgID: source.OrgID, IssuedByOrgSlug: source.OrgSlug, IssuedByName: source.OrgName, EffectiveFrom: now.Format(time.RFC3339), EffectiveUntil: now.Add(24 * time.Hour).Format(time.RFC3339), Status: domain.DirectiveStatusActive, CreatedAt: now.Format(time.RFC3339), CreatedByID: automatedAuthorID, Automated: true, AutomationLabel: "Automated from an official authority feed", SourceName: source.Name, SourceURL: link}
	return s.directives.Insert(ctx, d)
}

var tagsRE = regexp.MustCompile(`<[^>]+>`)

func cleanText(v string) string {
	return strings.Join(strings.Fields(html.UnescapeString(tagsRE.ReplaceAllString(v, " "))), " ")
}
func first(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
func truncate(v string, n int) string {
	if len(v) <= n {
		return v
	}
	return strings.TrimSpace(v[:n]) + "…"
}
func itemURL(item feedItem) string {
	for _, link := range item.Links {
		if link.Rel == "" || link.Rel == "alternate" {
			return strings.TrimSpace(first(link.Href, link.Text))
		}
	}
	return ""
}
func relevant(item feedItem) bool {
	haystack := strings.ToLower(item.Title + " " + item.Description + " " + item.Summary + " " + item.Content)
	for _, term := range []string{"cape coast", "oguaa", "central region", "elmina", "komenda", "fetu afahye"} {
		if strings.Contains(haystack, term) {
			return true
		}
	}
	return false
}
