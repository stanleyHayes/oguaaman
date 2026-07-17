package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── authorized directives / announcements ────────────────────────────────────

// Directives lists the public directive feed, sorted most-severe then newest.
// ?active=true keeps only currently-active directives; ?town= scopes to a town.
func (h *Handler) Directives(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	items, err := h.svc.ListDirectives(r.Context(), q.Get("active") == "true", q.Get("town"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// Directive fetches one directive by slug (public).
func (h *Handler) Directive(w http.ResponseWriter, r *http.Request) {
	d, err := h.svc.Directive(r.Context(), r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// PostInstitutionDirective — a manager of an authority institution issues a
// directive on its behalf (nested under institutions, like PostInstitutionEvent).
func (h *Handler) PostInstitutionDirective(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "directive:"+clientKey(r)+":"+r.PathValue("slug"), 20, time.Hour) {
		return
	}
	var in service.DirectiveInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	d, err := h.svc.CreateDirectiveForOrg(r.Context(), m.ID, r.PathValue("slug"), in)
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
	writeJSON(w, http.StatusCreated, d)
}

// AdminDirectives lists every directive (all statuses) for the back-office.
func (h *Handler) AdminDirectives(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	items, err := h.svc.AdminDirectives(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// AdminCreateDirective issues a directive as a curator/steward on behalf of an
// authority (the org is chosen by issuedByOrgId or issuedByOrgSlug in the body).
func (h *Handler) AdminCreateDirective(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleCurator)
	if !ok {
		return
	}
	var in service.DirectiveInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if m == nil {
		m = &domain.Member{ID: domain.DevDemoModeratorID, Role: domain.RoleSteward} // dev convenience only — never reached when AUTH_REQUIRED=true
	}
	d, err := h.svc.AdminCreateDirective(r.Context(), m.ID, in)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, d)
}

// AdminCancelDirective withdraws a directive (curator/steward only).
func (h *Handler) AdminCancelDirective(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	d, err := h.svc.CancelDirective(r.Context(), r.PathValue("id"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, d)
}
