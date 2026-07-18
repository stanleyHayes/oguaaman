package domain

import "context"

// AgentReview — a client's rating of an agent after a completed job. One review
// per job; the agent's RatingAvg/RatingCount are recomputed from these.
type AgentReview struct {
	ID             string `json:"id" bson:"_id"`
	JobID          string `json:"jobId" bson:"jobId"`
	AgentID        string `json:"agentId" bson:"agentId"`
	AgentSlug      string `json:"agentSlug" bson:"agentSlug"`
	ClientMemberID string `json:"clientMemberId" bson:"clientMemberId"`
	ClientName     string `json:"clientName,omitempty" bson:"clientName,omitempty"`
	Rating         int    `json:"rating" bson:"rating"` // 1–5
	Body           string `json:"body,omitempty" bson:"body,omitempty"`
	CreatedAt      string `json:"createdAt" bson:"createdAt"`
}

// AgentReviewRepository persists agent reviews.
type AgentReviewRepository interface {
	ByAgent(ctx context.Context, agentID string) ([]AgentReview, error)
	ByJob(ctx context.Context, jobID string) (AgentReview, error)
	Create(ctx context.Context, r AgentReview) (AgentReview, error)
}
