package domain

// Classification of seed content: what is factual Cape Coast reference material
// and what is illustration.
//
// The seed corpus mixes the two. Most of it is real — 94 institutions, the
// historical figures on the sons-and-daughters wall, the festival calendar, the
// timeline, the quarters, the civic code. That material is the point of the
// site and belongs in production.
//
// The rest is invented, and some of it is actively unsafe in public: fabricated
// emergencies and a fabricated missing-child notice that someone could act on,
// memorials for people who never died, job posts naming real employers, shops
// that do not exist, and profiles of young people who do not exist. It is
// useful for local development and useless — or harmful — anywhere else.
//
// This is the single source of truth for that split. `cmd/seedlive` consults it
// so a production seed never writes illustration; `cmd/purgefabricated` consults
// it to move what a previous seed already wrote. Keeping one list means the two
// cannot drift apart and quietly re-admit something.

// FabricatedListingTypes are listing types that exist only as illustration —
// every document of these types is invented, with no real counterpart to keep.
var FabricatedListingTypes = []string{
	TypeBusiness,
	TypeArtist,
	TypeProperty,
	TypeLostFound,
	TypeIncident,
	TypeMemorial,
	TypeProject,
	TypeOpportunity,
	TypeMemory,
}

// FabricatedListingIDs are individually-invented documents inside a type that is
// otherwise real. Everything else of those types is genuine and stays.
var FabricatedListingIDs = []string{
	// Invented "young talent" profiles — young people who do not exist.
	"p-ama-sampson", "p-efia-grant", "p-kwame-aborampa",
	// Invented dates. The rest of the calendar is real: the Fetu Afahye
	// editions, Edina Bakatue, PANAFEST, Emancipation Day, Akwambo, Edina
	// Bronya, the Mfantsipim–Adisadel fixture and the Mfantsipim @150 durbar.
	"e-soundlive",     // a concert that was never booked
	"e-bakaano-prize", // a speech day that was never held
}

// IsFabricatedListing reports whether a listing is illustration rather than
// fact, and so must never be written to a live database or indexed.
func IsFabricatedListing(id, listingType string) bool {
	for _, t := range FabricatedListingTypes {
		if listingType == t {
			return true
		}
	}
	for _, x := range FabricatedListingIDs {
		if id == x {
			return true
		}
	}
	return false
}

// DemoMemberEmailSuffix marks the seeded demo identities. They own the invented
// content and share one password that is documented in the repository, so they
// must never exist in a live database.
const DemoMemberEmailSuffix = "@oguaa.test"
