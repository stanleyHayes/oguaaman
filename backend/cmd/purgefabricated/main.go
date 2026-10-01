// Command purgefabricated moves illustrative seed content — and the seeded
// @oguaa.test demo accounts — out of a live database.
//
// The seed corpus mixes two very different things. Most of it is factual Cape
// Coast reference material — 94 real institutions, the historical figures on the
// sons-and-daughters wall, the real festival calendar, the timeline, the
// quarters. That is the point of the site and must stay.
//
// The rest is invented: shops that do not exist, artists nobody can book,
// rentals nobody can let, and — worse on a live public site — fabricated
// emergencies, a fabricated missing-child notice, memorials for people who
// never died, job posts naming real employers, profiles of young people who
// do not exist, demo directives and goals issued in real authorities' names,
// the seeddemo showcase with its invented fundraising totals, and seedmissing's
// representative activity. The seeded member accounts share one password that
// is documented in the repository, so they must not exist in production either.
//
// This copies those documents to the dev database first, verifies the copy, and
// only then deletes them from the source. Nothing is destroyed; it is moved.
// Every match is by exact seeded _id (or @oguaa.test email for members), never
// by listing type, so a real member's shop or safety report is never touched.
//
//	go run ./cmd/purgefabricated                       # dry run — reports, changes nothing
//	go run ./cmd/purgefabricated --apply               # move, verify, delete, then verify the source is clean
//	go run ./cmd/purgefabricated --members-only --apply  # only the @oguaa.test accounts
//	go run ./cmd/purgefabricated --verify              # check only; exit 1 if anything seeded remains
//
// Source is MONGODB_URI/MONGODB_DB; the destination is DEV_MONGODB_URI/DEV_MONGODB_DB
// (not needed for --verify).
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

	"github.com/oguaa/backend/internal/config"
	mongox "github.com/oguaa/backend/internal/infra/mongo"
)

const (
	collListings = "listings"
	collMembers  = "members"
)

// target is one collection and the filter selecting its seeded documents.
type target struct {
	coll   string
	filter bson.M
}

func main() {
	os.Exit(purge())
}

// purge runs the command and returns the process exit code, so deferred
// disconnects still run.
func purge() int {
	apply := flag.Bool("apply", false, "actually move and delete (default: dry run)")
	verify := flag.Bool("verify", false, "only check the source: exit 1 if any @oguaa.test member or seeded illustration remains")
	membersOnly := flag.Bool("members-only", false, "only move the seeded @oguaa.test member accounts")
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	cfg := config.Load()
	srcClient, src, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		fail("connect source", err)
	}
	defer func() { _ = srcClient.Disconnect(context.Background()) }()

	targets := purgeTargets(*membersOnly)
	if *verify {
		return verifyClean(ctx, src, cfg.MongoDB, targets)
	}

	dev, closeDev := connectDev(ctx, cfg)
	defer closeDev()

	mode := map[bool]string{true: "APPLY", false: "dry run"}[*apply]
	fmt.Printf("source      %s\ndestination %s\nmode        %s\n\n", cfg.MongoDB, dev.Name(), mode)

	type tally struct{ copied, deleted int }
	totals := make([]tally, len(targets))
	for i, t := range targets {
		c, d := run(ctx, src, dev, t.coll, t.filter, *apply)
		totals[i] = tally{c, d}
	}
	fmt.Println()
	for i, t := range targets {
		fmt.Printf("%-18s copied=%d deleted=%d\n", t.coll, totals[i].copied, totals[i].deleted)
	}
	if !*apply {
		fmt.Println("\ndry run — nothing changed. Re-run with --apply to move and delete.")
		return 0
	}
	fmt.Println()
	return verifyClean(ctx, src, cfg.MongoDB, targets)
}

// purgeTargets lists every collection to clean, members first so the shared-
// password accounts are gone even if a later collection fails.
func purgeTargets(membersOnly bool) []target {
	targets := []target{{coll: collMembers, filter: mongox.DemoMemberFilter()}}
	if membersOnly {
		return targets
	}
	fab := mongox.FabricatedSeedIDs()
	for _, coll := range fab.Collections() {
		f := bson.M{"_id": bson.M{"$in": fab.ByCollection[coll]}}
		if coll == collListings {
			// Anything explicitly flagged demo is caught too.
			f = bson.M{"$or": []bson.M{f, {"demo": true}}}
		}
		targets = append(targets, target{coll: coll, filter: f})
	}
	return targets
}

func connectDev(ctx context.Context, cfg config.Config) (*mongo.Database, func()) {
	devURI, devDB := os.Getenv("DEV_MONGODB_URI"), os.Getenv("DEV_MONGODB_DB")
	if devURI == "" || devDB == "" {
		fail("config", fmt.Errorf("set DEV_MONGODB_URI and DEV_MONGODB_DB — the destination for the moved content (or use --verify to check only)"))
	}
	if devURI == cfg.MongoURI && devDB == cfg.MongoDB {
		fail("config", fmt.Errorf("source and destination are the same database (%s) — refusing", devDB))
	}
	devClient, dev, err := mongox.Connect(ctx, devURI, devDB)
	if err != nil {
		fail("connect dev", err)
	}
	return dev, func() { _ = devClient.Disconnect(context.Background()) }
}

// verifyClean counts what is still in the source and returns the process exit
// code: 0 when nothing seeded remains, 1 otherwise.
func verifyClean(ctx context.Context, src *mongo.Database, name string, targets []target) int {
	fmt.Printf("verify %s\n", name)
	remaining := int64(0)
	for _, t := range targets {
		n, err := src.Collection(t.coll).CountDocuments(ctx, t.filter)
		if err != nil {
			fail("count "+t.coll, err)
		}
		remaining += n
		status := "clean"
		if n > 0 {
			status = "REMAINING"
		}
		fmt.Printf("   %-18s %-9s %d\n", t.coll, status, n)
	}
	if remaining > 0 {
		fmt.Printf("\nFAIL: %d seeded document(s) remain in %s (including any @oguaa.test member accounts).\n", remaining, name)
		return 1
	}
	fmt.Printf("\nOK: no @oguaa.test member accounts and no seeded illustration in %s.\n", name)
	return 0
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
		label := rowLabel(r)
		if !apply {
			fmt.Printf("   would move  %-32v %v\n", id, label)
			continue
		}
		if !copyVerified(ctx, dev, coll, id, r) {
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

// copyVerified upserts the row into dev and reads it back before the source is
// touched.
func copyVerified(ctx context.Context, dev *mongo.Database, coll string, id any, r bson.M) bool {
	if _, err := dev.Collection(coll).ReplaceOne(ctx, bson.M{"_id": id}, r, options.Replace().SetUpsert(true)); err != nil {
		fmt.Printf("   COPY FAILED %-32v %v — keeping in source\n", id, err)
		return false
	}
	if n, err := dev.Collection(coll).CountDocuments(ctx, bson.M{"_id": id}); err != nil || n != 1 {
		fmt.Printf("   VERIFY FAILED %-30v — keeping in source\n", id)
		return false
	}
	return true
}

func rowLabel(r bson.M) any {
	for _, k := range []string{"title", "displayName", "name", "email"} {
		if v, ok := r[k]; ok && v != nil {
			return v
		}
	}
	return ""
}

func fail(what string, err error) {
	fmt.Fprintf(os.Stderr, "%s: %v\n", what, err)
	os.Exit(1)
}
