package mongo

import "github.com/oguaa/backend/internal/domain"

// ── subscription plans catalog (Creator plan §5/§9.1) ────────────────────────
// The defaults from the Creator Platform Plan: Starter (free), Supporter
// (monthly — GH₵50 for businesses, GH₵30 for artist/organiser creators) and
// the Featured bundle (GH₵120/mo: Supporter perks + 7 promotion days applied
// on every confirmed payment). Staff edit these from Monetization → Plans;
// prices are pesewas (GH₵1 = 100).

var seedPlans = []domain.Plan{
	{
		ID: "plan-starter", Slug: "starter", Name: "Starter", Audience: "any",
		Prices: map[string]int64{"default": 0}, Interval: "free",
		Perks:       []string{"1 live listing", "Standard directory placement"},
		MaxListings: 1, Active: true, SortOrder: 1,
		CreatedAt: "2026-07-15T00:00:00Z", UpdatedAt: "2026-07-15T00:00:00Z",
	},
	{
		ID: "plan-supporter", Slug: "supporter", Name: "Supporter", Audience: "business",
		Prices: map[string]int64{"default": 3_000, "business": 5_000}, Interval: "month",
		Perks:       []string{"Gold ★ badge", "Priority sorting in the directory", "Up to 3 live listings", "More photos per listing"},
		MaxListings: 3, GoldBadge: true, Active: true, SortOrder: 2,
		CreatedAt: "2026-07-15T00:00:00Z", UpdatedAt: "2026-07-15T00:00:00Z",
	},
	{
		ID: "plan-featured", Slug: "featured", Name: "Featured bundle", Audience: "business",
		Prices: map[string]int64{"default": 12_000}, Interval: "month",
		Perks:       []string{"Everything in Supporter", "7 promotion days auto-applied every month"},
		MaxListings: 3, GoldBadge: true, IncludedPromoDays: 7, Active: true, SortOrder: 3,
		CreatedAt: "2026-07-15T00:00:00Z", UpdatedAt: "2026-07-15T00:00:00Z",
	},
}
