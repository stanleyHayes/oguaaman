package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── Ghana Data Protection Act, 2012 (Act 843) — spec §14.2 ──────────────────
// Right of access (export) and right to erasure (anonymised deletion). Both
// need a genuinely signed-in member — never the dev fallback identity.

// ExportMyData — everything the platform holds about the member, as a JSON
// download (Act 843 right of access). Includes the private identifiers here
// (email/phone/DOB) because this response is the member's own copy.
func (h *Handler) ExportMyData(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "export:"+clientKey(r), 5, time.Hour) {
		return
	}
	ctx := r.Context()
	listings, err := h.svc.ListingsByOwner(ctx, m.ID)
	if err != nil {
		listings = []domain.Listing{}
	}
	tickets, err := h.tickets.MemberTickets(ctx, m.ID)
	if err != nil {
		tickets = []domain.Ticket{}
	}
	subs, err := h.subs.MemberSubscriptions(ctx, m.ID)
	if err != nil {
		subs = []domain.Subscription{}
	}
	pledges, err := h.payments.MemberPledges(ctx, m.ID)
	if err != nil {
		pledges = []domain.Pledge{}
	}
	promotions, err := h.promotions.MemberPromotions(ctx, m.ID)
	if err != nil {
		promotions = []domain.Promotion{}
	}
	// Content-Disposition must be set before writeJSON commits the headers.
	w.Header().Set("Content-Disposition", `attachment; filename="oguaa-data-export.json"`)
	writeJSON(w, http.StatusOK, map[string]any{
		"exportedAt": time.Now().UTC().Format(time.RFC3339),
		"profile": map[string]any{
			"id": m.ID, "slug": m.Slug, "displayName": m.DisplayName, "initials": m.Initials,
			"photoUrl": m.PhotoURL, "bio": m.Bio, "townId": m.TownID, "asafoId": m.AsafoID,
			"schoolIds": m.SchoolIDs, "schooling": m.Schooling, "links": m.Links,
			"phoneVerified": m.PhoneVerified, "role": m.Role, "creatorTypes": m.CreatorTypes,
			"creatorPlanIntent": m.CreatorPlanIntent,
			"suspended":         m.Suspended, "joinedAt": m.JoinedAt,
			"birthday": m.Birthday, "broadcastBirthday": m.BroadcastBirthday, "diaspora": m.Diaspora,
			"email": m.Email, "phone": m.Phone, "dateOfBirth": m.DateOfBirth,
			"mfaEnabled": m.MFAEnabled,
		},
		"listings":      listings,
		"tickets":       tickets,
		"subscriptions": subs,
		"pledges":       pledges,
		"promotions":    promotions,
	})
}

// DeleteMyAccount — anonymises the account (Act 843 right to erasure): all
// personal data is wiped and the account is suspended so it can never sign in
// again. Published, approved listings stay live under a "Former member" owner
// so community content (memorials especially) doesn't vanish; drafts and
// pending submissions are unpublished. Requires the current password.
func (h *Handler) DeleteMyAccount(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "delete:"+clientKey(r), 5, time.Hour) {
		return
	}
	var in struct {
		Password string `json:"password"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.auth.DeleteAccount(r.Context(), m.ID, in.Password); errors.Is(err, service.ErrInvalidCredentials) {
		fail(w, http.StatusForbidden, "That password is incorrect.")
		return
	} else if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	// Unpublish anything not yet approved — it was never community content.
	if err := h.svc.UnpublishDraftsByOwner(r.Context(), m.ID); err != nil {
		// The account is already anonymised; log and still report success.
		h.log.Error("unpublish drafts on account delete", "member", m.ID, "err", err)
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
