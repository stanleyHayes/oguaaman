package service

import "github.com/oguaa/backend/internal/domain"

// notificationKindCategory classifies every notification kind the platform
// sends into its K14 message category. Safety, account and transaction are
// service messages (a member can't switch them off by category, only by
// channel); community and remembrances are the member's to switch off; product
// (news about Oguaa itself, i.e. marketing) is opt-in. Add every new kind here.
var notificationKindCategory = map[string]string{
	// Safety alerts.
	"incident":  domain.CategorySafety,
	"directive": domain.CategorySafety,
	"lostfound": domain.CategorySafety,

	// The member's own account, content, roles and staff duties.
	"welcome":             domain.CategoryAccount,
	"security":            domain.CategoryAccount,
	"approved":            domain.CategoryAccount,
	"rejected":            domain.CategoryAccount,
	"changes":             domain.CategoryAccount,
	"keeper-claim":        domain.CategoryAccount,
	"report":              domain.CategoryAccount,
	"org-claim":           domain.CategoryAccount,
	"org-invite":          domain.CategoryAccount,
	"org-invite-response": domain.CategoryAccount,
	"org-team":            domain.CategoryAccount,

	// Money, orders and bookings.
	"ticket":                domain.CategoryTransaction,
	"pledge":                domain.CategoryTransaction,
	"donation":              domain.CategoryTransaction,
	"order":                 domain.CategoryTransaction,
	"payout":                domain.CategoryTransaction,
	"subscription":          domain.CategoryTransaction,
	"agent-job":             domain.CategoryTransaction,
	"artist-booking":        domain.CategoryTransaction,
	"artist-booking-status": domain.CategoryTransaction,

	// Community activity.
	"birthday":   domain.CategoryCommunity,
	"review":     domain.CategoryCommunity,
	"follow":     domain.CategoryCommunity,
	"connection": domain.CategoryCommunity,
	"tribute":    domain.CategoryCommunity,

	// Yearly remembrance of memorials a member follows.
	"remembrance": domain.CategoryRemembrances,

	// Product news (marketing): only ever sent to members who opted in.
	"product":      domain.CategoryProduct,
	"product-news": domain.CategoryProduct,
	"newsletter":   domain.CategoryProduct,
	"marketing":    domain.CategoryProduct,
}

// notificationCategory returns the K14 category of a notification kind. A kind
// missing from the table is treated as an account (service) message: new
// kinds are almost always about the member's own activity, and failing closed
// would silently drop them. Marketing must use a product kind.
func notificationCategory(kind string) string {
	if c, ok := notificationKindCategory[kind]; ok {
		return c
	}
	return domain.CategoryAccount
}
