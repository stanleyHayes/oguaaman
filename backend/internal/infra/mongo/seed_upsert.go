package mongo

import (
	"context"
	"log/slog"

	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

// SeedUpsert loads the factual Cape Coast corpus into a database that is
// already in use, WITHOUT dropping or overwriting anything.
//
// Seed() is for a local reset: it drops every collection first, including
// members, so it must never be pointed at a live database. This function is
// the deployable half of the same data:
//
//   - every write is INSERT-IF-ABSENT ($setOnInsert keyed by _id). A row that
//     already exists is left exactly as it is, because staff and members edit
//     seeded rows in place: plan prices, institution pages and offices,
//     verification, moderation status, view counts. Re-running never undoes
//     those edits. A correction to a row that already shipped must go out as a
//     targeted migration, not through this command.
//   - illustration is never written: fabricated listings, demo directives and
//     goals, demo institution claims, outside agents and demo news (see
//     domain/seedclass.go). No member accounts are created either — every
//     seeded identity is an @oguaa.test demo account.
//   - the copy that is written is cleaned for a live site: placeholder contact
//     buttons are dropped from institution pages, and invented ticket tiers are
//     dropped from real events.
//
// It returns the number of documents inserted and the number of corpus rows
// left alone because a document with that _id already existed.
func SeedUpsert(ctx context.Context, db *mongo.Database) (written int, existing int, err error) {
	w := &liveSeedWriter{ctx: ctx, db: db}
	steps := []func() error{w.orgsAndPlaces, w.listings, w.reference}
	for _, step := range steps {
		if err = step(); err != nil {
			return w.written, w.existing, err
		}
	}
	slog.Info("seedlive: illustration withheld from the live database", "rowsWithheld", w.withheld)
	err = createIndexes(ctx, db)
	return w.written, w.existing, err
}

// liveSeedWriter tallies insert-if-absent writes for SeedUpsert.
type liveSeedWriter struct {
	ctx      context.Context
	db       *mongo.Database
	written  int
	existing int
	withheld int
}

func (w *liveSeedWriter) put(coll, id string, doc any) error {
	inserted, err := insertIfAbsent(w.ctx, w.db.Collection(coll), id, doc)
	if err != nil {
		return err
	}
	if inserted {
		w.written++
	} else {
		w.existing++
	}
	return nil
}

func (w *liveSeedWriter) orgsAndPlaces() error {
	allOrgs := append(append([]domain.Organization{}, seedOrgs...), seedExtraOrgs...)
	applyOrgCoords(allOrgs)
	for _, o := range allOrgs {
		if err := w.put(collOrgs, o.ID, liveCorpusOrg(o)); err != nil {
			return err
		}
	}
	added, err := seedClaimableOrgsData(w.ctx, w.db) // insert-if-absent by _id and slug
	if err != nil {
		return err
	}
	w.written += added
	for _, p := range seedPlaces {
		if err := w.put(collPlaces, p.ID, p); err != nil {
			return err
		}
	}
	return nil
}

func (w *liveSeedWriter) listings() error {
	all := append(append(append(seedListings(), seedExtraListings()...), seedIncidents()...), seedLostFound()...)
	applyListingCoords(all)
	for _, l := range all {
		// Illustration never reaches a live database. Shops that do not exist,
		// fabricated emergencies, memorials for the living — see
		// domain/seedclass.go for the full reasoning.
		if domain.IsFabricatedListing(l.ID, l.Type) {
			w.withheld++
			continue
		}
		if err := w.put(collListings, l.ID, liveCorpusListing(l)); err != nil {
			return err
		}
	}
	return nil
}

func (w *liveSeedWriter) reference() error {
	for _, n := range seedNews {
		if domain.IsFabricatedNews(n.ID) {
			w.withheld++
			continue
		}
		if err := w.put(collNews, n.ID, n); err != nil {
			return err
		}
	}
	for _, t := range seedTimeline {
		if err := w.put(collTimeline, t.ID, t); err != nil {
			return err
		}
	}
	for _, p := range seedPlans {
		if err := w.put(collPlans, p.ID, p); err != nil {
			return err
		}
	}
	for _, b := range seedCivicBehaviours {
		if err := w.put(collCivicBehaviours, b.Slug, b); err != nil { // Slug is bson _id
			return err
		}
	}
	for _, l := range seedCivicLessons {
		if err := w.put(collCivicLessons, l.Slug, l); err != nil { // Slug is bson _id
			return err
		}
	}
	// Directives, goals, institution claims and outside agents are all
	// illustration (domain/seedclass.go): demo announcements and verdicts in
	// real authorities' names, a demo manager of a real office, invented
	// escrow agents. None of them is written.
	w.withheld += len(seedDirectives()) + len(seedGoals) + len(seedOrgClaims) + len(seedAgents)

	// SeedEmptyCollections fills empty activity collections with representative
	// pledges, tickets and subscriptions. That is invented transaction history;
	// a live database's activity must be its own.
	return nil
}
