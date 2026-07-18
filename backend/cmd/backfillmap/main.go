// Command backfillmap safely adds known seed coordinates to existing map
// records. It never replaces a non-null coordinate. Dry-run is the default.
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
	apply := flag.Bool("apply", false, "write missing map coordinates (dry-run when omitted)")
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

	results, err := mongox.BackfillMapCoordinates(ctx, db, *apply)
	if err != nil {
		log.Error("map coordinate backfill failed", "err", err)
		os.Exit(1)
	}

	mode := "dry-run"
	if *apply {
		mode = "apply"
	}
	var matched, modified int64
	for _, result := range results {
		log.Info(
			"map coordinate backfill collection",
			"collection", result.Collection,
			"mode", mode,
			"matched", result.MatchedCount,
			"modified", result.ModifiedCount,
		)
		matched += result.MatchedCount
		modified += result.ModifiedCount
	}
	log.Info("map coordinate backfill complete", "db", cfg.MongoDB, "mode", mode, "matched", matched, "modified", modified)
}
