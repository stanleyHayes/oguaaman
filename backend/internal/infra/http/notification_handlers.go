package http

import (
	"net/http"

	"github.com/oguaa/backend/internal/domain"
)

// ── notifications & remembrance (spec §8.2, §8.11) ───────────────────────────

func (h *Handler) Notifications(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, []domain.Notification{})
		return
	}
	ns, err := h.svc.Notifications(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ns)
}

func (h *Handler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, map[string]int{"count": 0})
		return
	}
	n, err := h.svc.UnreadCount(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"count": n})
}

func (h *Handler) MarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if err := h.svc.MarkNotificationRead(r.Context(), r.PathValue("id"), m.ID); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) MarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if err := h.svc.MarkAllNotificationsRead(r.Context(), m.ID); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) FollowState(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, map[string]bool{"following": false})
		return
	}
	following, err := h.svc.IsFollowing(r.Context(), m.ID, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"following": following})
}

func (h *Handler) FollowMemorial(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		fail(w, http.StatusUnauthorized, "Sign in to remember someone.")
		return
	}
	count, err := h.svc.FollowMemorial(r.Context(), m.ID, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"following": true, "remembering": count})
}

func (h *Handler) UnfollowMemorial(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	count, err := h.svc.UnfollowMemorial(r.Context(), m.ID, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"following": false, "remembering": count})
}

func (h *Handler) AdminRunRemembrance(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r); !ok { // steward
		return
	}
	created, err := h.svc.RunRemembrance(r.Context(), r.URL.Query().Get("date"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"created": created})
}
