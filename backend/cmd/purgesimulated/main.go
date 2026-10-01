// Command purgesimulated removes simulated (dev-mode) payment records from a
// live database (P32/P49).
//
// SimulatedPaystack flags everything it settles with simulated:true: pledges,
// donations, tickets, subscriptions, promotions, commerce orders and Stripe
// intents. None of it moved real money. The seed also loads such records (and
// "(Simulated — dev mode.)" notifications) into whatever database it targets.
// The revenue dashboard already leaves them out; this takes them out of the
// database before live money arrives:
//
//   - lists every simulated record per collection (dry run, the default);
//   - with --apply, first takes each settled simulated pledge or donation back
//     out of its listing's public raised/donation total (only when the listing
//     recorded that credit), then deletes the simulated records and the
//     simulated-payment notifications.
//
// Plans, featured placements and agent-job escrows that simulated payments
// granted are listed for review but not changed.
//
//	go run ./cmd/purgesimulated            # dry run — reports, changes nothing
//	go run ./cmd/purgesimulated --apply    # reverse credits, then delete
//
// Reads MONGODB_URI/MONGODB_DB.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/config"
	"github.com/oguaa/backend/internal/domain"
	mongox "github.com/oguaa/backend/internal/infra/mongo"
)

const (
	collPledges       = "pledges"
	collListings      = "listings"
	collNotifications = "notifications"
	collAgentJobs     = "agent_jobs"
	fieldPledgeCredit = "pledgeCredits"
)

// paymentCollections hold one payment record per document, flagged simulated.
var paymentCollections = []string{collPledges, "tickets", "subscriptions", "promotions", "commerce_orders", "stripe_intents"}

// simulatedFilter selects the simulated records of a payment collection.
func simulatedFilter() bson.M { return bson.M{"simulated": true} }

// simulatedNoticeFilter selects the notifications simulated payments sent.
func simulatedNoticeFilter() bson.M {
	return bson.M{"body": bson.M{"$regex": `Simulated — dev mode|simulated ticket`, "$options": "i"}}
}

// creditReversal is how a settled pledge's credit comes back off its listing.
type creditReversal struct {
	listingID string
	reference string
	inc       bson.M
}

// reversalFor returns the credit a settled simulated pledge put on its
// listing (the inverse of ListingRepo.IncrementRaised/IncrementDonations).
func reversalFor(p domain.Pledge) (creditReversal, bool) {
	if p.Status != domain.PledgeSuccess || !p.Simulated || p.ProjectID == "" {
		return creditReversal{}, false
	}
	inc := bson.M{"details.raisedPesewas": -p.NetPesewas, "details.backers": -1}
	if p.Kind == domain.PledgeKindDonation {
		inc = bson.M{"details.donationsNetPesewas": -p.NetPesewas, "details.donorCount": -1}
	}
	return creditReversal{listingID: p.ProjectID, reference: p.Reference, inc: inc}, true
}

func main() {
	os.Exit(run())
}

// run returns the process exit code so deferred disconnects still run.
func run() int {
	apply := flag.Bool("apply", false, "reverse the credits and delete the simulated records (default: dry run)")
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	cfg := config.Load()
	client, db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect: %v\n", err)
		return 1
	}
	defer func() { _ = client.Disconnect(context.Background()) }()

	mode := map[bool]string{true: "APPLY", false: "dry run"}[*apply]
	fmt.Printf("database %s\nmode     %s\n\n", cfg.MongoDB, mode)
	if err := listAll(ctx, db); err != nil {
		fmt.Fprintf(os.Stderr, "list: %v\n", err)
		return 1
	}
	if !*apply {
		fmt.Println("\ndry run — nothing changed. Re-run with --apply to reverse credits and delete.")
		return 0
	}
	if err := reverseCredits(ctx, db); err != nil {
		fmt.Fprintf(os.Stderr, "reverse credits: %v\n", err)
		return 1
	}
	if err := deleteAll(ctx, db); err != nil {
		fmt.Fprintf(os.Stderr, "delete: %v\n", err)
		return 1
	}
	return 0
}

// listAll prints what a run would touch, with the references of each record.
func listAll(ctx context.Context, db *mongo.Database) error {
	for _, coll := range paymentCollections {
		if err := listColl(ctx, db, coll, simulatedFilter()); err != nil {
			return err
		}
	}
	if err := listColl(ctx, db, collNotifications, simulatedNoticeFilter()); err != nil {
		return err
	}
	n, err := db.Collection(collAgentJobs).CountDocuments(ctx, bson.M{"escrow.simulated": true})
	if err != nil {
		return err
	}
	if n > 0 {
		fmt.Printf("\nreview by hand: %d agent job(s) carry a simulated escrow (not changed)\n", n)
	}
	fmt.Println("review by hand: plans and featured placements granted by the simulated subscriptions/promotions above are not changed")
	return nil
}

func listColl(ctx context.Context, db *mongo.Database, coll string, filter bson.M) error {
	cur, err := db.Collection(coll).Find(ctx, filter)
	if err != nil {
		return err
	}
	var rows []bson.M
	if err := cur.All(ctx, &rows); err != nil {
		return err
	}
	fmt.Printf("%-16s %d\n", coll, len(rows))
	for _, r := range rows {
		fmt.Printf("    %v  ref=%v status=%v amount=%v\n", r["_id"], r["reference"], r["status"], r["amountPesewas"])
	}
	return nil
}

// reverseCredits takes each settled simulated pledge back off its listing's
// public total. The filter requires the listing to have recorded the credit,
// so a total the credit never reached is left alone.
func reverseCredits(ctx context.Context, db *mongo.Database) error {
	cur, err := db.Collection(collPledges).Find(ctx, bson.M{"simulated": true, "status": domain.PledgeSuccess})
	if err != nil {
		return err
	}
	var pledges []domain.Pledge
	if err := cur.All(ctx, &pledges); err != nil {
		return err
	}
	reversed, unrecorded := 0, 0
	for _, p := range pledges {
		rev, ok := reversalFor(p)
		if !ok {
			continue
		}
		res, err := db.Collection(collListings).UpdateOne(ctx,
			bson.M{"_id": rev.listingID, fieldPledgeCredit: rev.reference},
			bson.M{"$inc": rev.inc, "$pull": bson.M{fieldPledgeCredit: rev.reference}})
		if err != nil {
			return err
		}
		if res.ModifiedCount == 1 {
			reversed++
			continue
		}
		unrecorded++
		fmt.Printf("    no credit on record for %s on listing %s — check its total by hand\n", p.Reference, p.ProjectID)
	}
	fmt.Printf("\ncredits reversed=%d not-on-record=%d\n", reversed, unrecorded)
	return nil
}

func deleteAll(ctx context.Context, db *mongo.Database) error {
	for _, coll := range paymentCollections {
		res, err := db.Collection(coll).DeleteMany(ctx, simulatedFilter())
		if err != nil {
			return err
		}
		fmt.Printf("%-16s deleted=%d\n", coll, res.DeletedCount)
	}
	res, err := db.Collection(collNotifications).DeleteMany(ctx, simulatedNoticeFilter())
	if err != nil {
		return err
	}
	fmt.Printf("%-16s deleted=%d\n", collNotifications, res.DeletedCount)
	return nil
}
