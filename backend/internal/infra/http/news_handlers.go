package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── news / editorial (spec §8.12) ─────────────────────────────────────────────

// News (public) — published articles, newest first.
func (h *Handler) News(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.PublishedNews(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// NewsArticle (public) — one published article by slug.
func (h *Handler) NewsArticle(w http.ResponseWriter, r *http.Request) {
	a, err := h.svc.NewsBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// SubmitNews (member) — a "writer" creator or a manager of a verified authority
// institution posts a news/blog article. POST /api/news (requireAuth). Writers'
// posts enter the newsroom as drafts for editorial review; verified-authority
// managers auto-publish. The public GET /api/news lists published posts.
func (h *Handler) SubmitNews(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "news-submit:"+clientKey(r), 10, time.Hour) {
		return
	}
	var in service.NewsInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	a, err := h.svc.SubmitNews(r.Context(), m.ID, in)
	if err != nil {
		var fb *domain.ForbiddenError
		var nf *domain.NotFoundError
		if errors.As(err, &fb) || errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

// ── admin (curator/steward) ───────────────────────────────────────────────────

func (h *Handler) AdminNewsList(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator", "editor"); !ok {
		return
	}
	items, err := h.svc.AllNews(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) AdminNewsGet(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator", "editor"); !ok {
		return
	}
	a, err := h.svc.NewsForAdmin(r.Context(), r.PathValue("id"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (h *Handler) AdminNewsCreate(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, "curator", "editor")
	if !ok {
		return
	}
	var in service.NewsInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	authorID, authorName := "m-nana", "Editorial"
	if m != nil {
		authorID, authorName = m.ID, m.DisplayName
	}
	a, err := h.svc.CreateNews(r.Context(), authorID, authorName, in)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (h *Handler) AdminNewsUpdate(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator", "editor"); !ok {
		return
	}
	var in service.NewsInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	a, err := h.svc.UpdateNews(r.Context(), r.PathValue("id"), in)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (h *Handler) AdminNewsPublish(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator", "editor"); !ok {
		return
	}
	var in struct {
		Publish bool `json:"publish"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.svc.SetNewsPublished(r.Context(), r.PathValue("id"), in.Publish); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"published": in.Publish})
}

func (h *Handler) AdminNewsDelete(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator", "editor"); !ok {
		return
	}
	if err := h.svc.DeleteNews(r.Context(), r.PathValue("id")); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
