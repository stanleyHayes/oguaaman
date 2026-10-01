package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// aiMemberStore records AI consent writes for one member.
type aiMemberStore struct {
	domain.MemberRepository
	m *domain.Member
}

func (s *aiMemberStore) SetAIConsent(_ context.Context, _ string, at string) error {
	s.m.AIConsentAt = at
	return nil
}

func aiHandler(m *domain.Member, ai *service.AIService) *Handler {
	svc := service.New(service.Deps{Members: &aiMemberStore{m: m}})
	return &Handler{svc: svc, ai: ai, limiter: newRateLimiter(), log: slog.Default()}
}

func postAI(h *Handler, m *domain.Member, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/ai", strings.NewReader(body))
	if m != nil {
		r = asMember(r, m)
	}
	w := httptest.NewRecorder()
	h.AI(w, r)
	return w
}

// K15 / F119: sign-in (401) and consent (403 ai_consent_required) come first.
func TestAIEndpoint_requiresSignInAndConsent(t *testing.T) {
	m := &domain.Member{ID: "m-1"}
	h := aiHandler(m, service.NewAIService("", "", 60, 20, nil))
	body := `{"action":"grammar","text":"hello there"}`

	if w := postAI(h, nil, body); w.Code != http.StatusUnauthorized {
		t.Errorf("anonymous = %d, want 401", w.Code)
	}
	w := postAI(h, m, body)
	if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), `"error":"ai_consent_required"`) {
		t.Errorf("no consent = %d %s, want 403 ai_consent_required", w.Code, w.Body.String())
	}
	m.AIConsentAt = "2026-09-30T10:00:00Z"
	w = postAI(h, m, body)
	if w.Code != http.StatusOK {
		t.Fatalf("with consent = %d %s", w.Code, w.Body.String())
	}
	var res service.AIResult
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil || !res.Simulated {
		t.Errorf("dev without a key answers a labelled simulation: %+v %v", res, err)
	}
	if w := postAI(h, m, `{"action":"translate","text":"hi","language":"`+strings.Repeat("x", 300)+`"}`); w.Code != http.StatusBadRequest {
		t.Errorf("oversized language = %d, want 400", w.Code)
	}
	if w := postAI(h, m, `{"action":"grammar","text":""}`); w.Code != http.StatusBadRequest {
		t.Errorf("empty text = %d, want 400", w.Code)
	}
}

// D4: production without a provider key answers 503 ai_unavailable.
func TestAIEndpoint_productionWithoutKeyIsUnavailable(t *testing.T) {
	m := &domain.Member{ID: "m-1", AIConsentAt: "2026-09-30T10:00:00Z"}
	h := aiHandler(m, service.NewAIService("", "", 60, 20, nil).WithProduction(true))
	w := postAI(h, m, `{"action":"grammar","text":"hello there"}`)
	if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), `"error":"ai_unavailable"`) {
		t.Errorf("= %d %s, want 503 ai_unavailable", w.Code, w.Body.String())
	}
}

// K15: POST /api/me/ai-consent records and withdraws consent; /api/auth/me
// reports it as aiConsent.
func TestSetMyAIConsent(t *testing.T) {
	m := &domain.Member{ID: "m-1"}
	h := aiHandler(m, service.NewAIService("", "", 60, 20, nil))
	send := func(body string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		h.SetMyAIConsent(w, asMember(httptest.NewRequest(http.MethodPost, "/api/me/ai-consent", strings.NewReader(body)), m))
		return w
	}
	if w := send(`{"consent":true}`); w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != `{"aiConsent":true}` || m.AIConsentAt == "" {
		t.Fatalf("consent = %d %s (at %q)", w.Code, w.Body.String(), m.AIConsentAt)
	}
	if !selfView(m).AIConsent {
		t.Error("/api/auth/me must report aiConsent: true")
	}
	if w := send(`{"consent":false}`); w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != `{"aiConsent":false}` || m.AIConsentAt != "" {
		t.Errorf("withdraw = %d %s (at %q)", w.Code, w.Body.String(), m.AIConsentAt)
	}
	if w := send(`{}`); w.Code != http.StatusBadRequest {
		t.Errorf("missing consent = %d, want 400", w.Code)
	}
}
