// Command seeddemo writes a self-contained Creator Monetization showcase (a
// subscribed demo creator, a fully-filled business with reviews, an artist
// accepting donations, and three campaigns) into a development or staging
// database WITHOUT dropping anything.
//
// Everything it writes is illustration: the listings are stamped Demo, the
// creator is an @oguaa.test identity, and cmd/purgefabricated can move every
// row by exact id. It refuses to run when GO_ENV=production — invented
// campaigns in a live database would accept real pledges. Plans are only
// inserted when missing, so staff-set prices are never reverted.
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
	os.Exit(run())
}

func run() int {
	log := logger.New()
	if os.Getenv("GO_ENV") == "production" {
		log.Error("seeddemo refused: GO_ENV=production — the showcase is invented content and must never reach a live database")
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

	n, err := mongox.SeedDemo(ctx, db)
	if err != nil {
		log.Error("seeddemo failed", "err", err, "written", n)
		return 1
	}
	log.Info("seeddemo complete — demo showcase written (Demo-flagged, purgeable)", "db", cfg.MongoDB, "documentsWritten", n)
	return 0
}
