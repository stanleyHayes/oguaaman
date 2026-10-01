// Command seedmissing tops up empty activity collections in a DEVELOPMENT
// database with deterministic demo activity (moderation, notifications,
// reports, pledges, tickets, subscriptions, promotions, views).
//
// It never drops, deletes, or appends to a collection that already contains a
// document. Before writing a collection it resolves every listing and member
// the fixtures reference; if any is absent the collection is skipped whole and
// reported. Dry-run is the default. The fixtures are invented transaction
// history, so -apply is refused when GO_ENV=production.
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
	os.Exit(run())
}

func run() int {
	apply := flag.Bool("apply", false, "insert fixtures into collections that are completely empty")
	dryRun := flag.Bool("dry-run", false, "inspect and report only (also the default when -apply is omitted)")
	flag.Parse()

	log := logger.New()
	if *apply && *dryRun {
		log.Error("choose either -apply or -dry-run, not both")
		return 2
	}
	if *apply && os.Getenv("GO_ENV") == "production" {
		log.Error("seedmissing -apply refused: GO_ENV=production — demo activity is invented transaction history and must never reach a live database")
		return 1
	}
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		log.Error("mongo connect failed", "err", err)
		return 1
	}
	defer func() { _ = client.Disconnect(context.Background()) }()

	results, err := mongox.SeedMissing(ctx, db, *apply)
	if err != nil {
		log.Error("seedmissing failed", "err", err)
		return 1
	}
	inserted := 0
	for _, result := range results {
		inserted += report(log, result, *apply)
	}
	mode := "dry-run"
	if *apply {
		mode = "apply"
	}
	log.Info("seedmissing complete", "db", cfg.MongoDB, "mode", mode, "inserted", inserted, "intentionallyEmpty", []string{"ai_usage", "stripe_intents"})
	return 0
}

type infoLogger interface {
	Info(msg string, args ...any)
	Warn(msg string, args ...any)
}

// report logs one collection's outcome and returns how many fixtures it inserted.
func report(log infoLogger, result mongox.SeedMissingResult, apply bool) int {
	switch {
	case result.ExistingCount > 0:
		log.Info("collection left unchanged", "collection", result.Collection, "documents", result.ExistingCount)
	case len(result.MissingRefs) > 0:
		log.Warn("collection skipped — fixtures reference records this database does not hold", "collection", result.Collection, "missing", result.MissingRefs)
	case apply:
		log.Info("empty collection seeded", "collection", result.Collection, "inserted", result.InsertedCount, "derivedListingsUpdated", result.UpdatedListings)
		return result.InsertedCount
	default:
		log.Info("empty collection would be seeded", "collection", result.Collection, "fixtures", result.FixtureCount)
	}
	return 0
}
