package http

import (
	"errors"
	"net/http"

	"github.com/oguaa/backend/internal/service"
)

// ── AI writing assistant ──────────────────────────────────────────────────────

func (h *Handler) AI(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action   string `json:"action"`
		Text     string `json:"text"`
		Language string `json:"language"`
		Prompt   string `json:"prompt"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if len(in.Text) > 8000 || len(in.Prompt) > 2000 {
		fail(w, http.StatusBadRequest, "input too long")
		return
	}
	memberID := ""
	if m := currentMember(r); m != nil {
		memberID = m.ID
	}
	res, err := h.ai.Generate(r.Context(), memberID, in.Action, in.Text, in.Language, in.Prompt)
	if errors.Is(err, service.ErrAILimit) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{
			"error": "limit", "message": "You've reached today's AI limit. It resets at midnight.",
		})
		return
	}
	if err != nil {
		h.log.Error("ai error", "err", err)
		fail(w, http.StatusBadGateway, "Something went wrong generating that. Your text is unchanged.")
		return
	}
	writeJSON(w, http.StatusOK, res)
}
