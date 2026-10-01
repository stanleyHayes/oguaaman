package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

type researchNewsRepo struct{ rows []domain.NewsArticle }

func (r *researchNewsRepo) Insert(_ context.Context, a domain.NewsArticle) error {
	r.rows = append(r.rows, a)
	return nil
}
func (r *researchNewsRepo) Update(context.Context, domain.NewsArticle) error         { return nil }
func (r *researchNewsRepo) Get(context.Context, string) (*domain.NewsArticle, error) { return nil, nil }
func (r *researchNewsRepo) BySlug(context.Context, string) (*domain.NewsArticle, error) {
	return nil, nil
}
func (r *researchNewsRepo) All(context.Context) ([]domain.NewsArticle, error) { return r.rows, nil }
func (r *researchNewsRepo) Published(context.Context) ([]domain.NewsArticle, error) {
	return r.rows, nil
}
func (r *researchNewsRepo) ByAuthor(context.Context, string) ([]domain.NewsArticle, error) {
	return nil, nil
}
func (r *researchNewsRepo) SetPublished(context.Context, string, string, string) error { return nil }
func (r *researchNewsRepo) Delete(context.Context, string) error                       { return nil }
func (r *researchNewsRepo) EraseAuthor(context.Context, string, string) error          { return nil }

type researchDirectiveRepo struct{ rows []domain.Directive }

func (r *researchDirectiveRepo) Insert(_ context.Context, d *domain.Directive) error {
	r.rows = append(r.rows, *d)
	return nil
}
func (r *researchDirectiveRepo) List(context.Context, domain.DirectiveFilters) ([]domain.Directive, error) {
	return r.rows, nil
}
func (r *researchDirectiveRepo) BySlug(context.Context, string) (*domain.Directive, error) {
	return nil, nil
}
func (r *researchDirectiveRepo) ByID(context.Context, string) (*domain.Directive, error) {
	return nil, nil
}
func (r *researchDirectiveRepo) SetStatus(context.Context, string, string) error { return nil }

func TestAutomatedResearchPublishesRelevantNewsOnce(t *testing.T) {
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`<?xml version="1.0"?><rss><channel><item><title>Cape Coast market reopens</title><link>https://example.test/story</link><description>Traders returned to Kotokuraba after planned works.</description></item></channel></rss>`))
	}))
	defer feed.Close()
	news := &researchNewsRepo{}
	directives := &researchDirectiveRepo{}
	worker := NewAutomatedResearchService(news, directives, []ResearchSource{{Name: "Test desk", URL: feed.URL}})
	first, err := worker.Run(context.Background())
	if err != nil || first.PublishedNews != 1 {
		t.Fatalf("first run = %+v, %v", first, err)
	}
	if !news.rows[0].Automated || news.rows[0].SourceURL != "https://example.test/story" || news.rows[0].Status != domain.NewsPublished {
		t.Fatalf("missing automation provenance: %+v", news.rows[0])
	}
	second, err := worker.Run(context.Background())
	if err != nil || second.PublishedNews != 0 || len(news.rows) != 1 {
		t.Fatalf("duplicate run = %+v, rows=%d, err=%v", second, len(news.rows), err)
	}
}

func TestAutomatedAlertRequiresOfficialAttribution(t *testing.T) {
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`<rss><channel><item><title>Cape Coast weather advisory</title><link>https://authority.test/advisory</link><description>Central Region residents should expect heavy rain.</description></item></channel></rss>`))
	}))
	defer feed.Close()
	news := &researchNewsRepo{}
	directives := &researchDirectiveRepo{}
	worker := NewAutomatedResearchService(news, directives, []ResearchSource{{Name: "Official feed", URL: feed.URL, Alert: true}})
	result, err := worker.Run(context.Background())
	if err != nil || result.PublishedAlerts != 0 || len(directives.rows) != 0 {
		t.Fatalf("unattributed alert published: %+v, %v", result, err)
	}
	worker = NewAutomatedResearchService(news, directives, []ResearchSource{{Name: "Official feed", URL: feed.URL, Alert: true, OrgID: "org-fire", OrgSlug: "fire-service", OrgName: "Fire Service"}})
	result, err = worker.Run(context.Background())
	if err != nil || result.PublishedAlerts != 1 || !directives.rows[0].Automated || directives.rows[0].Severity != domain.DirectiveSeverityMedium {
		t.Fatalf("official alert not published safely: %+v, rows=%+v, err=%v", result, directives.rows, err)
	}
}

func serveFeed(t *testing.T, xml string) string {
	t.Helper()
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(xml))
	}))
	t.Cleanup(feed.Close)
	return feed.URL
}

// TestAutomatedNewsStoresOnlyAShortSummary: the full source text is never
// stored — only a <= 60-word summary of the teaser, the source, its author and
// a link to the full story.
func TestAutomatedNewsStoresOnlyAShortSummary(t *testing.T) {
	long := strings.Repeat("Traders in Cape Coast returned to Kotokuraba market today. ", 20)
	full := "FULL ARTICLE TEXT " + strings.Repeat("paragraph ", 400)
	url := serveFeed(t, `<?xml version="1.0"?><rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<item><title>Cape Coast market reopens</title><link>https://example.test/story</link>
<dc:creator>Ama Reporter</dc:creator>
<description>`+long+` [click](https://evil.test)</description>
<content:encoded>`+full+`</content:encoded></item></channel></rss>`)
	news := &researchNewsRepo{}
	worker := NewAutomatedResearchService(news, &researchDirectiveRepo{}, []ResearchSource{{Name: "Test desk", URL: url}})
	if res, err := worker.Run(context.Background()); err != nil || res.PublishedNews != 1 {
		t.Fatalf("run = %+v, %v", res, err)
	}
	a := news.rows[0]
	if strings.Contains(a.Body, "FULL ARTICLE TEXT") || strings.Contains(a.Body, "paragraph") {
		t.Fatal("the source's full text must never be stored")
	}
	summaryPart := strings.SplitN(a.Body, "\n\n", 2)[0]
	if n := len(strings.Fields(summaryPart)); n > automatedSummaryWords {
		t.Errorf("summary has %d words, want <= %d", n, automatedSummaryWords)
	}
	if a.SourceAuthor != "Ama Reporter" || !strings.Contains(a.Body, "By Ama Reporter for Test desk.") {
		t.Errorf("author credit missing: author=%q body=%q", a.SourceAuthor, a.Body)
	}
	if !strings.Contains(a.Body, "[Read the full story at Test desk](https://example.test/story)") {
		t.Errorf("missing link to the full story: %q", a.Body)
	}
	if len(a.Summary) > automatedCardChars+len("…") {
		t.Errorf("card summary too long: %d", len(a.Summary))
	}
}

func TestAutomatedNewsSkipsAllRightsReservedWithoutLicence(t *testing.T) {
	item := `<item><title>Cape Coast news</title><link>https://example.test/a</link><description>Cape Coast story teaser.</description></item>`
	url := serveFeed(t, `<rss><channel><copyright>© 2026 Example Media. All Rights Reserved.</copyright>`+item+`</channel></rss>`)

	news := &researchNewsRepo{}
	worker := NewAutomatedResearchService(news, &researchDirectiveRepo{}, []ResearchSource{{Name: "Reserved", URL: url}})
	res, err := worker.Run(context.Background())
	if err != nil || res.PublishedNews != 0 || res.Skipped != 1 || len(news.rows) != 0 {
		t.Fatalf("reserved feed without licence: %+v, rows=%d, %v", res, len(news.rows), err)
	}

	worker = NewAutomatedResearchService(news, &researchDirectiveRepo{}, []ResearchSource{{Name: "Reserved", URL: url, LicenceRef: "Syndication agreement 2026-09"}})
	if res, err = worker.Run(context.Background()); err != nil || res.PublishedNews != 1 {
		t.Fatalf("licensed feed: %+v, %v", res, err)
	}
}

func TestFeedAuthorNeverStoresEmail(t *testing.T) {
	var it feedItem
	it.Author.Text = "desk@example.test (Kofi Mensah)"
	if got := feedAuthor(it); got != "Kofi Mensah" {
		t.Errorf("name from RSS author = %q", got)
	}
	it.Author.Text = "desk@example.test"
	if got := feedAuthor(it); got != "" {
		t.Errorf("bare email must not be stored, got %q", got)
	}
}
