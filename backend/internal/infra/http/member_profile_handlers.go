package http

import (
	"context"
	"net/http"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── member directory + profiles (contract K5) ────────────────────────────────
//
// Public member endpoints serialise service.PublicMember only. The stored
// domain.Member (plans, suspension, two-factor state, broadcast settings) is
// returned to the member themself and to staff, never to other callers.

// MembersList — GET /api/members. The public directory: public fields only,
// suspended/erased accounts left out.
func (h *Handler) MembersList(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.PublicMembers(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeList(w, r, items)
}

// Member — GET /api/members/{slug}. What the caller sees depends on who they
// are: the member themself gets their own full record and every listing they
// own (the studio and the /me form rely on it); staff get the same for
// moderation; everyone else gets the public projection and approved listings
// only.
//
// A block hides the profile from BOTH sides (App Store Guideline 1.2). We answer
// 200 with direction-aware flags rather than 404 so the blocker can be offered
// an undo, while the member on the receiving end sees a neutral "profile
// unavailable" (blockedMe) instead of a misattributed "You blocked …".
func (h *Handler) Member(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	m, err := h.svc.MemberBySlug(ctx, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	h.svc.EnrichMemberBadge(ctx, m) // verified/verifiedAs badge next to their name

	viewer := currentMember(r)
	var status service.BlockStatus
	if viewer != nil {
		if st, bErr := h.svc.BlockStatusBetween(ctx, viewer.ID, m.ID); bErr == nil {
			status = st
		}
	}
	if status.Blocked() && !service.IsStaffViewer(viewer) {
		writeJSON(w, http.StatusOK, map[string]any{
			"member":  map[string]any{"slug": m.Slug, "displayName": m.DisplayName},
			"blocked": true, "blockedByMe": status.BlockedByMe, "blockedMe": status.BlockedMe,
			"listings": []any{}, "places": []any{}, "schools": []any{},
		})
		return
	}
	body, err := h.profileBody(ctx, m, viewer)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	body["blocked"], body["blockedByMe"], body["blockedMe"] = status.Blocked(), status.BlockedByMe, status.BlockedMe
	writeJSON(w, http.StatusOK, body)
}

// profileBody assembles the member, their listings for this viewer, and the
// place/school lookups the profile page resolves names from.
func (h *Handler) profileBody(ctx context.Context, m *domain.Member, viewer *domain.Member) (map[string]any, error) {
	listings, err := h.svc.ProfileListings(ctx, m, viewer)
	if err != nil {
		return nil, err
	}
	places, err := h.svc.Places(ctx)
	if err != nil {
		return nil, err
	}
	schools, err := h.svc.Schools(ctx)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"member": memberViewFor(m, viewer), "listings": listings, "places": places, "schools": schools,
	}, nil
}

// memberViewFor picks the member shape for the viewer: the stored record for
// the member themself and for staff, the public projection for everyone else.
func memberViewFor(m *domain.Member, viewer *domain.Member) any {
	if viewer != nil && (viewer.ID == m.ID || service.IsStaffViewer(viewer)) {
		return m
	}
	return service.PublicMemberOf(m)
}

// AdminMembers — GET /api/admin/members. The staff directory: the full stored
// record (role, suspension, two-factor state) that the public list no longer
// carries. Curators and moderators use it for owner look-ups; stewards pass.
func (h *Handler) AdminMembers(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator, domain.RoleModerator); !ok {
		return
	}
	items, err := h.svc.StaffMembers(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeList(w, r, items)
}

// AdminMember — GET /api/admin/members/{slug}. The staff member-detail view:
// the stored record and every listing at every status. Blocks between the
// staffer and the member do not apply here — a member must not be able to hide
// from moderation by blocking the moderator.
func (h *Handler) AdminMember(w http.ResponseWriter, r *http.Request) {
	staff, ok := h.requireRole(w, r, domain.RoleCurator, domain.RoleModerator)
	if !ok {
		return
	}
	ctx := r.Context()
	m, err := h.svc.MemberBySlug(ctx, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	h.svc.EnrichMemberBadge(ctx, m)
	viewer := staff
	if viewer == nil { // dev (AUTH_REQUIRED=false) opens the back office to anyone
		viewer = &domain.Member{Role: domain.RoleSteward}
	}
	body, err := h.profileBody(ctx, m, viewer)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, body)
}
