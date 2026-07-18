package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── the civic hub ─────────────────────────────────────────────────────────────
// "Our code": the town's code of behaviours ringed from the self outward, and
// the lessons drawn from civilizations that built great, orderly societies —
// both loaded from the seed and read publicly (GET /api/civic).

// CivicView is the assembled civic payload. The JSON field names ("behaviors",
// "civilizations") are the frontend contract and must not drift.
type CivicView struct {
	Behaviors     []domain.CivicBehaviour `json:"behaviors"`
	Civilizations []domain.CivicLesson    `json:"civilizations"`
}

// civicRingOrder places the rings inner (self) to outer (nation) for display.
var civicRingOrder = map[string]int{"self": 0, "home": 1, "school": 2, "work": 3, "town": 4, "nation": 5}

// civicLessonOrder is the curated (roughly chronological) order for the lessons.
var civicLessonOrder = map[string]int{"kemet": 0, "asante": 1, "mali-songhai": 2, "meiji-japan": 3, "singapore": 4, "rwanda": 5}

// Civic assembles the hub: behaviours grouped by ring (self → nation) with "do"
// before "stop", and the civilization lessons in curated order.
func (s *Service) Civic(ctx context.Context) (*CivicView, error) {
	behaviours, err := s.civicBehaviours.All(ctx)
	if err != nil {
		return nil, err
	}
	lessons, err := s.civicLessons.All(ctx)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(behaviours, func(i, j int) bool {
		if ri, rj := civicRingOrder[behaviours[i].Ring], civicRingOrder[behaviours[j].Ring]; ri != rj {
			return ri < rj
		}
		if behaviours[i].Type != behaviours[j].Type {
			return behaviours[i].Type == "do" // "do" before "stop" within a ring
		}
		return behaviours[i].Slug < behaviours[j].Slug
	})
	sort.SliceStable(lessons, func(i, j int) bool {
		return civicLessonOrder[lessons[i].Slug] < civicLessonOrder[lessons[j].Slug]
	})
	return &CivicView{Behaviors: behaviours, Civilizations: lessons}, nil
}

// ── admin: manage the pledges (curators add/edit/remove behaviours) ──────────

// CivicBehaviourInput is the create/edit payload. The slug is derived from the
// title on create and is immutable after (residents' pledges are stored by slug).
type CivicBehaviourInput struct {
	Ring        string `json:"ring"`
	Type        string `json:"type"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Why         string `json:"why"`
}

func validateBehaviour(in CivicBehaviourInput) (domain.CivicBehaviour, error) {
	ring := strings.TrimSpace(in.Ring)
	if _, ok := civicRingOrder[ring]; !ok {
		return domain.CivicBehaviour{}, fmt.Errorf("choose a valid ring (self, home, school, work, town, nation)")
	}
	typ := strings.TrimSpace(in.Type)
	if typ != "do" && typ != "stop" {
		return domain.CivicBehaviour{}, fmt.Errorf("type must be \"do\" or \"stop\"")
	}
	title := strings.TrimSpace(in.Title)
	if len(title) < 2 || len(title) > 160 {
		return domain.CivicBehaviour{}, fmt.Errorf("title must be 2–160 characters")
	}
	desc := strings.TrimSpace(in.Description)
	if desc == "" {
		return domain.CivicBehaviour{}, fmt.Errorf("a description is required")
	}
	return domain.CivicBehaviour{Ring: ring, Type: typ, Title: title, Description: desc, Why: strings.TrimSpace(in.Why)}, nil
}

// AdminCivicBehaviours lists every behaviour (ordered like the public hub) for
// the dashboard.
func (s *Service) AdminCivicBehaviours(ctx context.Context) ([]domain.CivicBehaviour, error) {
	rows, err := s.civicBehaviours.All(ctx)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if ri, rj := civicRingOrder[rows[i].Ring], civicRingOrder[rows[j].Ring]; ri != rj {
			return ri < rj
		}
		if rows[i].Type != rows[j].Type {
			return rows[i].Type == "do"
		}
		return rows[i].Slug < rows[j].Slug
	})
	return rows, nil
}

// CreateCivicBehaviour adds a new pledge, deriving a unique slug from the title.
func (s *Service) CreateCivicBehaviour(ctx context.Context, in CivicBehaviourInput) (domain.CivicBehaviour, error) {
	b, err := validateBehaviour(in)
	if err != nil {
		return domain.CivicBehaviour{}, err
	}
	base := slugify(in.Title)
	if base == "" {
		base = "pledge"
	}
	slug := base
	if _, err := s.civicBehaviours.BySlug(ctx, slug); err == nil {
		slug = base + "-" + fmt.Sprintf("%d", time.Now().UnixNano()%100000)
	}
	b.Slug = slug
	return s.civicBehaviours.Create(ctx, b)
}

// UpdateCivicBehaviour edits an existing pledge (its slug never changes).
func (s *Service) UpdateCivicBehaviour(ctx context.Context, slug string, in CivicBehaviourInput) (domain.CivicBehaviour, error) {
	existing, err := s.civicBehaviours.BySlug(ctx, slug)
	if err != nil {
		return domain.CivicBehaviour{}, err
	}
	b, err := validateBehaviour(in)
	if err != nil {
		return domain.CivicBehaviour{}, err
	}
	b.Slug = existing.Slug
	return s.civicBehaviours.Update(ctx, b)
}

// DeleteCivicBehaviour removes a pledge.
func (s *Service) DeleteCivicBehaviour(ctx context.Context, slug string) error {
	if _, err := s.civicBehaviours.BySlug(ctx, slug); err != nil {
		return err
	}
	return s.civicBehaviours.Delete(ctx, slug)
}
