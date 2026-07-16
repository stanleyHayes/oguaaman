package http

import (
	"encoding/base64"
	"errors"
	"net/http"
	"time"

	"github.com/skip2/go-qrcode"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── auth (spec §8.1) ─────────────────────────────────────────────────────────

// selfMember enriches the member payload on self-facing auth endpoints with
// the account's own contact identifiers. Everywhere else Email/Phone stay
// json:"-" so public payloads never leak them.
type selfMember struct {
	*domain.Member
	Email string `json:"email,omitempty"`
	Phone string `json:"phone,omitempty"`
}

func selfView(m *domain.Member) selfMember {
	return selfMember{Member: m, Email: m.Email, Phone: m.Phone}
}

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
	h.svc.EnrichMemberBadge(r.Context(), member) // verified/verifiedAs badge
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "member": selfView(member)})
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
	h.svc.EnrichMemberBadge(r.Context(), member) // verified/verifiedAs badge
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "member": selfView(member)})
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
	h.svc.EnrichMemberBadge(r.Context(), member) // verified/verifiedAs badge
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "member": selfView(member)})
}

// StartPhoneVerification issues a short-lived verification code for the signed-in
// member. In dev, the code is returned so the UI can surface it without an SMS
// provider; production can swap this out for real delivery later.
func (h *Handler) StartPhoneVerification(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "phone-verify-start:"+clientKey(r), 5, time.Hour) {
		return
	}
	member, code, expiresAt, err := h.auth.StartPhoneVerification(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"member":    member,
		"code":      code,
		"expiresAt": expiresAt,
		"verified":  member.PhoneVerified,
	})
}

// ConfirmPhoneVerification checks a one-time code and marks the member verified.
func (h *Handler) ConfirmPhoneVerification(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "phone-verify-confirm:"+clientKey(r), 10, 5*time.Minute) {
		return
	}
	var in struct {
		Code string `json:"code"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	member, err := h.auth.ConfirmPhoneVerification(r.Context(), m.ID, in.Code)
	if errors.Is(err, service.ErrPhoneVerificationNotSetup) {
		fail(w, http.StatusBadRequest, "Start verification first — no code is waiting.")
		return
	}
	if errors.Is(err, service.ErrPhoneVerificationExpired) {
		fail(w, http.StatusUnauthorized, "That verification code expired — please request a new one.")
		return
	}
	if errors.Is(err, service.ErrInvalidPhoneVerificationCode) {
		fail(w, http.StatusUnauthorized, "That verification code didn't work.")
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"member": member, "verified": member.PhoneVerified})
}

func (h *Handler) AuthMe(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		fail(w, http.StatusUnauthorized, "Not signed in.")
		return
	}
	h.svc.EnrichMemberBadge(r.Context(), m) // verified/verifiedAs badge
	writeJSON(w, http.StatusOK, selfView(m))
}
