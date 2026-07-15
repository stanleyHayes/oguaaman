package http

import (
	"encoding/base64"
	"errors"
	"net/http"
	"time"

	"github.com/skip2/go-qrcode"

	"github.com/oguaa/backend/internal/service"
)

// ── auth (spec §8.1) ─────────────────────────────────────────────────────────

func (h *Handler) AuthRegister(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Identifier   string   `json:"identifier"`
		DisplayName  string   `json:"displayName"`
		DateOfBirth  string   `json:"dateOfBirth"`
		Password     string   `json:"password"`
		CreatorTypes []string `json:"creatorTypes"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	token, member, err := h.auth.Register(r.Context(), in.Identifier, in.DisplayName, in.DateOfBirth, in.Password, in.CreatorTypes)
	if errors.Is(err, service.ErrUnderage) {
		fail(w, http.StatusForbidden, "You must be 18 or older to join Oguaa.")
		return
	}
	if errors.Is(err, service.ErrIdentifierTaken) {
		fail(w, http.StatusConflict, "An account already exists for that email or phone.")
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "member": member})
}

// AuthMFA completes an MFA-gated sign-in: challenge from AuthLogin + a TOTP or
// recovery code → full session (spec §14).
func (h *Handler) AuthMFA(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "mfa-login:"+clientKey(r), 10, 5*time.Minute) {
		return
	}
	var in struct {
		Challenge string `json:"challenge"`
		Code      string `json:"code"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	token, member, err := h.auth.MFALogin(r.Context(), in.Challenge, in.Code)
	if errors.Is(err, service.ErrInvalidChallenge) {
		fail(w, http.StatusUnauthorized, "Your sign-in challenge expired — please sign in again.")
		return
	}
	if errors.Is(err, service.ErrSuspended) {
		fail(w, http.StatusForbidden, "This account is suspended.")
		return
	}
	if errors.Is(err, service.ErrMFANotSetup) {
		fail(w, http.StatusBadRequest, "Two-factor authentication isn't set up on this account.")
		return
	}
	if errors.Is(err, service.ErrInvalidMFACode) {
		fail(w, http.StatusUnauthorized, "That code didn't work — check your authenticator app and try again.")
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "member": member})
}

// MFASetup starts enrolment: a fresh secret + otpauth URL + QR PNG (data URL).
func (h *Handler) MFASetup(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if h.rateLimited(w, r, "mfa-setup:"+clientKey(r), 10, time.Hour) {
		return
	}
	secret, account, err := h.auth.MFASetup(r.Context(), m.ID)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	uri := service.OtpauthURL("Oguaa", account, secret)
	png, err := qrcode.Encode(uri, qrcode.Medium, 256)
	if err != nil {
		fail(w, http.StatusInternalServerError, "Could not render the QR code.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"secret":     secret,
		"otpauthUrl": uri,
		"qr":         "data:image/png;base64," + base64.StdEncoding.EncodeToString(png),
	})
}

// MFAConfirm turns MFA on after the first authenticator code verifies, and
// returns the one-time recovery codes (shown once).
func (h *Handler) MFAConfirm(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if h.rateLimited(w, r, "mfa-code:"+clientKey(r), 10, 5*time.Minute) {
		return
	}
	var in struct {
		Code string `json:"code"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	codes, err := h.auth.MFAConfirm(r.Context(), m.ID, in.Code)
	if errors.Is(err, service.ErrMFANotSetup) {
		fail(w, http.StatusBadRequest, "Start setup first — no authenticator secret is waiting.")
		return
	}
	if errors.Is(err, service.ErrInvalidMFACode) {
		fail(w, http.StatusBadRequest, "That code didn't work — check your authenticator app and try again.")
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recoveryCodes": codes})
}

// MFADisable turns MFA off after re-verifying a current code.
func (h *Handler) MFADisable(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if h.rateLimited(w, r, "mfa-code:"+clientKey(r), 10, 5*time.Minute) {
		return
	}
	var in struct {
		Code string `json:"code"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	err := h.auth.MFADisable(r.Context(), m.ID, in.Code)
	if errors.Is(err, service.ErrMFANotSetup) {
		fail(w, http.StatusBadRequest, "Two-factor authentication isn't enabled on this account.")
		return
	}
	if errors.Is(err, service.ErrInvalidMFACode) {
		fail(w, http.StatusBadRequest, "That code didn't work — check your authenticator app and try again.")
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
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
	if errors.Is(err, service.ErrSuspended) {
		fail(w, http.StatusForbidden, "This account is suspended.")
		return
	}
	if errors.Is(err, service.ErrNoPassword) {
		fail(w, http.StatusUnauthorized, "This account has no password yet — use Join to claim it.")
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	// MFA enrolment: the password step returns a 5-minute challenge instead of
	// a session — the client collects the authenticator code next (spec §14).
	if member.MFAEnabled {
		writeJSON(w, http.StatusOK, map[string]any{"mfaRequired": true, "challenge": token})
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
