package http

import (
	"errors"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
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
	var ve *domain.ValidationError
	if errors.As(err, &ve) {
		fail(w, http.StatusBadRequest, ve.Error())
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"created": created})
}

// ── notification preferences (contract K14) ──────────────────────────────────

// MyNotificationPreferences returns the signed-in member's preferences:
// {"categories":{"safety","community","remembrances","product"},
// "channels":{"push","email","whatsapp"}} (defaults when never set).
func (h *Handler) MyNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	prefs, err := h.svc.NotificationPreferences(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, prefs)
}

// notificationPrefsInput is the PUT body: the K14 shape, every key optional
// (an absent key keeps its current value).
type notificationPrefsInput struct {
	Categories struct {
		Safety       *bool `json:"safety"`
		Community    *bool `json:"community"`
		Remembrances *bool `json:"remembrances"`
		Product      *bool `json:"product"`
	} `json:"categories"`
	Channels struct {
		Push     *bool `json:"push"`
		Email    *bool `json:"email"`
		WhatsApp *bool `json:"whatsapp"`
	} `json:"channels"`
}

// SetMyNotificationPreferences updates the signed-in member's preferences and
// returns the stored result in the GET shape.
func (h *Handler) SetMyNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "notifprefs:"+clientKey(r), 60, time.Hour) {
		return
	}
	var in notificationPrefsInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	prefs, err := h.svc.UpdateNotificationPreferences(r.Context(), m.ID, service.NotificationPrefsUpdate{
		Safety: in.Categories.Safety, Community: in.Categories.Community,
		Remembrances: in.Categories.Remembrances, Product: in.Categories.Product,
		Push: in.Channels.Push, Email: in.Channels.Email, WhatsApp: in.Channels.WhatsApp,
	})
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, prefs)
}

// Unsubscribe page copy shared by GET and POST.
const (
	unsubscribeInvalidHeading = "This link isn't valid"
	unsubscribeInvalidMessage = "The unsubscribe link is incomplete or has been changed. You can switch notifications off in the Oguaa app under Settings › Notifications."
)

// UnsubscribeConfirmPage answers GET on the signed unsubscribe link in
// notification emails: it checks the link and shows a confirmation button,
// changing nothing. Mail security scanners fetch every link in a message, so
// a GET must never switch anything off; only the page's POST does.
func (h *Handler) UnsubscribeConfirmPage(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "unsubscribe:"+clientIP(r), 30, time.Hour) {
		return
	}
	token := r.URL.Query().Get("token")
	res, err := h.svc.CheckUnsubscribe(token)
	if err != nil {
		writeNoticePage(w, http.StatusBadRequest, unsubscribeInvalidHeading, unsubscribeInvalidMessage)
		return
	}
	writeUnsubscribeConfirmPage(w, token, res)
}

// UnsubscribeNotifications applies the signed unsubscribe (POST: the
// confirmation page's button, or an RFC 8058 List-Unsubscribe-Post client).
// Public — the token is the credential — and it answers with a small HTML
// page, not JSON.
func (h *Handler) UnsubscribeNotifications(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "unsubscribe:"+clientIP(r), 30, time.Hour) {
		return
	}
	res, err := h.svc.Unsubscribe(r.Context(), r.URL.Query().Get("token"))
	switch {
	case errors.Is(err, service.ErrInvalidUnsubscribe):
		writeNoticePage(w, http.StatusBadRequest, unsubscribeInvalidHeading, unsubscribeInvalidMessage)
	case err != nil:
		h.log.Error("unsubscribe failed", "err", err)
		writeNoticePage(w, http.StatusInternalServerError, "Something went wrong",
			"We couldn't update your choices just now. Please try again later, or switch notifications off in the Oguaa app under Settings › Notifications.")
	default:
		writeNoticePage(w, http.StatusOK, "You're unsubscribed", unsubscribedMessage(res))
	}
}

// unsubscribedMessage says what the one-click unsubscribe switched off.
func unsubscribedMessage(res service.UnsubscribeResult) string {
	const turnBackOn = " You can turn them back on in the Oguaa app under Settings › Notifications."
	switch res.Category {
	case domain.CategoryCommunity:
		return "You won't get community notifications from Oguaa any more." + turnBackOn
	case domain.CategoryRemembrances:
		return "You won't get remembrance notifications from Oguaa any more." + turnBackOn
	case domain.CategoryProduct:
		return "You won't get news about Oguaa any more." + turnBackOn
	}
	return "We've stopped sending Oguaa notifications to your email. Sign-in codes and password resets still arrive when you ask for them." + turnBackOn
}

// unsubscribeConfirmMessage says what confirming the unsubscribe switches off.
func unsubscribeConfirmMessage(res service.UnsubscribeResult) string {
	switch res.Category {
	case domain.CategoryCommunity:
		return "You'll stop getting community notifications from Oguaa."
	case domain.CategoryRemembrances:
		return "You'll stop getting remembrance notifications from Oguaa."
	case domain.CategoryProduct:
		return "You'll stop getting news about Oguaa."
	}
	return "We'll stop sending Oguaa notifications to your email. Sign-in codes and password resets still arrive when you ask for them."
}

// writeNoticePage writes a minimal, self-contained HTML page (no scripts, no
// external resources).
func writeNoticePage(w http.ResponseWriter, status int, heading, message string) {
	setPageHeaders(w)
	w.WriteHeader(status)
	h := html.EscapeString(heading)
	_, _ = fmt.Fprintf(w, noticePageHTML, h, h, html.EscapeString(message))
}

// writeUnsubscribeConfirmPage writes the confirmation page: one button that
// POSTs the token back to this endpoint. Its CSP allows exactly that form
// submission (the API's default CSP forbids every form).
func writeUnsubscribeConfirmPage(w http.ResponseWriter, token string, res service.UnsubscribeResult) {
	setPageHeaders(w)
	w.Header().Set("Content-Security-Policy", cspUnsubscribeConfirm)
	w.WriteHeader(http.StatusOK)
	action := "?token=" + url.QueryEscape(token)
	_, _ = fmt.Fprintf(w, unsubscribeConfirmHTML, html.EscapeString(unsubscribeConfirmMessage(res)), html.EscapeString(action))
}

// setPageHeaders marks an HTML page as private, uncached and unindexed.
func setPageHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex")
	w.Header().Set("Referrer-Policy", "no-referrer")
}

// cspUnsubscribeConfirm is cspAPI with the confirmation form allowed to post
// back to this origin.
const cspUnsubscribeConfirm = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"

const unsubscribeConfirmHTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
	`<meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe · Oguaa</title></head>` +
	`<body style="font-family:system-ui,sans-serif;background:#F6F1E7;color:#123F2D;margin:0;padding:48px 16px">` +
	`<main style="max-width:32rem;margin:0 auto"><h1 style="font-size:1.5rem">Unsubscribe from these emails?</h1>` +
	`<p style="line-height:1.5">%s You can turn them back on in the Oguaa app under Settings › Notifications.</p>` +
	`<form method="post" action="%s"><button type="submit" style="font:inherit;font-weight:600;background:#123F2D;color:#F6F1E7;border:0;border-radius:8px;padding:12px 20px;cursor:pointer">Unsubscribe</button></form>` +
	`</main></body></html>`

const noticePageHTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
	`<meta name="viewport" content="width=device-width,initial-scale=1"><title>%s · Oguaa</title></head>` +
	`<body style="font-family:system-ui,sans-serif;background:#F6F1E7;color:#123F2D;margin:0;padding:48px 16px">` +
	`<main style="max-width:32rem;margin:0 auto"><h1 style="font-size:1.5rem">%s</h1><p style="line-height:1.5">%s</p></main></body></html>`
