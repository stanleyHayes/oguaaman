package domain

import "context"

// Listing lifecycle states (spec §8.2).
const (
	StatusDraft       = "draft"
	StatusPending     = "pending"
	StatusApproved    = "approved"
	StatusRejected    = "rejected"
	StatusUnpublished = "unpublished"
)

// Listing types (spec §8.3; project = adopt-a-project, spec §4/§6/§15 Phase 2;
// incident = community-safety report, auto-published on submit with an
// operational lifecycle tracked in details.incidentStatus / details.statusHistory;
// lostfound = lost items, found items & missing people, auto-published like
// incidents, resolved by the owner or a curator via details.lfStatus).
const (
	TypeBusiness    = "business"
	TypeArtist      = "artist"
	TypePerson      = "person"
	TypeMemory      = "memory"
	TypeEvent       = "event"
	TypeOpportunity = "opportunity"
	TypeMemorial    = "memorial"
	TypeProject     = "project"
	TypeIncident    = "incident"
	TypeLostFound   = "lostfound"
)

// Tribute — a condolence/memory left on a memorial (spec §8.11).
type Tribute struct {
	ID         string `json:"id" bson:"id"`
	AuthorName string `json:"authorName" bson:"authorName"`
	Relation   string `json:"relation,omitempty" bson:"relation,omitempty"`
	Message    string `json:"message" bson:"message"`
	CreatedAt  string `json:"createdAt" bson:"createdAt"`
}

// Listing — Pillar 3. A single polymorphic document for every contributed entry.
// Type-specific fields live in Details (a free-form object), which is the natural
// fit for MongoDB's document model and keeps the engine to one collection.
type Listing struct {
	ID        string   `json:"id" bson:"_id"`
	Slug      string   `json:"slug" bson:"slug"`
	Type      string   `json:"type" bson:"type"`
	OwnerID   string   `json:"ownerId" bson:"ownerId"`
	Title     string   `json:"title" bson:"title"`
	Status    string   `json:"status" bson:"status"`
	Tags      []string `json:"tags" bson:"tags"`
	TownID    string   `json:"townId,omitempty" bson:"townId,omitempty"`
	SchoolIDs []string `json:"schoolIds,omitempty" bson:"schoolIds,omitempty"`
	// Optional map pin. Only set when the listing has a real, known coordinate
	// (no server-side geocoding); businesses/events/incidents/lostfound carry it
	// so the town map can drop an accurate pin. Both must be set to be usable.
	Latitude        *float64       `json:"latitude,omitempty" bson:"latitude,omitempty"`
	Longitude       *float64       `json:"longitude,omitempty" bson:"longitude,omitempty"`
	PostedByOrgID   string         `json:"postedByOrgId,omitempty" bson:"postedByOrgId,omitempty"`
	CoverImageURL   string         `json:"coverImageUrl,omitempty" bson:"coverImageUrl,omitempty"`
	Featured        bool           `json:"featured" bson:"featured"`                               // surfaced on front pages (paid placement, spec §8.14)
	FeaturedUntil   string         `json:"featuredUntil,omitempty" bson:"featuredUntil,omitempty"` // RFC3339; empty = no expiry. Past = lapsed.
	ViewCount       int            `json:"viewCount" bson:"viewCount"`
	Details         map[string]any `json:"details" bson:"details"`
	Tributes        []Tribute      `json:"tributes,omitempty" bson:"tributes,omitempty"`
	CreatedAt       string         `json:"createdAt" bson:"createdAt"`
	SubmittedAt     string         `json:"submittedAt,omitempty" bson:"submittedAt,omitempty"`
	ReviewedByID    string         `json:"reviewedById,omitempty" bson:"reviewedById,omitempty"`
	ReviewedAt      string         `json:"reviewedAt,omitempty" bson:"reviewedAt,omitempty"`
	RejectionReason string         `json:"rejectionReason,omitempty" bson:"rejectionReason,omitempty"`
	PublishedAt     string         `json:"publishedAt,omitempty" bson:"publishedAt,omitempty"`
}

// ListingFilter expresses the read predicates the API needs. Empty fields are
// ignored. SchoolID matches listings whose schoolIds array contains the id.
type ListingFilter struct {
	Type          string
	Status        string
	Slug          string
	OwnerID       string
	PostedByOrgID string
	SchoolID      string
	FeaturedOnly  bool   // when true, only currently-featured (paid, unexpired) listings
	Now           string // RFC3339; used with FeaturedOnly to exclude lapsed placements
	TownID        string // filter listings whose townId equals this value
	Tag           string // filter listings whose tags array contains this value
	Era           string // filter listings whose details.era equals this value
}

// ListingRepository is the one engine's persistence boundary (spec §8.2).
type ListingRepository interface {
	Find(ctx context.Context, f ListingFilter) ([]Listing, error)
	GetBySlug(ctx context.Context, typ, slug string) (*Listing, error)
	GetByID(ctx context.Context, id string) (*Listing, error)
	Insert(ctx context.Context, l Listing) error
	UpdateStatus(ctx context.Context, id, status, reviewedBy, reason, at string) error
	// OwnerUpdate applies a creator's content edit: title, cover, whitelisted
	// details (system keys are stripped by the service before this call), and
	// the resulting status/submittedAt (edits to non-live listings re-queue
	// them for review; approved listings stay live).
	OwnerUpdate(ctx context.Context, id, title, coverImageURL string, details map[string]any, status, submittedAt string) error
	AddTribute(ctx context.Context, listingID string, t Tribute) error
	IncrementCandles(ctx context.Context, listingID string) (int, error)
	// IncrementRaised atomically adds a confirmed pledge to a project's running
	// total (details.raisedPesewas) and bumps its backer count (details.backers).
	IncrementRaised(ctx context.Context, listingID string, deltaPesewas int64) error
	SetFeatured(ctx context.Context, id string, featured bool, until string) error
	// UpdateIncidentStatus sets details.incidentStatus and appends the history
	// entry to details.statusHistory (the incident operational lifecycle).
	UpdateIncidentStatus(ctx context.Context, listingID, status string, entry map[string]any) error
	// SetLostFoundStatus sets details.lfStatus (the lost & found resolution
	// lifecycle: open → reunited | closed).
	SetLostFoundStatus(ctx context.Context, listingID, status string) error
	// SetSubscribedUntil sets details.subscribedUntil (RFC3339) — the paid-until
	// date of a business's Supporter subscription (Phase 7).
	SetSubscribedUntil(ctx context.Context, listingID, until string) error
	// SetKeeperID sets details.keeperId on a memorial listing (a curator action
	// taken after reviewing a family keeper-claim request).
	SetKeeperID(ctx context.Context, listingID, keeperMemberID string) error
	// RecordView idempotently records a unique daily page-view. visitorKey is the
	// member ID (if authed) or "ip:"+IP (anon). Returns true when this is the
	// first view from this visitor today (viewCount was incremented).
	RecordView(ctx context.Context, listingID, visitorKey string) (bool, error)
	// ViewsThisMonth sums unique daily view records for the given listing IDs in
	// the current calendar month (YYYY-MM prefix match on the day field).
	ViewsThisMonth(ctx context.Context, listingIDs []string) (int, error)
	// PlatformViewsThisMonth counts all unique daily view records across every
	// listing in the current calendar month (admin KPI dashboard).
	PlatformViewsThisMonth(ctx context.Context) (int, error)
	// AvgApprovalHours returns the mean hours between submittedAt and reviewedAt
	// for approved listings over the last 90 days (admin KPI dashboard).
	// Returns 0.0 if there are no decisions in the window.
	AvgApprovalHours(ctx context.Context) (float64, error)
}
