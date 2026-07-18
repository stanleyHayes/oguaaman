package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// AgentJobRepo is the Mongo-backed AgentJobRepository (collection "agent_jobs").
type AgentJobRepo struct{ c *mongo.Collection }

func NewAgentJobRepo(db *mongo.Database) *AgentJobRepo {
	return &AgentJobRepo{db.Collection(collAgentJobs)}
}

func (r *AgentJobRepo) ByID(ctx context.Context, id string) (domain.AgentJob, error) {
	var j domain.AgentJob
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&j); err != nil {
		return domain.AgentJob{}, notFound("job", err)
	}
	return j, nil
}

func (r *AgentJobRepo) ByReference(ctx context.Context, reference string) (domain.AgentJob, error) {
	var j domain.AgentJob
	if err := r.c.FindOne(ctx, bson.M{"reference": reference}).Decode(&j); err != nil {
		return domain.AgentJob{}, notFound("job", err)
	}
	return j, nil
}

func (r *AgentJobRepo) list(ctx context.Context, q bson.M) ([]domain.AgentJob, error) {
	cur, err := r.c.Find(ctx, q, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.AgentJob{}
	return out, cur.All(ctx, &out)
}

func (r *AgentJobRepo) ForClient(ctx context.Context, memberID string) ([]domain.AgentJob, error) {
	return r.list(ctx, bson.M{"clientMemberId": memberID})
}

func (r *AgentJobRepo) ForAgentMember(ctx context.Context, memberID string) ([]domain.AgentJob, error) {
	return r.list(ctx, bson.M{"agentMemberId": memberID})
}

func (r *AgentJobRepo) Disputed(ctx context.Context) ([]domain.AgentJob, error) {
	return r.list(ctx, bson.M{"status": domain.JobStatusDisputed})
}

func (r *AgentJobRepo) Create(ctx context.Context, j domain.AgentJob) (domain.AgentJob, error) {
	if _, err := r.c.InsertOne(ctx, j); err != nil {
		return domain.AgentJob{}, err
	}
	return j, nil
}

func (r *AgentJobRepo) Update(ctx context.Context, j domain.AgentJob) (domain.AgentJob, error) {
	if _, err := r.c.ReplaceOne(ctx, bson.M{"_id": j.ID}, j); err != nil {
		return domain.AgentJob{}, err
	}
	return j, nil
}
