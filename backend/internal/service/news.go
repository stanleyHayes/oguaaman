package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── news / editorial (spec §8.12) ─────────────────────────────────────────────

// NewsInput is a create/update payload for an article (Body is Markdown).
type NewsInput struct {
	Title         string   `json:"title"`
	Summary       string   `json:"summary"`
	Body          string   `json:"body"`
	CoverColor    string   `json:"coverColor"`
	CoverImageURL string   `json:"coverImageUrl"`
	Tags          []string `json:"tags"`
}

func (s *Service) validateNews(in NewsInput) (string, error) {
	title := strings.TrimSpace(in.Title)
	if len(title) < 3 || len(title) > 160 {
		return "", fmt.Errorf("title must be 3–160 characters")
	}
	if strings.TrimSpace(in.Body) == "" {
		return "", fmt.Errorf("an article needs a body")
	}
	return title, nil
}

// SubmitNews lets a member post a news/blog article from the creator app. It is
// permitted for a "writer" creator OR a manager of a verified authority
// institution. A writer's post enters the newsroom as a draft for editorial
// review (the moderation queue — AllNews surfaces drafts to curators/editors);
// a verified-authority manager auto-publishes, mirroring PostOrgEvent. Curators
// and stewards use the admin newsroom (CreateNews) instead.
func (s *Service) SubmitNews(ctx context.Context, memberID string, in NewsInput) (*domain.NewsArticle, error) {
	m, err := s.members.ByID(ctx, memberID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, &domain.NotFoundError{Entity: "member"}
	}
	isWriter := false
	for _, t := range m.CreatorTypes {
		if t == domain.CreatorWriter {
			isWriter = true
			break
		}
	}
	verified, _, err := s.memberVerified(ctx, m)
	if err != nil {
		return nil, err
	}
	// An "authority manager" is verified through a managed authority org — not
	// by the curator/steward role, which routes through the admin newsroom.
	authorityManager := verified && m.Role != domain.RoleCurator && m.Role != domain.RoleSteward
	if !isWriter && !authorityManager {
		return nil, &domain.ForbiddenError{Reason: "only writers or verified authority managers can post news"}
	}
	title, err := s.validateNews(in)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	a := domain.NewsArticle{
		ID:            "news-" + fmt.Sprintf("%d", time.Now().UnixNano()),
		Slug:          slugify(title) + "-" + fmt.Sprintf("%d", time.Now().UnixNano()%100000),
		Title:         title,
		Summary:       strings.TrimSpace(in.Summary),
		Body:          in.Body,
		CoverColor:    in.CoverColor,
		CoverImageURL: strings.TrimSpace(in.CoverImageURL),
		Tags:          in.Tags,
		AuthorID:      m.ID,
		AuthorName:    m.DisplayName,
		Status:        domain.NewsDraft,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if a.Tags == nil {
		a.Tags = []string{}
	}
	if authorityManager {
		a.Status = domain.NewsPublished
		a.PublishedAt = now
	}
	if err := s.news.Insert(ctx, a); err != nil {
		return nil, err
	}
	return &a, nil
}

// CreateNews drafts a new article authored by the given editor.
func (s *Service) CreateNews(ctx context.Context, authorID, authorName string, in NewsInput) (*domain.NewsArticle, error) {
	title, err := s.validateNews(in)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	a := domain.NewsArticle{
		ID:            "news-" + fmt.Sprintf("%d", time.Now().UnixNano()),
		Slug:          slugify(title) + "-" + fmt.Sprintf("%d", time.Now().UnixNano()%100000),
		Title:         title,
		Summary:       strings.TrimSpace(in.Summary),
		Body:          in.Body,
		CoverColor:    in.CoverColor,
		CoverImageURL: strings.TrimSpace(in.CoverImageURL),
		Tags:          in.Tags,
		AuthorID:      authorID,
		AuthorName:    authorName,
		Status:        domain.NewsDraft,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if a.Tags == nil {
		a.Tags = []string{}
	}
	if err := s.news.Insert(ctx, a); err != nil {
		return nil, err
	}
	return &a, nil
}

// UpdateNews edits an article's content (does not change publication status).
func (s *Service) UpdateNews(ctx context.Context, id string, in NewsInput) (*domain.NewsArticle, error) {
	title, err := s.validateNews(in)
	if err != nil {
		return nil, err
	}
	a, err := s.news.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	a.Title = title
	a.Summary = strings.TrimSpace(in.Summary)
	a.Body = in.Body
	a.CoverColor = in.CoverColor
	a.CoverImageURL = strings.TrimSpace(in.CoverImageURL)
	a.Tags = in.Tags
	if a.Tags == nil {
		a.Tags = []string{}
	}
	a.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := s.news.Update(ctx, *a); err != nil {
		return nil, err
	}
	return a, nil
}

// SetNewsPublished publishes or unpublishes an article.
func (s *Service) SetNewsPublished(ctx context.Context, id string, publish bool) error {
	status := domain.NewsDraft
	if publish {
		status = domain.NewsPublished
	}
	return s.news.SetPublished(ctx, id, status, time.Now().UTC().Format(time.RFC3339))
}

func (s *Service) DeleteNews(ctx context.Context, id string) error {
	return s.news.Delete(ctx, id)
}

// AllNews returns every article (admin), newest first.
func (s *Service) AllNews(ctx context.Context) ([]domain.NewsArticle, error) {
	items, err := s.news.All(ctx)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].UpdatedAt > items[j].UpdatedAt })
	return items, nil
}

// PublishedNews returns published articles, newest first (public).
func (s *Service) PublishedNews(ctx context.Context) ([]domain.NewsArticle, error) {
	items, err := s.news.Published(ctx)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].PublishedAt > items[j].PublishedAt })
	return items, nil
}

// MyNews returns the signed-in member's own articles in ALL statuses (draft +
// published), newest first, so a writer can see posts still pending editorial
// review ("In review") alongside their published work.
func (s *Service) MyNews(ctx context.Context, memberID string) ([]domain.NewsArticle, error) {
	items, err := s.news.ByAuthor(ctx, memberID)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].CreatedAt > items[j].CreatedAt })
	return items, nil
}

// NewsBySlug returns a single published article (public).
func (s *Service) NewsBySlug(ctx context.Context, slug string) (*domain.NewsArticle, error) {
	a, err := s.news.BySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	if a.Status != domain.NewsPublished {
		return nil, &domain.NotFoundError{Entity: "article"}
	}
	return a, nil
}

// NewsForAdmin returns a single article in any status (admin editor).
func (s *Service) NewsForAdmin(ctx context.Context, id string) (*domain.NewsArticle, error) {
	return s.news.Get(ctx, id)
}
