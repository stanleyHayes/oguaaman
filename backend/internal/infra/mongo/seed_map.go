package mongo

import "github.com/oguaa/backend/internal/domain"

// ── seedMap: real Cape Coast coordinates ─────────────────────────────────────
// Rather than thread lat/lng fields through every seed struct literal, the map
// pins are single-sourced here as {id → [lat, lng]} tables and stamped onto the
// assembled slices in Seed(). Coordinates are plausible Cape Coast locations,
// spread across the quarters so the town map is populated. Demo data — never
// presented as survey-grade.

// fptr returns a pointer to a float64 (for the optional geo fields).
func fptr(v float64) *float64 { return &v }

// listingGeo pins seeded listings (businesses, events, incidents, lost & found)
// to their quarters. Only ids present here get a coordinate.
var listingGeo = map[string][2]float64{
	// Businesses.
	"b-castleview":      {5.1050, -1.2431}, // Victoria Road, by the Castle
	"b-fish":            {5.1086, -1.2470}, // Kotokuraba market
	"b-kenkey":          {5.1062, -1.2492}, // Bakaano junction
	"b-adjuah-tailor":   {5.1088, -1.2467}, // Kotokuraba cloth row
	"b-campus-bookshop": {5.1136, -1.2876}, // Amamoma, UCC gate
	"b-tantri-beach":    {5.1008, -1.2437}, // Tantri beachfront
	"b-lagoon-view":     {5.1035, -1.2555}, // Bakaano, Fosu Lagoon

	// Events.
	"e-fetu":                     {5.1038, -1.2432}, // Victoria Park durbar
	"e-bakaano-prize":            {5.1060, -1.2495}, // Bakaano school park
	"e-funmatch":                 {5.1150, -1.2720}, // Cape Coast Sports Stadium
	"e-soundlive":                {5.1050, -1.2424}, // Castle Gardens
	"e-mfantsipim-at-150-durbar": {5.1030, -1.2530}, // Kwabotwe Hill

	// Incidents (severity carried in details.severity).
	"inc-fosu-lagoon-flood": {5.1015, -1.2560}, // Fosu Lagoon, Bakaano side
	"inc-kotokuraba-fire":   {5.1085, -1.2471}, // Kotokuraba market
	"inc-abura-accident":    {5.1175, -1.2660}, // Abura junction
	"inc-aboom-pole":        {5.1030, -1.2510}, // Aboom, the old well

	// Lost & found.
	"lf-kofi-bakaano":          {5.1061, -1.2500}, // Wesley Methodist, Bakaano
	"lf-samsung-victoria-park": {5.1038, -1.2433}, // Victoria Park
	"lf-keys-kotokuraba":       {5.1084, -1.2478}, // Kotokuraba main gate
	"lf-aponkye-goat":          {5.1028, -1.2512}, // Aboom, old well
}

// orgGeo pins seeded orgs. Heritage orgs render as map landmarks, health/
// emergency orgs as services, schools as school pins, the rest as institutions.
var orgGeo = map[string][2]float64{
	// Schools & tertiary (institutions layer).
	"mfantsipim":             {5.1030, -1.2530},
	"adisadel":               {5.1180, -1.2600},
	schoolWesleyGirls:        {5.1120, -1.2582},
	"st-augustines":          {5.1162, -1.2678},
	schoolHolyChild:          {5.1100, -1.2620},
	"ucc":                    {5.1150, -1.2900},
	schoolBakaanoBasic:       {5.1058, -1.2500},
	"ghana-national-college": {5.1105, -1.2555},
	"philip-quaque-boys":     {5.1051, -1.2437}, // beside the Castle
	"ola-college":            {5.1140, -1.2762},
	"cctu":                   {5.1120, -1.2830},

	// Civic / faith / traditional (institutions layer).
	"ccma":               {5.1060, -1.2461}, // Metropolitan Assembly
	orgOguaaTraditional:  {5.1057, -1.2472}, // Emintsimadze palace
	"inst-christ-church": {5.1065, -1.2446}, // Anglican cathedral
	"inst-st-francis":    {5.1075, -1.2502}, // Catholic cathedral
	"inst-cc-mosque":     {5.1090, -1.2464}, // Central mosque, by Kotokuraba

	// Health & emergency (services layer).
	"inst-ccth":    {5.1232, -1.2820}, // Cape Coast Teaching Hospital
	"inst-cc-fire": {5.1092, -1.2510}, // Ghana National Fire Service, Cape Coast

	// Heritage sites (landmarks layer).
	"h-castle":        {5.1053, -1.2419},
	"h-fort-william":  {5.1066, -1.2506},
	"h-fort-victoria": {5.1041, -1.2496},
	"h-chapel-square": {5.1046, -1.2448},
	"h-kotokuraba":    {5.1085, -1.2472},
	"h-victoria-park": {5.1038, -1.2432},
	"h-kakum":         {5.3500, -1.3830},
	"h-fosu":          {5.1012, -1.2558},
	"h-elmina":        {5.0847, -1.3510},
	"h-bakaano-shore": {5.1058, -1.2489},
	"h-hans-cottage":  {5.1670, -1.3170},
	"h-assin-manso":   {5.6975, -1.2905},
}

// applyListingCoords stamps the listingGeo table onto the assembled listings.
func applyListingCoords(ls []domain.Listing) {
	for i := range ls {
		if c, ok := listingGeo[ls[i].ID]; ok {
			lat, lng := c[0], c[1]
			ls[i].Latitude, ls[i].Longitude = &lat, &lng
		}
	}
}

// applyOrgCoords stamps the orgGeo table onto the assembled orgs.
func applyOrgCoords(os []domain.Organization) {
	for i := range os {
		if c, ok := orgGeo[os[i].ID]; ok {
			lat, lng := c[0], c[1]
			os[i].Latitude, os[i].Longitude = &lat, &lng
		}
	}
}
