package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type ReportRepo struct{ c *mongo.Collection }

func NewReportRepo(db *mongo.Database) *ReportRepo { return &ReportRepo{db.Collection(collReports)} }

func (r *ReportRepo) Insert(ctx context.Context, rep domain.Report) error {
	_, err := r.c.InsertOne(ctx, rep)
	return err
}

func (r *ReportRepo) All(ctx context.Context) ([]domain.Report, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.Report{}
	return out, cur.All(ctx, &out)
}

func (r *ReportRepo) Get(ctx context.Context, id string) (*domain.Report, error) {
	var rep domain.Report
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&rep); err != nil {
		return nil, notFound("report", err)
	}
	return &rep, nil
}

func (r *ReportRepo) UpdateStatus(ctx context.Context, id, status, reviewedBy, resolution, at string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"status": status, "reviewedById": reviewedBy, "resolution": resolution, "reviewedAt": at,
	}})
	return err
}

func (r *ReportRepo) OpenCount(ctx context.Context) (int, error) {
	n, err := r.c.CountDocuments(ctx, bson.M{"status": domain.ReportOpen})
	return int(n), err
}
