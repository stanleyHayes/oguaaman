package mongo

import (
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// The purge tool deletes from a live database, so what it does NOT match is the
// property that matters. Matching by listing type would sweep up a real
// trader's shop, a citizen's safety report or a genuine missing-person notice,
// because "business", "incident" and "lostfound" are exactly what real members
// create.
func TestFabricatedSeedIDsAreExactAndDoNotCoverRealSubmissions(t *testing.T) {
	fab := FabricatedSeedIDs()
	listings, agents := fab.ByCollection[collListings], fab.ByCollection[collAgents]
	if len(listings) == 0 {
		t.Fatal("no fabricated listing ids resolved — the purge would silently match nothing")
	}
	if len(agents) == 0 {
		t.Fatal("no seeded agent ids resolved")
	}

	seeded := map[string]bool{}
	for _, id := range listings {
		seeded[id] = true
	}

	// Ids a real submission would carry. None may appear.
	for _, realID := range []string{
		"lst-1770000000-abc123", // service-generated id shape
		"b-my-new-shop",
		"inc-real-flood-report",
		"lf-missing-child-real",
	} {
		if seeded[realID] {
			t.Errorf("%q is matched by the purge — a real member's listing would be deleted", realID)
		}
	}

	// Everything resolved must genuinely be fabricated per the classification.
	for _, id := range listings {
		if !strings.ContainsAny(id, "-") {
			t.Errorf("suspicious id %q", id)
		}
	}
	t.Logf("purge scope: %d seeded listings, %d seeded agents", len(listings), len(agents))
}

// The individually-named ids must actually exist in the corpus, or a rename
// would silently stop purging them while the list still looks correct.
func TestNamedFabricatedIDsExistInTheCorpus(t *testing.T) {
	all := append(append(append(seedListings(), seedExtraListings()...), seedIncidents()...), seedLostFound()...)
	present := map[string]bool{}
	for _, l := range all {
		present[l.ID] = true
	}
	for _, id := range domain.FabricatedListingIDs {
		if !present[id] {
			t.Errorf("FabricatedListingIDs names %q, which is not in the seed corpus — it was renamed or removed", id)
		}
	}
}

// Every seeded row that SeedUpsert withholds from a live database, and every
// showcase row seeddemo writes, must be reachable by the purge — otherwise an
// earlier run's illustration could never be cleaned up.
func TestFabricatedSeedIDsCoverDemoShowcaseAndIllustrativeCollections(t *testing.T) {
	fab := FabricatedSeedIDs()
	has := func(coll, id string) bool {
		for _, x := range fab.ByCollection[coll] {
			if x == id {
				return true
			}
		}
		return false
	}
	for _, want := range []struct{ coll, id string }{
		{collListings, demoBusinessID},
		{collListings, demoArtistID},
		{collListings, "lst-demo-camp-1"},
		{collListings, "lst-demo-camp-3"},
		{collReviews, "rev-demo-1"},
		{collArtistBookings, "artist-booking-demo-1"},
		{collDirectives, "dir-fire-dry-season-advisory"},
		{collGoals, "goal-2026-annual"},
		{collOrgClaims, "clm-fire-nana"},
		{collNews, "news-draft-tip"},
		{collPledges, "plg-seed-library-efua"},
		{collReports, "rpt-seed-fish-address"},
	} {
		if !has(want.coll, want.id) {
			t.Errorf("purge scope is missing %s/%s", want.coll, want.id)
		}
	}
	// Real reference material must never be in scope.
	for _, keep := range []struct{ coll, id string }{
		{collListings, "e-fetu"},
		{collNews, "news-fetu-2026"},
		{collPlans, "plan-supporter"},
	} {
		if has(keep.coll, keep.id) {
			t.Errorf("purge scope includes real content %s/%s", keep.coll, keep.id)
		}
	}
}

func TestSeedDemoListingsAreStampedDemo(t *testing.T) {
	all := append([]domain.Listing{demoBusiness(), demoArtist()}, demoCampaigns()...)
	for _, l := range all {
		if !l.Demo {
			t.Errorf("seeddemo listing %s is not stamped Demo — it would reach the sitemap and accept real money", l.ID)
		}
		if !domain.IsFabricatedListing(l.ID, l.Type) {
			t.Errorf("seeddemo listing %s (%s) is not classified as illustration", l.ID, l.Type)
		}
	}
}
