package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// erasureNews is a stateful NewsRepository double for the erasure tests.
type erasureNews struct {
	stubNews
	rows map[string]domain.NewsArticle
}

func (r *erasureNews) Get(_ context.Context, id string) (*domain.NewsArticle, error) {
	a, ok := r.rows[id]
	if !ok {
		return nil, &domain.NotFoundError{Entity: "article"}
	}
	return &a, nil
}

func (r *erasureNews) SetPublished(_ context.Context, id, status, at string) error {
	a := r.rows[id]
	a.Status, a.PublishedAt = status, at
	r.rows[id] = a
	return nil
}

func (r *erasureNews) EraseAuthor(_ context.Context, authorID, name string) error {
	for id, a := range r.rows {
		if a.AuthorID != authorID {
			continue
		}
		if a.Status != domain.NewsPublished {
			delete(r.rows, id)
			continue
		}
		a.AuthorName = name
		r.rows[id] = a
	}
	return nil
}

// erasedMembers reports every member as anonymised by the erasure flow.
type erasedMembers struct{ stubMembers }

func (erasedMembers) ByID(_ context.Context, id string) (*domain.Member, error) {
	return &domain.Member{ID: id, Slug: "former-" + id, DisplayName: formerMemberName}, nil
}

func TestEraseNewsAuthorScrubsBylineAndDrafts(t *testing.T) {
	news := &erasureNews{rows: map[string]domain.NewsArticle{
		"n-pub":   {ID: "n-pub", AuthorID: "m-ama", AuthorName: "Ama Mensah", Status: domain.NewsPublished},
		"n-draft": {ID: "n-draft", AuthorID: "m-ama", AuthorName: "Ama Mensah", Status: domain.NewsDraft},
		"n-other": {ID: "n-other", AuthorID: "m-kofi", AuthorName: "Kofi", Status: domain.NewsPublished},
	}}
	svc := &Service{news: news}
	if err := svc.EraseNewsAuthor(context.Background(), "m-ama"); err != nil {
		t.Fatalf("EraseNewsAuthor: %v", err)
	}
	if got := news.rows["n-pub"].AuthorName; got != formerMemberName {
		t.Errorf("published byline = %q, want %q", got, formerMemberName)
	}
	if _, ok := news.rows["n-draft"]; ok {
		t.Error("the erased author's draft must be deleted")
	}
	if got := news.rows["n-other"].AuthorName; got != "Kofi" {
		t.Errorf("other authors untouched, got %q", got)
	}
}

// tombstoneMembers serves every member as today's erasure tombstone: stamped
// erasedAt, under a random id and a hashed slug (R15).
type tombstoneMembers struct{ stubMembers }

func (tombstoneMembers) ByID(_ context.Context, id string) (*domain.Member, error) {
	return &domain.Member{ID: id, Slug: "former-9f2c4a1b7e3d5c60", DisplayName: formerMemberName,
		Suspended: true, ErasedAt: "2026-10-01T09:00:00Z"}, nil
}

func TestSetNewsPublishedRefusesErasedAuthorsDraft(t *testing.T) {
	for name, members := range map[string]domain.MemberRepository{
		"legacy tombstone":  erasedMembers{},
		"stamped tombstone": tombstoneMembers{},
	} {
		news := &erasureNews{rows: map[string]domain.NewsArticle{
			"n-draft": {ID: "n-draft", AuthorID: "erased-1a2b3c4d5e6f7081", AuthorName: "Ama Mensah", Status: domain.NewsDraft},
		}}
		svc := &Service{news: news, members: members}
		err := svc.SetNewsPublished(context.Background(), "n-draft", true)
		var ve *domain.ValidationError
		if !errors.As(err, &ve) {
			t.Fatalf("%s: want ValidationError, got %v", name, err)
		}
		if news.rows["n-draft"].Status != domain.NewsDraft {
			t.Errorf("%s: draft must stay unpublished", name)
		}
		// Unpublishing is always allowed.
		if err := svc.SetNewsPublished(context.Background(), "n-draft", false); err != nil {
			t.Fatalf("%s: unpublish: %v", name, err)
		}
	}
}
