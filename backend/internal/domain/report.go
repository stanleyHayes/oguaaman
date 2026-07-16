package domain

import "context"

// Report — a member-facing notice-and-takedown report against a published
// listing (spec §14.3/§14.4/§14.7). Any visitor can raise one; stewards triage
// it from the back-office. This is the safeguard path for contested memorials,
// impersonation, and inappropriate content — distinct from the internal
// moderator "flag" action, which only annotates the audit trail.
type Report struct {
	ID           string `json:"id" bson:"_id"`
	ListingID    string `json:"listingId" bson:"listingId"`
	ListingSlug  string `json:"listingSlug" bson:"listingSlug"`
	ListingType  string `json:"listingType" bson:"listingType"`
	ListingTitle string `json:"listingTitle" bson:"listingTitle"`
	Reason       string `json:"reason" bson:"reason"` // see report reason constants
	Detail       string `json:"detail,omitempty" bson:"detail,omitempty"`
	ReporterID   string `json:"reporterId,omitempty" bson:"reporterId,omitempty"` // member id, if signed in
	ReporterName string `json:"reporterName,omitempty" bson:"reporterName,omitempty"`
	Status       string `json:"status" bson:"status"`
	CreatedAt    string `json:"createdAt" bson:"createdAt"`
	ReviewedByID string `json:"reviewedById,omitempty" bson:"reviewedById,omitempty"`
	ReviewedAt   string `json:"reviewedAt,omitempty" bson:"reviewedAt,omitempty"`
	Resolution   string `json:"resolution,omitempty" bson:"resolution,omitempty"`
	// KeeperClaim marks this as a family "claim / correct / remove" request for a
	// memorial — distinct from a generic bereavement concern. When true, the curator
	// reviews it and may transfer keeperId to the claimant, request evidence, or dismiss.
	KeeperClaim bool `json:"keeperClaim,omitempty" bson:"keeperClaim,omitempty"`
}

// Report lifecycle.
const (
	ReportOpen      = "open"
	ReportActioned  = "actioned"
	ReportDismissed = "dismissed"
)

// Report reason categories (kept stable so the clients can label them).
const (
	ReasonInaccurate    = "inaccurate"    // wrong facts / not real
	ReasonInappropriate = "inappropriate" // offensive / not for the platform
	ReasonImpersonation = "impersonation" // pretending to be someone / a body
	ReasonBereavement   = "bereavement"   // a memorial concern from the family
	ReasonOther         = "other"
)

// ValidReportReason reports whether r is a known report category.
func ValidReportReason(r string) bool {
	switch r {
	case ReasonInaccurate, ReasonInappropriate, ReasonImpersonation, ReasonBereavement, ReasonOther:
		return true
	}
	return false
}

// ReportRepository persists reports for steward triage.
type ReportRepository interface {
	Insert(ctx context.Context, r Report) error
	All(ctx context.Context) ([]Report, error)
	Get(ctx context.Context, id string) (*Report, error)
	UpdateStatus(ctx context.Context, id, status, reviewedBy, resolution, at string) error
	OpenCount(ctx context.Context) (int, error)
}
