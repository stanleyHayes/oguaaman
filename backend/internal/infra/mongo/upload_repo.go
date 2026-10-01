package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

// UploadRepo remembers who uploaded each first-party image
// (domain.UploadRepository), so an erased member's files can be found.
type UploadRepo struct{ c *mongo.Collection }

func NewUploadRepo(db *mongo.Database) *UploadRepo { return &UploadRepo{c: db.Collection(collUploads)} }

// EnsureIndexes creates the owner lookup index.
func (r *UploadRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.c.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: fOwnerID, Value: 1}}})
	return err
}

func (r *UploadRepo) Record(ctx context.Context, rec domain.UploadRecord) error {
	_, err := r.c.InsertOne(ctx, rec)
	return err
}

func (r *UploadRepo) ByOwner(ctx context.Context, ownerID string) ([]domain.UploadRecord, error) {
	return findMemberDocs[domain.UploadRecord](ctx, r.c, bson.M{fOwnerID: ownerID})
}

func (r *UploadRepo) DeleteByOwner(ctx context.Context, ownerID string) error {
	_, err := r.c.DeleteMany(ctx, bson.M{fOwnerID: ownerID})
	return err
}
