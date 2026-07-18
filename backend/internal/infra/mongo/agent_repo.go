package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// AgentRepo is the Mongo-backed AgentRepository (collection "agents"). Display
// ordering (verified first, best-rated) is applied by the service; a stable
// createdAt/_id sort here keeps reads deterministic.
type AgentRepo struct{ c *mongo.Collection }

func NewAgentRepo(db *mongo.Database) *AgentRepo {
	return &AgentRepo{db.Collection(collAgents)}
}

func (r *AgentRepo) All(ctx context.Context) ([]domain.Agent, error) {
	cur, err := r.c.Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.Agent{}
	return out, cur.All(ctx, &out)
}

func (r *AgentRepo) ByID(ctx context.Context, id string) (domain.Agent, error) {
	var a domain.Agent
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&a); err != nil {
		return domain.Agent{}, notFound("agent", err)
	}
	return a, nil
}

func (r *AgentRepo) BySlug(ctx context.Context, slug string) (domain.Agent, error) {
	var a domain.Agent
	if err := r.c.FindOne(ctx, bson.M{"slug": slug}).Decode(&a); err != nil {
		return domain.Agent{}, notFound("agent", err)
	}
	return a, nil
}

func (r *AgentRepo) ByMemberID(ctx context.Context, memberID string) (domain.Agent, error) {
	var a domain.Agent
	if err := r.c.FindOne(ctx, bson.M{"memberId": memberID}).Decode(&a); err != nil {
		return domain.Agent{}, notFound("agent", err)
	}
	return a, nil
}

func (r *AgentRepo) Create(ctx context.Context, a domain.Agent) (domain.Agent, error) {
	if _, err := r.c.InsertOne(ctx, a); err != nil {
		return domain.Agent{}, err
	}
	return a, nil
}

func (r *AgentRepo) Update(ctx context.Context, a domain.Agent) (domain.Agent, error) {
	if _, err := r.c.ReplaceOne(ctx, bson.M{"_id": a.ID}, a); err != nil {
		return domain.Agent{}, err
	}
	return a, nil
}

func (r *AgentRepo) Delete(ctx context.Context, id string) error {
	_, err := r.c.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

func (r *AgentRepo) InsertMany(ctx context.Context, agents []domain.Agent) error {
	return insertAll(ctx, r.c, agents)
}
