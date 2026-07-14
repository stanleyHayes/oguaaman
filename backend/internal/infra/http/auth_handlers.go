package http

import (
	"errors"
	"net/http"

	"github.com/oguaa/backend/internal/service"
)

// ── auth (spec §8.1) ─────────────────────────────────────────────────────────

func (h *Handler) AuthRequestOTP(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Identifier  string `json:"identifier"`
		DisplayName string `json:"displayName"`
		DateOfBirth string `json:"dateOfBirth"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	code, err := h.auth.RequestOTP(r.Context(), in.Identifier, in.DisplayName, in.DateOfBirth)
	if errors.Is(err, service.ErrUnderage) {
		fail(w, http.StatusForbidden, "You must be 18 or older to join Oguaa.")
		return
	}
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	resp := map[string]any{"sent": true}
	if code != "" {
		resp["devCode"] = code // dev mode only — no SMS provider configured
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) AuthVerifyOTP(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Identifier string `json:"identifier"`
		Code       string `json:"code"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	token, member, err := h.auth.VerifyOTP(r.Context(), in.Identifier, in.Code)
	if errors.Is(err, service.ErrInvalidOTP) {
		fail(w, http.StatusUnauthorized, "That code is invalid or has expired.")
		return
	}
	if errors.Is(err, service.ErrUnderage) {
		fail(w, http.StatusForbidden, "You must be 18 or older to join Oguaa.")
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
