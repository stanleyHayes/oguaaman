package domain

import "context"

// Plan — a subscription plan sold to creators/businesses (Creator plan §5).
// Plans live in the `plans` collection and are managed from the admin
// dashboard (Monetization → Plans); nothing price-related is hardcoded
// client-side. The seeded catalog is Starter (free), Supporter (monthly,
// cheaper for artist/organiser creators than for businesses) and the
// Featured bundle (Supporter perks + promotion days each month).
type Plan struct {
	ID   string `json:"id" bson:"_id"`
	Slug string `json:"slug" bson:"slug"` // stable identifier subscriptions reference ("supporter")
	Name string `json:"name" bson:"name"`
	// Audience is who the plan is for: "business", "creator" (artist/
	// organiser) or "any". Display + eligibility only in v1.
	Audience string `json:"audience" bson:"audience"`
	// Prices in pesewas by audience key ("default" always present;
	// "business"/"creator" override it — Supporter is GH₵50 business,
	// GH₵30 artist/organiser).
	Prices   map[string]int64 `json:"prices" bson:"prices"`
	Interval string           `json:"interval" bson:"interval"` // "free" | "month"
	// Perks are the marketing bullet lines shown on plan cards.
	Perks       []string `json:"perks" bson:"perks"`
	MaxListings int      `json:"maxListings,omitempty" bson:"maxListings,omitempty"`
	// IncludedPromoDays are promotion days auto-applied to the subscribed
	// listing on every confirmed payment (Featured bundle: 7/month).
	IncludedPromoDays int `json:"includedPromoDays,omitempty" bson:"includedPromoDays,omitempty"`
	// TakeRatePercent is the platform's cut (integer %) on donations and
	// campaign contributions raised by a member on this plan — configured per
	// plan from the admin dashboard. Only meaningful on paid plans; a member
	// with no active paid plan cannot receive donations or run campaigns at all.
	// Replaces the flat PLATFORM_FEE_PERCENT for creator monetization flows;
	// the flat value stays the fallback for legacy civic (adopt-a-project) pledges.
	TakeRatePercent int `json:"takeRatePercent,omitempty" bson:"takeRatePercent,omitempty"`
	// MaxProducts / MaxServices cap how many storefront products and services a
	// business on this plan may publish — configured per plan from the admin
	// dashboard. 0 means none allowed on that plan.
	MaxProducts int    `json:"maxProducts,omitempty" bson:"maxProducts,omitempty"`
	MaxServices int    `json:"maxServices,omitempty" bson:"maxServices,omitempty"`
	GoldBadge   bool   `json:"goldBadge,omitempty" bson:"goldBadge,omitempty"`
	Active      bool   `json:"active" bson:"active"` // only active plans are sold/listed publicly
	SortOrder   int    `json:"sortOrder" bson:"sortOrder"`
	CreatedAt   string `json:"createdAt" bson:"createdAt"`
	UpdatedAt   string `json:"updatedAt" bson:"updatedAt"`
}

// DefaultSupporterPlanSlug is the catalog slug of the plan bought when a
// business subscribe call names no plan (the Creator plan §5 default).
const DefaultSupporterPlanSlug = "supporter"

// DefaultCreatorPlanSlug is the catalog slug bought when a member-level creator
// subscribe call names no plan (Creator Monetization).
const DefaultCreatorPlanSlug = "creator-supporter"

// DefaultCreatorPlanIntentSlug is the active free plan selected when a creator
// joins without choosing one. This records onboarding intent only; it does not
// create a Subscription or grant paid-plan benefits.
const DefaultCreatorPlanIntentSlug = "starter"

// PriceFor returns the plan's pesewas price for an audience key
// ("business"/"creator"), falling back to the default price.
func (p Plan) PriceFor(audience string) int64 {
	if v, ok := p.Prices[audience]; ok {
		return v
	}
	return p.Prices["default"]
}

// PlanRepository persists the plans catalog.
type PlanRepository interface {
	All(ctx context.Context) ([]Plan, error)
	Get(ctx context.Context, id string) (*Plan, error)
	BySlug(ctx context.Context, slug string) (*Plan, error)
	Insert(ctx context.Context, p Plan) error
	Update(ctx context.Context, p Plan) error
	Delete(ctx context.Context, id string) error
}
