package http

import (
	"net/http"

	"github.com/oguaa/backend/internal/domain"
)

// PushKey returns the VAPID public key the browser needs to subscribe. Empty
// string means web push is not configured (clients stay on the foreground ring).
func (h *Handler) PushKey(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"publicKey": h.svc.PushPublicKey()})
}

// pushSubscribeInput is the register payload: a web push subscription OR an
// expo token. Platform selects which.
type pushSubscribeInput struct {
	Platform  string `json:"platform"`
	Endpoint  string `json:"endpoint"`
	P256dh    string `json:"p256dh"`
	Auth      string `json:"auth"`
	ExpoToken string `json:"expoToken"`
}

// PushSubscribe registers the signed-in member's device for safety-alert push.
func (h *Handler) PushSubscribe(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	var in pushSubscribeInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	err := h.svc.RegisterPush(r.Context(), domain.PushSubscription{
		MemberID: m.ID, Platform: in.Platform,
		Endpoint: in.Endpoint, P256dh: in.P256dh, Auth: in.Auth, ExpoToken: in.ExpoToken,
	})
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// pushUnsubscribeInput identifies a subscription to remove (endpoint or token).
type pushUnsubscribeInput struct {
	ID string `json:"id"` // web endpoint or expo token
}

// PushUnsubscribe removes the member's subscription.
func (h *Handler) PushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	var in pushUnsubscribeInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.svc.UnregisterPush(r.Context(), m.ID, in.ID); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
