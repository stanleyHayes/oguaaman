package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// G118: an AI-written summary is held as a draft for an editor, never
// auto-published.
func TestAutomatedResearch_holdsAISummariesAsDrafts(t *testing.T) {
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`<?xml version="1.0"?><rss><channel><item><title>Cape Coast market reopens</title><link>https://example.test/story</link><description>Traders returned to Kotokuraba after planned works.</description></item></channel></rss>`))
	}))
	defer feed.Close()
	llm, _ := anthropicStub(t, func(string) string { return "Kotokuraba market has reopened." }, 0)
	ai := NewAIService("key", "model", 60, 20, newMemUsage())
	ai.anthropicURL = llm.URL

	news := &researchNewsRepo{}
	worker := NewAutomatedResearchService(news, &researchDirectiveRepo{}, []ResearchSource{{Name: "Test desk", URL: feed.URL}}).WithAI(ai)
	run, err := worker.Run(context.Background())
	if err != nil || run.HeldNews != 1 || run.PublishedNews != 0 {
		t.Fatalf("run = %+v, %v; want one held story", run, err)
	}
	a := news.rows[0]
	if a.Status != domain.NewsDraft || a.PublishedAt != "" || a.AutomationLabel != "AI-generated summary of a trusted public source" {
		t.Errorf("AI summary must wait as a labelled draft: %+v", a)
	}
}
