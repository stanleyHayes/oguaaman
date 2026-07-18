package service

import (
	"context"
	"sort"

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
