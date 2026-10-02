package domain

import "context"

// Report — a member-facing notice-and-takedown report (spec §14.3/§14.4/§14.7).
// Any piece of member content can be reported: a listing, a member profile, a
// review, a tribute, a storefront product, a news article, an agent profile or
// an AI writing suggestion. Stewards triage reports from the back-office. This
// is the safeguard path for contested memorials, impersonation, abuse and
// child safety — distinct from the internal moderator "flag" action, which only
// annotates the audit trail.
//
// Rows written before reports covered every content type carry only the
// Listing* fields; readers treat them as listing reports.
type Report struct {
	ID string `json:"id" bson:"_id"`
	// TargetType / TargetID identify what was reported (see the Report*
	// target constants). TargetTitle is a readable label for the queue and
	// TargetOwnerID the member responsible for the content (used by
	// "remove and suspend"); both are captured when the report is made.
	TargetType    string `json:"targetType" bson:"targetType,omitempty"`
	TargetID      string `json:"targetId" bson:"targetId,omitempty"`
	TargetTitle   string `json:"targetTitle" bson:"targetTitle,omitempty"`
	TargetOwnerID string `json:"targetOwnerId,omitempty" bson:"targetOwnerId,omitempty"`
	// Listing* denormalise the listing the content lives on — the listing
	// itself, or the business / memorial holding a review, product or tribute —
	// so the queue can link to the page even if the content is later removed.
	ListingID    string `json:"listingId" bson:"listingId"`
	ListingSlug  string `json:"listingSlug" bson:"listingSlug"`
	ListingType  string `json:"listingType" bson:"listingType"`
	ListingTitle string `json:"listingTitle" bson:"listingTitle"`
	Reason       string `json:"reason" bson:"reason"` // see report reason constants
	// Priority orders the triage queue: 0 is most urgent (child safety,
	// intimate images). See ReportPriority.
	Priority     int    `json:"priority" bson:"priority"`
	Detail       string `json:"detail,omitempty" bson:"detail,omitempty"`
	ReporterID   string `json:"reporterId,omitempty" bson:"reporterId,omitempty"` // member id, if signed in
	ReporterName string `json:"reporterName,omitempty" bson:"reporterName,omitempty"`
	Status       string `json:"status" bson:"status"`
	CreatedAt    string `json:"createdAt" bson:"createdAt"`
	ReviewedByID string `json:"reviewedById,omitempty" bson:"reviewedById,omitempty"`
	ReviewedAt   string `json:"reviewedAt,omitempty" bson:"reviewedAt,omitempty"`
	Resolution   string `json:"resolution,omitempty" bson:"resolution,omitempty"`
	// Action is what the reviewer did to the content when resolving
	// (ReportActionNone / Remove / RemoveAndSuspend).
	Action string `json:"action,omitempty" bson:"action,omitempty"`
	// AutoHidden is true when this report withdrew the content from public
	// view on arrival (child-safety and intimate-image reports). Resolving the
	// report with action "none" puts the content back.
	AutoHidden bool `json:"autoHidden,omitempty" bson:"autoHidden,omitempty"`
	// HiddenFromStatus is the content's public status before the auto-hide
	// (e.g. a listing's "approved"), restored if the report is dismissed.
	HiddenFromStatus string `json:"-" bson:"hiddenFromStatus,omitempty"`
	// Evidence is a JSON snapshot of the reported content taken when the
	// report arrived. It is preserved for staff review even if the content is
	// later edited or removed.
	Evidence string `json:"evidence,omitempty" bson:"evidence,omitempty"`
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

// Report target types (Report.TargetType).
const (
	ReportTargetListing  = "listing"
	ReportTargetMember   = "member"
	ReportTargetReview   = "review"
	ReportTargetTribute  = "tribute"
	ReportTargetProduct  = "product"
	ReportTargetNews     = "news"
	ReportTargetAgent    = "agent"
	ReportTargetAIOutput = "ai_output"
	// ReportTargetAgentReview is a client's review of an Oguaa Outside agent
	// (domain.AgentReview), distinct from a business review.
	ReportTargetAgentReview = "agent_review"
	// ReportTargetAd is a paid advertisement (an ad campaign). Reports on ads
	// are never auto-hidden; political ads are queued at high priority.
	ReportTargetAd = "ad"
)

// ValidReportTarget reports whether t is a reportable content type.
func ValidReportTarget(t string) bool {
	switch t {
	case ReportTargetListing, ReportTargetMember, ReportTargetReview, ReportTargetTribute,
		ReportTargetProduct, ReportTargetNews, ReportTargetAgent, ReportTargetAIOutput, ReportTargetAgentReview,
		ReportTargetAd:
		return true
	}
	return false
}

// Actions a reviewer can take when resolving a report.
const (
	ReportActionNone             = "none"               // leave the content as it is
	ReportActionRemove           = "remove"             // take the content down
	ReportActionRemoveAndSuspend = "remove_and_suspend" // take it down and suspend its author
)

// Report reason categories (kept stable so the clients can label them).
const (
	ReasonInaccurate    = "inaccurate"    // wrong facts / not real
	ReasonInappropriate = "inappropriate" // offensive / not for the platform
	ReasonImpersonation = "impersonation" // pretending to be someone / a body
	ReasonBereavement   = "bereavement"   // a memorial concern from the family
	ReasonChildSafety   = "child_safety"  // a child may be at risk, or child sexual abuse material
	ReasonNCII          = "ncii"          // intimate image shared without consent, or sextortion
	ReasonHarassment    = "harassment"    // bullying, threats or abuse aimed at a person
	ReasonHate          = "hate"          // attacks on people for who they are
	ReasonViolence      = "violence"      // threats of violence or glorifying it
	ReasonPrivateInfo   = "private_info"  // someone's phone, address or other private details
	ReasonScam          = "scam"          // fraud, fake offers, money requests
	ReasonOther         = "other"
)

// ValidReportReason reports whether r is a known report category.
func ValidReportReason(r string) bool {
	switch r {
	case ReasonInaccurate, ReasonInappropriate, ReasonImpersonation, ReasonBereavement,
		ReasonChildSafety, ReasonNCII, ReasonHarassment, ReasonHate, ReasonViolence,
		ReasonPrivateInfo, ReasonScam, ReasonOther:
		return true
	}
	return false
}

// UrgentReportReason reports whether a reason withdraws the content from public
// view the moment it is reported (and alerts stewards as urgent): child safety
// and intimate images shared without consent.
func UrgentReportReason(r string) bool {
	return r == ReasonChildSafety || r == ReasonNCII
}

// ReportPriorityHigh is the priority a report on a political ad is queued at
// (at least): next after child safety and intimate images.
const ReportPriorityHigh = 1

// ReportPriority orders the triage queue: lower is more urgent.
func ReportPriority(reason string) int {
	switch reason {
	case ReasonChildSafety, ReasonNCII:
		return 0
	case ReasonViolence:
		return 1
	case ReasonPrivateInfo:
		return 2
	case ReasonHarassment, ReasonHate:
		return 3
	case ReasonScam, ReasonImpersonation:
		return 4
	case ReasonBereavement, ReasonInappropriate:
		return 5
	default:
		return 6
	}
}

// ReportRepository persists reports for steward triage.
type ReportRepository interface {
	Insert(ctx context.Context, r Report) error
	All(ctx context.Context) ([]Report, error)
	Get(ctx context.Context, id string) (*Report, error)
	UpdateStatus(ctx context.Context, id, status, reviewedBy, resolution, at string) error
	OpenCount(ctx context.Context) (int, error)
	// OpenByTarget returns the open reports against one piece of content.
	// Legacy listing reports (no targetType) match targetType "listing".
	OpenByTarget(ctx context.Context, targetType, targetID string) ([]Report, error)
	// Resolve closes a report in one write: status, the action taken on the
	// content, the reviewer and their note.
	Resolve(ctx context.Context, id, status, action, reviewedBy, resolution, at string) error
}
