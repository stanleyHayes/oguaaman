package mongo

import (
	"context"
	"log/slog"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
)

// SeedUpsert loads the full Cape Coast corpus into a database that is already
// in use, WITHOUT dropping anything.
//
// Seed() is for a local reset: it drops 28 collections first, including members.
// Run against production that would delete every real account — including the
// steward's — so it must never be pointed at a live database. This function is
// the deployable half of the same data:
//
//   - content collections (listings, orgs, places, news, timeline, plans,
//     directives…) are ReplaceOne upserts keyed by _id, so re-running restores
//     seed rows to their canonical state and never touches rows we didn't ship;
//   - members are INSERT-IF-ABSENT. If a real signed-up account ever occupies an
//     id the seed also uses, replacing it would reset that person's password,
//     email and role. Existing member documents are left exactly as they are,
//     and the count of skips is reported so the operator can see it happened.
//
// It returns the number of documents written and the number of members skipped
// because a real account already held that id.
func SeedUpsert(ctx context.Context, db *mongo.Database) (written int, membersSkipped int, err error) {
	up := func(coll string, id string, doc any) error {
		if id == "" {
			return nil
		}
		_, e := db.Collection(coll).ReplaceOne(ctx, bson.M{"_id": id}, doc, options.Replace().SetUpsert(true))
		if e == nil {
			written++
		}
		return e
	}

	// ── members: insert only when absent ────────────────────────────────────
	members := append([]domain.Member{}, seedMembers...)
	if hash, hErr := bcrypt.GenerateFromPassword([]byte(SeedPassword), bcrypt.DefaultCost); hErr != nil {
		slog.Warn("seedupsert: could not hash the seed password", "err", hErr)
	} else {
		for i := range members {
			members[i].PasswordHash = string(hash)
		}
	}
	for _, m := range members {
		n, cErr := db.Collection(collMembers).CountDocuments(ctx, bson.M{"_id": m.ID})
		if cErr != nil {
			return written, membersSkipped, cErr
		}
		if n > 0 {
			membersSkipped++
			continue
		}
		if _, iErr := db.Collection(collMembers).InsertOne(ctx, m); iErr != nil {
			return written, membersSkipped, iErr
		}
		written++
	}

	// ── organisations, places ───────────────────────────────────────────────
	allOrgs := append(append([]domain.Organization{}, seedOrgs...), seedExtraOrgs...)
	applyOrgCoords(allOrgs)
	for _, o := range allOrgs {
		if err = up(collOrgs, o.ID, o); err != nil {
			return
		}
	}
	if _, err = seedClaimableOrgsData(ctx, db); err != nil { // already upsert-by-slug
		return
	}
	for _, p := range seedPlaces {
		if err = up(collPlaces, p.ID, p); err != nil {
			return
		}
	}

	// ── listings: the archive people actually came to read ──────────────────
	allListings := append(append(append(seedListings(), seedExtraListings()...), seedIncidents()...), seedLostFound()...)
	applyListingCoords(allListings)
	for _, l := range allListings {
		if err = up(collListings, l.ID, l); err != nil {
			return
		}
	}

	// ── editorial + reference data ──────────────────────────────────────────
	for _, n := range seedNews {
		if err = up(collNews, n.ID, n); err != nil {
			return
		}
	}
	for _, t := range seedTimeline {
		if err = up(collTimeline, t.ID, t); err != nil {
			return
		}
	}
	for _, p := range seedPlans {
		if err = up(collPlans, p.ID, p); err != nil {
			return
		}
	}
	for _, c := range seedOrgClaims {
		if err = up(collOrgClaims, c.ID, c); err != nil {
			return
		}
	}
	for _, d := range seedDirectives() {
		if err = up(collDirectives, d.ID, d); err != nil {
			return
		}
	}

	// Civic code, goals and agents are upserted here rather than through
	// seedCivic/seedGoalsData/seedAgentsData: those are plain InsertMany and only
	// work because Seed() drops their collections first, so calling them twice
	// fails on a duplicate _id.
	for _, b := range seedCivicBehaviours {
		if err = up(collCivicBehaviours, b.Slug, b); err != nil { // Slug is bson _id
			return
		}
	}
	for _, l := range seedCivicLessons {
		if err = up(collCivicLessons, l.Slug, l); err != nil { // Slug is bson _id
			return
		}
	}
	for _, g := range seedGoals {
		if err = up(collGoals, g.ID, g); err != nil {
			return
		}
	}
	for _, a := range seedAgents {
		if err = up(collAgents, a.ID, a); err != nil {
			return
		}
	}

	// Fills only collections that are still empty — never overwrites activity.
	if _, err = SeedEmptyCollections(ctx, db); err != nil {
		return
	}

	err = createIndexes(ctx, db)
	return
}
