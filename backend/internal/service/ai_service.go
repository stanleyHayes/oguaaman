package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ErrAILimit is returned when the daily AI budget is exhausted (→ HTTP 429).
var ErrAILimit = errors.New("ai daily limit reached")

// AIService powers the admin writing assistant (spec §8.12). It calls Anthropic
// server-side (key never leaves the server), meters usage against both a global
// daily budget and a per-member (per-admin) daily cap, and degrades gracefully
// to a labelled simulation when no key is configured.
type AIService struct {
	apiKey    string
	model     string
	budget    int // global daily cap
	perMember int // per-member daily cap

	usage domain.AIUsageRepository // durable counters; nil → in-memory fallback

	mu       sync.Mutex
	day      string
	used     int            // global count today (in-memory fallback only)
	byMember map[string]int // per-member count today (in-memory fallback only)
	client   *http.Client
}

func NewAIService(apiKey, model string, budget, perMember int, usage domain.AIUsageRepository) *AIService {
	return &AIService{
		apiKey:    apiKey,
		model:     model,
		budget:    budget,
		perMember: perMember,
		usage:     usage,
		byMember:  map[string]int{},
		client:    &http.Client{Timeout: 30 * time.Second},
	}
}

var systemByAction = map[string]string{
	"formalize": "Rewrite the user's text in a more professional, formal tone. Keep the meaning. Return only the rewritten text.",
	"casual":    "Rewrite the user's text in a friendly, simple, conversational tone. Return only the rewritten text.",
	"clarity":   "Rewrite the user's text to be clearer and easier to understand, with short lines or bullets where it helps. Return only the rewritten text.",
	"grammar":   "Correct spelling, grammar, punctuation and sentence structure. Make no other changes. Return only the corrected text.",
	"expand":    "Expand the user's text with relevant detail while keeping the original meaning and tone. Return only the expanded text.",
	"summarize": "Summarise the user's text into a tighter, clearer version. Return only the summary.",
	"title":     "Propose a strong title or headline for the user's text, plus 2 short alternatives. Return only the titles.",
	"email":     "Help compose a clear, courteous message/announcement from the user's notes, with a subject line. Return only the message.",
	"prompt":    "Write the text the user describes, in a warm community tone suitable for Cape Coast (Oguaa). Return only the text.",
	"translate": "Translate the user's text faithfully. Return only the translation. If a Ghanaian language, add a one-line note that a fluent speaker should review before publishing.",
}

// AIResult is the assistant's response.
type AIResult struct {
	Result    string `json:"result"`
	Remaining int    `json:"remaining"`
	Simulated bool   `json:"simulated,omitempty"`
}

// take reserves one unit against both the global budget and the member's daily
// cap. memberID "" shares a single anonymous bucket. The returned remaining is
// the member's own remaining allowance for the day (what's most useful to show).
// With a durable repo the counters survive restarts and are shared across
// instances; otherwise it falls back to an in-process map. Metering errors
// fail open (a budget guard should never deny a user over a DB hiccup).
func (s *AIService) take(ctx context.Context, memberID string) (int, bool) {
	if memberID == "" {
		memberID = "anon"
	}
	if s.usage != nil {
		return s.takeDurable(ctx, memberID)
	}
	return s.takeMemory(memberID)
}

func (s *AIService) takeDurable(ctx context.Context, memberID string) (int, bool) {
	day := time.Now().UTC().Format("2006-01-02")
	if g, err := s.usage.Count(ctx, day, "global"); err == nil && g >= s.budget {
		return 0, false
	}
	if s.perMember > 0 {
		if m, err := s.usage.Count(ctx, day, memberID); err == nil && m >= s.perMember {
			return 0, false
		}
	}
	ng, err := s.usage.Incr(ctx, day, "global")
	if err != nil {
		return s.budget, true // fail open
	}
	remaining := s.budget - ng
	if s.perMember > 0 {
		nm, err := s.usage.Incr(ctx, day, memberID)
		if err == nil {
			if mr := s.perMember - nm; mr < remaining {
				remaining = mr
			}
		}
	}
	if remaining < 0 {
		remaining = 0
	}
	return remaining, true
}

func (s *AIService) takeMemory(memberID string) (int, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	today := time.Now().UTC().Format("2006-01-02")
	if s.day != today {
		s.day = today
		s.used = 0
		s.byMember = map[string]int{}
	}
	if s.used >= s.budget {
		return 0, false
	}
	if s.perMember > 0 && s.byMember[memberID] >= s.perMember {
		return 0, false
	}
	s.used++
	s.byMember[memberID]++
	remaining := s.budget - s.used
	if s.perMember > 0 {
		if mr := s.perMember - s.byMember[memberID]; mr < remaining {
			remaining = mr
		}
	}
	return remaining, true
}

func (s *AIService) Generate(ctx context.Context, memberID, action, text, language, prompt string) (AIResult, error) {
	sys, ok := systemByAction[action]
	if !ok {
		return AIResult{}, fmt.Errorf("unknown action %q", action)
	}
	remaining, ok := s.take(ctx, memberID)
	if !ok {
		return AIResult{}, ErrAILimit
	}

	user := text
	switch action {
	case "prompt":
		user = prompt
	case "translate":
		lang := language
		if lang == "" {
			lang = "the target language"
		}
		user = fmt.Sprintf("Translate into %s:\n\n%s", lang, text)
	}

	if s.apiKey == "" {
		return AIResult{Result: simulate(action, text, language, prompt), Remaining: remaining, Simulated: true}, nil
	}

	payload := map[string]any{
		"model":      s.model,
		"max_tokens": 1024,
		"system":     sys,
		"messages":   []map[string]any{{"role": "user", "content": user}},
	}
	buf, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(buf))
	if err != nil {
		return AIResult{}, err
	}
	req.Header.Set("x-api-key", s.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return AIResult{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return AIResult{}, fmt.Errorf("anthropic upstream status %d", resp.StatusCode)
	}
	var parsed struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return AIResult{}, err
	}
	var b strings.Builder
	for _, c := range parsed.Content {
		if c.Type == "text" {
			b.WriteString(c.Text)
		}
	}
	return AIResult{Result: strings.TrimSpace(b.String()), Remaining: remaining}, nil
}

// simulate is the no-key fallback — clearly labelled so it's never mistaken for live output.
func simulate(action, text, language, prompt string) string {
	note := "▌ Simulated — set ANTHROPIC_API_KEY for live Claude output.\n\n"
	trimmed := strings.TrimSpace(text)
	cap := func(s string) string {
		if s == "" {
			return s
		}
		return strings.ToUpper(s[:1]) + s[1:]
	}
	first := trimmed
	if i := strings.IndexAny(trimmed, ".!?"); i > 0 {
		first = trimmed[:i+1]
	}
	switch action {
	case "summarize":
		return note + first
	case "title":
		words := strings.Fields(trimmed)
		if len(words) > 8 {
			words = words[:8]
		}
		return note + cap(strings.Join(words, " ")) + "\n\nAlternatives:\n• A clearer headline\n• An inviting headline"
	case "formalize":
		return note + "Dear all,\n\n" + cap(trimmed)
	case "casual":
		return note + "Hey everyone — " + trimmed
	case "grammar", "clarity":
		out := cap(strings.Join(strings.Fields(trimmed), " "))
		if !strings.ContainsAny(out[len(out)-1:], ".!?") {
			out += "."
		}
		return note + out
	case "expand":
		return note + cap(trimmed) + "\n\n[With the live model, fuller detail and context would be drafted here.]"
	case "email":
		return note + "Subject: A note from Oguaa\n\n" + cap(trimmed)
	case "prompt":
		return note + "[Draft from your prompt: \"" + strings.TrimSpace(prompt) + "\"]\n\nConnect the live model for real generation."
	case "translate":
		lang := language
		if lang == "" {
			lang = "Translation"
		}
		return note + "[" + lang + " · the live model performs translation; a fluent speaker should review before publishing.]"
	default:
		return note + trimmed
	}
}
