package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type PledgeRepo struct{ c *mongo.Collection }

func NewPledgeRepo(db *mongo.Database) *PledgeRepo { return &PledgeRepo{db.Collection(collPledges)} }

func (r *PledgeRepo) Insert(ctx context.Context, p domain.Pledge) error {
	_, err := r.c.InsertOne(ctx, p)
	return err
}

func (r *PledgeRepo) ByReference(ctx context.Context, reference string) (*domain.Pledge, error) {
	var p domain.Pledge
	if err := r.c.FindOne(ctx, bson.M{"reference": reference}).Decode(&p); err != nil {
		return nil, notFound("pledge", err)
	}
	return &p, nil
}

func (r *PledgeRepo) UpdateStatus(ctx context.Context, reference, status, at string) error {
	set := bson.M{"status": status}
	if status == domain.PledgeSuccess {
		set["confirmedAt"] = at
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"reference": reference}, bson.M{"$set": set})
	return err
}

func (r *PledgeRepo) SetFeeNet(ctx context.Context, reference string, fee, net int64) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"reference": reference}, bson.M{"$set": bson.M{"feePesewas": fee, "netPesewas": net}})
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

func (r *PledgeRepo) All(ctx context.Context) ([]domain.Pledge, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.Pledge{}
	return out, cur.All(ctx, &out)
}
