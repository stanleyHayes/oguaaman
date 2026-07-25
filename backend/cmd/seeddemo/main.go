// Command seeddemo upserts a self-contained Creator Monetization showcase
// (a subscribed creator, a fully-filled business with reviews, an artist
// accepting donations, and three campaigns) into an existing database WITHOUT
// dropping anything. Every write is an idempotent upsert keyed by _id, so it is
// safe to run against a live/seeded database and safe to re-run.
package main

import (
	"context"
	"os"
	"time"

	"github.com/oguaa/backend/internal/config"
	mongox "github.com/oguaa/backend/internal/infra/mongo"
	"github.com/oguaa/backend/internal/platform/logger"
)

func main() {
	log := logger.New()
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		log.Error("mongo connect failed", "err", err)
		os.Exit(1)
	}
	defer func() { _ = client.Disconnect(context.Background()) }()

	n, err := mongox.SeedDemo(ctx, db)
	if err != nil {
		log.Error("seeddemo failed", "err", err, "written", n)
		os.Exit(1)
	}
	log.Info("seeddemo complete — non-destructive upsert", "db", cfg.MongoDB, "documentsWritten", n)
}
