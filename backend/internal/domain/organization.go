package domain

import "context"

// Office — a position within an institution, held by a verified member (spec §8.13).
type Office struct {
	ID         string `json:"id" bson:"id"`
	Role       string `json:"role" bson:"role"`
	HolderID   string `json:"holderId,omitempty" bson:"holderId,omitempty"`
	HolderName string `json:"holderName,omitempty" bson:"holderName,omitempty"`
	Verified   bool   `json:"verified" bson:"verified"`
}

// Organization — Pillar 2, an institution with an official, verified profile (spec §8.13).
type Organization struct {
	ID             string       `json:"id" bson:"_id"`
	Slug           string       `json:"slug" bson:"slug"`
	Kind           string       `json:"kind" bson:"kind"`
	Name           string       `json:"name" bson:"name"`
	OfficialTitle  string       `json:"officialTitle,omitempty" bson:"officialTitle,omitempty"`
	Motto          string       `json:"motto,omitempty" bson:"motto,omitempty"`
	CrestURL       string       `json:"crestUrl,omitempty" bson:"crestUrl,omitempty"`
	Summary        string       `json:"summary" bson:"summary"`
	History        string       `json:"history,omitempty" bson:"history,omitempty"`
	Founded        int          `json:"founded,omitempty" bson:"founded,omitempty"`
	Classification string       `json:"classification,omitempty" bson:"classification,omitempty"`
	Jurisdiction   string       `json:"jurisdiction,omitempty" bson:"jurisdiction,omitempty"`
	Contact        []SocialLink `json:"contact,omitempty" bson:"contact,omitempty"`
	Offices        []Office     `json:"offices,omitempty" bson:"offices"`
	// Gallery is the institution's photo library; Sections is the author-composed
	// custom showcase (the "official page" body). Both are manager-editable via
	// dedicated setters (see SetGallery/SetSections), kept off OrgProfilePatch so a
	// plain profile save never clobbers them.
	Gallery       []MediaAsset     `json:"gallery,omitempty" bson:"gallery,omitempty"`
	Sections      []ProfileSection `json:"sections,omitempty" bson:"sections,omitempty"`
	RelatedOrgIDs []string         `json:"relatedOrgIds,omitempty" bson:"relatedOrgIds,omitempty"`
	Verified      bool             `json:"verified" bson:"verified"`
	VerifiedOn    string           `json:"verifiedOn,omitempty" bson:"verifiedOn,omitempty"`
	HouseColors   []string         `json:"houseColors,omitempty" bson:"houseColors,omitempty"`
	OSAName       string           `json:"osaName,omitempty" bson:"osaName,omitempty"`
	MemberCount   int              `json:"memberCount,omitempty" bson:"memberCount,omitempty"`
}

type OrganizationRepository interface {
	All(ctx context.Context) ([]Organization, error)
	ByKind(ctx context.Context, kind string) ([]Organization, error)
	BySlug(ctx context.Context, slug string) (*Organization, error)
	ByID(ctx context.Context, id string) (*Organization, error)
	// Create inserts a new organization (steward action — e.g. a new heritage place).
	Create(ctx context.Context, org Organization) error
	SetVerified(ctx context.Context, id string, verified bool, on string) error
	// Manager-editable mutations (spec §8.13): "soft" profile fields and the
	// roster of offices. Authoritative fields stay steward-only via SetVerified.
	UpdateProfile(ctx context.Context, id string, patch OrgProfilePatch) error
	SetOffices(ctx context.Context, id string, offices []Office) error
	// SetGallery / SetSections replace the institution's photo gallery and custom
	// showcase sections wholesale (full-replace, mirroring SetOffices).
	SetGallery(ctx context.Context, id string, gallery []MediaAsset) error
	SetSections(ctx context.Context, id string, sections []ProfileSection) error
}
