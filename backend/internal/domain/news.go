package domain

import "context"

// News lifecycle.
const (
	NewsDraft     = "draft"
	NewsPublished = "published"
)

// NewsArticle — an editorial post (spec §8.12 editorial). Body is Markdown,
// rendered on the client. Authored and published by curators/stewards.
type NewsArticle struct {
	ID            string   `json:"id" bson:"_id"`
	Slug          string   `json:"slug" bson:"slug"`
	Title         string   `json:"title" bson:"title"`
	Summary       string   `json:"summary,omitempty" bson:"summary,omitempty"`
	Body          string   `json:"body" bson:"body"` // Markdown
	CoverColor    string   `json:"coverColor,omitempty" bson:"coverColor,omitempty"`
	CoverImageURL string   `json:"coverImageUrl,omitempty" bson:"coverImageUrl,omitempty"`
	Tags          []string `json:"tags,omitempty" bson:"tags,omitempty"`
	AuthorID      string   `json:"authorId" bson:"authorId"`
	AuthorName    string   `json:"authorName" bson:"authorName"`
	Status        string   `json:"status" bson:"status"`
	CreatedAt     string   `json:"createdAt" bson:"createdAt"`
	UpdatedAt     string   `json:"updatedAt" bson:"updatedAt"`
	PublishedAt   string   `json:"publishedAt,omitempty" bson:"publishedAt,omitempty"`
}

// NewsRepository persists editorial articles (spec §8.12).
type NewsRepository interface {
	Insert(ctx context.Context, a NewsArticle) error
	Update(ctx context.Context, a NewsArticle) error
	Get(ctx context.Context, id string) (*NewsArticle, error)
	BySlug(ctx context.Context, slug string) (*NewsArticle, error)
	All(ctx context.Context) ([]NewsArticle, error)       // admin: drafts + published
	Published(ctx context.Context) ([]NewsArticle, error) // public
	SetPublished(ctx context.Context, id, status, at string) error
	Delete(ctx context.Context, id string) error
}
