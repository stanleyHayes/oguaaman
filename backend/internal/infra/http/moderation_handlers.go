package http

import "net/http"

// ── moderation queue & actions ───────────────────────────────────────────────

func (h *Handler) Queue(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator", "moderator"); !ok {
		return
	}
	typeFilter := r.URL.Query().Get("type")
	items, err := h.svc.ModerationQueue(r.Context(), typeFilter)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) Moderate(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, "curator", "moderator")
	if !ok {
		return
	}
	var in struct {
		ListingID   string `json:"listingId"`
		Action      string `json:"action"`
		Reason      string `json:"reason"`
		ModeratorID string `json:"moderatorId"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if m != nil {
		in.ModeratorID = m.ID
	} else if !h.authRequired {
		in.ModeratorID = "m-nana" // dev convenience only — never reached when AUTH_REQUIRED=true
	}
	if err := h.svc.Moderate(r.Context(), in.ListingID, in.Action, in.Reason, in.ModeratorID); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ── admin back-office ─────────────────────────────────────────────────────────

func (h *Handler) AdminListings(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator", "moderator"); !ok {
		return
	}
	items, err := h.svc.AllListings(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) AdminAudit(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator"); !ok {
		return
	}
	recs, err := h.svc.AuditLog(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, recs)
}

func (h *Handler) AdminSetRole(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r); !ok { // steward only
		return
	}
	var in struct {
		Role string `json:"role"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.svc.SetMemberRole(r.Context(), r.PathValue("id"), in.Role); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// AdminInviteMember — pre-create a member with a role (steward): invite a
// curator, steward or editor by phone/email.
func (h *Handler) AdminInviteMember(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r); !ok { // steward only
		return
	}
	var in struct {
		Identifier  string `json:"identifier"`
		DisplayName string `json:"displayName"`
		Role        string `json:"role"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	m, err := h.svc.InviteMember(r.Context(), in.Identifier, in.DisplayName, in.Role)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

// AdminCreateInstitution creates a new institution/place (steward only). Used by
// the admin "New place" flow; the steward then configures its official page.
func (h *Handler) AdminCreateInstitution(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r); !ok { // steward only
		return
	}
	var in struct {
		Name           string `json:"name"`
		Kind           string `json:"kind"`
		Classification string `json:"classification"`
		Summary        string `json:"summary"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	org, err := h.svc.CreateOrg(r.Context(), in.Name, in.Kind, in.Classification, in.Summary)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, org)
}

func (h *Handler) AdminSuspend(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r); !ok { // steward only
		return
	}
	var in struct {
		Suspended bool `json:"suspended"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.svc.SuspendMember(r.Context(), r.PathValue("id"), in.Suspended); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"suspended": in.Suspended})
}

// AdminInstitutions is the steward's unfiltered institution directory — the
// verification queue. The public /api/institutions hides unverified orgs, so
// the queue would be blind without it (spec §8.13).
func (h *Handler) AdminInstitutions(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r); !ok { // steward only
		return
	}
	items, err := h.svc.AllInstitutions(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) AdminVerify(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r); !ok { // steward only
		return
	}
	var in struct {
		Verified bool `json:"verified"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.svc.VerifyInstitution(r.Context(), r.PathValue("id"), in.Verified); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"verified": in.Verified})
}

func (h *Handler) AdminFeature(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator"); !ok {
		return
	}
	var in struct {
		Featured bool `json:"featured"`
		Days     int  `json:"days"` // paid placement length; 0 = no expiry (editorial)
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	until, err := h.svc.SetFeatured(r.Context(), r.PathValue("id"), in.Featured, in.Days)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"featured": in.Featured, "featuredUntil": until})
}

func (h *Handler) AdminUnpublish(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, "curator", "moderator")
	if !ok {
		return
	}
	modID := ""
	if m != nil {
		modID = m.ID
	} else if !h.authRequired {
		modID = "m-nana" // dev convenience only — never reached when AUTH_REQUIRED=true
	}
	if err := h.svc.Moderate(r.Context(), r.PathValue("id"), "unpublish", "", modID); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
