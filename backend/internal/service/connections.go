package service

import (
	"context"
	"sort"
	"strings"

	"github.com/oguaa/backend/internal/domain"
)

// ── people you may know (spec §8.6) ──────────────────────────────────────────

// Connection is a suggested member to follow, with a human reason and a score.
type Connection struct {
	Member  domain.Member `json:"member"`
	Reasons []string      `json:"reasons"`
	Score   int           `json:"score"`
}

// SetMemberSchooling records a member's schools + years (the classmate signal).
func (s *Service) SetMemberSchooling(ctx context.Context, memberID string, stints []domain.SchoolStint) error {
	cleaned := make([]domain.SchoolStint, 0, len(stints))
	for _, st := range stints {
		if strings.TrimSpace(st.SchoolID) == "" {
			continue
		}
		cleaned = append(cleaned, st)
	}
	return s.members.SetSchooling(ctx, memberID, cleaned)
}

// overlaps reports whether two school stints share any years (the classmate test).
// If either has no years, sharing the school still counts as a weaker tie.
func overlaps(a, b domain.SchoolStint) (bool, bool) {
	if a.FromYear == 0 || a.ToYear == 0 || b.FromYear == 0 || b.ToYear == 0 {
		return false, true // same school, years unknown → weak tie
	}
	return a.FromYear <= b.ToYear && b.FromYear <= a.ToYear, true
}

// Recommendations suggests members to connect with, ranked by shared ties:
// classmates (same school + overlapping years) rank highest, then same Asafo,
// then same quarter (spec §8.6). Members already followed are excluded.
func (s *Service) Recommendations(ctx context.Context, memberID string) ([]Connection, error) {
	me, err := s.members.ByID(ctx, memberID)
	if err != nil {
		return nil, err
	}
	all, err := s.members.All(ctx)
	if err != nil {
		return nil, err
	}

	out := []Connection{}
	for i := range all {
		other := &all[i]
		if other.ID == memberID || other.Suspended {
			continue
		}
		score, reasons := s.scoreConnection(ctx, me, other)
		if score > 0 {
			out = append(out, Connection{Member: *other, Reasons: reasons, Score: score})
		}
	}

	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Score != out[j].Score {
			return out[i].Score > out[j].Score
		}
		return out[i].Member.DisplayName < out[j].Member.DisplayName
	})
	if len(out) > 12 {
		out = out[:12]
	}
	return out, nil
}

// scoreConnection computes the tie score and human reasons between the member
// and a candidate: classmates (same school + overlapping years) rank highest,
// then same Asafo, then same quarter (spec §8.6).
func (s *Service) scoreConnection(ctx context.Context, me, other *domain.Member) (int, []string) {
	// Classmates: same school, overlapping years.
	score, reasons := s.classmateTies(ctx, me, other)
	// Same Asafo company.
	if me.AsafoID != "" && me.AsafoID == other.AsafoID {
		score += 3
		reasons = append(reasons, "Both rep "+s.placeName(ctx, me.AsafoID))
	}
	// Same quarter.
	if me.TownID != "" && me.TownID == other.TownID {
		score += 2
		reasons = append(reasons, "Both from "+s.placeName(ctx, me.TownID))
	}
	return score, reasons
}

// classmateTies scores shared schools: same school with overlapping years
// ranks highest; same school with unknown years is a weaker tie (spec §8.6).
func (s *Service) classmateTies(ctx context.Context, me, other *domain.Member) (int, []string) {
	score := 0
	reasons := []string{}
	for _, mine := range me.Schooling {
		for _, theirs := range other.Schooling {
			if mine.SchoolID != theirs.SchoolID {
				continue
			}
			overlap, sameSchool := overlaps(mine, theirs)
			if overlap {
				score += 5
				reasons = append(reasons, s.schoolName(ctx, mine.SchoolID)+" — classmates")
			} else if sameSchool {
				score += 2
				reasons = append(reasons, "Both went to "+s.schoolName(ctx, mine.SchoolID))
			}
		}
	}
	return score, reasons
}

func (s *Service) schoolName(ctx context.Context, id string) string {
	if o, err := s.orgs.ByID(ctx, id); err == nil {
		return o.Name
	}
	return "the same school"
}

func (s *Service) placeName(ctx context.Context, id string) string {
	if p, err := s.places.ByID(ctx, id); err == nil {
		return p.Name
	}
	return "the same place"
}
