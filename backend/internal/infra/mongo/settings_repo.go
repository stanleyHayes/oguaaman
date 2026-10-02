package mongo

import (
	"context"
	"errors"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

const (
	collPlatformSettings = "platform_settings"
	collSettingsAudit    = "settings_audit"

	fSettingsVersion = "version"
	fAuditKey        = "key"
	fAuditAt         = "at"

	// maxSettingsAuditRows bounds one Audit read.
	maxSettingsAuditRows = 200
)

// SettingsRepo stores platform settings documents (`platform_settings`, _id =
// key, with a version for optimistic concurrency) and their audit trail
// (`settings_audit`). It implements domain.SettingsRepository and
// domain.SettingsAuditLog.
type SettingsRepo struct {
	settings *mongo.Collection
	audit    *mongo.Collection
}

func NewSettingsRepo(db *mongo.Database) *SettingsRepo {
	return &SettingsRepo{settings: db.Collection(collPlatformSettings), audit: db.Collection(collSettingsAudit)}
}

// EnsureIndexes creates the audit trail's per-key, newest-first index.
func (r *SettingsRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.audit.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: fAuditKey, Value: 1}, {Key: fAuditAt, Value: -1}},
	})
	return err
}

// Get decodes the document stored under key into out.
func (r *SettingsRepo) Get(ctx context.Context, key string, out any) (bool, error) {
	err := r.settings.FindOne(ctx, bson.M{"_id": key}).Decode(out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, nil
	}
	return err == nil, err
}

// Put writes doc under key iff the stored version is expectedVersion (0 =
// the document must not exist yet), then records the audit row. The stored
// version becomes expectedVersion+1 whatever doc carries. A lost race is
// domain.ErrSettingsConflict and writes no audit row.
func (r *SettingsRepo) Put(ctx context.Context, key string, doc any, expectedVersion int, audit domain.SettingsAudit) error {
	if expectedVersion < 0 {
		return domain.ErrSettingsConflict
	}
	stored, err := settingsDocument(key, doc, expectedVersion+1)
	if err != nil {
		return err
	}
	if expectedVersion == 0 {
		if _, err := r.settings.InsertOne(ctx, stored); err != nil {
			if mongo.IsDuplicateKeyError(err) {
				return domain.ErrSettingsConflict
			}
			return err
		}
	} else {
		res, err := r.settings.ReplaceOne(ctx, settingsVersionFilter(key, expectedVersion), stored)
		if err != nil {
			return err
		}
		if res.MatchedCount == 0 {
			return domain.ErrSettingsConflict
		}
	}
	audit.Key = key
	return r.AppendAudit(ctx, audit)
}

// AppendAudit inserts one audit row.
func (r *SettingsRepo) AppendAudit(ctx context.Context, a domain.SettingsAudit) error {
	_, err := r.audit.InsertOne(ctx, a)
	return err
}

// Audit returns up to limit rows for key, newest first.
func (r *SettingsRepo) Audit(ctx context.Context, key string, limit int) ([]domain.SettingsAudit, error) {
	opts := options.Find().
		SetSort(bson.D{{Key: fAuditAt, Value: -1}, {Key: "_id", Value: -1}}).
		SetLimit(int64(clampAuditLimit(limit)))
	cur, err := r.audit.Find(ctx, bson.M{fAuditKey: key}, opts)
	if err != nil {
		return nil, err
	}
	out := []domain.SettingsAudit{}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// clampAuditLimit keeps an audit read between 1 and maxSettingsAuditRows rows
// (50 when unspecified).
func clampAuditLimit(limit int) int {
	switch {
	case limit <= 0:
		return 50
	case limit > maxSettingsAuditRows:
		return maxSettingsAuditRows
	}
	return limit
}

// settingsVersionFilter matches the document under key at exactly version.
func settingsVersionFilter(key string, version int) bson.M {
	return bson.M{"_id": key, fSettingsVersion: version}
}

// settingsDocument is doc as stored: its own fields through its bson tags,
// with _id = key first and version forced to the given value.
func settingsDocument(key string, doc any, version int) (bson.D, error) {
	raw, err := bson.Marshal(doc)
	if err != nil {
		return nil, err
	}
	var fields bson.D
	if err := bson.Unmarshal(raw, &fields); err != nil {
		return nil, err
	}
	out := bson.D{{Key: "_id", Value: key}}
	for _, f := range fields {
		if f.Key == "_id" || f.Key == fSettingsVersion {
			continue
		}
		out = append(out, f)
	}
	return append(out, bson.E{Key: fSettingsVersion, Value: version}), nil
}
