package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// Stateful members stub for the diaspora register — overrides All and
// SetDiaspora on top of the nil-safe stubMembers.
type diasporaMembers struct {
	stubMembers
	ms  []domain.Member
	set *domain.Diaspora // last value persisted by SetDiaspora
}

func (d *diasporaMembers) All(context.Context) ([]domain.Member, error) { return d.ms, nil }
func (d *diasporaMembers) SetDiaspora(_ context.Context, _ string, v *domain.Diaspora) error {
	d.set = v
	return nil
}

func newDiasporaService(m *diasporaMembers) *Service {
	f := &fakeRepo{}
	return New(Deps{Listings: f, Members: m, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: stubNotifs{}, Follows: stubFollows{}, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}})
}

func TestDiasporaMembersFiltersAndSorts(t *testing.T) {
	abroad := &domain.Diaspora{Abroad: true, City: "London", Country: "United Kingdom"}
	members := &diasporaMembers{ms: []domain.Member{
		{ID: "m1", DisplayName: "Zara Home"},                                           // no opt-in
		{ID: "m2", DisplayName: "Yaw Away", Diaspora: abroad},                          // opted in
		{ID: "m3", DisplayName: "Ama Away", Diaspora: &domain.Diaspora{Abroad: true}},  // opted in
		{ID: "m4", DisplayName: "Esi Back", Diaspora: &domain.Diaspora{Abroad: false}}, // cleared
	}}
	got, err := newDiasporaService(members).DiasporaMembers(context.Background())
	if err != nil {
		t.Fatalf("DiasporaMembers: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 abroad members, got %d", len(got))
	}
	if got[0].DisplayName != "Ama Away" || got[1].DisplayName != "Yaw Away" {
		t.Fatalf("expected sort by display name, got %q then %q", got[0].DisplayName, got[1].DisplayName)
	}
}

func TestSetMemberDiasporaClearVsSet(t *testing.T) {
	members := &diasporaMembers{}
	svc := newDiasporaService(members)

	// abroad=false with no city/country clears the opt-in entirely.
	if d, err := svc.SetMemberDiaspora(context.Background(), "m1", false, " ", ""); err != nil || d != nil {
		t.Fatalf("clear: got d=%v err=%v", d, err)
	}
	if members.set != nil {
		t.Fatalf("clear should persist nil, got %+v", members.set)
	}

	// A real opt-in persists the trimmed location.
	d, err := svc.SetMemberDiaspora(context.Background(), "m1", true, " London ", " United Kingdom ")
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if d == nil || d.City != "London" || d.Country != "United Kingdom" || !d.Abroad {
		t.Fatalf("set: got %+v", d)
	}
	if members.set == nil || members.set.City != "London" {
		t.Fatalf("set should persist the location, got %+v", members.set)
	}
}
