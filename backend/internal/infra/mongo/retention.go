package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

// EnsureRetentionIndexes creates the TTL indexes of the retention schedule —
// in-app notifications after 12 months, AI usage counters after 90 days — and
// backfills expiry dates on rows written before the TTLs existed. Idempotent;
// runs at API startup (cmd/server) and with the other indexes (seed / seedlive).
func EnsureRetentionIndexes(ctx context.Context, db *mongo.Database) error {
	if err := EnsureNotificationRetention(ctx, db); err != nil {
		return err
	}
	return EnsureAIUsageRetention(ctx, db)
}
