package http

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/skip2/go-qrcode"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── auth (spec §8.1) ─────────────────────────────────────────────────────────

// User-facing messages shared by several auth endpoints.
const (
	msgBadCredentials   = "That email/phone or password is incorrect."
	msgAccountSuspended = "This account is suspended."
	msgBadMFACode       = "That code didn't work — check your authenticator app and try again."
	msgShortPassword    = "Your new password must be at least 8 characters."
	// One answer for a wrong, expired or never-requested reset code, so the
	// reset flow never reveals whether an account exists.
	msgBadResetCode = "That code is incorrect or has expired. Check the latest code we sent, or request a new one."
	// Sign-up with an identifier that already has an account (K3: never claimed).
	msgCannotRegister = "We couldn't create an account with those details. If you already have one, sign in or reset your password."
)

// Throttles for the anonymous auth flows. They key on the client IP and on the
// account being targeted from that network — never on the caller's own
// session token, which an attacker can rotate at will, and never on the
// account alone, which would let a stranger use up its owner's attempts (R01).
// Guessing spread over many networks is held back by the account's sign-in
// lock and the reset code's overall guess cap in the auth service.
const (
	loginWindow             = 15 * time.Minute
	loginPerIP              = 30
	loginPerIdentifier      = 5
	registerPerIP           = 10
	registerPerIdentifier   = 5
	mfaLoginWindow          = 5 * time.Minute
	mfaLoginPerIP           = 20
	mfaLoginPerAccount      = 10
	resetStartPerIP         = 10
	resetStartPerIdentifier = 5
	resetConfirmWindow      = 15 * time.Minute
	resetConfirmPerIP       = 20
	resetConfirmPerID       = 10
	codeCheckWindow         = 5 * time.Minute
)

// selfMember enriches the member payload on self-facing auth endpoints with
// the account's own contact identifiers and consent state. Everywhere else
// Email/Phone/consent stay json:"-" so public payloads never leak them.
type selfMember struct {
	*domain.Member
	Email string `json:"email,omitempty"`
	Phone string `json:"phone,omitempty"`
	// AIConsent: the member agreed to the writing assistant's data use (K15).
	AIConsent bool `json:"aiConsent"`
	// ConsentRequired: the member must (re-)accept the current Terms of Use
	// and Privacy Policy (POST /api/me/consent) — contract K2.
	ConsentRequired bool `json:"consentRequired"`
	// AdultVerified: confirmed 18 or older (never the date of birth itself).
	AdultVerified bool            `json:"adultVerified"`
	Consent       *domain.Consent `json:"consent,omitempty"`
	// StaffMFARequired: a staff role the account can't use until two-factor
	// is on (production; staff routes answer 403 mfa_required meanwhile).
	StaffMFARequired bool `json:"staffMfaRequired"`
}

func selfView(m *domain.Member) selfMember {
	return selfMember{
		Member: m, Email: m.Email, Phone: m.Phone,
		AIConsent:       m.AIConsentAt != "",
		ConsentRequired: service.ConsentRequired(m),
		AdultVerified:   service.AdultVerified(m),
		Consent:         m.Consent,
	}
}

// accountView is selfView plus what only the auth service knows.
func (h *Handler) accountView(m *domain.Member) selfMember {
	v := selfView(m)
	v.StaffMFARequired = h.auth.StaffMFARequired(m)
	return v
}

// throttled applies the per-IP limit and then the per-target limit for one
// auth flow, writing the 429 when either is exceeded.
func (h *Handler) throttled(w http.ResponseWriter, r *http.Request, flow string, perIP int, target string, perTarget int, per time.Duration) bool {
	return h.rateLimited(w, r, flow+":ip:"+clientIP(r), perIP, per) ||
		h.rateLimited(w, r, flow+":t:"+target, perTarget, per)
}

// throttledAnon is throttled for the anonymous flows that name an account:
// the per-account limit is counted per client network, so requests from
// elsewhere never use up the owner's own attempts.
func (h *Handler) throttledAnon(w http.ResponseWriter, r *http.Request, flow string, perIP int, target string, perTarget int, per time.Duration) bool {
	return h.throttled(w, r, flow, perIP, target+"@"+clientNet(r), perTarget, per)
}

// withSource tags the request context with the client network, which the
// auth service uses to bind a sign-in lock or a reset-code guess budget to
// the networks that earned it.
func withSource(r *http.Request) context.Context {
	return service.WithRequestSource(r.Context(), clientNet(r))
}

func (h *Handler) AuthRegister(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Identifier   string   `json:"identifier"`
		DisplayName  string   `json:"displayName"`
		DateOfBirth  string   `json:"dateOfBirth"`
		Password     string   `json:"password"`
		CreatorTypes []string `json:"creatorTypes"`
		// CreatorPlanIntent is a catalog preference, not proof of a paid
		// subscription. Creators default to the active free Starter plan.
		CreatorPlanIntent string `json:"creatorPlanIntent"`
		// Consent (K1): acceptTerms must be true; the server records its own
		// current notice versions, termsVersion is what the client showed.
		AcceptTerms  bool   `json:"acceptTerms"`
		TermsVersion string `json:"termsVersion"`
		Platform     string `json:"platform"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	target := limiterSubject(service.NormalizeIdentifier(in.Identifier))
	if h.throttledAnon(w, r, "register", registerPerIP, target, registerPerIdentifier, time.Hour) {
		return
	}
	token, member, err := h.auth.Register(r.Context(), service.RegisterInput{
		Identifier: in.Identifier, DisplayName: in.DisplayName, DateOfBirth: in.DateOfBirth,
		Password: in.Password, CreatorTypes: in.CreatorTypes, CreatorPlanIntent: in.CreatorPlanIntent,
		AcceptTerms: in.AcceptTerms, TermsVersion: in.TermsVersion, Platform: in.Platform,
	})
	if err != nil {
		h.registerFailed(w, err)
		return
	}
	h.svc.EnrichMemberBadge(r.Context(), member) // verified/verifiedAs badge
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "member": h.accountView(member)})
}

// registerFailed maps a sign-up error to its response.
func (h *Handler) registerFailed(w http.ResponseWriter, err error) {
	var validation *domain.ValidationError
	switch {
	case errors.Is(err, service.ErrTermsNotAccepted):
		fail(w, http.StatusBadRequest, "Please agree to the Terms of Use and Privacy Policy to join.")
	case errors.Is(err, service.ErrUnderage):
		fail(w, http.StatusForbidden, "You must be 18 or older to join Oguaa.")
	case errors.Is(err, service.ErrIdentifierTaken):
		fail(w, http.StatusConflict, msgCannotRegister)
	case errors.As(err, &validation):
		fail(w, http.StatusBadRequest, validation.Error())
	default:
		h.handleErr(w, err)
	}
}

// AuthMFA completes an MFA-gated sign-in: challenge from AuthLogin + a TOTP or
// recovery code → full session (spec §14).
func (h *Handler) AuthMFA(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Challenge string `json:"challenge"`
		Code      string `json:"code"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if h.rateLimited(w, r, "mfa-login:ip:"+clientIP(r), mfaLoginPerIP, mfaLoginWindow) {
		return
	}
	if sub := h.auth.ChallengeSubject(in.Challenge); sub != "" && h.rateLimited(w, r, "mfa-login:m:"+sub, mfaLoginPerAccount, mfaLoginWindow) {
		return
	}
	token, member, err := h.auth.MFALogin(withSource(r), in.Challenge, in.Code)
	switch {
	case errors.Is(err, service.ErrInvalidChallenge):
		fail(w, http.StatusUnauthorized, "Your sign-in challenge expired — please sign in again.")
	case errors.Is(err, service.ErrAccountLocked):
		fail(w, http.StatusTooManyRequests, msgRateLimited)
	case errors.Is(err, service.ErrSuspended):
		fail(w, http.StatusForbidden, msgAccountSuspended)
	case errors.Is(err, service.ErrMFANotSetup):
		fail(w, http.StatusBadRequest, "Two-factor authentication isn't set up on this account.")
	case errors.Is(err, service.ErrInvalidMFACode):
		fail(w, http.StatusUnauthorized, msgBadMFACode)
	case err != nil:
		h.handleErr(w, err)
	default:
		h.svc.EnrichMemberBadge(r.Context(), member) // verified/verifiedAs badge
		writeJSON(w, http.StatusOK, map[string]any{"token": token, "member": h.accountView(member)})
	}
}

// MFASetup starts enrolment: a fresh secret + otpauth URL + QR PNG (data URL).
// When two-factor is already on, the body must carry {"code"} — a current
// authenticator or recovery code — to replace the authenticator.
func (h *Handler) MFASetup(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "mfa-setup:m:"+m.ID, 10, time.Hour) {
		return
	}
	var in struct {
		Code string `json:"code"`
	}
	if err := decodeBody(r, &in); err != nil && !errors.Is(err, io.EOF) {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	secret, account, err := h.auth.MFASetup(r.Context(), m.ID, in.Code)
	switch {
	case errors.Is(err, service.ErrMFACodeRequired):
		writeJSON(w, http.StatusForbidden, map[string]string{
			"error":   "mfa_code_required",
			"message": "Enter a code from your current authenticator app, or a recovery code, to set up a new one.",
		})
		return
	case errors.Is(err, service.ErrInvalidMFACode):
		fail(w, http.StatusBadRequest, msgBadMFACode)
		return
	case err != nil:
		h.handleErr(w, err)
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
// returns the one-time recovery codes (shown once) plus a fresh session token:
// enrolment signs out every earlier session, including the caller's.
func (h *Handler) MFAConfirm(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "mfa-code:m:"+m.ID, 10, codeCheckWindow) {
		return
	}
	var in struct {
		Code string `json:"code"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	codes, token, err := h.auth.MFAConfirm(r.Context(), m.ID, in.Code)
	switch {
	case errors.Is(err, service.ErrMFANotSetup):
		fail(w, http.StatusBadRequest, "Start setup first — no authenticator secret is waiting.")
	case errors.Is(err, service.ErrInvalidMFACode):
		fail(w, http.StatusBadRequest, msgBadMFACode)
	case err != nil:
		h.handleErr(w, err)
	default:
		writeJSON(w, http.StatusOK, map[string]any{"recoveryCodes": codes, "token": token})
	}
}

// MFADisable turns MFA off after re-verifying a current code. Every earlier
// session is signed out; the response carries a fresh {token} for this device.
func (h *Handler) MFADisable(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "mfa-code:m:"+m.ID, 10, codeCheckWindow) {
		return
	}
	var in struct {
		Code string `json:"code"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	token, err := h.auth.MFADisable(r.Context(), m.ID, in.Code)
	switch {
	case errors.Is(err, service.ErrMFANotSetup):
		fail(w, http.StatusBadRequest, "Two-factor authentication isn't enabled on this account.")
	case errors.Is(err, service.ErrInvalidMFACode):
		fail(w, http.StatusBadRequest, msgBadMFACode)
	case err != nil:
		h.handleErr(w, err)
	default:
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": token})
	}
}

// AuthLogin signs a member in. Every credential failure — unknown account,
// wrong password, an invited account nobody has claimed — gets the same 401,
// and a locked account gets the same 429 as a throttled caller.
func (h *Handler) AuthLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Identifier string `json:"identifier"`
		Password   string `json:"password"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	target := limiterSubject(service.NormalizeIdentifier(in.Identifier))
	if h.throttledAnon(w, r, "login", loginPerIP, target, loginPerIdentifier, loginWindow) {
		return
	}
	token, member, err := h.auth.Login(withSource(r), in.Identifier, in.Password)
	switch {
	case errors.Is(err, service.ErrInvalidCredentials):
		fail(w, http.StatusUnauthorized, msgBadCredentials)
	case errors.Is(err, service.ErrAccountLocked):
		fail(w, http.StatusTooManyRequests, msgRateLimited)
	case errors.Is(err, service.ErrSuspended):
		fail(w, http.StatusForbidden, msgAccountSuspended)
	case err != nil:
		h.handleErr(w, err)
	case member.MFAEnabled:
		// MFA enrolment: the password step returns a 5-minute challenge instead
		// of a session — the client collects the authenticator code next (spec §14).
		writeJSON(w, http.StatusOK, map[string]any{"mfaRequired": true, "challenge": token})
	default:
		h.svc.EnrichMemberBadge(r.Context(), member) // verified/verifiedAs badge
		writeJSON(w, http.StatusOK, map[string]any{"token": token, "member": h.accountView(member)})
	}
}

// StartPhoneVerification issues a short-lived verification code for the signed-in
// member and delivers it by email or WhatsApp. Outside production an
// undelivered code is returned so the UI can surface it; production never
// returns one and answers 503 when no channel could deliver it.
func (h *Handler) StartPhoneVerification(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.throttled(w, r, "phone-verify-start", 20, "m:"+m.ID, 5, time.Hour) {
		return
	}
	member, code, expiresAt, err := h.auth.StartPhoneVerification(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	if h.production {
		code = "" // belt and braces: production never puts a code in a response
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
	if h.throttled(w, r, "phone-verify-confirm", 30, "m:"+m.ID, 10, codeCheckWindow) {
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

// StartPasswordReset issues a short-lived reset code for the account matching
// the identifier and delivers it over email/WhatsApp. It is also how an invited
// account (no password yet) is claimed. The response is a generic 200
// {ok:true} for known and unknown accounts alike; production answers 503 when
// no channel could deliver the code (or none is configured for that kind of
// identifier). In dev (AUTH_REQUIRED=false) the
// code is echoed as {devCode} so the flow is testable without email/WhatsApp
// configured — mirroring the phone-verify dev behaviour.
func (h *Handler) StartPasswordReset(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Identifier string `json:"identifier"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	target := limiterSubject(service.NormalizeIdentifier(in.Identifier))
	if h.throttledAnon(w, r, "pw-reset-start", resetStartPerIP, target, resetStartPerIdentifier, time.Hour) {
		return
	}
	member, code, err := h.auth.StartPasswordReset(r.Context(), in.Identifier)
	if errors.Is(err, service.ErrResetAccountNotFound) {
		// Unknown account — return the same generic success as a real send.
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	out := map[string]any{"ok": true}
	// Echo the code only in dev so it's testable without a delivery channel.
	// Production never echoes one (the service returns "" there too).
	if !h.authRequired && !h.production && member != nil && code != "" {
		out["devCode"] = code
	}
	writeJSON(w, http.StatusOK, out)
}

// ConfirmPasswordReset checks a reset code and sets a new password, signing out
// every existing session. It never issues a session — the member signs back in
// with the new password. A wrong, expired or never-requested code all get the
// same answer.
func (h *Handler) ConfirmPasswordReset(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Identifier  string `json:"identifier"`
		Code        string `json:"code"`
		NewPassword string `json:"newPassword"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	target := limiterSubject(service.NormalizeIdentifier(in.Identifier))
	if h.throttledAnon(w, r, "pw-reset-confirm", resetConfirmPerIP, target, resetConfirmPerID, resetConfirmWindow) {
		return
	}
	err := h.auth.ConfirmPasswordReset(withSource(r), in.Identifier, in.Code, in.NewPassword)
	switch {
	case errors.Is(err, service.ErrResetNotStarted), errors.Is(err, service.ErrResetExpired), errors.Is(err, service.ErrInvalidResetCode):
		fail(w, http.StatusBadRequest, msgBadResetCode)
	case errors.Is(err, service.ErrResetPasswordTooShort):
		fail(w, http.StatusBadRequest, msgShortPassword)
	case err != nil:
		h.handleErr(w, err)
	default:
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

// ChangeMyPassword re-verifies the signed-in member's current password and sets
// a new one. Every existing session is signed out; the response carries a fresh
// {token} for this device to continue with.
func (h *Handler) ChangeMyPassword(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "change-password:m:"+m.ID, 10, time.Hour) {
		return
	}
	var in struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	token, err := h.auth.ChangePassword(r.Context(), m.ID, in.CurrentPassword, in.NewPassword)
	switch {
	case errors.Is(err, service.ErrCurrentPasswordWrong):
		fail(w, http.StatusForbidden, "Your current password is incorrect.")
	case errors.Is(err, service.ErrNoPassword):
		fail(w, http.StatusBadRequest, "This account has no password yet.")
	case errors.Is(err, service.ErrResetPasswordTooShort):
		fail(w, http.StatusBadRequest, msgShortPassword)
	case err != nil:
		h.handleErr(w, err)
	default:
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": token})
	}
}

// AuthMe returns the signed-in member's own account, including consent state
// (consentRequired, adultVerified — contract K2).
func (h *Handler) AuthMe(w http.ResponseWriter, r *http.Request) {
	m := currentAccount(r)
	if m == nil {
		fail(w, http.StatusUnauthorized, "Not signed in.")
		return
	}
	h.svc.EnrichMemberBadge(r.Context(), m) // verified/verifiedAs badge
	writeJSON(w, http.StatusOK, h.accountView(m))
}

// RecordMyConsent records the signed-in member's acceptance of the current
// Terms of Use and Privacy Policy — and, with confirmAdult, that they are 18 or
// older (required when their age was never verified) — and returns their own
// account in the GET /api/auth/me shape (contract K2).
func (h *Handler) RecordMyConsent(w http.ResponseWriter, r *http.Request) {
	m := currentAccount(r)
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "consent:m:"+m.ID, 30, time.Hour) {
		return
	}
	var in struct {
		AcceptTerms  bool   `json:"acceptTerms"`
		ConfirmAdult bool   `json:"confirmAdult"`
		Platform     string `json:"platform"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	updated, err := h.auth.RecordConsent(r.Context(), m.ID, service.ConsentInput{
		AcceptTerms: in.AcceptTerms, ConfirmAdult: in.ConfirmAdult, Platform: in.Platform,
	})
	switch {
	case errors.Is(err, service.ErrTermsNotAccepted):
		fail(w, http.StatusBadRequest, "Please agree to the Terms of Use and Privacy Policy to continue.")
	case errors.Is(err, service.ErrAdultConfirmationRequired):
		fail(w, http.StatusBadRequest, "Please confirm you are 18 or older to continue.")
	case err != nil:
		h.handleErr(w, err)
	default:
		h.svc.EnrichMemberBadge(r.Context(), updated)
		writeJSON(w, http.StatusOK, h.accountView(updated))
	}
}
