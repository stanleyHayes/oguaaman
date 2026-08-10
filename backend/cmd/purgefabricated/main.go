// Command purgefabricated moves illustrative seed content out of a live database.
//
// The seed corpus mixes two very different things. Most of it is factual Cape
// Coast reference material — 94 real institutions, the historical figures on the
// sons-and-daughters wall, the real festival calendar, the timeline, the
// quarters. That is the point of the site and must stay.
//
// The rest is invented: shops that do not exist, artists nobody can book,
// rentals nobody can let, and — worse on a live public site — fabricated
// emergencies, a fabricated missing-child notice, memorials for people who
// never died, job posts naming real employers, and profiles of young people who
// do not exist. None of that should be readable by the public, and none of it
// should ever reach a search engine.
//
// This copies those documents to the dev database first, verifies the copy, and
// only then deletes them from the source. Nothing is destroyed; it is moved.
//
//	go run ./cmd/purgefabricated              # dry run — reports, changes nothing
//	go run ./cmd/purgefabricated --apply      # move, verify, then delete
//
// Source is MONGODB_URI/MONGODB_DB; the destination is DEV_MONGODB_URI/DEV_MONGODB_DB.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"regexp"

	"github.com/oguaa/backend/internal/config"
	"github.com/oguaa/backend/internal/domain"
	mongox "github.com/oguaa/backend/internal/infra/mongo"
)

func main() {
	apply := flag.Bool("apply", false, "actually move and delete (default: dry run)")
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	cfg := config.Load()
	srcClient, src, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		fail("connect source", err)
	}
	defer func() { _ = srcClient.Disconnect(context.Background()) }()

	devURI, devDB := os.Getenv("DEV_MONGODB_URI"), os.Getenv("DEV_MONGODB_DB")
	if devURI == "" || devDB == "" {
		fail("config", fmt.Errorf("set DEV_MONGODB_URI and DEV_MONGODB_DB — the destination for the moved content"))
	}
	if devURI == cfg.MongoURI && devDB == cfg.MongoDB {
		fail("config", fmt.Errorf("source and destination are the same database (%s) — refusing", devDB))
	}
	devClient, dev, err := mongox.Connect(ctx, devURI, devDB)
	if err != nil {
		fail("connect dev", err)
	}
	defer func() { _ = devClient.Disconnect(context.Background()) }()

	fmt.Printf("source      %s\ndestination %s\nmode        %s\n\n",
		cfg.MongoDB, devDB, map[bool]string{true: "APPLY", false: "dry run"}[*apply])

	filter := bson.M{"$or": []bson.M{
		{"type": bson.M{"$in": domain.FabricatedListingTypes}},
		{"_id": bson.M{"$in": domain.FabricatedListingIDs}},
	}}

	moved, deleted := run(ctx, src, dev, "listings", filter, *apply)

	// The demo member accounts: they own the invented content, carry
	// @oguaa.test addresses and share one publicly-documented password.
	memberFilter := bson.M{"email": bson.M{"$regex": regexp.QuoteMeta(domain.DemoMemberEmailSuffix) + "$"}}
	mMoved, mDeleted := run(ctx, src, dev, "members", memberFilter, *apply)

	// Outside agents are invented people offering escrow-backed services.
	aMoved, aDeleted := run(ctx, src, dev, "agents", bson.M{}, *apply)

	fmt.Printf("\nlistings  copied=%d deleted=%d\nmembers   copied=%d deleted=%d\nagents    copied=%d deleted=%d\n",
		moved, deleted, mMoved, mDeleted, aMoved, aDeleted)
	if !*apply {
		fmt.Println("\ndry run — nothing changed. Re-run with --apply to move and delete.")
	}
}

// run copies matching documents to dev, verifies each landed, then deletes the
// verified ones from the source. A document that fails to copy is never deleted.
func run(ctx context.Context, src, dev *mongo.Database, coll string, filter bson.M, apply bool) (copied, deleted int) {
	cur, err := src.Collection(coll).Find(ctx, filter)
	if err != nil {
		fail("find "+coll, err)
	}
	var rows []bson.M
	if err := cur.All(ctx, &rows); err != nil {
		fail("decode "+coll, err)
	}
	fmt.Printf("%s — %d to move\n", coll, len(rows))
	for _, r := range rows {
		id := r["_id"]
		label := r["title"]
		if label == nil {
			label = r["displayName"]
		}
		if !apply {
			fmt.Printf("   would move  %-32v %v\n", id, label)
			continue
		}
		// Upsert into dev, then read it back before touching the source.
		if _, err := dev.Collection(coll).ReplaceOne(ctx, bson.M{"_id": id}, r, options.Replace().SetUpsert(true)); err != nil {
			fmt.Printf("   COPY FAILED %-32v %v — keeping in source\n", id, err)
			continue
		}
		if n, err := dev.Collection(coll).CountDocuments(ctx, bson.M{"_id": id}); err != nil || n != 1 {
			fmt.Printf("   VERIFY FAILED %-30v — keeping in source\n", id)
			continue
		}
		copied++
		res, err := src.Collection(coll).DeleteOne(ctx, bson.M{"_id": id})
		if err != nil {
			fmt.Printf("   delete failed %-30v %v\n", id, err)
			continue
		}
		deleted += int(res.DeletedCount)
		fmt.Printf("   moved       %-32v %v\n", id, label)
	}
	return copied, deleted
}

func fail(what string, err error) {
	fmt.Fprintf(os.Stderr, "%s: %v\n", what, err)
	os.Exit(1)
}
