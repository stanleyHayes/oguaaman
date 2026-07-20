// Command seed loads the Cape Coast seed data into MongoDB (idempotent).
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

	// Generous window: a full reseed writes many collections, and a high-latency
	// link (e.g. Ghana → an eu-west Atlas cluster) can take minutes.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	client, db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		log.Error("mongo connect failed", "err", err)
		os.Exit(1)
	}
	defer func() { _ = client.Disconnect(context.Background()) }()

	if err := mongox.Seed(ctx, db); err != nil {
		log.Error("seed failed", "err", err)
		os.Exit(1)
	}
	log.Info("seed complete", "db", cfg.MongoDB)
}
