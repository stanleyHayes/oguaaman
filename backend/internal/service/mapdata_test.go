package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

func f64(v float64) *float64 { return &v }

// mapOrgs is an OrganizationRepository returning a fixed set (only All is used).
type mapOrgs struct{ items []domain.Organization }

func (m mapOrgs) All(context.Context) ([]domain.Organization, error) { return m.items, nil }
func (mapOrgs) ByKind(context.Context, string) ([]domain.Organization, error) {
	return nil, nil
}
func (mapOrgs) BySlug(context.Context, string) (*domain.Organization, error)        { return nil, nil }
func (mapOrgs) ByID(context.Context, string) (*domain.Organization, error)          { return nil, nil }
func (mapOrgs) Create(context.Context, domain.Organization) error                   { return nil }
func (mapOrgs) SetVerified(context.Context, string, bool, string) error             { return nil }
func (mapOrgs) UpdateProfile(context.Context, string, domain.OrgProfilePatch) error { return nil }
func (mapOrgs) SetOffices(context.Context, string, []domain.Office) error           { return nil }
func (mapOrgs) SetGallery(context.Context, string, []domain.MediaAsset) error       { return nil }
func (mapOrgs) SetSections(context.Context, string, []domain.ProfileSection) error  { return nil }

func TestMapDataAggregates(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "b1", Slug: "biz", Type: domain.TypeBusiness, Status: domain.StatusApproved, Title: "Fish spot", TownID: "kotokuraba",
			Latitude: f64(5.108), Longitude: f64(-1.247), Details: map[string]any{"category": "Market", "address": "Kotokuraba"}},
		{ID: "i1", Slug: "flood", Type: domain.TypeIncident, Status: domain.StatusApproved, Title: "Flood",
			Latitude: f64(5.101), Longitude: f64(-1.256), Details: map[string]any{"severity": "high", "category": "flood", "location": "Bakaano"}},
		// Approved but no coordinates → not a point.
		{ID: "b2", Slug: "nocoord", Type: domain.TypeBusiness, Status: domain.StatusApproved, Title: "No pin"},
		// Located, but a type the map does not pin.
		{ID: "a1", Slug: "artist", Type: domain.TypeArtist, Status: domain.StatusApproved, Title: "Artist", Latitude: f64(5.1), Longitude: f64(-1.2)},
	}}
	orgs := mapOrgs{items: []domain.Organization{
		{ID: "sch", Slug: "mfantsipim", Kind: "school", Name: "Mfantsipim", Latitude: f64(5.103), Longitude: f64(-1.253)},
		{ID: "cas", Slug: "cape-coast-castle", Kind: "heritage", Name: "Cape Coast Castle", Latitude: f64(5.105), Longitude: f64(-1.242)},
		{ID: "noc", Slug: "no-coord-org", Kind: "faith", Name: "No coords"}, // skipped
	}}
	dirs := &fakeDirectives{items: []domain.Directive{
		{ID: "d-geo", Slug: "works", Title: "Road works", Severity: "high", Status: domain.DirectiveStatusActive,
			EffectiveFrom: "2020-01-01T00:00:00Z", Latitude: f64(5.104), Longitude: f64(-1.255), RadiusM: f64(400)},
		{ID: "d-nogeo", Slug: "advisory", Title: "Advisory", Severity: "medium", Status: domain.DirectiveStatusActive,
			EffectiveFrom: "2020-01-01T00:00:00Z"}, // active but no geo → no area
	}}

	svc := New(Deps{Listings: listings, Members: stubMembers{}, Orgs: orgs, Places: stubPlaces{},
		Mod: modRepo{listings}, Notifs: stubNotifs{}, Follows: stubFollows{}, Claims: stubClaims{},
		News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}, Directives: dirs})

	got, err := svc.MapData(context.Background())
	if err != nil {
		t.Fatalf("MapData: %v", err)
	}

	byID := map[string]domain.MapPoint{}
	for _, p := range got.Points {
		byID[p.ID] = p
	}
	if _, ok := byID["b2"]; ok {
		t.Error("business without coordinates must not be a point")
	}
	if _, ok := byID["a1"]; ok {
		t.Error("artist listing must not be pinned")
	}
	if _, ok := byID["noc"]; ok {
		t.Error("org without coordinates must not be a point")
	}
	biz := byID["b1"]
	if biz.Kind != "business" || biz.Layer != "business" || biz.Href != "/business/biz" {
		t.Errorf("business point wrong: %+v", biz)
	}
	if biz.Category != "Market" || biz.Quarter != "kotokuraba" {
		t.Errorf("business category/quarter wrong: %+v", biz)
	}
	if inc := byID["i1"]; inc.Kind != "incident" || inc.Layer != "safety" || inc.Severity != "high" || inc.Href != "/safety/flood" {
		t.Errorf("incident point wrong: %+v", inc)
	}
	if sch := byID["sch"]; sch.Kind != "school" || sch.Layer != "institutions" || sch.Href != "/education/mfantsipim" {
		t.Errorf("school point wrong: %+v", sch)
	}
	if cas := byID["cas"]; cas.Kind != "landmark" || cas.Layer != "landmarks" {
		t.Errorf("heritage point wrong: %+v", cas)
	}

	// Furniture: at least one service and one transport POI, and both trails.
	var services, transport int
	for _, p := range got.Points {
		switch p.Layer {
		case "services":
			services++
		case "transport":
			transport++
		}
	}
	if services == 0 || transport == 0 {
		t.Errorf("expected seeded service and transport POIs, got services=%d transport=%d", services, transport)
	}
	if len(got.Trails) != 2 {
		t.Fatalf("expected 2 trails, got %d", len(got.Trails))
	}
	var haveHeritage, haveFestival bool
	for _, tr := range got.Trails {
		if len(tr.Stops) == 0 || len(tr.Path) == 0 {
			t.Errorf("trail %q missing stops or path", tr.ID)
		}
		switch tr.Kind {
		case "heritage":
			haveHeritage = true
		case "festival":
			haveFestival = true
		}
	}
	if !haveHeritage || !haveFestival {
		t.Error("expected one heritage trail and one festival trail")
	}

	// Areas: only the active directive with a full geo footprint.
	if len(got.Areas) != 1 {
		t.Fatalf("expected 1 area, got %d", len(got.Areas))
	}
	if a := got.Areas[0]; a.ID != "d-geo" || a.Kind != "directive" || a.RadiusM != 400 || a.Severity != "high" {
		t.Errorf("area wrong: %+v", a)
	}
}
