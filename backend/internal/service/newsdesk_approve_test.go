package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// failingNews fails ApplyReport the given number of times, then writes.
type failingNews struct {
	*researchNewsRepo
	fails int
}

func (f *failingNews) ApplyReport(ctx context.Context, a domain.NewsArticle) error {
	if f.fails > 0 {
		f.fails--
		return errors.New("mongo: connection reset")
	}
	return f.researchNewsRepo.ApplyReport(ctx, a)
}

// A failed article write gives the approval back: the draft is ready again
// with no reviewer and the brief untouched, so approving again publishes it
// (before, the job stayed approved, a retry got 409 and rerun refused it).
func TestNewsDeskApproveSurvivesAFailedWrite(t *testing.T) {
	f := newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_ok"))
	job := f.run(t)
	f.desk.news = &failingNews{researchNewsRepo: f.news, fails: 1}
	ctx := context.Background()
	editor := AuditActor{ID: "m-ed", Name: "Kofi Mensah"}

	if _, err := f.desk.Approve(ctx, f.article.ID, approveBody(job.Draft), editor); err == nil {
		t.Fatal("a failed article write was reported as published")
	}
	if j := f.jobs.only(t); j.Status != domain.NewsJobReady || j.ReviewedByName != "" || j.ReviewedAt != "" {
		t.Fatalf("job after the failed write = %+v", j)
	}
	if a := f.articleNow(t); a.Tier != domain.NewsTierBrief || a.Title != f.article.Title || a.ReviewedByName != "" {
		t.Fatalf("brief after the failed write = %+v", a)
	}

	a, err := f.desk.Approve(ctx, f.article.ID, approveBody(job.Draft), editor)
	if err != nil {
		t.Fatalf("approve again = %v", err)
	}
	stored := f.articleNow(t)
	if stored.Tier != domain.NewsTierReport || stored.Status != domain.NewsPublished || stored.Slug != f.article.Slug || a.ReviewedByName != "Kofi Mensah" {
		t.Fatalf("stored = %+v", stored)
	}
	if j := f.jobs.only(t); j.Status != domain.NewsJobApproved || j.ReviewedByName != "Kofi Mensah" {
		t.Fatalf("job = %+v", j)
	}
}
