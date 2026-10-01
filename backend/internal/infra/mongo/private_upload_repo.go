package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// PrivateUploadRepo stores encrypted identity/vetting documents
// (domain.PrivateUploadRepository). Documents are small (≤ 5 MB), so the
// ciphertext lives in the document itself — durable across redeploys, unlike
// the API's ephemeral disk.
type PrivateUploadRepo struct{ c *mongo.Collection }

func NewPrivateUploadRepo(db *mongo.Database) *PrivateUploadRepo {
	return &PrivateUploadRepo{c: db.Collection(collPrivateUploads)}
}

// EnsureIndexes creates the owner lookup index.
func (r *PrivateUploadRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.c.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: fOwnerID, Value: 1}}})
	return err
}

func (r *PrivateUploadRepo) Insert(ctx context.Context, u domain.PrivateUpload) error {
	_, err := r.c.InsertOne(ctx, u)
	return err
}

func (r *PrivateUploadRepo) ByID(ctx context.Context, id string) (*domain.PrivateUpload, error) {
	var u domain.PrivateUpload
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&u); err != nil {
		return nil, notFound("document", err)
	}
	return &u, nil
}

func (r *PrivateUploadRepo) ByOwner(ctx context.Context, ownerID string) ([]domain.PrivateUpload, error) {
	return findMemberDocs[domain.PrivateUpload](ctx, r.c, bson.M{fOwnerID: ownerID},
		options.Find().SetProjection(bson.M{"ciphertext": 0}).SetSort(bson.D{{Key: "createdAt", Value: -1}}))
}

// OwnerUsage counts the owner's documents and sums their sizes. The quota
// keeps an owner to a handful of documents, so reading only the size field of
// each is cheap.
func (r *PrivateUploadRepo) OwnerUsage(ctx context.Context, ownerID string) (int, int64, error) {
	rows, err := findMemberDocs[struct {
		Size int64 `bson:"size"`
	}](ctx, r.c, bson.M{fOwnerID: ownerID}, options.Find().SetProjection(bson.M{"size": 1}))
	if err != nil {
		return 0, 0, err
	}
	var total int64
	for _, row := range rows {
		total += row.Size
	}
	return len(rows), total, nil
}

func (r *PrivateUploadRepo) DeleteByOwner(ctx context.Context, ownerID string) error {
	_, err := r.c.DeleteMany(ctx, bson.M{fOwnerID: ownerID})
	return err
}
