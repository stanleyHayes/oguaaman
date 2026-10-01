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
	filter := bson.M{"$or": bson.A{bson.M{"reference": reference}, bson.M{"pastReferences": reference}}}
	if err := r.c.FindOne(ctx, filter).Decode(&j); err != nil {
		return domain.AgentJob{}, notFound("job", err)
	}
	return j, nil
}

// MarkFunded is conditional on the job still awaiting its escrow payment.
func (r *AgentJobRepo) MarkFunded(ctx context.Context, id string, escrow domain.AgentJobEscrow, at string) (bool, error) {
	res, err := r.c.UpdateOne(ctx,
		bson.M{"_id": id, "status": domain.JobStatusQuoted, "escrow.status": domain.EscrowPending},
		bson.M{"$set": bson.M{"status": domain.JobStatusFunded, "escrow": escrow, "updatedAt": at}})
	if err != nil {
		return false, err
	}
	return res.ModifiedCount == 1, nil
}

// MarkRefundDue is conditional on the job being cancelled with its escrow
// checkout still pending, so a payment is recorded exactly once.
func (r *AgentJobRepo) MarkRefundDue(ctx context.Context, id string, escrow domain.AgentJobEscrow, reason, at string) (bool, error) {
	res, err := r.c.UpdateOne(ctx,
		bson.M{"_id": id, "status": domain.JobStatusCancelled, "escrow.status": domain.EscrowPending},
		bson.M{"$set": bson.M{"escrow": escrow, "disputeReason": reason, "updatedAt": at}})
	if err != nil {
		return false, err
	}
	return res.ModifiedCount == 1, nil
}

// AddExtraPayment pushes a stray payment onto a job once per reference.
func (r *AgentJobRepo) AddExtraPayment(ctx context.Context, id string, p domain.AgentJobExtraPayment) (bool, error) {
	res, err := r.c.UpdateOne(ctx,
		bson.M{"_id": id, "extraPayments.reference": bson.M{"$ne": p.Reference}},
		bson.M{"$push": bson.M{"extraPayments": p}, "$set": bson.M{"updatedAt": p.RecordedAt}})
	if err != nil {
		return false, err
	}
	return res.ModifiedCount == 1, nil
}

// SetReviewed changes the flag only if it differs, so exactly one caller
// claims (or releases) a job's review slot.
func (r *AgentJobRepo) SetReviewed(ctx context.Context, id string, reviewed bool) (bool, error) {
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": id, "reviewed": bson.M{"$ne": reviewed}}, bson.M{"$set": bson.M{"reviewed": reviewed}})
	if err != nil {
		return false, err
	}
	return res.ModifiedCount == 1, nil
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
	return r.list(ctx, bson.M{opOr: bson.A{
		bson.M{"status": domain.JobStatusDisputed},
		bson.M{"escrow.status": domain.EscrowRefundDue},
		bson.M{"extraPayments": bson.M{"$elemMatch": bson.M{"refundedAt": bson.M{"$exists": false}}}},
	}})
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
