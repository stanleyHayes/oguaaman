// Command seedlive loads the full Cape Coast corpus into a database that is
// already in use, WITHOUT dropping anything.
//
// Use this — never `cmd/seed` — against production. `cmd/seed` drops 28
// collections including members, which would delete every real account.
//
// Every write is insert-if-absent keyed by _id: a row that already exists is
// never replaced, so staff and member edits to seeded rows (plan prices,
// institution pages, moderation, verification) survive a re-run. Corrections
// to rows that already shipped go out as targeted migrations instead.
// Illustration — fabricated listings, demo directives, goals, claims and
// agents — is never written. Safe to re-run.
//
//	go run ./cmd/seedlive              # uses MONGODB_URI / MONGODB_DB from the env
//
// It creates NO member accounts. Every seeded identity carries an @oguaa.test
// address and the shared password documented in this repository, so none of them
// belong in a live database. That means a fresh deployment has no curator or
// steward, and therefore nobody who can approve a submission — sign up through
// the app, then promote yourself once:
//
//	go run ./cmd/grantrole -email you@example.com -role steward
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

	written, existing, err := mongox.SeedUpsert(ctx, db)
	if err != nil {
		log.Error("seedlive failed", "err", err, "written", written)
		os.Exit(1)
	}
	log.Info("seedlive complete — insert-if-absent, existing rows untouched",
		"db", cfg.MongoDB, "documentsInserted", written, "existingRowsLeftAlone", existing)
}
