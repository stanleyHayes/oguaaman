package http

import (
	"errors"
	"net/http"

	"github.com/oguaa/backend/internal/service"
)

// ── auth (spec §8.1) ─────────────────────────────────────────────────────────

func (h *Handler) AuthRegister(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Identifier  string `json:"identifier"`
		DisplayName string `json:"displayName"`
		DateOfBirth string `json:"dateOfBirth"`
		Password    string `json:"password"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	token, member, err := h.auth.Register(r.Context(), in.Identifier, in.DisplayName, in.DateOfBirth, in.Password)
	if errors.Is(err, service.ErrUnderage) {
		fail(w, http.StatusForbidden, "You must be 18 or older to join Oguaa.")
		return
	}
	if errors.Is(err, service.ErrIdentifierTaken) {
		fail(w, http.StatusConflict, "An account already exists for that email or phone.")
		return
	}
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "member": member})
}

func (h *Handler) AuthLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Identifier string `json:"identifier"`
		Password   string `json:"password"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	token, member, err := h.auth.Login(r.Context(), in.Identifier, in.Password)
	if errors.Is(err, service.ErrInvalidCredentials) {
		fail(w, http.StatusUnauthorized, "That email/phone or password is incorrect.")
		return
	}
	if errors.Is(err, service.ErrNoPassword) {
		fail(w, http.StatusUnauthorized, "This account has no password yet — use Join to claim it.")
		return
	}
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "member": member})
}

func (h *Handler) AuthMe(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		fail(w, http.StatusUnauthorized, "Not signed in.")
		return
	}
	writeJSON(w, http.StatusOK, m)
}
