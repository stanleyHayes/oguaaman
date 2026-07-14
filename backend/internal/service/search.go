package service

import (
	"context"
	"sort"
	"strings"

	"github.com/oguaa/backend/internal/domain"
)

// ── cross-listing search (spec §12) ──────────────────────────────────────────

// SearchHit is one result in the unified search across the three pillars. The
// client maps (kind, type, slug) to its own route.
type SearchHit struct {
	Kind     string `json:"kind"` // "listing" | "member" | "institution"
	Type     string `json:"type,omitempty"`
	Slug     string `json:"slug"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle,omitempty"`
	ImageURL string `json:"imageUrl,omitempty"` // listing cover, member photo, or institution crest
	score    int
}

// Search ranks members, approved listings, and institutions against a free-text
// query. It loads-and-ranks in process — correct and instant at the platform's
// current scale; the seam moves to a Mongo $text index when the catalog grows.
func (s *Service) Search(ctx context.Context, query string, limit int) ([]SearchHit, error) {
	terms := searchTerms(query)
	if len(terms) == 0 {
		return []SearchHit{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	hits := []SearchHit{}
	for _, collect := range []func(context.Context, []string) ([]SearchHit, error){
		s.searchListings, s.searchMembers, s.searchInstitutions,
	} {
		found, err := collect(ctx, terms)
		if err != nil {
			return nil, err
		}
		hits = append(hits, found...)
	}

	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].score != hits[j].score {
			return hits[i].score > hits[j].score
		}
		return hits[i].Title < hits[j].Title
	})
	if len(hits) > limit {
		hits = hits[:limit]
	}
	return hits, nil
}

// searchListings ranks approved listings (every type rides the one engine).
func (s *Service) searchListings(ctx context.Context, terms []string) ([]SearchHit, error) {
	listings, err := s.listings.Find(ctx, domain.ListingFilter{Status: domain.StatusApproved})
	if err != nil {
		return nil, err
	}
	hits := []SearchHit{}
	for _, l := range listings {
		score := scoreTerms(terms, l.Title, strings.Join(l.Tags, " "), asString(l.Details, "summary"), asString(l.Details, "tagline"))
		if score > 0 {
			hits = append(hits, SearchHit{Kind: "listing", Type: l.Type, Slug: l.Slug, Title: l.Title, Subtitle: listingSubtitle(l), ImageURL: l.CoverImageURL, score: score})
		}
	}
	return hits, nil
}

// searchMembers ranks members (people of Oguaa).
func (s *Service) searchMembers(ctx context.Context, terms []string) ([]SearchHit, error) {
	members, err := s.members.All(ctx)
	if err != nil {
		return nil, err
	}
	hits := []SearchHit{}
	for _, m := range members {
		score := scoreTerms(terms, m.DisplayName, m.Bio)
		if score > 0 {
			hits = append(hits, SearchHit{Kind: "member", Slug: m.Slug, Title: m.DisplayName, Subtitle: strings.TrimSpace(m.Bio), ImageURL: m.PhotoURL, score: score})
		}
	}
	return hits, nil
}

// searchInstitutions ranks institutions.
func (s *Service) searchInstitutions(ctx context.Context, terms []string) ([]SearchHit, error) {
	orgs, err := s.orgs.All(ctx)
	if err != nil {
		return nil, err
	}
	hits := []SearchHit{}
	for _, o := range orgs {
		score := scoreTerms(terms, o.Name, o.OfficialTitle, o.Summary, o.Classification)
		if score > 0 {
			hits = append(hits, SearchHit{Kind: "institution", Type: o.Kind, Slug: o.Slug, Title: o.Name, Subtitle: o.Classification, ImageURL: o.CrestURL, score: score})
		}
	}
	return hits, nil
}

func searchTerms(q string) []string {
	q = strings.ToLower(strings.TrimSpace(q))
	if q == "" {
		return nil
	}
	out := []string{}
	for _, t := range strings.Fields(q) {
		if len(t) >= 2 {
			out = append(out, t)
		}
	}
	return out
}

// scoreTerms scores how well the query terms match a set of fields. A whole-term
// hit in an earlier (more important) field scores higher; every term must appear
// somewhere or the score is zero (AND semantics).
func scoreTerms(terms []string, fields ...string) int {
	haystacks := make([]string, len(fields))
	for i, f := range fields {
		haystacks[i] = strings.ToLower(f)
	}
	total := 0
	for _, term := range terms {
		best := bestFieldScore(haystacks, term)
		if best == 0 {
			return 0 // this term matched nothing — drop the candidate
		}
		total += best
	}
	return total
}

// bestFieldScore returns the strongest match weight for a term across the
// haystacks: an earlier (more important) field scores higher, and a whole-term
// hit scores higher still. Zero means the term matched nothing.
func bestFieldScore(haystacks []string, term string) int {
	best := 0
	for i, hay := range haystacks {
		if hay == "" || !strings.Contains(hay, term) {
			continue
		}
		weight := len(haystacks) - i // earlier field = higher weight
		if wholeWordMatch(hay, term) {
			weight += len(haystacks)
		}
		if weight > best {
			best = weight
		}
	}
	return best
}

func wholeWordMatch(hay, term string) bool {
	for _, w := range strings.FieldsFunc(hay, func(r rune) bool {
		return !isASCIIAlphanumeric(r)
	}) {
		if w == term {
			return true
		}
	}
	return false
}

func isASCIIAlphanumeric(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
}

func listingSubtitle(l domain.Listing) string {
	if t := asString(l.Details, "tagline"); t != "" {
		return t
	}
	switch l.Type {
	case domain.TypeMemorial:
		return "In Memoriam"
	case domain.TypeArtist:
		return "Artist"
	case domain.TypeBusiness:
		return "Business"
	case domain.TypeEvent:
		return "Event"
	case domain.TypePerson:
		return "Son / daughter of Oguaa"
	case domain.TypeMemory:
		return "Memory"
	case domain.TypeOpportunity:
		return "Opportunity"
	}
	return ""
}
