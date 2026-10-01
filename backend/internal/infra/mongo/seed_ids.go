package mongo

import (
	"sort"

	"github.com/oguaa/backend/internal/domain"
)

// FabricatedSeed lists, per collection, the exact _id of every illustrative
// document the seed commands can write (Seed, seeddemo and seedmissing).
type FabricatedSeed struct {
	// ByCollection maps a collection name to the seeded ids in it.
	ByCollection map[string][]string
}

// Collections returns the collection names in a stable order.
func (f FabricatedSeed) Collections() []string {
	names := make([]string, 0, len(f.ByCollection))
	for name := range f.ByCollection {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// FabricatedSeedIDs returns the _id of every illustrative document the seed
// corpus defines, resolved from the corpus itself.
//
// Purging must key off these EXACT ids, never off the listing type. The type
// list describes what the seed contains — every seeded business is invented —
// but "business" is also exactly what a real trader creates. Deleting by type
// would move a genuine shop, a citizen's safety report, or a real missing-person
// notice out of the live database. That is the same trap that
// service.PublicListingsByType documents on the read side, with delete
// semantics instead of hide semantics.
func FabricatedSeedIDs() FabricatedSeed {
	by := map[string][]string{}
	add := func(coll, id string) {
		if id != "" {
			by[coll] = append(by[coll], id)
		}
	}

	all := append(append(append(seedListings(), seedExtraListings()...), seedIncidents()...), seedLostFound()...)
	all = append(all, demoBusiness(), demoArtist())
	all = append(all, demoCampaigns()...)
	for _, l := range all {
		if domain.IsFabricatedListing(l.ID, l.Type) {
			add(collListings, l.ID)
		}
	}
	for _, a := range seedAgents {
		add(collAgents, a.ID)
	}
	for _, d := range seedDirectives() {
		add(collDirectives, d.ID)
	}
	for _, g := range seedGoals {
		add(collGoals, g.ID)
	}
	for _, c := range seedOrgClaims {
		add(collOrgClaims, c.ID)
	}
	for _, n := range seedNews {
		if domain.IsFabricatedNews(n.ID) {
			add(collNews, n.ID)
		}
	}
	for _, r := range demoReviews() {
		add(collReviews, r.ID)
	}
	for _, b := range demoArtistBookings() {
		add(collArtistBookings, b.ID)
	}
	addActivityFixtureIDs(add)
	return FabricatedSeed{ByCollection: by}
}

// addActivityFixtureIDs covers the representative activity seedmissing writes.
// Follows carry no seeded _id, and listing-view ids embed the day the seeder
// ran, so neither can be matched exactly and both are left alone.
func addActivityFixtureIDs(add func(coll, id string)) {
	for _, r := range seedModerationRecords {
		add(collModeration, r.ID)
	}
	for _, r := range seedNotifications {
		add(collNotifications, r.ID)
	}
	for _, r := range seedReports {
		add(collReports, r.ID)
	}
	for _, r := range seedPledges {
		add(collPledges, r.ID)
	}
	for _, r := range seedTickets {
		add(collTickets, r.ID)
	}
	for _, r := range seedSubscriptions {
		add(collSubscriptions, r.ID)
	}
	for _, r := range seedPromotions {
		add(collPromotions, r.ID)
	}
}
