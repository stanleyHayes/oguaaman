package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type NewsRepo struct{ c *mongo.Collection }

func NewNewsRepo(db *mongo.Database) *NewsRepo { return &NewsRepo{db.Collection(collNews)} }

func (r *NewsRepo) Insert(ctx context.Context, a domain.NewsArticle) error {
	_, err := r.c.InsertOne(ctx, a)
	return err
}

func (r *NewsRepo) Update(ctx context.Context, a domain.NewsArticle) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": a.ID}, bson.M{"$set": bson.M{
		"slug": a.Slug, "title": a.Title, "summary": a.Summary, "body": a.Body,
		"coverColor": a.CoverColor, "coverImageUrl": a.CoverImageURL, "tags": a.Tags, "updatedAt": a.UpdatedAt,
		"automated": a.Automated, "automationLabel": a.AutomationLabel, "sourceName": a.SourceName,
		"sourceUrl": a.SourceURL, "sourceAuthor": a.SourceAuthor, "sourcePublishedAt": a.SourcePublishedAt,
	}})
	return err
}

func (r *NewsRepo) Get(ctx context.Context, id string) (*domain.NewsArticle, error) {
	var a domain.NewsArticle
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&a); err != nil {
		return nil, notFound("article", err)
	}
	return &a, nil
}

func (r *NewsRepo) BySlug(ctx context.Context, slug string) (*domain.NewsArticle, error) {
	var a domain.NewsArticle
	if err := r.c.FindOne(ctx, bson.M{"slug": slug}).Decode(&a); err != nil {
		return nil, notFound("article", err)
	}
	return &a, nil
}

func (r *NewsRepo) All(ctx context.Context) ([]domain.NewsArticle, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.NewsArticle{}
	return out, cur.All(ctx, &out)
}

func (r *NewsRepo) Published(ctx context.Context) ([]domain.NewsArticle, error) {
	cur, err := r.c.Find(ctx, bson.M{"status": domain.NewsPublished})
	if err != nil {
		return nil, err
	}
	out := []domain.NewsArticle{}
	return out, cur.All(ctx, &out)
}

func (r *NewsRepo) ByAuthor(ctx context.Context, authorID string) ([]domain.NewsArticle, error) {
	cur, err := r.c.Find(ctx, bson.M{"authorId": authorID})
	if err != nil {
		return nil, err
	}
	out := []domain.NewsArticle{}
	return out, cur.All(ctx, &out)
}

func (r *NewsRepo) SetPublished(ctx context.Context, id, status, at string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"status": status, "publishedAt": at, "updatedAt": at}})
	return err
}

// EraseAuthor rewrites the byline on the author's articles and deletes their
// unpublished drafts (Act 843 right to erasure).
func (r *NewsRepo) EraseAuthor(ctx context.Context, authorID, displayName string) error {
	if authorID == "" {
		return nil
	}
	if _, err := r.c.DeleteMany(ctx, bson.M{"authorId": authorID, "status": bson.M{"$ne": domain.NewsPublished}}); err != nil {
		return err
	}
	_, err := r.c.UpdateMany(ctx, bson.M{"authorId": authorID}, bson.M{"$set": bson.M{"authorName": displayName}})
	return err
}

func (r *NewsRepo) Delete(ctx context.Context, id string) error {
	_, err := r.c.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

// ApplyReport writes an approved research report onto the article in place
// (spec §2.9). The slug is never touched.
func (r *NewsRepo) ApplyReport(ctx context.Context, a domain.NewsArticle) error {
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": a.ID}, bson.M{"$set": bson.M{
		"title": a.Title, "summary": a.Summary, "body": a.Body, "sources": a.Sources, "topics": a.Topics,
		"political": a.Political, "tags": a.Tags, "tier": a.Tier, "coverImageUrl": a.CoverImageURL,
		"coverImageKind": a.CoverImageKind, "coverImageAlt": a.CoverImageAlt, "coverImageCredit": a.CoverImageCredit,
		"reviewedById": a.ReviewedByID, "reviewedByName": a.ReviewedByName, "reviewedAt": a.ReviewedAt,
		"automationLabel": a.AutomationLabel, "status": a.Status, "publishedAt": a.PublishedAt,
		"updatedAt": a.UpdatedAt, "researchStatus": a.ResearchStatus,
	}})
	if err == nil && res.MatchedCount == 0 {
		return &domain.NotFoundError{Entity: "article"}
	}
	return err
}

// SetResearchStatus mirrors the research job's status onto the article.
func (r *NewsRepo) SetResearchStatus(ctx context.Context, id, status string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"researchStatus": status}})
	return err
}

// AddCorrection appends a dated correction and bumps updatedAt.
func (r *NewsRepo) AddCorrection(ctx context.Context, id string, c domain.NewsCorrection, updatedAt string) error {
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{
		"$push": bson.M{"corrections": c},
		"$set":  bson.M{"updatedAt": updatedAt},
	})
	if err == nil && res.MatchedCount == 0 {
		return &domain.NotFoundError{Entity: "article"}
	}
	return err
}
