package mongo

import "github.com/oguaa/backend/internal/domain"

// ── subscription plans catalog (Creator plan §5/§9.1; Creator Monetization) ──
// The defaults from the Creator Platform Plan: Starter (free), Supporter
// (monthly — GH₵50 for businesses) and the Featured bundle (GH₵120/mo:
// Supporter perks + 7 promotion days applied on every confirmed payment), plus
// the creator-audience plans that unlock artist donations and fundraising
// campaigns. Staff edit ALL of these from Monetization → Plans — prices
// (pesewas, GH₵1 = 100), the platform take-rate on donations/campaigns
// (takeRatePercent) and the storefront product/service caps are configured
// there, never hardcoded client-side. The values below are only starting points.

var seedPlans = []domain.Plan{
	{
		ID: "plan-starter", Slug: "starter", Name: "Starter", Audience: "any",
		Prices: map[string]int64{"default": 0}, Interval: "free",
		Perks:       []string{"1 live listing", "Standard directory placement", "Up to 3 storefront services"},
		MaxListings: 1, MaxServices: 3, Active: true, SortOrder: 1,
		CreatedAt: "2026-07-15T00:00:00Z", UpdatedAt: "2026-07-15T00:00:00Z",
	},
	{
		ID: "plan-supporter", Slug: "supporter", Name: "Supporter", Audience: "business",
		Prices: map[string]int64{"default": 3_000, "business": 5_000}, Interval: "month",
		Perks:       []string{"Gold ★ badge", "Priority sorting in the directory", "Up to 3 live listings", "10 products & 10 services on your storefront"},
		MaxListings: 3, MaxProducts: 10, MaxServices: 10, GoldBadge: true, Active: true, SortOrder: 2,
		CreatedAt: "2026-07-15T00:00:00Z", UpdatedAt: "2026-07-15T00:00:00Z",
	},
	{
		ID: "plan-featured", Slug: "featured", Name: "Featured bundle", Audience: "business",
		Prices: map[string]int64{"default": 12_000}, Interval: "month",
		Perks:       []string{"Everything in Supporter", "30 products & 30 services", "7 promotion days auto-applied every month"},
		MaxListings: 3, MaxProducts: 30, MaxServices: 30, GoldBadge: true, IncludedPromoDays: 7, Active: true, SortOrder: 3,
		CreatedAt: "2026-07-15T00:00:00Z", UpdatedAt: "2026-07-15T00:00:00Z",
	},
	{
		ID: "plan-creator-supporter", Slug: "creator-supporter", Name: "Creator Supporter", Audience: "creator",
		Prices: map[string]int64{"default": 3_000, "creator": 3_000}, Interval: "month",
		Perks:           []string{"Accept fan donations on your profile", "Run fundraising campaigns", "Gold ★ badge", "15% platform fee on what you raise"},
		TakeRatePercent: 15, GoldBadge: true, Active: true, SortOrder: 4,
		CreatedAt: "2026-07-15T00:00:00Z", UpdatedAt: "2026-07-15T00:00:00Z",
	},
	{
		ID: "plan-creator-pro", Slug: "creator-pro", Name: "Creator Pro", Audience: "creator",
		Prices: map[string]int64{"default": 8_000, "creator": 8_000}, Interval: "month",
		Perks:           []string{"Everything in Creator Supporter", "Lower 10% platform fee on what you raise", "Priority support"},
		TakeRatePercent: 10, GoldBadge: true, Active: true, SortOrder: 5,
		CreatedAt: "2026-07-15T00:00:00Z", UpdatedAt: "2026-07-15T00:00:00Z",
	},
}
