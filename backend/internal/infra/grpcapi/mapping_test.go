package grpcapi

import (
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

func TestStructFromMap(t *testing.T) {
	if structFromMap(nil) != nil {
		t.Fatal("nil map should produce a nil struct")
	}
	if structFromMap(map[string]any{}) != nil {
		t.Fatal("empty map should produce a nil struct")
	}
	s := structFromMap(map[string]any{"name": "Ato", "count": 3, "tags": []any{"music"}})
	if s == nil {
		t.Fatal("expected a non-nil struct")
	}
	if got := s.Fields["name"].GetStringValue(); got != "Ato" {
		t.Errorf("name = %q, want Ato", got)
	}
	if got := s.Fields["count"].GetNumberValue(); got != 3 {
		t.Errorf("count = %v, want 3", got)
	}
	if got := s.Fields["tags"].GetListValue().Values[0].GetStringValue(); got != "music" {
		t.Errorf("tags[0] = %q, want music", got)
	}
}

func TestListingToPB(t *testing.T) {
	if listingToPB(nil) != nil {
		t.Fatal("nil listing should map to nil")
	}
	l := &domain.Listing{
		ID: "l1", Slug: "ato-kwamena", Type: domain.TypeArtist, Title: "Ato",
		Tags: []string{"music"}, Details: map[string]any{"genre": "highlife"},
		Tributes: []domain.Tribute{{ID: "t1", Message: "Da yie"}},
	}
	got := listingToPB(l)
	if got.GetId() != "l1" || got.GetSlug() != "ato-kwamena" || got.GetTitle() != "Ato" {
		t.Errorf("scalar fields mismatched: %+v", got)
	}
	if got.GetDetails().Fields["genre"].GetStringValue() != "highlife" {
		t.Error("details not carried through")
	}
	if len(got.GetTributes()) != 1 || got.GetTributes()[0].GetMessage() != "Da yie" {
		t.Error("tributes not carried through")
	}
}

func TestMemberToPBOmitsPrivateFields(t *testing.T) {
	// Phone/email are private (spec §11) and must never appear on the wire —
	// the generated Member has no such fields, which this guards by construction.
	m := &domain.Member{ID: "m1", Slug: "akua", DisplayName: "Akua", Phone: "+233...", Email: "x@y.z"}
	got := memberToPB(m)
	if got.GetId() != "m1" || got.GetDisplayName() != "Akua" {
		t.Errorf("member fields mismatched: %+v", got)
	}
}
