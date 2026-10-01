// Command seedcivic tops up the civic code (civic_behaviours, civic_lessons)
// and the claimable institutions in a live database.
//
// Every write is insert-if-absent: nothing is dropped, and a row that already
// exists — including one staff created or edited — is left exactly as it is.
// Seeded town goals and outside agents are illustration (domain/seedclass.go)
// and are never written here. Point it at a database with MONGODB_URI /
// MONGODB_DB (defaults: mongodb://localhost:27017 / oguaa).
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

	civic, err := mongox.SeedCivicOnly(ctx, db)
	if err != nil {
		log.Fatalf("seed civic: %v", err)
	}
	added, err := mongox.SeedClaimableOrgsOnly(ctx, db)
	if err != nil {
		log.Fatalf("seed claimable orgs: %v", err)
	}
	log.Printf("insert-if-absent top-up into db %q: %d civic documents and %d claimable schools/places added; existing rows untouched", dbName, civic, added)
}
