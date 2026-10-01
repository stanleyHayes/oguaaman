package service

import (
	"context"
	"errors"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── subscription plans catalog (Creator plan §5/§9.1) ────────────────────────
// Plan names, prices and perks are staff-configurable from the admin
// dashboard; the public catalog feeds the creator Grow page and the portal
// subscribe panel so nothing price-related is hardcoded client-side.

// PlanInput is a create/update payload from the admin Plans page.
type PlanInput struct {
	Name              string           `json:"name"`
	Slug              string           `json:"slug"`
	Audience          string           `json:"audience"`
	Prices            map[string]int64 `json:"prices"`
	Interval          string           `json:"interval"`
	Perks             []string         `json:"perks"`
	MaxListings       int              `json:"maxListings"`
	IncludedPromoDays int              `json:"includedPromoDays"`
	TakeRatePercent   int              `json:"takeRatePercent"`
	MaxProducts       int              `json:"maxProducts"`
	MaxServices       int              `json:"maxServices"`
	GoldBadge         bool             `json:"goldBadge"`
	Active            bool             `json:"active"`
	SortOrder         int              `json:"sortOrder"`
}

var planSlugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,48}$`)

// Plan validation messages reused across checks.
const (
	msgPlanDefaultPrice = "a default price is required (0 for a free plan)"
	msgPlanSlugTaken    = "a plan with that slug already exists"
)

// invalidPlan is a curator-fixable problem with a plan form: the admin
// handlers answer it with 400 and the message.
func invalidPlan(msg string) error { return &domain.ValidationError{Message: msg} }

func validatePlan(in PlanInput) (domain.Plan, error) {
	p := domain.Plan{
		Name: strings.TrimSpace(in.Name), Audience: strings.TrimSpace(in.Audience),
		Interval: strings.TrimSpace(in.Interval), MaxListings: in.MaxListings,
		IncludedPromoDays: in.IncludedPromoDays, TakeRatePercent: in.TakeRatePercent,
		MaxProducts: in.MaxProducts, MaxServices: in.MaxServices,
		GoldBadge: in.GoldBadge, Active: in.Active, SortOrder: in.SortOrder,
	}
	if len(p.Name) < 2 || len(p.Name) > 80 {
		return p, invalidPlan("name must be 2–80 characters")
	}
	p.Slug = strings.TrimSpace(in.Slug)
	if p.Slug == "" {
		p.Slug = slugify(p.Name)
	}
	if !planSlugRe.MatchString(p.Slug) {
		return p, invalidPlan("slug must be lowercase letters, numbers and dashes")
	}
	switch p.Audience {
	case "any", "business", "creator":
	default:
		return p, invalidPlan("audience must be any, business or creator")
	}
	switch p.Interval {
	case "free", "month":
	default:
		return p, invalidPlan("interval must be free or month")
	}
	prices, err := validatePlanPrices(in.Prices, p.Interval)
	if err != nil {
		return p, err
	}
	p.Prices = prices
	for _, perk := range in.Perks {
		if s := strings.TrimSpace(perk); s != "" {
			p.Perks = append(p.Perks, s)
		}
	}
	if p.Perks == nil {
		p.Perks = []string{} // the API always returns an array, never null
	}
	if len(p.Perks) > 8 {
		return p, invalidPlan("at most 8 perk lines")
	}
	return p, validatePlanLimits(p)
}

// validatePlanPrices cleans the per-audience price map: non-negative pesewas,
// a "default" key always, zero for a free plan and non-zero for a monthly one.
func validatePlanPrices(in map[string]int64, interval string) (map[string]int64, error) {
	if len(in) == 0 {
		return nil, invalidPlan(msgPlanDefaultPrice)
	}
	prices := map[string]int64{}
	for k, v := range in {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		if v < 0 {
			return nil, invalidPlan("prices can't be negative")
		}
		prices[k] = v
	}
	def, ok := prices["default"]
	if !ok {
		return nil, invalidPlan(msgPlanDefaultPrice)
	}
	if interval == "free" && def != 0 {
		return nil, invalidPlan("a free plan must have a zero default price")
	}
	if interval == "month" && def == 0 {
		return nil, invalidPlan("a monthly plan needs a non-zero default price")
	}
	return prices, nil
}

// validatePlanLimits range-checks a plan's numeric entitlements.
func validatePlanLimits(p domain.Plan) error {
	switch {
	case p.MaxListings < 0 || p.MaxListings > 100:
		return invalidPlan("max listings must be 0–100")
	case p.IncludedPromoDays < 0 || p.IncludedPromoDays > 31:
		return invalidPlan("included promotion days must be 0–31")
	case p.TakeRatePercent < 0 || p.TakeRatePercent > 90:
		return invalidPlan("platform take-rate must be 0–90%")
	case p.MaxProducts < 0 || p.MaxProducts > 1000:
		return invalidPlan("max products must be 0–1000")
	case p.MaxServices < 0 || p.MaxServices > 1000:
		return invalidPlan("max services must be 0–1000")
	}
	return nil
}

// Plans is the public catalog: active plans in display order. It feeds the
// creator Grow page and the portal subscribe panel.
func (s *Service) Plans(ctx context.Context) ([]domain.Plan, error) {
	all, err := s.plans.All(ctx)
	if err != nil {
		return nil, err
	}
	out := []domain.Plan{}
	for _, p := range all {
		if p.Active {
			out = append(out, p)
		}
	}
	sortPlans(out)
	return out, nil
}

// AdminPlans is the staff catalog: every plan, active or not.
func (s *Service) AdminPlans(ctx context.Context) ([]domain.Plan, error) {
	all, err := s.plans.All(ctx)
	if err != nil {
		return nil, err
	}
	sortPlans(all)
	return all, nil
}

func sortPlans(ps []domain.Plan) {
	sort.Slice(ps, func(i, j int) bool {
		if ps[i].SortOrder != ps[j].SortOrder {
			return ps[i].SortOrder < ps[j].SortOrder
		}
		return ps[i].Name < ps[j].Name
	})
}

// CreatePlan validates and adds a plan; the slug must be unique.
func (s *Service) CreatePlan(ctx context.Context, in PlanInput) (*domain.Plan, error) {
	p, err := validatePlan(in)
	if err != nil {
		return nil, err
	}
	if _, err := s.plans.BySlug(ctx, p.Slug); err == nil {
		return nil, invalidPlan(msgPlanSlugTaken)
	} else {
		var nf *domain.NotFoundError
		if !errors.As(err, &nf) {
			return nil, err
		}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	p.ID = "plan-" + p.Slug
	p.CreatedAt, p.UpdatedAt = now, now
	if err := s.plans.Insert(ctx, p); err != nil {
		return nil, err
	}
	return &p, nil
}

// UpdatePlan replaces a plan's configurable fields; CreatedAt is preserved.
func (s *Service) UpdatePlan(ctx context.Context, id string, in PlanInput) (*domain.Plan, error) {
	existing, err := s.plans.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	p, err := validatePlan(in)
	if err != nil {
		return nil, err
	}
	// Slug change must not collide with another plan.
	if p.Slug != existing.Slug {
		if other, err := s.plans.BySlug(ctx, p.Slug); err == nil && other.ID != id {
			return nil, invalidPlan(msgPlanSlugTaken)
		}
	}
	p.ID = existing.ID
	p.CreatedAt = existing.CreatedAt
	p.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := s.plans.Update(ctx, p); err != nil {
		return nil, err
	}
	return &p, nil
}

// DeletePlan removes a plan. Subscriptions already sold keep their denormalised
// plan slug and amount — deleting never rewrites the ledger.
func (s *Service) DeletePlan(ctx context.Context, id string) error {
	return s.plans.Delete(ctx, id)
}
