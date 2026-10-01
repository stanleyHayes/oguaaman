package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

// Fields shared by the payment ledgers (pledges, tickets, subscriptions,
// promotions), which all key on the provider reference and reuse the pledge
// status constants.
const (
	fieldReference   = "reference"
	fieldStatus      = "status"
	fieldConfirmedAt = "confirmedAt"
)

// unsettled matches a payment record by reference unless it has already
// succeeded. Every pending→success (and →failed) write filters on it, so a
// settled record is never re-settled or knocked back to failed.
func unsettled(reference string) bson.M {
	return bson.M{fieldReference: reference, fieldStatus: bson.M{"$ne": domain.PledgeSuccess}}
}

// won turns a conditional update's result into "did THIS call make the
// transition" — the single decision point for concurrent confirms.
func won(res *mongo.UpdateResult, err error) (bool, error) {
	if err != nil {
		return false, err
	}
	return res.ModifiedCount == 1, nil
}

// Fields of the grant a settled payment still owes (see domain grantPending).
const (
	fieldGrantPending  = "grantPending"
	fieldFeaturedUntil = "featuredUntil"
)

// markGranted clears a settled payment's grantPending flag once what it
// bought has been applied.
func markGranted(ctx context.Context, c *mongo.Collection, reference string) error {
	_, err := c.UpdateOne(ctx, bson.M{fieldReference: reference}, bson.M{"$unset": bson.M{fieldGrantPending: ""}})
	return err
}

type PledgeRepo struct{ c *mongo.Collection }

func NewPledgeRepo(db *mongo.Database) *PledgeRepo { return &PledgeRepo{db.Collection(collPledges)} }

func (r *PledgeRepo) Insert(ctx context.Context, p domain.Pledge) error {
	_, err := r.c.InsertOne(ctx, p)
	return err
}

func (r *PledgeRepo) ByReference(ctx context.Context, reference string) (*domain.Pledge, error) {
	var p domain.Pledge
	if err := r.c.FindOne(ctx, bson.M{fieldReference: reference}).Decode(&p); err != nil {
		return nil, notFound("pledge", err)
	}
	return &p, nil
}

// MarkSuccess settles a pledge and its fee split in one conditional write; see
// domain.PledgeRepository for the concurrency contract.
func (r *PledgeRepo) MarkSuccess(ctx context.Context, reference, at string, fee, net int64) (bool, error) {
	return won(r.c.UpdateOne(ctx, unsettled(reference), bson.M{"$set": bson.M{
		fieldStatus: domain.PledgeSuccess, fieldConfirmedAt: at, "feePesewas": fee, "netPesewas": net, fieldGrantPending: true,
	}}))
}

// MarkGranted clears grantPending once the pledge's target is credited.
func (r *PledgeRepo) MarkGranted(ctx context.Context, reference string) error {
	return markGranted(ctx, r.c, reference)
}

// MarkFailed records a failed payment unless the pledge already succeeded.
func (r *PledgeRepo) MarkFailed(ctx context.Context, reference string) error {
	_, err := r.c.UpdateOne(ctx, unsettled(reference), bson.M{"$set": bson.M{fieldStatus: domain.PledgeFailed}})
	return err
}

func (r *PledgeRepo) ByMember(ctx context.Context, memberID string) ([]domain.Pledge, error) {
	cur, err := r.c.Find(ctx, bson.M{"memberId": memberID})
	if err != nil {
		return nil, err
	}
	out := []domain.Pledge{}
	return out, cur.All(ctx, &out)
}

func (r *PledgeRepo) ByProject(ctx context.Context, projectID string) ([]domain.Pledge, error) {
	cur, err := r.c.Find(ctx, bson.M{"projectId": projectID})
	if err != nil {
		return nil, err
	}
	out := []domain.Pledge{}
	return out, cur.All(ctx, &out)
}

func (r *PledgeRepo) All(ctx context.Context) ([]domain.Pledge, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.Pledge{}
	return out, cur.All(ctx, &out)
}
