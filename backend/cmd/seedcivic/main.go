// Command seedcivic loads ONLY the civic collections (civic_behaviours,
// civic_lessons) into the target Mongo — a targeted, non-destructive top-up
// that never touches the other collections, unlike the full destructive
// `seed` service. Point it at a database with MONGODB_URI / MONGODB_DB
// (defaults: mongodb://localhost:27017 / oguaa).
package main

import (
	"context"
	"log"
	"os"
	"time"

	mongox "github.com/oguaa/backend/internal/infra/mongo"
)

func main() {
	uri := os.Getenv("MONGODB_URI")
	if uri == "" {
		uri = "mongodb://localhost:27017"
	}
	dbName := os.Getenv("MONGODB_DB")
	if dbName == "" {
		dbName = "oguaa"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, db, err := mongox.Connect(ctx, uri, dbName)
	if err != nil {
		log.Fatalf("connect to %q: %v", dbName, err)
	}
	defer func() { _ = client.Disconnect(context.Background()) }()

	if err := mongox.SeedCivicOnly(ctx, db); err != nil {
		log.Fatalf("seed civic: %v", err)
	}
	if err := mongox.SeedGoalsOnly(ctx, db); err != nil {
		log.Fatalf("seed goals: %v", err)
	}
	if err := mongox.SeedAgentsOnly(ctx, db); err != nil {
		log.Fatalf("seed agents: %v", err)
	}
	log.Printf("civic + goals + agents seeded into db %q", dbName)
}
