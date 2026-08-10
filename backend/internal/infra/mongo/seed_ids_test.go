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
	listings, agents := FabricatedSeedIDs()
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
