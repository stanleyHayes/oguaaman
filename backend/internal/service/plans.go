package service

import (
	"context"
	"errors"
	"fmt"
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
	GoldBadge         bool             `json:"goldBadge"`
	Active            bool             `json:"active"`
	SortOrder         int              `json:"sortOrder"`
}

var planSlugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,48}$`)

func validatePlan(in PlanInput) (domain.Plan, error) {
	p := domain.Plan{
		Name: strings.TrimSpace(in.Name), Audience: strings.TrimSpace(in.Audience),
		Interval: strings.TrimSpace(in.Interval), MaxListings: in.MaxListings,
		IncludedPromoDays: in.IncludedPromoDays, GoldBadge: in.GoldBadge,
		Active: in.Active, SortOrder: in.SortOrder,
	}
	if len(p.Name) < 2 || len(p.Name) > 80 {
		return p, fmt.Errorf("name must be 2–80 characters")
	}
	p.Slug = strings.TrimSpace(in.Slug)
	if p.Slug == "" {
		p.Slug = slugify(p.Name)
	}
	if !planSlugRe.MatchString(p.Slug) {
		return p, fmt.Errorf("slug must be lowercase letters, numbers and dashes")
	}
	switch p.Audience {
	case "any", "business", "creator":
	default:
		return p, fmt.Errorf("audience must be any, business or creator")
	}
	switch p.Interval {
	case "free", "month":
	default:
		return p, fmt.Errorf("interval must be free or month")
	}
	if len(in.Prices) == 0 {
		return p, fmt.Errorf("a default price is required (0 for a free plan)")
	}
	p.Prices = map[string]int64{}
	for k, v := range in.Prices {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		if v < 0 {
			return p, fmt.Errorf("prices can't be negative")
		}
		p.Prices[k] = v
	}
	def, ok := p.Prices["default"]
	if !ok {
		return p, fmt.Errorf("a default price is required (0 for a free plan)")
	}
	if p.Interval == "free" && def != 0 {
		return p, fmt.Errorf("a free plan must have a zero default price")
	}
	if p.Interval == "month" && def == 0 {
		return p, fmt.Errorf("a monthly plan needs a non-zero default price")
	}
	for _, perk := range in.Perks {
		if s := strings.TrimSpace(perk); s != "" {
			p.Perks = append(p.Perks, s)
		}
	}
	if p.Perks == nil {
		p.Perks = []string{} // the API always returns an array, never null
	}
	if len(p.Perks) > 8 {
		return p, fmt.Errorf("at most 8 perk lines")
	}
	if p.MaxListings < 0 || p.MaxListings > 100 {
		return p, fmt.Errorf("max listings must be 0–100")
	}
	if p.IncludedPromoDays < 0 || p.IncludedPromoDays > 31 {
		return p, fmt.Errorf("included promotion days must be 0–31")
	}
	return p, nil
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
		return nil, fmt.Errorf("a plan with that slug already exists")
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
			return nil, fmt.Errorf("a plan with that slug already exists")
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
