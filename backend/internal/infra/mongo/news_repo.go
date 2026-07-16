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

func (r *NewsRepo) Delete(ctx context.Context, id string) error {
	_, err := r.c.DeleteOne(ctx, bson.M{"_id": id})
	return err
}
