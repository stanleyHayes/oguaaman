package service

import (
	"context"
	"sort"

	"github.com/oguaa/backend/internal/domain"
)

// ── the history hub ──────────────────────────────────────────────────────────
// "Our history": the town's timeline plus the living record — the verified
// heritage institutions, the notable people, and the community's memories —
// assembled here over the timeline collection and the listing engine.

// HistoryView is the assembled history hub payload (GET /api/history).
type HistoryView struct {
	Timeline []domain.TimelineEntry `json:"timeline"`
	Heritage []domain.Organization  `json:"heritage"`
	People   []domain.Listing       `json:"people"`
	Memories []domain.Listing       `json:"memories"`
}

// History assembles the hub: the timeline oldest first, the verified heritage
// institutions (kind "heritage"), approved people and memories, the living
// record newest first.
func (s *Service) History(ctx context.Context) (*HistoryView, error) {
	timeline, err := s.timeline.All(ctx)
	if err != nil {
		return nil, err
	}
	heritage, err := s.orgs.ByKind(ctx, "heritage")
	if err != nil {
		return nil, err
	}
	verified := make([]domain.Organization, 0, len(heritage))
	for _, o := range heritage {
		if o.Verified {
			verified = append(verified, o)
		}
	}
	people, err := s.People(ctx)
	if err != nil {
		return nil, err
	}
	memories, err := s.Memories(ctx)
	if err != nil {
		return nil, err
	}
	// Guarantee ascending years even if a store ignores the sort.
	sort.SliceStable(timeline, func(i, j int) bool { return timeline[i].Year < timeline[j].Year })
	sort.SliceStable(people, func(i, j int) bool { return people[i].CreatedAt > people[j].CreatedAt })
	sort.SliceStable(memories, func(i, j int) bool { return memories[i].CreatedAt > memories[j].CreatedAt })
	return &HistoryView{Timeline: timeline, Heritage: verified, People: people, Memories: memories}, nil
}
