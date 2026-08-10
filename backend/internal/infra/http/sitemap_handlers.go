package http

import (
	"encoding/xml"
	"net/http"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── Dynamic sitemap for database-driven pages ────────────────────────────────
//
// The citizen app is a client-rendered SPA, and its static sitemap lists only
// the fixed routes. Everything that actually holds content — a business, a
// storefront, an individual product, an artist, a person, an event — lives in
// MongoDB and appears at a URL the build could not have known. None of those
// URLs were in any sitemap, and nothing links to most of them from a crawlable
// page, so a search engine had no way to discover them at all. That, not the
// absence of structured data, is why no shop or product was ever indexed.
//
// This emits them. It is served from the API but proxied onto the citizen host
// (see frontend/vercel.json) so the sitemap and the URLs it lists share an
// origin — a sitemap on a different host is ignored unless both are verified.
//
// Illustrative content is excluded. Indexing a fabricated business would put an
// invented name, address and price into Google's index as fact.

type sitemapURL struct {
	Loc        string `xml:"loc"`
	LastMod    string `xml:"lastmod,omitempty"`
	ChangeFreq string `xml:"changefreq,omitempty"`
	Priority   string `xml:"priority,omitempty"`
}

type urlSet struct {
	XMLName xml.Name     `xml:"urlset"`
	NS      string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

// listingSitemapSpec maps a listing type onto its public URL prefix and how
// often that kind of page changes.
var listingSitemapSpec = []struct {
	typ, prefix, freq, priority string
}{
	{domain.TypeBusiness, "/business/", "weekly", "0.8"},
	{domain.TypeArtist, "/music/", "weekly", "0.8"},
	{domain.TypeProperty, "/rent-stay/", "weekly", "0.7"},
	{domain.TypePerson, "/people/", "monthly", "0.7"},
	{domain.TypeEvent, "/events/", "daily", "0.7"},
	{domain.TypeMemorial, "/memoriam/", "monthly", "0.6"},
	{domain.TypeProject, "/projects/", "weekly", "0.6"},
}

// SitemapListings — GET /sitemap-listings.xml.
func (h *Handler) SitemapListings(w http.ResponseWriter, r *http.Request) {
	base := strings.TrimRight(h.portalURL, "/")
	if base == "" {
		fail(w, http.StatusServiceUnavailable, "The public portal URL is not configured.")
		return
	}
	ctx := r.Context()
	out := make([]sitemapURL, 0, 256)
	today := time.Now().UTC().Format("2006-01-02")

	for _, spec := range listingSitemapSpec {
		items, err := h.svc.PublicListingsByType(ctx, spec.typ)
		if err != nil {
			h.log.Warn("sitemap: could not list", "type", spec.typ, "err", err)
			continue
		}
		for _, l := range items {
			out = append(out, sitemapURL{
				Loc: base + spec.prefix + l.Slug, LastMod: lastModOf(l, today),
				ChangeFreq: spec.freq, Priority: spec.priority,
			})
			if spec.typ != domain.TypeBusiness {
				continue
			}
			// A storefront's clean handle is a real, shareable second address.
			if l.Handle != "" {
				out = append(out, sitemapURL{
					Loc: base + "/s/" + l.Handle, LastMod: lastModOf(l, today),
					ChangeFreq: "weekly", Priority: "0.8",
				})
			}
			// Products are what the shop actually wants found. Each needs its own
			// URL to be a search result at all — a thing with no address cannot
			// be indexed, however good its structured data.
			for _, p := range l.Products {
				if p.ID == "" || !p.Available {
					continue
				}
				out = append(out, sitemapURL{
					Loc: base + "/business/" + l.Slug + "/p/" + p.ID, LastMod: lastModOf(l, today),
					ChangeFreq: "weekly", Priority: "0.6",
				})
			}
		}
	}

	body, err := xml.MarshalIndent(urlSet{NS: "http://www.sitemaps.org/schemas/sitemap/0.9", URLs: out}, "", "  ")
	if err != nil {
		h.handleErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	// Crawlers re-fetch often; an hour keeps new shops discoverable quickly
	// without hitting the database on every request.
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(xml.Header))
	_, _ = w.Write(body)
}

func lastModOf(l domain.Listing, fallback string) string {
	for _, s := range []string{l.PublishedAt, l.SubmittedAt, l.CreatedAt} {
		if len(s) >= 10 {
			return s[:10]
		}
	}
	return fallback
}
