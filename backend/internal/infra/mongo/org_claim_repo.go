package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type OrgClaimRepo struct{ c *mongo.Collection }

func NewOrgClaimRepo(db *mongo.Database) *OrgClaimRepo {
	return &OrgClaimRepo{db.Collection(collOrgClaims)}
}

func (r *OrgClaimRepo) Insert(ctx context.Context, c domain.OrgClaim) error {
	_, err := r.c.InsertOne(ctx, c)
	return err
}

func (r *OrgClaimRepo) Get(ctx context.Context, id string) (*domain.OrgClaim, error) {
	var c domain.OrgClaim
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&c); err != nil {
		return nil, notFound("claim", err)
	}
	return &c, nil
}

func (r *OrgClaimRepo) Pending(ctx context.Context) ([]domain.OrgClaim, error) {
	cur, err := r.c.Find(ctx, bson.M{"status": domain.ClaimPending})
	if err != nil {
		return nil, err
	}
	out := []domain.OrgClaim{}
	return out, cur.All(ctx, &out)
}

func (r *OrgClaimRepo) ByMember(ctx context.Context, memberID string) ([]domain.OrgClaim, error) {
	cur, err := r.c.Find(ctx, bson.M{"memberId": memberID})
	if err != nil {
		return nil, err
	}
	out := []domain.OrgClaim{}
	return out, cur.All(ctx, &out)
}

func (r *OrgClaimRepo) UpdateStatus(ctx context.Context, id, status, reviewedBy, at string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"status": status, "reviewedById": reviewedBy, "reviewedAt": at,
	}})
	return err
}

func (r *OrgClaimRepo) IsManager(ctx context.Context, memberID, orgID string) (bool, error) {
	n, err := r.c.CountDocuments(ctx, bson.M{"memberId": memberID, "orgId": orgID, "status": domain.ClaimApproved})
	return n > 0, err
}

func (r *OrgClaimRepo) ManagedOrgIDs(ctx context.Context, memberID string) ([]string, error) {
	cur, err := r.c.Find(ctx, bson.M{"memberId": memberID, "status": domain.ClaimApproved})
	if err != nil {
		return nil, err
	}
	rows := []domain.OrgClaim{}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, c := range rows {
		ids = append(ids, c.OrgID)
	}
	return ids, nil
}

func (r *OrgClaimRepo) HasActiveClaim(ctx context.Context, memberID, orgID string) (bool, error) {
	n, err := r.c.CountDocuments(ctx, bson.M{
		"memberId": memberID, "orgId": orgID,
		"status": bson.M{"$in": bson.A{domain.ClaimPending, domain.ClaimApproved}},
	})
	return n > 0, err
}
