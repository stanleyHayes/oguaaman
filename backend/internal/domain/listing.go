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

// Operational status values for time-critical listing types.
const (
	IncidentStatusReported   = "reported"
	IncidentStatusVerified   = "verified"
	IncidentStatusResponding = "responding"
	IncidentStatusResolved   = "resolved"
	IncidentStatusRecovered  = "recovered"
	// IncidentStatusRetracted withdraws a report found to be false or
	// mistaken: the incident is unpublished and, if it was alerted town-wide,
	// a correction goes to the same audience.
	IncidentStatusRetracted = "retracted"

	LostFoundStatusOpen     = "open"
	LostFoundStatusReunited = "reunited"
	LostFoundStatusClosed   = "closed"

	// Property letting states (details.availability), owner-controlled. "let"
	// means taken — such listings drop out of the public browse + search.
	PropertyAvailabilityAvailable = "available"
	PropertyAvailabilityReserved  = "reserved"
	PropertyAvailabilityLet       = "let"
)

// ID prefixes for generated records. Centralised to satisfy SonarQube S1192.
const (
	PrefixListing      = "lst-"
	PrefixModeration   = "mod-"
	PrefixNotification = "ntf-"
	PrefixTribute      = "trb-"
	PrefixReport       = "rpt-"
	PrefixClaim        = "clm-"
	PrefixNews         = "news-"
	PrefixStripeIntent = "sti-"
	PrefixReview       = "rev-"
)

// Listing types (spec §8.3; project = adopt-a-project, spec §4/§6/§15 Phase 2;
// incident = community-safety report, auto-published on submit with an
// operational lifecycle tracked in details.incidentStatus / details.statusHistory;
// lostfound = lost items, found items & missing people, auto-published like
// incidents, resolved by the owner or a curator via details.lfStatus).
const (
	TypeBusiness    = "business"
	TypeProperty    = "property"
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

// Storefront media caps (business Supporter feature). Owners may upload up to
// this many photos and videos to their storefront gallery.
const (
	MaxStorefrontPhotos = 10
	MaxStorefrontVideos = 5
)

// StoreItem — one product or service a business publishes on its storefront
// (business Supporter feature). Prices are integer pesewas. How many a business
// may publish is capped by its subscription plan (Plan.MaxProducts /
// MaxServices), configured from the admin dashboard. Services reuse the same
// shape; Unit labels a service's pricing basis (e.g. "per hour", "from").
type StoreItem struct {
	ID           string `json:"id" bson:"id"`
	Name         string `json:"name" bson:"name"`
	Description  string `json:"description,omitempty" bson:"description,omitempty"`
	PricePesewas int64  `json:"pricePesewas,omitempty" bson:"pricePesewas,omitempty"`
	Unit         string `json:"unit,omitempty" bson:"unit,omitempty"` // services: "per hour", "from", …
	ImageURL     string `json:"imageUrl,omitempty" bson:"imageUrl,omitempty"`
	Available    bool   `json:"available" bson:"available"`
	// Kind is "physical" (goods) or "service" (in person) — see
	// StoreItemPhysical/StoreItemService. Digital goods are never accepted.
	Kind string `json:"kind,omitempty" bson:"kind,omitempty"`
}

// Tribute — a condolence/memory left on a memorial (spec §8.11).
type Tribute struct {
	ID         string `json:"id" bson:"id"`
	AuthorName string `json:"authorName" bson:"authorName"`
	Relation   string `json:"relation,omitempty" bson:"relation,omitempty"`
	Message    string `json:"message" bson:"message"`
	CreatedAt  string `json:"createdAt" bson:"createdAt"`
	// MemberID is the signed-in author. It stays server-side: it drives the
	// per-member cap, block filtering and suspension, while readers get the
	// public MemberSlug to report or block the author.
	MemberID   string `json:"-" bson:"memberId,omitempty"`
	MemberSlug string `json:"memberSlug,omitempty" bson:"memberSlug,omitempty"`
	// Status is empty for a visible tribute. Hidden and removed tributes stay
	// in the document as evidence but are never shown to the public.
	Status string `json:"status,omitempty" bson:"status,omitempty"`
}

// Tribute visibility (Tribute.Status). The zero value is visible.
const (
	TributeHidden  = "hidden"  // withdrawn pending review (child-safety / intimate-image report)
	TributeRemoved = "removed" // removed by staff, the memorial's keeper or its author
)

// MaxTributesPerMemorial caps how many tributes one memorial document may hold
// (visible or not). Tributes are embedded in the memorial, so an unbounded
// array would eventually hit MongoDB's 16 MB document limit and bloat every
// read of the memorial.
const MaxTributesPerMemorial = 500

// Incident alerts sent town-wide at most once each (see ClaimIncidentAlert).
const (
	IncidentAlertBroadcast = "broadcast" // in-app notice + push to every member
	IncidentAlertRing      = "ring"      // the critical, ringing push (curator-verified only)
)

// AnonymousVisitorPrefix starts the visitor key of a signed-out caller, who is
// known only by IP address ("ip:<addr>"); a signed-in caller's visitor key is
// the member ID. Many people can share one address.
const AnonymousVisitorPrefix = "ip:"

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
	// (no server-side geocoding); businesses/properties/events/incidents/lostfound carry it
	// so the town map can drop an accurate pin. Both must be set to be usable.
	Latitude      *float64 `json:"latitude,omitempty" bson:"latitude,omitempty"`
	Longitude     *float64 `json:"longitude,omitempty" bson:"longitude,omitempty"`
	PostedByOrgID string   `json:"postedByOrgId,omitempty" bson:"postedByOrgId,omitempty"`
	CoverImageURL string   `json:"coverImageUrl,omitempty" bson:"coverImageUrl,omitempty"`
	Featured      bool     `json:"featured" bson:"featured"`                               // surfaced on front pages (paid placement, spec §8.14)
	FeaturedUntil string   `json:"featuredUntil,omitempty" bson:"featuredUntil,omitempty"` // RFC3339; empty = no expiry. Past = lapsed.
	// PromotedUntil (RFC3339) marks PAID placement: set only by paid promotions
	// and plan-bundled promotion days, never by editorial featuring. Clients
	// label the listing "Sponsored" while it is in the future.
	PromotedUntil string `json:"promotedUntil,omitempty" bson:"promotedUntil,omitempty"`
	ViewCount     int    `json:"viewCount" bson:"viewCount"`
	// Demo marks illustrative content written by the seeder rather than
	// contributed by a real member.
	//
	// It exists for one reason: search engines must never index a fabricated
	// business. A LocalBusiness or Product entry with an invented name, address
	// and price violates Google's structured-data guidelines and would damage
	// the domain's standing before a single real trader has joined. The seeder
	// stamps every document it writes; anything a member submits is, by
	// definition, not demo. Indexing surfaces (sitemap, JSON-LD, robots) key off
	// this flag, so real content starts being indexed the moment it exists,
	// with no further change.
	Demo    bool           `json:"demo,omitempty" bson:"demo,omitempty"`
	Details map[string]any `json:"details" bson:"details"`
	// Storefront (business Supporter feature) — an owner-composed profile that
	// renders on the listing's public page. Sections reuse the institution
	// section engine (ProfileSection); Photos/Videos are a device-uploaded media
	// gallery (capped: MaxStorefrontPhotos / MaxStorefrontVideos). Handle is an
	// optional clean, unique, shareable slug (e.g. /s/aunties-kitchen) that a
	// future <handle>.oguaaman.com subdomain can map onto. Supporter-gated writes.
	Sections []ProfileSection `json:"sections,omitempty" bson:"sections,omitempty"`
	Photos   []MediaAsset     `json:"photos,omitempty" bson:"photos,omitempty"`
	Videos   []MediaAsset     `json:"videos,omitempty" bson:"videos,omitempty"`
	// Products / Services are the business storefront catalog (Supporter
	// feature). How many may be published is capped by the business's
	// subscription plan (Plan.MaxProducts / MaxServices).
	Products []StoreItem `json:"products,omitempty" bson:"products,omitempty"`
	Services []StoreItem `json:"services,omitempty" bson:"services,omitempty"`
	Handle   string      `json:"handle,omitempty" bson:"handle,omitempty"`
	Tributes []Tribute   `json:"tributes,omitempty" bson:"tributes,omitempty"`
	// Held marks a post withheld from publication until a curator reviews it:
	// a sensitive incident category, a content-screen hit, a poster without a
	// verified phone, or a child-safety / intimate-image report. Cleared when
	// a curator approves the listing.
	Held bool `json:"held,omitempty" bson:"held,omitempty"`
	// ScreenFlags are the automated content screen's reasons for a curator's
	// attention ("private_info", "sexual", …). Cleared on approval.
	ScreenFlags     []string `json:"screenFlags,omitempty" bson:"screenFlags,omitempty"`
	CreatedAt       string   `json:"createdAt" bson:"createdAt"`
	SubmittedAt     string   `json:"submittedAt,omitempty" bson:"submittedAt,omitempty"`
	ReviewedByID    string   `json:"reviewedById,omitempty" bson:"reviewedById,omitempty"`
	ReviewedAt      string   `json:"reviewedAt,omitempty" bson:"reviewedAt,omitempty"`
	RejectionReason string   `json:"rejectionReason,omitempty" bson:"rejectionReason,omitempty"`
	PublishedAt     string   `json:"publishedAt,omitempty" bson:"publishedAt,omitempty"`
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
	// AddTribute appends a tribute to a memorial. It refuses (ValidationError)
	// once the memorial holds MaxTributesPerMemorial tributes.
	AddTribute(ctx context.Context, listingID string, t Tribute) error
	// SetTributeStatus changes one tribute's visibility ("" visible,
	// TributeHidden, TributeRemoved) without deleting it.
	SetTributeStatus(ctx context.Context, listingID, tributeID, status string) error
	// GetByTributeID returns the memorial that holds the tribute (or NotFound).
	GetByTributeID(ctx context.Context, tributeID string) (*Listing, error)
	// RemoveStoreItem pulls one product or service (by item id) out of a
	// business storefront catalog.
	RemoveStoreItem(ctx context.Context, listingID, itemID string) error
	// HoldForReview withdraws a listing from public view until a curator
	// reviews it (status pending, held), e.g. after a child-safety report.
	HoldForReview(ctx context.Context, id, at string) error
	// SetScreenFlags records the content screen's reasons for a curator's
	// attention on a listing (cleared again on approval).
	SetScreenFlags(ctx context.Context, id string, flags []string) error
	// ClaimIncidentAlert records that the named town-wide alert
	// (IncidentAlertBroadcast / IncidentAlertRing) is being sent for an
	// incident. It reports false when that alert was already claimed, so each
	// alert goes out at most once even if curators act concurrently.
	ClaimIncidentAlert(ctx context.Context, listingID, alert, at string) (bool, error)
	// MarkPostReviewed records that a curator looked at an auto-published
	// safety post (details.postReviewedAt / postReviewedBy).
	MarkPostReviewed(ctx context.Context, id, reviewerID, at string) error
	// IncrementCandles lights one candle for visitorKey and returns the count.
	// A visitor lights at most perDay candles per listing per UTC day; past
	// that the counter is unchanged and the current count is returned.
	IncrementCandles(ctx context.Context, listingID, visitorKey string, perDay int) (int, error)
	// IncrementRaised atomically adds a confirmed pledge to a project's running
	// total (details.raisedPesewas) and bumps its backer count (details.backers).
	// It is keyed on the payment reference: the same reference is credited at
	// most once, so a retried grant never counts a pledge twice. It reports
	// whether this call credited it.
	IncrementRaised(ctx context.Context, listingID, reference string, deltaPesewas int64) (bool, error)
	// IncrementDonations atomically adds a confirmed artist donation to the
	// artist listing's running net total (details.donationsNetPesewas) and bumps
	// its donor count (details.donorCount), at most once per reference. The
	// "tip jar" counterpart of IncrementRaised (Creator Monetization).
	IncrementDonations(ctx context.Context, listingID, reference string, deltaNetPesewas int64) (bool, error)
	// SetRating stores a listing's recomputed review aggregate
	// (details.ratingAvg, details.ratingCount) so the directory reads it cheaply.
	SetRating(ctx context.Context, listingID string, avg float64, count int) error
	SetFeatured(ctx context.Context, id string, featured bool, until string) error
	// SetPromotedUntil records the end of a listing's paid placement (the
	// "Sponsored" label). Editorial featuring never calls it.
	SetPromotedUntil(ctx context.Context, id, until string) error
	// UpdateIncidentStatus sets details.incidentStatus and appends the history
	// entry to details.statusHistory (the incident operational lifecycle).
	UpdateIncidentStatus(ctx context.Context, listingID, status string, entry map[string]any) error
	// SetLostFoundStatus sets details.lfStatus (the lost & found resolution
	// lifecycle: open → reunited | closed).
	SetLostFoundStatus(ctx context.Context, listingID, status string) error
	// SetPropertyAvailability sets details.availability (available | reserved |
	// let) — the owner-controlled letting state. A "let" property drops out of
	// the public browse + search without re-queuing for moderation.
	SetPropertyAvailability(ctx context.Context, listingID, availability string) error
	// SetSubscribedUntil sets details.subscribedUntil (RFC3339) — the paid-until
	// date of a business's Supporter subscription (Phase 7) — and details.plan,
	// the active plan slug used to resolve storefront product/service caps.
	SetSubscribedUntil(ctx context.Context, listingID, plan, until string) error
	// SetStorefront replaces a business listing's owner-composed storefront:
	// profile sections + the photo/video gallery + the product/service catalog +
	// optional clean handle.
	SetStorefront(ctx context.Context, id, handle string, sections []ProfileSection, photos, videos []MediaAsset, products, services []StoreItem) error
	// GetByHandle returns a listing by its clean storefront handle (or NotFound).
	GetByHandle(ctx context.Context, handle string) (*Listing, error)
	// HandleTaken reports whether a storefront handle is already used by another
	// listing (exceptID is the listing being edited, allowed to keep its handle).
	HandleTaken(ctx context.Context, handle, exceptID string) (bool, error)
	// SetKeeperID sets details.keeperId on a memorial listing (a curator action
	// taken after reviewing a family keeper-claim request).
	SetKeeperID(ctx context.Context, listingID, keeperMemberID string) error
	// ReassignOrgListings moves the listings a team member posted for an
	// institution (postedByOrgId = orgID, ownerId = fromOwnerID) to
	// toOwnerID — used when the member is removed from the team, so they keep
	// no control over its official events. Returns how many moved.
	ReassignOrgListings(ctx context.Context, orgID, fromOwnerID, toOwnerID string) (int, error)
	// RecordView idempotently records a unique daily page-view. visitorKey is the
	// member ID (if authed) or "ip:"+IP (anon). Returns true when this is the
	// first view from this visitor today (viewCount was incremented).
	RecordView(ctx context.Context, listingID, visitorKey string) (bool, error)
	// ViewsThisMonth sums unique daily view records for the given listing IDs in
	// the current calendar month (YYYY-MM prefix match on the day field).
	ViewsThisMonth(ctx context.Context, listingIDs []string) (int, error)
	// PlatformViewsThisMonth counts all unique daily page-view records across
	// every listing in the current calendar month (admin KPI dashboard). Candles
	// are not page views.
	PlatformViewsThisMonth(ctx context.Context) (int, error)
	// AvgApprovalHours returns the mean hours between submittedAt and reviewedAt
	// for approved listings over the last 90 days (admin KPI dashboard).
	// Returns 0.0 if there are no decisions in the window.
	AvgApprovalHours(ctx context.Context) (float64, error)
}
