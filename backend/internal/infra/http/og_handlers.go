package http

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/infra/http/ogcard"
	"github.com/oguaa/backend/internal/infra/http/seedimg"
)

// ── Open Graph share cards (spec §11 — every public page has rich link
// previews; sharing is the growth engine). The SPA can't emit per-page meta
// for crawlers, so the portal's nginx maps bot user-agents onto these two
// endpoints: /api/og/page/* serves a meta-only HTML shim and /api/og/image/*
// renders the 1200×630 card it references.

// ogMeta is everything the shim page needs.
type ogMeta struct {
	Title, Description, URL, Image, Kicker string
}

var ogShim = template.Must(template.New("og").Parse(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>{{.Title}} — Oguaa</title>
<meta name="description" content="{{.Description}}">
<link rel="canonical" href="{{.URL}}">
<meta property="og:site_name" content="Oguaa">
<meta property="og:type" content="website">
<meta property="og:title" content="{{.Title}}">
<meta property="og:description" content="{{.Description}}">
<meta property="og:url" content="{{.URL}}">
<meta property="og:image" content="{{.Image}}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{{.Title}}">
<meta name="twitter:description" content="{{.Description}}">
<meta name="twitter:image" content="{{.Image}}">
<meta http-equiv="refresh" content="0; url={{.URL}}">
</head>
<body><p><a href="{{.URL}}">{{.Title}} — Oguaa</a></p></body>
</html>`))

// ogBase is the absolute origin the crawler sees (the portal host, proxied).
func ogBase(r *http.Request) string {
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		proto = "https"
		if strings.HasPrefix(r.Host, "localhost") || strings.HasPrefix(r.Host, "127.") {
			proto = "http"
		}
	}
	return proto + "://" + r.Host
}

func truncate(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return strings.TrimSpace(string(r[:n-1])) + "…"
}

// ogResolve maps a portal path (music/x, education/y…) to card + meta content.
func (h *Handler) ogResolve(ctx context.Context, path, base string) (ogcard.Card, ogMeta) {
	path = strings.Trim(strings.TrimSuffix(path, ".png"), "/")
	seg := strings.SplitN(path, "/", 2)
	kind, slug := seg[0], ""
	if len(seg) == 2 {
		slug = seg[1]
	}
	card := ogcard.Card{}
	meta := ogMeta{
		Title:       "Oguaa — Cape Coast's own platform",
		Description: "The mirror of the town: music, memorials, schools, business, events.",
		URL:         base + "/" + path,
		Image:       base + "/api/og/image/" + path + ".png",
	}
	finish := func(kicker, title, subtitle, desc string) {
		card.Kicker, card.Title, card.Subtitle = kicker, title, subtitle
		meta.Kicker = kicker
		if title != "" {
			meta.Title = title
		}
		if desc != "" {
			meta.Description = truncate(desc, 200)
		}
	}
	str := func(m map[string]any, k string) string {
		switch v := m[k].(type) {
		case string:
			return v
		case float64:
			return fmt.Sprintf("%v", v)
		case []any: // e.g. genres
			parts := make([]string, 0, len(v))
			for _, it := range v {
				if s, ok := it.(string); ok {
					parts = append(parts, s)
				}
			}
			return strings.Join(parts, " · ")
		}
		return ""
	}
	listingType := map[string]string{
		"music": domain.TypeArtist, "business": domain.TypeBusiness, "events": domain.TypeEvent,
		"memoriam": domain.TypeMemorial, "people": domain.TypePerson, "projects": domain.TypeProject,
	}
	if typ, ok := listingType[kind]; ok && slug != "" {
		l, err := h.svc.ListingBySlug(ctx, typ, slug)
		if err != nil {
			return card, meta // unknown/unpublished → generic site card
		}
		kicker := map[string]string{
			domain.TypeArtist: "Artist · The Oguaa Sound", domain.TypeBusiness: "Business in Oguaa",
			domain.TypeEvent: "Event in Cape Coast", domain.TypeMemorial: "In Memoriam",
			domain.TypePerson: "People of Oguaa", domain.TypeProject: "Adopt-a-Project",
		}[typ]
		subtitle := ""
		switch typ {
		case domain.TypeArtist:
			subtitle = str(l.Details, "genres")
		case domain.TypeBusiness:
			subtitle = strings.Trim(strings.Join([]string{str(l.Details, "category"), str(l.Details, "address")}, " · "), " ·")
		case domain.TypeEvent:
			subtitle = strings.Trim(strings.Join([]string{str(l.Details, "startsAt"), str(l.Details, "venue")}, " · "), " ·")
		case domain.TypeMemorial:
			years := strings.Trim(strings.Join([]string{str(l.Details, "bornYear"), str(l.Details, "diedDate")}, " – "), " –")
			subtitle = strings.Trim(strings.Join([]string{str(l.Details, "honorific"), years}, " · "), " ·")
		case domain.TypePerson:
			subtitle = str(l.Details, "whyNotable")
		}
		desc := str(l.Details, "description")
		if desc == "" {
			desc = str(l.Details, "bio")
		}
		if desc == "" {
			desc = str(l.Details, "lifeStory")
		}
		card.Cover = h.ogCover(l.CoverImageURL)
		finish(kicker, l.Title, subtitle, desc)
		return card, meta
	}
	if kind == "education" && slug != "" {
		if org, err := h.svc.InstitutionBySlug(ctx, slug); err == nil && org != nil && org.Verified {
			kicker := "Institution"
			for _, k := range domain.InstitutionKindCatalog {
				if k.Slug == org.Kind {
					kicker = k.Label
					break
				}
			}
			finish(kicker, org.Name, org.Jurisdiction, org.Summary)
			return card, meta
		}
	}
	if kind == "members" && slug != "" {
		if m, err := h.svc.MemberBySlug(ctx, slug); err == nil && m != nil {
			finish("Member of Oguaa", m.DisplayName, "", m.Bio)
			return card, meta
		}
	}
	if kind == "news" && slug != "" {
		if a, err := h.svc.NewsBySlug(ctx, slug); err == nil && a != nil {
			finish("Oguaa Newsroom", a.Title, "", a.Body)
			return card, meta
		}
	}
	// Everything else (home, section pages, unknown paths) → the site card.
	card.Kicker = "Oguaa"
	card.Title = "Cape Coast's own platform"
	card.Subtitle = "Music · Memorials · Schools · Business · Events"
	return card, meta
}

// ogCover decodes a cover image for compositing: seed images come from the
// embedded FS (their URLs carry a /uploads/seed/ prefix the FS doesn't),
// runtime uploads from disk; remote URLs are skipped (offline-safe).
func (h *Handler) ogCover(url string) image.Image {
	if url == "" || strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") {
		return nil
	}
	rest := strings.TrimPrefix(url, "/uploads/")
	if strings.Contains(rest, "..") || !filepath.IsLocal(filepath.FromSlash(rest)) {
		return nil
	}
	var rc io.ReadCloser
	if seed, ok := strings.CutPrefix(rest, "seed/"); ok {
		if sf, err := seedimg.FS.Open(seed); err == nil {
			rc = sf
		}
	} else {
		absBase, _ := filepath.Abs(h.uploadDir)
		target, _ := filepath.Abs(filepath.Join(h.uploadDir, filepath.FromSlash(rest)))
		if absBase != "" && target != "" && strings.HasPrefix(target, absBase+string(filepath.Separator)) {
			if df, err := os.Open(target); err == nil {
				rc = df
			}
		}
	}
	if rc == nil {
		return nil
	}
	defer func() { _ = rc.Close() }()
	img, _, err := image.Decode(rc)
	if err != nil {
		return nil
	}
	return img
}

// OGPage — the crawler-facing meta shim (bots only; humans get the SPA).
func (h *Handler) OGPage(w http.ResponseWriter, r *http.Request) {
	_, meta := h.ogResolve(r.Context(), r.PathValue("path"), ogBase(r))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_ = ogShim.Execute(w, meta)
}

// OGImage — renders the 1200×630 card (rate-limited; PNG is CPU work).
func (h *Handler) OGImage(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "ogimg:"+clientKey(r), 60, time.Minute) {
		return
	}
	card, _ := h.ogResolve(r.Context(), r.PathValue("path"), ogBase(r))
	var buf bytes.Buffer
	if err := ogcard.Render(&buf, card); err != nil {
		fail(w, http.StatusInternalServerError, fmt.Sprintf("render card: %v", err))
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = w.Write(buf.Bytes())
}
