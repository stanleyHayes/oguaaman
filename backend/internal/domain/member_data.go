package domain

import (
	"context"
	"time"
)

// ── a member's personal data across the platform (Act 843 access + erasure) ──
//
// The member document is only one of the places personal data lives. Orders,
// bookings, reviews, reports, follows, notifications, agent vetting files and
// payment ledgers all carry a member's name, contact details or id. The export
// and erasure flows reach them through MemberDataRepository so that neither can
// silently forget a collection.

// AIUsageDay is one day's writing-assistant call count for a member.
type AIUsageDay struct {
	Day   string `json:"day" bson:"day"`
	Count int    `json:"count" bson:"count"`
}

// UploadRecord remembers who uploaded a first-party image (POST /api/uploads),
// so the file can be found and deleted when that member erases their account.
type UploadRecord struct {
	Name      string `json:"name" bson:"_id"` // file name under UPLOAD_DIR
	OwnerID   string `json:"-" bson:"ownerId"`
	CreatedAt string `json:"createdAt" bson:"createdAt"`
}

// UploadRepository stores first-party upload ownership.
type UploadRepository interface {
	Record(ctx context.Context, rec UploadRecord) error
	ByOwner(ctx context.Context, ownerID string) ([]UploadRecord, error)
	DeleteByOwner(ctx context.Context, ownerID string) error
}

// TributeWritten is a tribute the member left on someone else's memorial, with
// the memorial it sits on.
type TributeWritten struct {
	MemorialID    string  `json:"memorialId"`
	MemorialSlug  string  `json:"memorialSlug"`
	MemorialTitle string  `json:"memorialTitle"`
	Tribute       Tribute `json:"tribute"`
}

// MemberRecords is every record outside the member document that holds the
// member's personal data, as loaded for a data export.
type MemberRecords struct {
	Listings               []Listing                `json:"listings"`
	Tickets                []Ticket                 `json:"tickets"`
	Subscriptions          []Subscription           `json:"subscriptions"`
	Pledges                []Pledge                 `json:"pledges"`
	Promotions             []Promotion              `json:"promotions"`
	StripeIntents          []StripeIntent           `json:"stripePayments"`
	AppleTransactions      []AppleTransactionRecord `json:"applePurchases"`
	Orders                 []CommerceOrder          `json:"orders"`
	SellerOrders           []CommerceOrder          `json:"sellerOrders"`
	BusinessVerifications  []BusinessVerification   `json:"businessVerifications"`
	ArtistBookingsMade     []ArtistBooking          `json:"artistBookingsMade"`
	ArtistBookingsReceived []ArtistBooking          `json:"artistBookingsReceived"`
	Agent                  *Agent                   `json:"agentProfile"`
	AgentJobs              []AgentJob               `json:"agentJobs"`
	AgentReviewsWritten    []AgentReview            `json:"agentReviewsWritten"`
	Reviews                []Review                 `json:"businessReviewsWritten"`
	TributesWritten        []TributeWritten         `json:"tributesWritten"`
	Following              []MemberFollow           `json:"following"`
	FollowerCount          int                      `json:"followerCount"`
	MemorialsRemembered    []Follow                 `json:"memorialsRemembered"`
	Blocks                 []MemberBlock            `json:"blocks"`
	Notifications          []Notification           `json:"notifications"`
	PushDevices            []PushSubscription       `json:"pushDevices"`
	News                   []NewsArticle            `json:"newsArticles"`
	Reports                []Report                 `json:"reportsFiled"`
	OrgClaims              []OrgClaim               `json:"institutionRoles"`
	AIUsage                []AIUsageDay             `json:"writingAssistantUsage"`
	Uploads                []UploadRecord           `json:"uploads"`
	PrivateUploads         []PrivateUpload          `json:"privateDocuments"`
	PrivacyRequests        []PrivacyRequest         `json:"privacyRequests"`
}

// MemberDataRepository reads and erases a member's personal data outside their
// own member document. Every erase method is idempotent, so a failed erasure
// can simply be run again.
type MemberDataRepository interface {
	// ExportRecords loads every section of MemberRecords. It fails as a whole
	// (naming the section) when any collection cannot be read: an export must
	// never look complete when it is not. Records are matched by member id
	// only: a member's email is not verified, so records keyed by an email
	// address (seller-registered affiliates) are left to the steward
	// privacy-request queue, where identity is checked.
	ExportRecords(ctx context.Context, memberID string) (*MemberRecords, error)

	// OpenObligations describes, in plain English, anything that must be
	// finished before the account can be deleted: escrow jobs holding money,
	// and paid shop orders still waiting to be fulfilled.
	OpenObligations(ctx context.Context, memberID string) ([]string, error)

	// DeleteNotifications removes the member's in-app notifications.
	DeleteNotifications(ctx context.Context, memberID string) error
	// DeleteFollows removes memorial "remember" links and member follows in
	// both directions.
	DeleteFollows(ctx context.Context, memberID string) error
	// DeleteOrgRoles removes the member's institution claims and team roles and
	// clears them from public office-holder rosters.
	DeleteOrgRoles(ctx context.Context, memberID string) error
	// SuspendAgentProfile takes the member's Oguaa Outside profile offline and
	// wipes its identity, ID document, guarantor and payout details.
	SuspendAgentProfile(ctx context.Context, memberID string) error
	// PseudonymiseAgentJobs removes the member's name and email from escrow jobs
	// (as client or agent), keeping amounts and references.
	PseudonymiseAgentJobs(ctx context.Context, memberID string) error
	// AnonymiseAuthorship renames reviews, agent reviews, tributes and news
	// bylines the member wrote to "Former member", and deletes unpublished news
	// drafts.
	AnonymiseAuthorship(ctx context.Context, memberID string) error
	// PseudonymiseReports removes the reporter's identity from reports filed.
	PseudonymiseReports(ctx context.Context, memberID string) error
	// UnpublishListings takes the member's own listings offline and removes
	// contact details from them. Listings posted on behalf of an institution
	// stay with the institution. Returns how many were unpublished.
	UnpublishListings(ctx context.Context, memberID string) (int, error)
	// PseudonymiseOrders removes buyer name, contact and address from the
	// member's shop orders, keeping amounts and references.
	PseudonymiseOrders(ctx context.Context, memberID string) error
	// PseudonymiseArtistBookings removes requester identity and contact from the
	// booking requests the member sent.
	PseudonymiseArtistBookings(ctx context.Context, memberID string) error
	// StripPaymentContacts removes payer emails from pledges, tickets,
	// subscriptions, promotions and card payments.
	StripPaymentContacts(ctx context.Context, memberID string) error
	// ScrubBusinessVerifications revokes the KYC records of the member's
	// businesses and deletes the Ghana Card number, ID documents, phone, address
	// and settlement account, keeping the business registration identifiers.
	ScrubBusinessVerifications(ctx context.Context, memberID string) error
	// DeleteUsageCounters removes per-member AI usage and listing-view counters.
	DeleteUsageCounters(ctx context.Context, memberID string) error
	// RetainedMediaRefs returns every string, at any depth, in the content
	// that outlives the member's erasure and can show an uploaded file —
	// listings (all but the member's own, which erasure takes down), news
	// (all but the member's unpublished drafts, which erasure deletes) and
	// institution pages — that contains one of needles, the locations of
	// files the member uploaded. Anyone's upload can appear anywhere there
	// (stewards edit every institution page, editors every article), so the
	// erasure keeps every file these strings point at. Call it before the
	// erasure takes anything down.
	RetainedMediaRefs(ctx context.Context, memberID string, needles []string) ([]string, error)
	// ReassignToTombstone moves every reference to the member on a record the
	// erasure keeps — payment ledgers and escrow jobs, their listings and
	// published news, staff and audit trails — from their id onto
	// tombstoneID, the random id of the tombstone that replaces them: member
	// ids minted at sign-up embed the member's name. The records stay linked
	// to one anonymous account, as tax and dispute handling need.
	ReassignToTombstone(ctx context.Context, memberID, tombstoneID string) error
}

// AccountDeletionCode is a pending "delete my account" confirmation code for
// members who cannot sign in (Google Play's web deletion requirement). Only a
// bcrypt hash of the code is stored.
type AccountDeletionCode struct {
	MemberID  string    `bson:"_id"`
	CodeHash  string    `bson:"codeHash"`
	Attempts  int       `bson:"attempts"`
	ExpiresAt time.Time `bson:"expiresAt"` // BSON date, so a TTL index can expire it
	CreatedAt time.Time `bson:"createdAt"`
}

// AccountDeletionCodeRepository stores pending deletion codes (one per member).
type AccountDeletionCodeRepository interface {
	Save(ctx context.Context, c AccountDeletionCode) error
	Get(ctx context.Context, memberID string) (*AccountDeletionCode, error)
	IncrementAttempts(ctx context.Context, memberID string) error
	Delete(ctx context.Context, memberID string) error
}
