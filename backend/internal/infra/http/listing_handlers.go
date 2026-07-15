package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── home aggregate (one request for the mobile-first landing) ─────────────────

func (h *Handler) Home(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	spotlight, err := h.svc.SpotlightArtist(ctx)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	artists, err := h.svc.Artists(ctx)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	events, err := h.svc.UpcomingEvents(ctx, today(), 4)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	memorials, err := h.svc.Memorials(ctx)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	stats, err := h.svc.Stats(ctx)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	var memorial *domain.Listing
	if len(memorials) > 0 {
		memorial = &memorials[0]
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"spotlight": spotlight,
		"artists":   artists,
		"events":    events,
		"memorial":  memorial,
		"stats":     stats,
	})
}

// ── listings by type ──────────────────────────────────────────────────────────

func (h *Handler) list(w http.ResponseWriter, r *http.Request, fn func() ([]domain.Listing, error)) {
	items, err := fn()
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) Artists(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, func() ([]domain.Listing, error) { return h.svc.Artists(r.Context()) })
}
func (h *Handler) People(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, func() ([]domain.Listing, error) { return h.svc.People(r.Context()) })
}
func (h *Handler) MusicLegacy(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, func() ([]domain.Listing, error) { return h.svc.MusicLegacy(r.Context()) })
}
func (h *Handler) Memorials(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, func() ([]domain.Listing, error) { return h.svc.Memorials(r.Context()) })
}

// businessView is a business listing plus its live Supporter flag (Phase 7),
// computed from details.subscribedUntil — supporters get the badge and sort
// first in the directory.
type businessView struct {
	domain.Listing
	Supporter bool `json:"supporter"`
}

func (h *Handler) Businesses(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.Businesses(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	now := time.Now().UTC()
	out := make([]businessView, len(items))
	for i, l := range items {
		out[i] = businessView{Listing: l, Supporter: service.SupporterActive(l, now)}
	}
	writeJSON(w, http.StatusOK, out)
}
func (h *Handler) Events(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, func() ([]domain.Listing, error) { return h.svc.Events(r.Context()) })
}

// ── the festival archive (assembled reads over event listings) ─────────────────

func (h *Handler) Festivals(w http.ResponseWriter, r *http.Request) {
	festivals, err := h.svc.Festivals(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, festivals)
}

func (h *Handler) Festival(w http.ResponseWriter, r *http.Request) {
	festival, err := h.svc.Festival(r.Context(), r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, festival)
}

// History — the history hub: the town's timeline plus the living record
// (heritage institutions, notable people, community memories).
func (h *Handler) History(w http.ResponseWriter, r *http.Request) {
	view, err := h.svc.History(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}
func (h *Handler) Opportunities(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, func() ([]domain.Listing, error) { return h.svc.Opportunities(r.Context()) })
}
func (h *Handler) Memories(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, func() ([]domain.Listing, error) { return h.svc.Memories(r.Context()) })
}

// Featured — editorially surfaced listings for the marketing "right now" band.
func (h *Handler) Featured(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, func() ([]domain.Listing, error) { return h.svc.Featured(r.Context()) })
}

func (h *Handler) Genres(w http.ResponseWriter, r *http.Request) {
	g, err := h.svc.Genres(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, g)
}

func (h *Handler) Artist(w http.ResponseWriter, r *http.Request) {
	l, err := h.svc.ListingBySlug(r.Context(), domain.TypeArtist, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, l)
}

func (h *Handler) Business(w http.ResponseWriter, r *http.Request) {
	l, err := h.svc.ListingBySlug(r.Context(), domain.TypeBusiness, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, businessView{Listing: *l, Supporter: service.SupporterActive(*l, time.Now().UTC())})
}

func (h *Handler) Memorial(w http.ResponseWriter, r *http.Request) {
	l, err := h.svc.ListingBySlug(r.Context(), domain.TypeMemorial, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, l)
}

func (h *Handler) Person(w http.ResponseWriter, r *http.Request) {
	l, err := h.svc.ListingBySlug(r.Context(), domain.TypePerson, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, l)
}

// ── mutations: submit / candle / tribute ─────────────────────────────────────

func (h *Handler) Submit(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if h.rateLimited(w, r, "submit:"+clientKey(r), 15, time.Hour) {
		return
	}
	var in service.SubmitInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if m != nil {
		in.OwnerID = m.ID // listings are owned by the signed-in member
	} else if !h.authRequired {
		in.OwnerID = "m-akua" // dev convenience only — never reached when AUTH_REQUIRED=true
	}
	l, err := h.svc.Submit(r.Context(), in)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, l)
}

// EditListing applies a creator's content edit (title, cover, whitelisted
// details). The service enforces ownership; approved listings stay live,
// non-live listings re-queue for review (Creator Platform, Phase 2).
func (h *Handler) EditListing(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "edit:"+clientKey(r), 60, time.Hour) {
		return
	}
	var in service.OwnerEditInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	l, err := h.svc.UpdateOwnerListing(r.Context(), m, r.PathValue("id"), in)
	if err != nil {
		var nf *domain.NotFoundError
		var fb *domain.ForbiddenError
		if errors.As(err, &nf) || errors.As(err, &fb) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, l)
}

func (h *Handler) Candle(w http.ResponseWriter, r *http.Request) {
	count, err := h.svc.LightCandle(r.Context(), r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"candles": count})
}

func (h *Handler) Tribute(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "tribute:"+clientKey(r), 12, time.Hour) {
		return
	}
	var in struct {
		AuthorName string `json:"authorName"`
		Message    string `json:"message"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	t, err := h.svc.AddTribute(r.Context(), r.PathValue("slug"), in.AuthorName, in.Message)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, t)
}
