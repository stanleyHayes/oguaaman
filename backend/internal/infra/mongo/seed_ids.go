package mongo

import "github.com/oguaa/backend/internal/domain"

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
func FabricatedSeedIDs() (listings []string, agents []string) {
	all := append(append(append(seedListings(), seedExtraListings()...), seedIncidents()...), seedLostFound()...)
	for _, l := range all {
		if domain.IsFabricatedListing(l.ID, l.Type) {
			listings = append(listings, l.ID)
		}
	}
	for _, a := range seedAgents {
		agents = append(agents, a.ID)
	}
	return listings, agents
}
