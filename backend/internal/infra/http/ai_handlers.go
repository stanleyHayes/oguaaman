package http

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/oguaa/backend/internal/service"
)

// ── AI writing assistant ──────────────────────────────────────────────────────

func (h *Handler) AI(w http.ResponseWriter, r *http.Request) {
	in, memberID, ok := h.decodeAIInput(w, r)
	if !ok {
		return
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

func (h *Handler) AIStream(w http.ResponseWriter, r *http.Request) {
	in, memberID, ok := h.decodeAIInput(w, r)
	if !ok {
		return
	}
	res, err := h.ai.Generate(r.Context(), memberID, in.Action, in.Text, in.Language, in.Prompt)
	if errors.Is(err, service.ErrAILimit) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{
			"error": "limit", "message": "You've reached today's AI limit. It resets at midnight.",
		})
		return
	}
	if err != nil {
		h.log.Error("ai stream error", "err", err)
		fail(w, http.StatusBadGateway, "Something went wrong generating that. Your text is unchanged.")
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
		fmt.Fprintf(w, "event: chunk\ndata: %s\n\n", strings.ReplaceAll(chunk, "\n", "\\n"))
		fl.Flush()
	}
	done, err := json.Marshal(map[string]any{"remaining": res.Remaining, "simulated": res.Simulated})
	if err != nil {
		h.log.Error("ai stream marshal done payload", "err", err)
		fmt.Fprintf(w, "event: done\ndata: {\"remaining\":%d,\"simulated\":%t}\n\n", res.Remaining, res.Simulated)
		fl.Flush()
		return
	}
	fmt.Fprintf(w, "event: done\ndata: %s\n\n", string(done))
	fl.Flush()
}

func (h *Handler) decodeAIInput(w http.ResponseWriter, r *http.Request) (struct {
	Action   string `json:"action"`
	Text     string `json:"text"`
	Language string `json:"language"`
	Prompt   string `json:"prompt"`
}, string, bool) {
	var in struct {
		Action   string `json:"action"`
		Text     string `json:"text"`
		Language string `json:"language"`
		Prompt   string `json:"prompt"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return in, "", false
	}
	if len(in.Text) > 8000 || len(in.Prompt) > 2000 {
		fail(w, http.StatusBadRequest, "input too long")
		return in, "", false
	}
	memberID := ""
	if m := currentMember(r); m != nil {
		memberID = m.ID
	}
	return in, memberID, true
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
