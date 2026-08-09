// Command seedlive loads the full Cape Coast corpus into a database that is
// already in use, WITHOUT dropping anything.
//
// Use this — never `cmd/seed` — against production. `cmd/seed` drops 28
// collections including members, which would delete every real account.
//
// Every content write is an idempotent upsert keyed by _id, and members are
// inserted only when absent, so a real account that happens to share a seed id
// keeps its own password, email and role. Safe to re-run.
//
//	go run ./cmd/seedlive              # uses MONGO_URI / MONGO_DB from the env
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
	// The corpus is a few hundred documents over a possibly-remote cluster.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	client, db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		log.Error("mongo connect failed", "err", err)
		os.Exit(1)
	}
	defer func() { _ = client.Disconnect(context.Background()) }()

	written, skipped, err := mongox.SeedUpsert(ctx, db)
	if err != nil {
		log.Error("seedlive failed", "err", err, "written", written)
		os.Exit(1)
	}
	log.Info("seedlive complete — non-destructive upsert",
		"db", cfg.MongoDB, "documentsWritten", written, "existingMembersLeftAlone", skipped)
}
