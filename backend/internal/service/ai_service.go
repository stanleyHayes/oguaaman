package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/oguaa/backend/internal/domain"
)

// ErrAILimit is returned when the daily AI budget is exhausted (→ HTTP 429).
var ErrAILimit = errors.New("ai daily limit reached")

// ErrAIRefused is returned when the model declines the request on policy
// grounds. It is deliberately NOT treated as a provider failure: retrying a
// refused request on the backup provider would be shopping for a second
// opinion on a safety decision, so the refusal is surfaced as-is.
var ErrAIRefused = errors.New("the assistant declined this request")

// ErrAIUnavailable is returned in production when no AI provider is
// configured (→ HTTP 503 ai_unavailable): production never serves simulated
// output as if it were the assistant's.
var ErrAIUnavailable = errors.New("ai unavailable")

// AIInputError is a request the assistant can't take (→ HTTP 400). It is
// raised before any budget is spent.
type AIInputError struct{ Message string }

func (e *AIInputError) Error() string { return e.Message }

// Input limits (runes for the language, bytes otherwise).
const (
	maxAITextLen     = 8000
	maxAIPromptLen   = 2000
	maxAILanguageLen = 40
)

// Budget buckets: members share the "global" daily budget and each has a
// per-member cap; the platform's own use (the automated research desk) has a
// separate daily budget so member traffic can never starve it, nor it them.
const (
	globalAIKey       = "global"
	globalSystemAIKey = "global-system"
)

const anthropicMessagesURL = "https://api.anthropic.com/v1/messages"

// AIService powers the writing assistant (spec §8.12). It calls Anthropic
// server-side (key never leaves the server), meters usage against a global
// daily budget and a per-member daily cap, redacts contact details and ID
// numbers before text leaves for the provider, and — outside production only
// — degrades to a labelled simulation when no key is configured.
type AIService struct {
	apiKey       string
	model        string
	budget       int // global daily cap for members
	perMember    int // per-member daily cap
	systemBudget int // daily cap for the platform's own use

	// Kimi (Moonshot) backup — used only when Anthropic is absent or errors,
	// and wired in production only when AI_ALLOW_KIMI=true.
	kimiKey   string
	kimiModel string
	kimiBase  string // OpenAI-compatible base, e.g. https://api.moonshot.ai/v1

	production bool

	usage domain.AIUsageRepository // durable counters; nil → in-memory fallback

	mu     sync.Mutex
	day    string
	counts map[string]int // in-memory fallback: bucket key → count today

	client       *http.Client
	anthropicURL string
	// callBudget bounds a whole Generate call (primary + backup) so the reply
	// always lands inside the server's 40s WriteTimeout; primaryShare is the
	// most the primary may take when a backup is configured.
	callBudget   time.Duration
	primaryShare time.Duration
}

func NewAIService(apiKey, model string, budget, perMember int, usage domain.AIUsageRepository) *AIService {
	return &AIService{
		apiKey:       apiKey,
		model:        model,
		budget:       budget,
		perMember:    perMember,
		systemBudget: budget,
		usage:        usage,
		counts:       map[string]int{},
		client:       &http.Client{Timeout: 30 * time.Second},
		anthropicURL: anthropicMessagesURL,
		callBudget:   35 * time.Second,
		primaryShare: 22 * time.Second,
	}
}

// WithFallback configures Kimi (Moonshot AI) as the BACKUP provider. Anthropic
// — the key given to NewAIService — is primary (see Generate); Kimi is tried
// only when Anthropic is unconfigured or the call fails. Returns the service so
// it can be chained off NewAIService. An empty Kimi key simply means no backup.
// In production the server wires this only when AI_ALLOW_KIMI=true (D4).
func (s *AIService) WithFallback(kimiKey, kimiModel, kimiBase string) *AIService {
	s.kimiKey = kimiKey
	s.kimiModel = kimiModel
	s.kimiBase = strings.TrimRight(kimiBase, "/")
	return s
}

// WithProduction marks a production deployment: with no provider configured
// the assistant reports ErrAIUnavailable instead of simulating.
func (s *AIService) WithProduction(production bool) *AIService {
	s.production = production
	return s
}

// Available reports whether a live AI provider is configured.
func (s *AIService) Available() bool { return s.apiKey != "" || s.kimiKey != "" }

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

// placeholderInstruction is appended to the system prompt when redaction
// replaced private details, so the model carries the placeholders through.
const placeholderInstruction = " Text in square brackets such as [PHONE_1], [EMAIL_1] or [ID_1] stands for private details: keep every such placeholder exactly as written."

// AIResult is the assistant's response.
type AIResult struct {
	Result    string `json:"result"`
	Remaining int    `json:"remaining"`
	Simulated bool   `json:"simulated,omitempty"`
	// Truncated marks a reply cut short by the token cap, so the UI can say so
	// rather than presenting a half-finished rewrite as the finished article.
	Truncated bool `json:"truncated,omitempty"`
}

// aiBucket is one metered spender: a per-key daily cap (0 = none) inside a
// global daily budget.
type aiBucket struct {
	key, global    string
	perKey, budget int
}

func (s *AIService) memberBucket(memberID string) aiBucket {
	return aiBucket{key: memberID, global: globalAIKey, perKey: s.perMember, budget: s.budget}
}

func (s *AIService) systemBucket() aiBucket {
	return aiBucket{global: globalSystemAIKey, budget: s.systemBudget}
}

// take reserves one unit for the bucket and returns the remaining allowance.
// The reservation IS the increment — the decision is taken on the counter's
// new value — so concurrent requests can never all slip under a cap the way
// check-then-increment let them. The member's own counter goes first, so a
// member at their cap can't burn the shared budget. With a durable repo the
// counters survive restarts and hold across instances; otherwise an
// in-process map. Metering errors fail open (a database hiccup must not deny
// a member); the per-member request rate limit still bounds the damage.
func (s *AIService) take(ctx context.Context, b aiBucket) (int, bool) {
	if s.usage != nil {
		return s.takeDurable(ctx, b)
	}
	return s.takeMemory(b)
}

func (s *AIService) takeDurable(ctx context.Context, b aiBucket) (int, bool) {
	day := time.Now().UTC().Format(time.DateOnly)
	remaining := math.MaxInt
	if b.perKey > 0 && b.key != "" {
		if n, err := s.usage.Incr(ctx, day, b.key); err == nil {
			if n > b.perKey {
				return 0, false
			}
			remaining = b.perKey - n
		}
	}
	if g, err := s.usage.Incr(ctx, day, b.global); err == nil {
		if g > b.budget {
			return 0, false
		}
		remaining = min(remaining, b.budget-g)
	}
	if remaining == math.MaxInt {
		remaining = b.budget // both counters unavailable: fail open
	}
	return remaining, true
}

func (s *AIService) takeMemory(b aiBucket) (int, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if today := time.Now().UTC().Format(time.DateOnly); s.day != today {
		s.day = today
		s.counts = map[string]int{}
	}
	perKey := b.perKey > 0 && b.key != ""
	if s.counts[b.global] >= b.budget || (perKey && s.counts[b.key] >= b.perKey) {
		return 0, false
	}
	s.counts[b.global]++
	remaining := b.budget - s.counts[b.global]
	if perKey {
		s.counts[b.key]++
		remaining = min(remaining, b.perKey-s.counts[b.key])
	}
	return remaining, true
}

// Generate runs one writing-assistant action for a signed-in member (the
// HTTP layer also enforces sign-in and consent, contract K15).
func (s *AIService) Generate(ctx context.Context, memberID, action, text, language, prompt string) (AIResult, error) {
	if memberID == "" {
		return AIResult{}, &AIInputError{Message: "sign in to use the writing assistant"}
	}
	return s.generate(ctx, s.memberBucket(memberID), action, text, language, prompt)
}

// GenerateForSystem runs an action for the platform itself (the automated
// research desk) against its own daily budget.
func (s *AIService) GenerateForSystem(ctx context.Context, action, text string) (AIResult, error) {
	return s.generate(ctx, s.systemBucket(), action, text, "", "")
}

func (s *AIService) generate(ctx context.Context, b aiBucket, action, text, language, prompt string) (AIResult, error) {
	sys, err := validateAIRequest(action, text, language, prompt)
	if err != nil {
		return AIResult{}, err
	}
	if !s.Available() && s.production {
		return AIResult{}, ErrAIUnavailable
	}
	remaining, ok := s.take(ctx, b)
	if !ok {
		return AIResult{}, ErrAILimit
	}
	// No provider configured (dev only) → labelled simulation.
	if !s.Available() {
		return AIResult{Result: simulate(action, text, language, prompt), Remaining: remaining, Simulated: true}, nil
	}
	user, red := redactForAI(aiUserMessage(action, text, language, prompt))
	if red.redacted() {
		sys += placeholderInstruction
	}
	out, truncated, err := s.callProviders(ctx, sys, user)
	if err != nil {
		return AIResult{}, err
	}
	return AIResult{Result: red.restore(out), Remaining: remaining, Truncated: truncated}, nil
}

// validateAIRequest checks an action and its input before any budget is
// spent, returning the action's system prompt.
func validateAIRequest(action, text, language, prompt string) (string, error) {
	sys, ok := systemByAction[action]
	if !ok {
		return "", &AIInputError{Message: "unknown writing-assistant action"}
	}
	switch {
	case len(text) > maxAITextLen || len(prompt) > maxAIPromptLen:
		return "", &AIInputError{Message: "input too long"}
	case action == "prompt" && strings.TrimSpace(prompt) == "":
		return "", &AIInputError{Message: "describe what you'd like written"}
	case action != "prompt" && strings.TrimSpace(text) == "":
		return "", &AIInputError{Message: "add some text for the assistant to work on"}
	case !validAILanguage(language):
		return "", &AIInputError{Message: fmt.Sprintf("the language must be a language name of up to %d letters", maxAILanguageLen)}
	}
	return sys, nil
}

// validAILanguage accepts a short language name ("Fante", "Twi (Asante)",
// "Français"); it is interpolated into the prompt, so it stays a name.
func validAILanguage(lang string) bool {
	if utf8.RuneCountInString(lang) > maxAILanguageLen {
		return false
	}
	for _, r := range lang {
		if !unicode.IsLetter(r) && !strings.ContainsRune(" -()'", r) {
			return false
		}
	}
	return true
}

// aiUserMessage is the user turn sent to the model for an action.
func aiUserMessage(action, text, language, prompt string) string {
	switch action {
	case "prompt":
		return prompt
	case "translate":
		lang := strings.TrimSpace(language)
		if lang == "" {
			lang = "the target language"
		}
		return fmt.Sprintf("Translate into %s:\n\n%s", lang, text)
	}
	return text
}

// callProviders asks Anthropic (primary) and, when it fails, Kimi (backup),
// all within ONE deadline (callBudget) that keeps the reply inside the
// server's write timeout. With a backup configured the primary gets at most
// primaryShare so the backup still has time to answer. A refusal is an
// answer, not an outage, so it is never retried on the backup.
func (s *AIService) callProviders(ctx context.Context, sys, user string) (string, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, s.callBudget)
	defer cancel()
	if s.apiKey == "" {
		return s.callKimi(ctx, sys, user)
	}
	primaryCtx := ctx
	if s.kimiKey != "" {
		var cancelPrimary context.CancelFunc
		primaryCtx, cancelPrimary = context.WithTimeout(ctx, s.primaryShare)
		defer cancelPrimary()
	}
	out, truncated, err := s.callAnthropic(primaryCtx, sys, user)
	if err == nil || errors.Is(err, ErrAIRefused) || s.kimiKey == "" {
		return out, truncated, err
	}
	return s.callKimi(ctx, sys, user)
}

// aiMaxTokens caps a single assistant reply. The writing actions are
// short-form (rewrite, summarise, retitle), but "expand" legitimately runs
// long, and the old 1024 truncated those mid-sentence. 4096 clears every
// action with room to spare while staying well inside the 30s client timeout.
//
// Note for a future model change: on Claude Opus 5 and Sonnet 5 thinking is on
// by default and max_tokens caps thinking PLUS the reply, so this figure would
// need raising again to leave the answer room.
const aiMaxTokens = 4096

// callAnthropic calls Claude's Messages API and returns the joined text plus
// whether the reply was cut short by the token cap.
func (s *AIService) callAnthropic(ctx context.Context, sys, user string) (string, bool, error) {
	payload := map[string]any{
		"model":      s.model,
		"max_tokens": aiMaxTokens,
		"system":     sys,
		"messages":   []map[string]any{{"role": "user", "content": user}},
	}
	buf, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.anthropicURL, bytes.NewReader(buf))
	if err != nil {
		return "", false, err
	}
	req.Header.Set("x-api-key", s.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", false, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		// Carry a slice of the body: the status alone can't tell an invalid
		// model id from a revoked key from a rate limit.
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", false, fmt.Errorf("anthropic upstream status %d: %s", resp.StatusCode, strings.TrimSpace(string(snippet)))
	}
	var parsed struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		StopReason string `json:"stop_reason"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", false, err
	}
	// Check the stop reason before trusting the content: a refusal returns a
	// successful 200 with empty or partial content, so reading the blocks
	// blindly would hand the member a silently empty result.
	if parsed.StopReason == "refusal" {
		return "", false, ErrAIRefused
	}
	var b strings.Builder
	for _, c := range parsed.Content {
		if c.Type == "text" {
			b.WriteString(c.Text)
		}
	}
	return strings.TrimSpace(b.String()), parsed.StopReason == "max_tokens", nil
}

// callKimi calls Kimi (Moonshot AI) via its OpenAI-compatible chat/completions
// endpoint and returns the first choice's text plus whether it was cut short —
// the backup path when Anthropic is unavailable.
func (s *AIService) callKimi(ctx context.Context, sys, user string) (string, bool, error) {
	payload := map[string]any{
		"model":      s.kimiModel,
		"max_tokens": aiMaxTokens,
		"messages": []map[string]any{
			{"role": "system", "content": sys},
			{"role": "user", "content": user},
		},
	}
	buf, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.kimiBase+"/chat/completions", bytes.NewReader(buf))
	if err != nil {
		return "", false, err
	}
	req.Header.Set("Authorization", "Bearer "+s.kimiKey)
	req.Header.Set("content-type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", false, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", false, fmt.Errorf("kimi upstream status %d: %s", resp.StatusCode, strings.TrimSpace(string(snippet)))
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", false, err
	}
	if len(parsed.Choices) == 0 {
		return "", false, fmt.Errorf("kimi returned no choices")
	}
	choice := parsed.Choices[0]
	// OpenAI-compatible spelling of "hit the token cap".
	return strings.TrimSpace(choice.Message.Content), choice.FinishReason == "length", nil
}

// capitalise upper-cases the first rune (rune-safe: a multi-byte first
// letter is never split).
func capitalise(s string) string {
	r, size := utf8.DecodeRuneInString(s)
	if size == 0 {
		return s
	}
	return string(unicode.ToUpper(r)) + s[size:]
}

// simulate is the no-key fallback (never in production) — clearly labelled so
// it's never mistaken for live output.
func simulate(action, text, language, prompt string) string {
	note := "▌ Simulated — set ANTHROPIC_API_KEY for live Claude output.\n\n"
	trimmed := strings.TrimSpace(text)
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
		return note + capitalise(strings.Join(words, " ")) + "\n\nAlternatives:\n• A clearer headline\n• An inviting headline"
	case "formalize":
		return note + "Dear all,\n\n" + capitalise(trimmed)
	case "casual":
		return note + "Hey everyone — " + trimmed
	case "grammar", "clarity":
		out := capitalise(strings.Join(strings.Fields(trimmed), " "))
		if out != "" && !strings.ContainsAny(out[len(out)-1:], ".!?") {
			out += "."
		}
		return note + out
	case "expand":
		return note + capitalise(trimmed) + "\n\n[With the live model, fuller detail and context would be drafted here.]"
	case "email":
		return note + "Subject: A note from Oguaa\n\n" + capitalise(trimmed)
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
