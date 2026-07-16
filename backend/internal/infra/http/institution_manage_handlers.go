package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── institution management: claim → steward-verify → manage (spec §8.13) ──────

// orgManageRateKey prefixes the rate-limit bucket for institution management writes.
const orgManageRateKey = "orgmanage:"

// ClaimInstitution — a signed-in member requests to manage an institution.
func (h *Handler) ClaimInstitution(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, "Sign in to claim an institution.")
		return
	}
	if h.rateLimited(w, r, "orgclaim:"+clientKey(r), 10, time.Hour) {
		return
	}
	var in struct {
		Role string `json:"requestedRole"`
		Note string `json:"note"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	c, err := h.svc.RequestOrgClaim(r.Context(), m.ID, r.PathValue("slug"), in.Role, in.Note)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

// MyInstitutions lists the institutions the signed-in member may manage.
func (h *Handler) MyInstitutions(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, []domain.Organization{})
		return
	}
	orgs, err := h.svc.ManagedOrgs(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, orgs)
}

// UpdateInstitutionProfile — a manager edits the soft profile fields.
func (h *Handler) UpdateInstitutionProfile(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, orgManageRateKey+clientKey(r), 60, time.Hour) {
		return
	}
	var in struct {
		Summary  string              `json:"summary"`
		History  string              `json:"history"`
		Motto    string              `json:"motto"`
		CrestURL string              `json:"crestUrl"`
		Contact  []domain.SocialLink `json:"contact"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	org, err := h.svc.UpdateOrgProfile(r.Context(), m.ID, r.PathValue("slug"), domain.OrgProfilePatch{
		Summary: in.Summary, History: in.History, Motto: in.Motto, CrestURL: in.CrestURL, Contact: in.Contact,
	})
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, org)
}

// SetInstitutionOffices — a manager replaces the roster of offices.
func (h *Handler) SetInstitutionOffices(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, orgManageRateKey+clientKey(r), 60, time.Hour) {
		return
	}
	var in struct {
		Offices []domain.Office `json:"offices"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	org, err := h.svc.SetOrgOffices(r.Context(), m.ID, r.PathValue("slug"), in.Offices)
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
	writeJSON(w, http.StatusOK, org)
}

// SetInstitutionGallery — a manager replaces the institution's photo gallery.
func (h *Handler) SetInstitutionGallery(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, orgManageRateKey+clientKey(r), 60, time.Hour) {
		return
	}
	var in struct {
		Gallery []domain.MediaAsset `json:"gallery"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	org, err := h.svc.SetOrgGallery(r.Context(), m.ID, r.PathValue("slug"), in.Gallery)
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
	writeJSON(w, http.StatusOK, org)
}

// SetInstitutionSections — a manager replaces the custom showcase sections.
func (h *Handler) SetInstitutionSections(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, orgManageRateKey+clientKey(r), 60, time.Hour) {
		return
	}
	var in struct {
		Sections []domain.ProfileSection `json:"sections"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	org, err := h.svc.SetOrgSections(r.Context(), m.ID, r.PathValue("slug"), in.Sections)
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
	writeJSON(w, http.StatusOK, org)
}

// PostInstitutionEvent — a manager publishes an official event.
func (h *Handler) PostInstitutionEvent(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "orgevent:"+clientKey(r)+":"+r.PathValue("slug"), 20, time.Hour) {
		return
	}
	var in struct {
		Title   string         `json:"title"`
		Details map[string]any `json:"details"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	l, err := h.svc.PostOrgEvent(r.Context(), m.ID, r.PathValue("slug"), in.Title, in.Details)
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
	writeJSON(w, http.StatusCreated, l)
}

// ── team management: invitations + scopes (Creator plan §4.1.2) ─────────────

// OrgTeam — a team member (either scope) or steward views the roster.
func (h *Handler) OrgTeam(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	team, err := h.svc.OrgTeam(r.Context(), m.ID, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, team)
}

// InviteToTeam — a manager invites a citizen by email/phone + office.
func (h *Handler) InviteToTeam(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "orginvite:"+clientKey(r), 10, time.Hour) {
		return
	}
	var in struct {
		Identifier string `json:"identifier"`
		Role       string `json:"role"`
		Scope      string `json:"scope"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	c, err := h.svc.InviteToTeam(r.Context(), m.ID, r.PathValue("slug"), in.Identifier, in.Role, in.Scope)
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
	writeJSON(w, http.StatusCreated, c)
}

// SetTeamScope — a manager promotes/demotes an approved team member.
func (h *Handler) SetTeamScope(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	var in struct {
		Scope string `json:"scope"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.svc.SetTeamMemberScope(r.Context(), m.ID, r.PathValue("slug"), r.PathValue("memberId"), in.Scope); err != nil {
		var fb *domain.ForbiddenError
		var nf *domain.NotFoundError
		if errors.As(err, &fb) || errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// RevokeTeamMember — a manager (or steward/moderator) removes a team member.
func (h *Handler) RevokeTeamMember(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if err := h.svc.RevokeTeamMember(r.Context(), m.ID, r.PathValue("slug"), r.PathValue("memberId")); err != nil {
		var fb *domain.ForbiddenError
		var nf *domain.NotFoundError
		if errors.As(err, &fb) || errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}

// MyInvitations — the signed-in member's unanswered team invitations.
func (h *Handler) MyInvitations(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	invites, err := h.svc.MyInvitations(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, invites)
}

// RespondToInvite — the invitee accepts or declines a team invitation.
func (h *Handler) RespondToInvite(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	var in struct {
		Accept bool `json:"accept"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.svc.RespondToInvite(r.Context(), m.ID, r.PathValue("id"), in.Accept); err != nil {
		var fb *domain.ForbiddenError
		var nf *domain.NotFoundError
		if errors.As(err, &fb) || errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"accepted": in.Accept})
}

// ── request-a-new-institution (Creator plan §4.1.1) ─────────────────────────

// InstitutionKinds — the server-side kind catalog (public).
func (h *Handler) InstitutionKinds(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.svc.InstitutionKinds(r.Context()))
}

// RequestInstitution — a signed-in member requests a missing institution.
func (h *Handler) RequestInstitution(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, "Sign in to request an institution.")
		return
	}
	if h.rateLimited(w, r, "orgclaim:"+clientKey(r), 10, time.Hour) {
		return
	}
	var in struct {
		Name string `json:"name"`
		Kind string `json:"kind"`
		Seat string `json:"seat"`
		Role string `json:"role"`
		Note string `json:"note"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	c, err := h.svc.RequestNewInstitution(r.Context(), m.ID, in.Name, in.Kind, in.Seat, in.Role, in.Note)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

// MyInstitutionRequests — the member's own create-requests with review state.
func (h *Handler) MyInstitutionRequests(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	reqs, err := h.svc.MyInstitutionRequests(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, reqs)
}

// ── admin: review institution claims (steward) ───────────────────────────────

func (h *Handler) AdminClaims(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r); !ok { // steward
		return
	}
	claims, err := h.svc.PendingClaims(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, claims)
}

func (h *Handler) AdminReviewClaim(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r) // steward
	if !ok {
		return
	}
	var in struct {
		Approve bool `json:"approve"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	stewardID := ""
	if m != nil {
		stewardID = m.ID
	}
	if err := h.svc.ReviewOrgClaim(r.Context(), r.PathValue("id"), in.Approve, stewardID); err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"approved": in.Approve})
}
