package http

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── AI writing assistant (contract K15) ───────────────────────────────────────

// msgAIConsent explains the 403 ai_consent_required answer.
const msgAIConsent = "The writing assistant sends the text you select to Anthropic (Claude), a US company, to write a suggestion. Agree to that first to use it."

// aiRequest is the assistant's input.
type aiRequest struct {
	Action   string `json:"action"`
	Text     string `json:"text"`
	Language string `json:"language"`
	Prompt   string `json:"prompt"`
}

func (h *Handler) AI(w http.ResponseWriter, r *http.Request) {
	in, m, ok := h.aiPreflight(w, r)
	if !ok {
		return
	}
	res, err := h.ai.Generate(r.Context(), m.ID, in.Action, in.Text, in.Language, in.Prompt)
	if h.aiFailed(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (h *Handler) AIStream(w http.ResponseWriter, r *http.Request) {
	in, m, ok := h.aiPreflight(w, r)
	if !ok {
		return
	}
	res, err := h.ai.Generate(r.Context(), m.ID, in.Action, in.Text, in.Language, in.Prompt)
	if h.aiFailed(w, err) {
		return
	}

	fl, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusOK, res)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	for _, chunk := range chunkText(res.Result, 120) {
		if _, err := fmt.Fprintf(w, "event: chunk\ndata: %s\n\n", strings.ReplaceAll(chunk, "\n", "\\n")); err != nil {
			return // client went away; nothing left to stream to
		}
		fl.Flush()
	}
	done, err := json.Marshal(map[string]any{"remaining": res.Remaining, "simulated": res.Simulated})
	if err != nil {
		h.log.Error("ai stream marshal done payload", "err", err)
		_, _ = fmt.Fprintf(w, "event: done\ndata: {\"remaining\":%d,\"simulated\":%t}\n\n", res.Remaining, res.Simulated)
		fl.Flush()
		return
	}
	_, _ = fmt.Fprintf(w, "event: done\ndata: %s\n\n", string(done))
	fl.Flush()
}

// aiPreflight enforces K15 before anything reaches the provider: a signed-in
// member (401), who has agreed to the assistant's data use (403
// ai_consent_required), within the per-member rate limit (429), with a
// decodable body (400). Input validation (length, language, empty text)
// happens in the service before any budget is spent.
func (h *Handler) aiPreflight(w http.ResponseWriter, r *http.Request) (aiRequest, *domain.Member, bool) {
	var in aiRequest
	m := currentMember(r)
	if m == nil {
		fail(w, http.StatusUnauthorized, "Sign in to use the writing assistant.")
		return in, nil, false
	}
	if m.AIConsentAt == "" {
		writeAIError(w, http.StatusForbidden, "ai_consent_required", msgAIConsent)
		return in, nil, false
	}
	if h.rateLimited(w, r, "ai:"+m.ID, 10, time.Minute) {
		return in, nil, false
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return in, nil, false
	}
	return in, m, true
}

// aiFailed writes the HTTP answer for an assistant error and reports whether
// there was one.
func (h *Handler) aiFailed(w http.ResponseWriter, err error) bool {
	var input *service.AIInputError
	switch {
	case err == nil:
		return false
	case errors.As(err, &input):
		fail(w, http.StatusBadRequest, input.Message)
	case errors.Is(err, service.ErrAILimit):
		writeAIError(w, http.StatusTooManyRequests, "limit", "You've reached today's AI limit. It resets at midnight.")
	case errors.Is(err, service.ErrAIUnavailable):
		writeAIError(w, http.StatusServiceUnavailable, "ai_unavailable", "The writing assistant is temporarily unavailable.")
	case errors.Is(err, service.ErrAIRefused):
		// A decline is a decision, not a failure — 422 with the model's own
		// framing, so the member isn't told to retry something that will be
		// declined again.
		writeAIError(w, http.StatusUnprocessableEntity, "refused", "The assistant declined that request. Your text is unchanged.")
	default:
		h.log.Error("ai error", "err", err)
		fail(w, http.StatusBadGateway, "Something went wrong generating that. Your text is unchanged.")
	}
	return true
}

// writeAIError writes the assistant's error shape {"error": code, "message": text}.
func writeAIError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"error": code, "message": message})
}

// SetMyAIConsent records or withdraws the signed-in member's consent to the
// writing assistant (K15): POST /api/me/ai-consent {"consent": bool} →
// {"aiConsent": bool}.
func (h *Handler) SetMyAIConsent(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	var in struct {
		Consent *bool `json:"consent"`
	}
	if err := decodeBody(r, &in); err != nil || in.Consent == nil {
		fail(w, http.StatusBadRequest, "Send consent: true or false.")
		return
	}
	got, err := h.svc.SetAIConsent(r.Context(), m.ID, *in.Consent)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"aiConsent": got})
}

func chunkText(in string, size int) []string {
	runes := []rune(in)
	if len(runes) <= size {
		return []string{in}
	}
	out := make([]string, 0, len(runes)/size+1)
	for len(runes) > size {
		out = append(out, string(runes[:size]))
		runes = runes[size:]
	}
	if len(runes) > 0 {
		out = append(out, string(runes))
	}
	return out
}
