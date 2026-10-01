// Command seed RESETS a local MongoDB and loads the full Cape Coast seed data,
// demo identities and illustration included.
//
// It is DESTRUCTIVE, not idempotent: it drops every product collection first —
// members, listings, pledges, tickets, orders and the rest — and re-inserts the
// seed. It therefore refuses to run when GO_ENV=production, or when the target
// database holds any member account that is not a seeded @oguaa.test identity,
// unless --i-know-this-drops-data is passed.
//
// For a live database use cmd/seedlive (insert-if-absent, no illustration).
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
	override := flag.Bool("i-know-this-drops-data", false, "drop and reseed even in production or when real member accounts exist")
	flag.Parse()

	log := logger.New()
	cfg := config.Load()

	// Generous window: a full reseed writes many collections, and a high-latency
	// link (e.g. Ghana → an eu-west Atlas cluster) can take minutes.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	client, db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		log.Error("mongo connect failed", "err", err)
		return 1
	}
	defer func() { _ = client.Disconnect(context.Background()) }()

	if err := mongox.CheckResetAllowed(ctx, db, os.Getenv("GO_ENV"), *override); err != nil {
		log.Error("seed refused — this command drops every collection", "db", cfg.MongoDB, "err", err)
		return 1
	}
	if err := mongox.Seed(ctx, db); err != nil {
		log.Error("seed failed", "err", err)
		return 1
	}
	log.Info("seed complete — database reset to the seed data", "db", cfg.MongoDB)
	return 0
}
