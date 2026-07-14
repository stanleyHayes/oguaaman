package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type OtpRepo struct{ c *mongo.Collection }

func NewOtpRepo(db *mongo.Database) *OtpRepo { return &OtpRepo{db.Collection(collOtps)} }

func (r *OtpRepo) Upsert(ctx context.Context, o domain.OTP) error {
	_, _ = r.c.DeleteOne(ctx, bson.M{"_id": o.Identifier})
	_, err := r.c.InsertOne(ctx, o)
	return err
}

func (r *OtpRepo) Get(ctx context.Context, identifier string) (*domain.OTP, error) {
	var o domain.OTP
	if err := r.c.FindOne(ctx, bson.M{"_id": identifier}).Decode(&o); err != nil {
		return nil, notFound("otp", err)
	}
	return &o, nil
}

func (r *OtpRepo) Delete(ctx context.Context, identifier string) error {
	_, err := r.c.DeleteOne(ctx, bson.M{"_id": identifier})
	return err
}
