// Command seedmissing safely tops up empty user-facing Mongo collections with
// deterministic demo activity. It never drops, deletes, or appends to a
// collection that already contains a document. Dry-run is the default.
package main

import (
	"context"
	"flag"
	"os"
	"time"

	"github.com/oguaa/backend/internal/config"
	mongox "github.com/oguaa/backend/internal/infra/mongo"
	"github.com/oguaa/backend/internal/platform/logger"
)

func main() {
	apply := flag.Bool("apply", false, "insert fixtures into collections that are completely empty")
	dryRun := flag.Bool("dry-run", false, "inspect and report only (also the default when -apply is omitted)")
	flag.Parse()

	log := logger.New()
	if *apply && *dryRun {
		log.Error("choose either -apply or -dry-run, not both")
		os.Exit(2)
	}
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		log.Error("mongo connect failed", "err", err)
		os.Exit(1)
	}
	defer func() { _ = client.Disconnect(context.Background()) }()

	results, err := mongox.SeedMissing(ctx, db, *apply)
	if err != nil {
		log.Error("seedmissing failed", "err", err)
		os.Exit(1)
	}
	inserted := 0
	for _, result := range results {
		if result.ExistingCount > 0 {
			log.Info("collection left unchanged", "collection", result.Collection, "documents", result.ExistingCount)
			continue
		}
		if *apply {
			log.Info("empty collection seeded", "collection", result.Collection, "inserted", result.InsertedCount, "derivedListingsUpdated", result.UpdatedListings)
			inserted += result.InsertedCount
			continue
		}
		log.Info("empty collection would be seeded", "collection", result.Collection, "fixtures", result.FixtureCount)
	}
	mode := "dry-run"
	if *apply {
		mode = "apply"
	}
	log.Info("seedmissing complete", "db", cfg.MongoDB, "mode", mode, "inserted", inserted, "intentionallyEmpty", []string{"ai_usage", "stripe_intents"})
}
