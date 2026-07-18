package service

import (
	"context"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── the town map (GET /api/map) ──────────────────────────────────────────────
//
// MapData gathers every located thing in Oguaa into one public payload: pins
// (points), routes (trails) and directive footprints (areas). It never
// geocodes — only entities that already carry real coordinates are returned.
//
// Points come from three non-overlapping sources:
//   • listings  — approved business/event/incident/lostfound rows with lat/lng;
//   • orgs      — institutions/schools/heritage/health/emergency orgs with
//     lat/lng (heritage → landmarks, health/emergency → services);
//   • furniture — curated non-org service & transport POIs seeded below.
//
// Trails (the heritage walk + the Fetu durbar route) and the non-org POIs are
// static reference data; they live in the service layer because the aggregation
// is business logic and the infra layer must not be a dependency of the core.

// MapData assembles the full town map. Layers are filtered client-side.
func (s *Service) MapData(ctx context.Context) (domain.MapPayload, error) {
	payload := domain.MapPayload{
		Points: []domain.MapPoint{},
		Trails: []domain.MapTrail{},
		Areas:  []domain.MapArea{},
	}

	// townId → quarter name, so a listing's pin can name its quarter.
	quarterName := map[string]string{}
	if places, err := s.places.All(ctx); err == nil {
		for _, p := range places {
			quarterName[p.ID] = p.Name
		}
	}

	// Points from approved listings (business / property / event / incident / lostfound).
	approved, err := s.listings.Find(ctx, domain.ListingFilter{Status: domain.StatusApproved})
	if err != nil {
		return payload, err
	}
	for i := range approved {
		if pt, ok := listingPoint(approved[i], quarterName); ok {
			payload.Points = append(payload.Points, pt)
		}
	}

	// Points from orgs that carry coordinates (institutions/schools/landmarks/services).
	orgs, err := s.orgs.All(ctx)
	if err != nil {
		return payload, err
	}
	for i := range orgs {
		if pt, ok := orgPoint(orgs[i]); ok {
			payload.Points = append(payload.Points, pt)
		}
	}

	// Curated non-org furniture: public services, transport, and the trails.
	payload.Points = append(payload.Points, capeCoastServicePOIs()...)
	payload.Points = append(payload.Points, capeCoastTransportPOIs()...)
	payload.Trails = append(payload.Trails, capeCoastTrails()...)

	// Areas: currently-active directives that carry a geo footprint.
	dirs, err := s.directives.List(ctx, domain.DirectiveFilters{ActiveOnly: true})
	if err != nil {
		return payload, err
	}
	now := time.Now().UTC()
	for i := range dirs {
		d := dirs[i]
		if !d.IsActive(now) {
			continue
		}
		if d.Latitude == nil || d.Longitude == nil || d.RadiusM == nil {
			continue
		}
		payload.Areas = append(payload.Areas, domain.MapArea{
			ID:       d.ID,
			Title:    d.Title,
			Kind:     "directive",
			Severity: d.Severity,
			Lat:      *d.Latitude,
			Lng:      *d.Longitude,
			RadiusM:  *d.RadiusM,
			Until:    d.EffectiveUntil,
		})
	}
	return payload, nil
}

// listingPoint maps an approved, located listing to a map point. It returns
// ok=false for listings without coordinates or of a non-mappable type.
func listingPoint(l domain.Listing, quarterName map[string]string) (domain.MapPoint, bool) {
	if l.Latitude == nil || l.Longitude == nil {
		return domain.MapPoint{}, false
	}
	pt := domain.MapPoint{
		ID:      l.ID,
		Title:   l.Title,
		Lat:     *l.Latitude,
		Lng:     *l.Longitude,
		Slug:    l.Slug,
		Quarter: quarterOf(l.TownID, quarterName),
	}
	switch l.Type {
	case domain.TypeBusiness:
		pt.Kind, pt.Layer, pt.Href = "business", "business", "/business/"+l.Slug
		pt.Category = asString(l.Details, "category")
		pt.Subtitle = asString(l.Details, "address")
	case domain.TypeProperty:
		pt.Kind, pt.Layer, pt.Href = "property", "property", "/rent-stay/"+l.Slug
		pt.Category = asString(l.Details, "propertyType")
		pt.Subtitle = asString(l.Details, "area")
		if pt.Subtitle == "" {
			pt.Subtitle = asString(l.Details, "address")
		}
	case domain.TypeEvent:
		pt.Kind, pt.Layer, pt.Href = "event", "events", "/events/"+l.Slug
		pt.Subtitle = asString(l.Details, "venue")
	case domain.TypeIncident:
		pt.Kind, pt.Layer, pt.Href = "incident", "safety", "/safety/"+l.Slug
		pt.Category = asString(l.Details, "category")
		pt.Severity = asString(l.Details, "severity")
		pt.Subtitle = asString(l.Details, "location")
	case domain.TypeLostFound:
		pt.Kind, pt.Layer, pt.Href = "lostfound", "lostfound", "/lost-found/"+l.Slug
		pt.Category = asString(l.Details, "kind")
		pt.Subtitle = asString(l.Details, "lastSeenLocation")
	default:
		return domain.MapPoint{}, false
	}
	return pt, true
}

// orgPoint maps an org that carries coordinates to a map point. Detail pages for
// every org kind live under /education/{slug}.
func orgPoint(o domain.Organization) (domain.MapPoint, bool) {
	if o.Latitude == nil || o.Longitude == nil {
		return domain.MapPoint{}, false
	}
	kind, layer := orgPointKind(o.Kind)
	return domain.MapPoint{
		ID:       o.ID,
		Kind:     kind,
		Layer:    layer,
		Title:    o.Name,
		Subtitle: o.Classification,
		Lat:      *o.Latitude,
		Lng:      *o.Longitude,
		Slug:     o.Slug,
		Href:     "/education/" + o.Slug,
		Category: o.Kind,
		Quarter:  o.QuarterTag,
	}, true
}

// orgPointKind maps an org kind onto the map point kind + layer.
func orgPointKind(k string) (kind, layer string) {
	switch k {
	case "school", "education":
		return "school", "institutions"
	case "heritage":
		return "landmark", "landmarks"
	case "health", "emergency-service":
		return "service", "services"
	default: // faith, civic, cultural, traditional-authority, association, asafo, local-government
		return "institution", "institutions"
	}
}

// quarterOf resolves a townId to its quarter name, falling back to the id.
func quarterOf(townID string, names map[string]string) string {
	if townID == "" {
		return ""
	}
	if n, ok := names[townID]; ok {
		return n
	}
	return townID
}

// ── seeded non-org furniture ─────────────────────────────────────────────────
// Real Cape Coast public-service and transport POIs that are not modelled as
// orgs (the hospital and fire service ARE orgs and flow through orgPoint). All
// coordinates are plausible town locations; demo data, never presented as
// official records.

func capeCoastServicePOIs() []domain.MapPoint {
	svc := func(id, title, subtitle, category, quarter string, lat, lng float64) domain.MapPoint {
		return domain.MapPoint{ID: id, Kind: "service", Layer: "services", Title: title, Subtitle: subtitle, Category: category, Quarter: quarter, Lat: lat, Lng: lng}
	}
	return []domain.MapPoint{
		svc("svc-police-divisional", "Ghana Police — Cape Coast Divisional HQ", "Police station", "police", "Cape Coast central", 5.1058, -1.2456),
		svc("svc-gcb-kotokuraba", "GCB Bank — Kotokuraba", "Bank & ATM", "bank", "Kotokuraba", 5.1082, -1.2466),
		svc("svc-ecobank-commercial", "Ecobank — Commercial Street", "Bank & ATM", "bank", "Cape Coast central", 5.1049, -1.2447),
		svc("svc-momo-kotokuraba", "MTN MoMo agents — Kotokuraba", "Mobile money", "momo", "Kotokuraba", 5.1087, -1.2478),
	}
}

func capeCoastTransportPOIs() []domain.MapPoint {
	trn := func(id, title, quarter string, lat, lng float64) domain.MapPoint {
		return domain.MapPoint{ID: id, Kind: "transport", Layer: "transport", Title: title, Subtitle: "Trotro / shared taxi", Category: "station", Quarter: quarter, Lat: lat, Lng: lng}
	}
	return []domain.MapPoint{
		trn("trn-kotokuraba-station", "Kotokuraba lorry & trotro station", "Kotokuraba", 5.1078, -1.2482),
		trn("trn-pedu-junction", "Pedu Junction station", "Pedu", 5.1196, -1.2790),
		trn("trn-abura-station", "Abura station", "Abura", 5.1170, -1.2652),
	}
}

// capeCoastTrails returns the two seeded routes: the heritage walking trail and
// the Fetu Afahye durbar procession.
func capeCoastTrails() []domain.MapTrail {
	return []domain.MapTrail{
		{
			ID:          "trail-heritage-walk",
			Kind:        "heritage",
			Title:       "Cape Coast Heritage Walk",
			Description: "A walk through the old town, from the Castle on the shore up to the durbar ground at Victoria Park.",
			Color:       "#B07D32",
			Stops: []domain.MapTrailStop{
				{N: 1, Title: "Cape Coast Castle", Lat: 5.1053, Lng: -1.2419, Story: "Begin at the whitewashed fortress and the Door of No Return — the reason the world comes to Oguaa."},
				{N: 2, Title: "Fort William Lighthouse", Lat: 5.1066, Lng: -1.2506, Story: "Climb Dawson's Hill to the old fort-turned-lighthouse for the best view of the whole town."},
				{N: 3, Title: "Chapel Square", Lat: 5.1046, Lng: -1.2448, Story: "The historic civic square by the Wesley Methodist Cathedral, cradle of Ghanaian Methodism."},
				{N: 4, Title: "Kotokuraba Market", Lat: 5.1085, Lng: -1.2472, Story: "The crab-sellers' market that gave the town its name and still its beating heart."},
				{N: 5, Title: "Victoria Park", Lat: 5.1038, Lng: -1.2432, Story: "End at the durbar ground where the chiefs and Asafo companies gather each Fetu Afahye."},
			},
			Path: [][2]float64{
				{5.1053, -1.2419},
				{5.1060, -1.2470},
				{5.1066, -1.2506},
				{5.1052, -1.2470},
				{5.1046, -1.2448},
				{5.1068, -1.2462},
				{5.1085, -1.2472},
				{5.1060, -1.2450},
				{5.1038, -1.2432},
			},
		},
		{
			ID:          "trail-fetu-durbar-route",
			Kind:        "festival",
			Title:       "Fetu Afahye durbar route",
			Description: "The procession of chiefs and the seven Asafo companies, in palanquins from the paramount stool's palace through the old town to the grand durbar at Victoria Park.",
			Color:       "#A4161A",
			Stops: []domain.MapTrailStop{
				{N: 1, Title: "Emintsimadze Palace", Lat: 5.1057, Lng: -1.2472, Story: "The durbar sets off from the palace of the Omanhene of Oguaa."},
				{N: 2, Title: "Chapel Square", Lat: 5.1046, Lng: -1.2448, Story: "Palanquins and state umbrellas pass the old Methodist square."},
				{N: 3, Title: "Cape Coast Castle forecourt", Lat: 5.1053, Lng: -1.2425, Story: "The companies pause by the Castle on the shore."},
				{N: 4, Title: "Kotokuraba", Lat: 5.1085, Lng: -1.2470, Story: "Through the market heart of Oguaa, drums answering the crowd."},
				{N: 5, Title: "Victoria Park", Lat: 5.1038, Lng: -1.2432, Story: "The grand durbar of chiefs closes the festival at Victoria Park."},
			},
			Path: [][2]float64{
				{5.1057, -1.2472},
				{5.1050, -1.2458},
				{5.1046, -1.2448},
				{5.1052, -1.2432},
				{5.1053, -1.2425},
				{5.1067, -1.2450},
				{5.1085, -1.2470},
				{5.1062, -1.2452},
				{5.1038, -1.2432},
			},
		},
	}
}
