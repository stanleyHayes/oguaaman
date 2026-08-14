package service

import (
	"context"
	"net/http"
	"net/http/httptest"
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
