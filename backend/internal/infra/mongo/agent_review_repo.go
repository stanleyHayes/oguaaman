package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// AgentReviewRepo is the Mongo-backed AgentReviewRepository ("agent_reviews").
type AgentReviewRepo struct{ c *mongo.Collection }

func NewAgentReviewRepo(db *mongo.Database) *AgentReviewRepo {
	return &AgentReviewRepo{db.Collection(collAgentReviews)}
}

func (r *AgentReviewRepo) ByAgent(ctx context.Context, agentID string) ([]domain.AgentReview, error) {
	cur, err := r.c.Find(ctx, bson.M{"agentId": agentID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.AgentReview{}
	return out, cur.All(ctx, &out)
}

func (r *AgentReviewRepo) ByJob(ctx context.Context, jobID string) (domain.AgentReview, error) {
	var rv domain.AgentReview
	if err := r.c.FindOne(ctx, bson.M{"jobId": jobID}).Decode(&rv); err != nil {
		return domain.AgentReview{}, notFound("review", err)
	}
	return rv, nil
}

func (r *AgentReviewRepo) Create(ctx context.Context, rv domain.AgentReview) (domain.AgentReview, error) {
	if _, err := r.c.InsertOne(ctx, rv); err != nil {
		return domain.AgentReview{}, err
	}
	return rv, nil
}
