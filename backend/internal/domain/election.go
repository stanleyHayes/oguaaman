package domain

import "context"

// The election calendar (spec §1.2) is one source of truth for both features:
// it drives political-ad windows and blackouts (Feature B) and the newsroom's
// "election mode" (Feature A).
const (
	ElectionGeneral          = "general"           // presidential + parliamentary
	ElectionParliamentaryBy  = "parliamentary_by"  // by-election
	ElectionPartyPrimary     = "party_primary"     // a party's own primary
	ElectionDistrictAssembly = "district_assembly" // non-partisan (Art. 248)
	ElectionReferendum       = "referendum"
)

// Election scopes: where the vote happens.
const (
	ElectionScopeNational     = "national"
	ElectionScopeRegion       = "region"
	ElectionScopeConstituency = "constituency"
)

// PrefixElection starts every election id.
const PrefixElection = "elc-"

// ValidElectionKind reports whether k is a known election kind.
func ValidElectionKind(k string) bool {
	switch k {
	case ElectionGeneral, ElectionParliamentaryBy, ElectionPartyPrimary, ElectionDistrictAssembly, ElectionReferendum:
		return true
	}
	return false
}

// ValidElectionScope reports whether s is a known election scope.
func ValidElectionScope(s string) bool {
	switch s {
	case ElectionScopeNational, ElectionScopeRegion, ElectionScopeConstituency:
		return true
	}
	return false
}

// Election is one entry on the calendar. Dates are YYYY-MM-DD in
// Africa/Accra; BlackoutStart/BlackoutEnd are RFC3339 instants. Every field
// is public.
type Election struct {
	ID                string   `json:"id" bson:"_id"`
	Name              string   `json:"name" bson:"name"` // "2028 General Election"
	Kind              string   `json:"kind" bson:"kind"`
	Scope             string   `json:"scope" bson:"scope"`                       // national | region | constituency
	Areas             []string `json:"areas,omitempty" bson:"areas,omitempty"`   // e.g. ["Cape Coast North"]
	PollDate          string   `json:"pollDate" bson:"pollDate"`                 // YYYY-MM-DD
	PoliticalAdsFrom  string   `json:"politicalAdsFrom" bson:"politicalAdsFrom"` // date; default pollDate-90d
	BlackoutStart     string   `json:"blackoutStart" bson:"blackoutStart"`       // RFC3339; default (pollDate-1d) 00:00 Accra
	BlackoutEnd       string   `json:"blackoutEnd" bson:"blackoutEnd"`           // RFC3339; default (pollDate+2d) 00:00 Accra [A12]
	NewsModeFrom      string   `json:"newsModeFrom" bson:"newsModeFrom"`         // date; default pollDate-30d
	NewsModeTo        string   `json:"newsModeTo" bson:"newsModeTo"`             // date; default pollDate+3d
	ResultsDeclaredAt string   `json:"resultsDeclaredAt,omitempty" bson:"resultsDeclaredAt,omitempty"`
	Notes             string   `json:"notes,omitempty" bson:"notes,omitempty"`
	CreatedAt         string   `json:"createdAt" bson:"createdAt"`
	UpdatedAt         string   `json:"updatedAt" bson:"updatedAt"`
}

// ElectionRepository persists the calendar (collection `elections`).
type ElectionRepository interface {
	Insert(ctx context.Context, e Election) error
	// Update replaces the stored election with e (matched by id); a missing id
	// is a *NotFoundError.
	Update(ctx context.Context, e Election) error
	// Delete removes the election; a missing id is a *NotFoundError.
	Delete(ctx context.Context, id string) error
	Get(ctx context.Context, id string) (*Election, error)
	All(ctx context.Context) ([]Election, error) // sorted by pollDate desc
}
