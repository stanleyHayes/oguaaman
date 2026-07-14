package service

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── the festival archive ─────────────────────────────────────────────────────
// Festivals are not a listing type: every edition is an ordinary event listing
// carrying details.festival (slug) and details.edition (year). The archive is
// assembled here, over the listings engine, from those two keys.

// festivalInfo is the fixed editorial copy for a known festival of the coast.
type festivalInfo struct {
	name    string
	tagline string
	history string
}

var festivalRegistry = map[string]festivalInfo{
	"fetu-afahye": {
		name:    "Fetu Afahye",
		tagline: "Oguaa's paramount festival — the homecoming beat of the year, first Saturday of September.",
		history: "Fetu Afahye is the paramount festival of the chiefs and people of Oguaa, held every year on the first Saturday of September. Its roots reach back to the seventeenth century: 'Fetu' comes from 'Efin Tu' — doing away with dirt — for it commemorates the lifting of a plague that struck the town, after the people prayed to the seventy-seven gods of Oguaa. The festival week opens with the Omanhen's confinement, a ban on drumming, and a ban on fishing in the Fosu Lagoon, lifted when the Omanhen himself casts the first net. The Asafo companies parade through the streets, and the week crowns in a grand durbar of chiefs at Victoria Park — palanquins, state umbrellas, the whole town in its finery. The colonial authorities banned the festival from 1932 to 1948, sneering at it as a 'Black Christmas', but Oguaa brought it back and it has only grown since. In 2024 the town celebrated Fetu @60, with the Asantehene, Otumfuo Osei Tutu II, attending the durbar for the first time.",
	},
	"edina-bakatue": {
		name:    "Edina Bakatue",
		tagline: "Elmina's festival — the opening of the Benya Lagoon, first Tuesday of July.",
		history: "Edina Bakatue is the festival of the chiefs and people of Elmina, held on the first Tuesday of July. Its name means the draining of the lagoon, and it marks the opening of the Benya Lagoon for the new fishing season. At the climax the chief priest casts a sacred net into the lagoon — three times — and the size of the catch is read as a sign of the season to come. The state offers mashed yam to the river god Nana Benya, and a grand durbar and a regatta on the lagoon follow. Documented since at least 1847, Bakatue is among the oldest recorded festivals on the coast.",
	},
	"panafest": {
		name:    "PANAFEST",
		tagline: "The biennial Pan-African festival of arts, emancipation and homecoming.",
		history: "PANAFEST — the Pan-African Historical Theatre Festival — grew from Efua Sutherland's 1980 proposal for a festival of historical drama in Cape Coast, and was first staged in 1992. Every two years it gathers the continent and the diaspora in Cape Coast and Elmina for historical drama, music, dance, colloquia and a candlelit emancipation vigil, alongside the Emancipation Day commemorations. It is a festival of arts and of remembrance — a homecoming for the children of the diaspora, held in the shadow of the castles.",
	},
	"emancipation-day": {
		name:    "Emancipation Day",
		tagline: "1 August — remembrance at Assin Manso and the castles.",
		history: "Emancipation Day, observed every 1 August, marks the abolition of slavery in the British Empire. Ghana was the first African nation to commemorate it, from 1998, and the Central Region is its heart. The day opens at Assin Manso, where captives took their last bath in the Slave River — the 'Last Bath' site — and closes with wreath-laying, libation and remembrance at the Cape Coast and Elmina castles, at the Door of No Return that is now also the Door of Return.",
	},
	"akwambo": {
		name:    "Akwambo",
		tagline: "The path-clearing festival of the central region communities.",
		history: "Akwambo is the path-clearing festival of the Fante communities of the Agona and Gomoa areas of the Central Region. Townspeople weed and clear the footpaths to the sacred streams and shrines, honouring the journeys of their founders, before the drumming of the Asafo and a durbar of chiefs in palanquins. It is kept town by town across August and September — each community clearing its own way into the new year.",
	},
	"edina-bronya": {
		name:    "Edina Bronya",
		tagline: "Elmina's own Christmas — first Thursday of January.",
		history: "Edina Bronya is Elmina's own Christmas — a harvest and thanksgiving festival inherited from the Dutch era and made wholly Fante, held on the first Thursday of January. At midnight the Paramount Chief fires musketry to usher in the new year; the next day he rides in palanquin through the town, sheep are slaughtered before Elmina Castle, and families feast together. Nowhere else on the coast keeps a festival quite like it.",
	},
}

// FestivalSummary is one festival in the archive index.
type FestivalSummary struct {
	Slug        string          `json:"slug"`
	Name        string          `json:"name"`
	Tagline     string          `json:"tagline"`
	Editions    int             `json:"editions"`
	NextEdition *domain.Listing `json:"nextEdition,omitempty"`
}

// FestivalEdition groups a festival's events under one year.
type FestivalEdition struct {
	Year   string           `json:"year"`
	Recap  string           `json:"recap"`
	Events []domain.Listing `json:"events"`
}

// FestivalView is the full archive page for one festival.
type FestivalView struct {
	Slug     string            `json:"slug"`
	Name     string            `json:"name"`
	Tagline  string            `json:"tagline"`
	History  string            `json:"history"`
	Editions []FestivalEdition `json:"editions"`
}

// festivalName resolves a festival slug to its display name; unknown slugs are
// title-cased ("kakum-festival" → "Kakum Festival").
func festivalName(slug string) string {
	if info, ok := festivalRegistry[slug]; ok {
		return info.name
	}
	parts := strings.Split(slug, "-")
	for i, p := range parts {
		if p != "" {
			parts[i] = strings.ToUpper(p[:1]) + p[1:]
		}
	}
	return strings.Join(parts, " ")
}

// editionYear is the year an event belongs to: details.edition, else the year
// of its start date.
func editionYear(e domain.Listing) string {
	if y := asString(e.Details, "edition"); y != "" {
		return y
	}
	if s := asString(e.Details, "startsAt"); len(s) >= 4 {
		return s[:4]
	}
	return ""
}

// festivalEvents returns approved events tagged with a festival slug.
func (s *Service) festivalEvents(ctx context.Context) ([]domain.Listing, error) {
	events, err := s.approved(ctx, domain.TypeEvent)
	if err != nil {
		return nil, err
	}
	out := []domain.Listing{}
	for _, e := range events {
		if asString(e.Details, "festival") != "" {
			out = append(out, e)
		}
	}
	return out, nil
}

// Festivals is the archive index: every festival that has at least one edition,
// with its edition count and its next upcoming edition (nearest start >= today).
func (s *Service) Festivals(ctx context.Context) ([]FestivalSummary, error) {
	events, err := s.festivalEvents(ctx)
	if err != nil {
		return nil, err
	}
	today := time.Now().UTC().Format("2006-01-02")
	bySlug := map[string][]domain.Listing{}
	order := []string{}
	for _, e := range events {
		slug := asString(e.Details, "festival")
		if _, ok := bySlug[slug]; !ok {
			order = append(order, slug)
		}
		bySlug[slug] = append(bySlug[slug], e)
	}
	out := make([]FestivalSummary, 0, len(bySlug))
	for _, slug := range order {
		es := bySlug[slug]
		years := map[string]bool{}
		var next *domain.Listing
		for i := range es {
			years[editionYear(es[i])] = true
			starts := asString(es[i].Details, "startsAt")
			if starts != "" && starts >= today && (next == nil || starts < asString(next.Details, "startsAt")) {
				next = &es[i]
			}
		}
		out = append(out, FestivalSummary{
			Slug:        slug,
			Name:        festivalName(slug),
			Tagline:     festivalRegistry[slug].tagline,
			Editions:    len(years),
			NextEdition: next,
		})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// Festival is the archive page for one festival: its history, and every edition
// grouped by year (newest first), each with its recap and its events.
func (s *Service) Festival(ctx context.Context, slug string) (*FestivalView, error) {
	events, err := s.festivalEvents(ctx)
	if err != nil {
		return nil, err
	}
	matched := []domain.Listing{}
	for _, e := range events {
		if asString(e.Details, "festival") == slug {
			matched = append(matched, e)
		}
	}
	if len(matched) == 0 {
		return nil, &domain.NotFoundError{Entity: "festival"}
	}
	sortByStart(matched)
	byYear := map[string]*FestivalEdition{}
	years := []string{}
	for _, e := range matched {
		y := editionYear(e)
		ed, ok := byYear[y]
		if !ok {
			ed = &FestivalEdition{Year: y, Events: []domain.Listing{}}
			byYear[y] = ed
			years = append(years, y)
		}
		ed.Events = append(ed.Events, e)
		if ed.Recap == "" {
			ed.Recap = asString(e.Details, "recap")
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(years)))
	editions := make([]FestivalEdition, 0, len(years))
	for _, y := range years {
		editions = append(editions, *byYear[y])
	}
	info := festivalRegistry[slug]
	return &FestivalView{
		Slug:     slug,
		Name:     festivalName(slug),
		Tagline:  info.tagline,
		History:  info.history,
		Editions: editions,
	}, nil
}
