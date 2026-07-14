package domain

import "context"

// Place kinds: a residential/area quarter, or one of Oguaa's 7 Asafo companies
// (a cultural affiliation, not just geography). Members rep both (spec §8.6).
const (
	PlaceQuarter = "quarter"
	PlaceAsafo   = "asafo"
)

// Place — the "rep your town" taxonomy: Cape Coast quarters plus the Asafo
// companies (spec §8.6).
type Place struct {
	ID       string   `json:"id" bson:"_id"`
	Slug     string   `json:"slug" bson:"slug"`
	Name     string   `json:"name" bson:"name"`
	Kind     string   `json:"kind,omitempty" bson:"kind,omitempty"` // quarter (default) | asafo
	ParentID string   `json:"parentId,omitempty" bson:"parentId,omitempty"`
	Blurb    string   `json:"blurb,omitempty" bson:"blurb,omitempty"`
	Colors   []string `json:"colors,omitempty" bson:"colors,omitempty"` // Asafo company colours
}

type PlaceRepository interface {
	All(ctx context.Context) ([]Place, error)
	ByID(ctx context.Context, id string) (*Place, error)
}
