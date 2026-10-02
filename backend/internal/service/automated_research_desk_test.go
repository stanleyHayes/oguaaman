package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// ── the RSS pass with the news desk connected (spec §2.2, test 16) ───────────

const politicalFeed = `<?xml version="1.0"?><rss><channel><item><title>NDC candidate tours Cape Coast market</title><link>https://example.test/politics</link><description>The parliamentary candidate met traders in Kotokuraba.</description></item></channel></rss>`

const marketFeed = `<?xml version="1.0"?><rss><channel><item><title>Cape Coast market reopens</title><link>` + leadURL + `</link><description>Traders returned to Kotokuraba after planned works.</description></item></channel></rss>`

// A political brief is always held as a draft, even with auto-publish on.
func TestAutomatedResearchHoldsPoliticalBriefs(t *testing.T) {
	news := &researchNewsRepo{}
	worker := NewAutomatedResearchService(news, &researchDirectiveRepo{}, []ResearchSource{{Name: "Test desk", URL: serveFeed(t, politicalFeed)}})
	run, err := worker.Run(context.Background())
	if err != nil || run.HeldNews != 1 || run.PublishedNews != 0 {
		t.Fatalf("run = %+v, %v", run, err)
	}
	if a := news.rows[0]; a.Status != domain.NewsDraft || a.PublishedAt != "" || !a.Political || a.Tier != domain.NewsTierBrief {
		t.Fatalf("political brief = %+v", a)
	}
}

// With the desk connected: briefAutoPublish=false holds every brief, the
// desk's kill switch stops the pass, and an eligible brief is queued for
// research without any AI call.
func TestAutomatedResearchWithDesk(t *testing.T) {
	f := newDeskFixture(t, nil)
	f.jobs = newMemJobs()
	f.desk.jobs = f.jobs
	news := &researchNewsRepo{}
	f.desk.news = news
	worker := NewAutomatedResearchService(news, &researchDirectiveRepo{}, []ResearchSource{{Name: "Ghana News Agency", URL: serveFeed(t, marketFeed)}}).WithDesk(f.desk)

	run, err := worker.Run(context.Background())
	if err != nil || run.PublishedNews != 1 {
		t.Fatalf("run = %+v, %v", run, err)
	}
	job := f.jobs.only(t)
	if job.ArticleID != news.rows[0].ID || job.LeadURL != leadURL || job.Status != domain.NewsJobQueued || f.claude.callCount() != 0 {
		t.Fatalf("job = %+v, claude calls %d", job, f.claude.callCount())
	}
	if news.rows[0].ResearchStatus != domain.NewsJobQueued {
		t.Fatalf("brief research status = %q", news.rows[0].ResearchStatus)
	}

	f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.BriefAutoPublish = false })
	news.rows = nil
	f.jobs.rows = map[string]domain.NewsResearchJob{}
	if run, err := worker.Run(context.Background()); err != nil || run.HeldNews != 1 || news.rows[0].Status != domain.NewsDraft {
		t.Fatalf("auto-publish off: run = %+v, %v", run, err)
	}

	f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.DeskEnabled = false })
	news.rows = nil
	if run, err := worker.Run(context.Background()); err != nil || run.Sources != 0 || len(news.rows) != 0 {
		t.Fatalf("desk off: run = %+v, rows %d, %v", run, len(news.rows), err)
	}
}
