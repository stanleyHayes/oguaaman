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
}

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
		Items []feedItem `xml:"item"`
	} `xml:"channel"`
	Entries []feedItem `xml:"entry"`
}

type feedItem struct {
	Title       string `xml:"title"`
	Description string `xml:"description"`
	Summary     string `xml:"summary"`
	Content     string `xml:"content"`
	Published   string `xml:"pubDate"`
	Updated     string `xml:"updated"`
	Links       []struct {
		Href string `xml:"href,attr"`
		Rel  string `xml:"rel,attr"`
		Text string `xml:",chardata"`
	} `xml:"link"`
}

type ResearchRun struct{ Sources, Seen, PublishedNews, PublishedAlerts, Skipped int }

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
			link := itemURL(item)
			if link == "" || !relevant(item) {
				result.Skipped++
				continue
			}
			if source.Alert {
				if knownAlerts[link] || source.OrgID == "" || source.OrgName == "" {
					result.Skipped++
					continue
				}
				if err := s.insertAlert(ctx, source, item, link); err != nil {
					failures = append(failures, source.Name+": "+err.Error())
					continue
				}
				knownAlerts[link] = true
				result.PublishedAlerts++
			} else {
				if knownNews[link] {
					result.Skipped++
					continue
				}
				if err := s.insertNews(ctx, source, item, link); err != nil {
					failures = append(failures, source.Name+": "+err.Error())
					continue
				}
				knownNews[link] = true
				result.PublishedNews++
			}
		}
	}
	if len(failures) > 0 {
		sort.Strings(failures)
		return result, fmt.Errorf("research source failures: %s", strings.Join(failures, "; "))
	}
	return result, nil
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
	return append(doc.Channel.Items, doc.Entries...), nil
}

func allowedFeedURL(u *url.URL) bool {
	return u != nil && (u.Scheme == "https" || ((u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1") && u.Scheme == "http"))
}

func (s *AutomatedResearchService) insertNews(ctx context.Context, source ResearchSource, item feedItem, link string) error {
	now := s.now().UTC()
	title := cleanText(item.Title)
	body := cleanText(first(item.Content, item.Description, item.Summary))
	if title == "" || body == "" {
		return nil
	}
	if len(body) > 1200 {
		body = strings.TrimSpace(body[:1200]) + "…"
	}
	label := "Automated from a trusted public source"
	if s.ai != nil {
		if result, err := s.ai.Generate(ctx, automatedAuthorID, "summarize", body, "", ""); err == nil && !result.Simulated && strings.TrimSpace(result.Result) != "" {
			body = strings.TrimSpace(result.Result)
			label = "AI-assisted summary from a trusted public source"
		}
	}
	a := domain.NewsArticle{ID: newID(domain.PrefixNews), Slug: slugify(title) + fmt.Sprintf("-%d", now.UnixNano()%100000), Title: title, Summary: truncate(body, 220), Body: body + "\n\n[Read the original report](" + link + ")", CoverColor: "#123F2D", Tags: []string{"Automated", "Cape Coast"}, AuthorID: automatedAuthorID, AuthorName: "Oguaa automated desk", Status: domain.NewsPublished, CreatedAt: now.Format(time.RFC3339), UpdatedAt: now.Format(time.RFC3339), PublishedAt: now.Format(time.RFC3339), Automated: true, AutomationLabel: label, SourceName: source.Name, SourceURL: link, SourcePublishedAt: first(item.Published, item.Updated)}
	return s.news.Insert(ctx, a)
}

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
