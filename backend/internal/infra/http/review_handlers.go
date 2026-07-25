package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── business reviews & ratings ───────────────────────────────────────────────

// BusinessReviews — GET /api/businesses/{slug}/reviews. Public: the reviews plus
// the aggregate star rating.
func (h *Handler) BusinessReviews(w http.ResponseWriter, r *http.Request) {
	reviews, avg, count, err := h.svc.BusinessReviews(r.Context(), r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"reviews":     reviews,
		"ratingAvg":   avg,
		"ratingCount": count,
	})
}

// SubmitBusinessReview — POST /api/businesses/{slug}/reviews. Requires a
// signed-in member; one review per member (editing replaces it).
func (h *Handler) SubmitBusinessReview(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "review:"+clientKey(r), 20, time.Hour) {
		return
	}
	var in service.ReviewInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	review, err := h.svc.AddBusinessReview(r.Context(), m, r.PathValue("slug"), in)
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
	writeJSON(w, http.StatusCreated, review)
}
