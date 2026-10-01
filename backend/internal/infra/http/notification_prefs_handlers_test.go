package http

import (
	"context"
	"encoding/json"
	"html"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// prefsMemberStore is a one-member store that keeps preference writes.
type prefsMemberStore struct {
	domain.MemberRepository
	m *domain.Member
}

func (s *prefsMemberStore) ByID(context.Context, string) (*domain.Member, error) { return s.m, nil }
func (s *prefsMemberStore) SetNotificationPrefs(_ context.Context, _ string, p domain.NotificationPrefs) error {
	s.m.NotificationPrefs = &p
	return nil
}

func prefsHandler(m *domain.Member) (*Handler, *service.Service) {
	svc := service.New(service.Deps{Members: &prefsMemberStore{m: m}})
	svc.ConfigureOutbound("https://oguaa.gh", "https://api.oguaa.gh", "test-secret")
	return &Handler{svc: svc, limiter: newRateLimiter(), log: slog.Default()}, svc
}

func asMember(r *http.Request, m *domain.Member) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), memberCtxKey, m))
}

// K14: GET returns the defaults; PUT is partial and returns the stored shape.
func TestNotificationPreferencesEndpoints(t *testing.T) {
	m := &domain.Member{ID: "m-1"}
	h, _ := prefsHandler(m)

	w := httptest.NewRecorder()
	h.MyNotificationPreferences(w, httptest.NewRequest(http.MethodGet, "/api/me/notification-preferences", nil))
	if w.Code != http.StatusUnauthorized {
		t.Errorf("anonymous GET = %d, want 401", w.Code)
	}

	w = httptest.NewRecorder()
	h.MyNotificationPreferences(w, asMember(httptest.NewRequest(http.MethodGet, "/api/me/notification-preferences", nil), m))
	want := `{"categories":{"safety":true,"community":true,"remembrances":true,"product":false},"channels":{"push":true,"email":true,"whatsapp":false}}`
	if w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != want {
		t.Fatalf("GET = %d %s; want %s", w.Code, w.Body.String(), want)
	}

	body := strings.NewReader(`{"categories":{"product":true,"safety":false},"channels":{"email":false}}`)
	w = httptest.NewRecorder()
	h.SetMyNotificationPreferences(w, asMember(httptest.NewRequest(http.MethodPut, "/api/me/notification-preferences", body), m))
	if w.Code != http.StatusOK {
		t.Fatalf("PUT = %d %s", w.Code, w.Body.String())
	}
	var got domain.NotificationPrefs
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !got.Categories.Product || !got.Categories.Safety || !got.Categories.Community || got.Channels.Email || !got.Channels.Push {
		t.Errorf("PUT result = %+v", got)
	}
}

// R23: GET on the signed link only shows a confirmation page — a mail
// scanner fetching it changes nothing — and the page's POST (or an RFC 8058
// one-click POST) switches email off. A bad link answers 400 either way.
func TestUnsubscribeEndpoint(t *testing.T) {
	m := &domain.Member{ID: "m-1"}
	h, svc := prefsHandler(m)

	token := svc.UnsubscribeToken("m-1", domain.CategoryAccount)
	target := "/api/notifications/unsubscribe?token=" + url.QueryEscape(token)
	w := httptest.NewRecorder()
	h.UnsubscribeConfirmPage(w, httptest.NewRequest(http.MethodGet, target, nil))
	if w.Code != http.StatusOK || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("confirm page = %d %q", w.Code, w.Header().Get("Content-Type"))
	}
	if m.NotificationPrefs != nil {
		t.Fatalf("a GET stored preferences: %+v", *m.NotificationPrefs)
	}
	page := w.Body.String()
	wantAction := `action="` + html.EscapeString("?token="+url.QueryEscape(token)) + `"`
	if !strings.Contains(page, `method="post"`) || !strings.Contains(page, wantAction) {
		t.Fatalf("confirm page has no POST form back to the link: %s", page)
	}
	if csp := w.Header().Get("Content-Security-Policy"); !strings.Contains(csp, "form-action 'self'") {
		t.Errorf("confirm page CSP = %q, want form-action 'self'", csp)
	}

	w = httptest.NewRecorder()
	h.UnsubscribeNotifications(w, httptest.NewRequest(http.MethodPost, target, strings.NewReader("List-Unsubscribe=One-Click")))
	if w.Code != http.StatusOK || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("unsubscribe = %d %q", w.Code, w.Header().Get("Content-Type"))
	}
	if !strings.Contains(w.Body.String(), "unsubscribed") || m.NotificationPreferences().Channels.Email {
		t.Errorf("email should be off after unsubscribing: %+v", m.NotificationPreferences())
	}

	for _, call := range []func(http.ResponseWriter, *http.Request){h.UnsubscribeConfirmPage, h.UnsubscribeNotifications} {
		w = httptest.NewRecorder()
		call(w, httptest.NewRequest(http.MethodGet, "/api/notifications/unsubscribe?token=forged.value", nil))
		if w.Code != http.StatusBadRequest {
			t.Errorf("forged token = %d, want 400", w.Code)
		}
	}
}

// R23: through the router and its middleware, GET shows the confirmation page
// (changing nothing) under a CSP that lets its form post back — the API's
// policy with only form-action loosened, and no second policy that would
// still forbid the form — and POST, as an RFC 8058 client sends it, applies
// the change.
func TestUnsubscribeRoutes(t *testing.T) {
	m := &domain.Member{ID: "m-1"}
	h, svc := prefsHandler(m)
	router := NewRouter(h, nil, nil, slog.Default())
	target := "/api/notifications/unsubscribe?token=" + url.QueryEscape(svc.UnsubscribeToken("m-1", domain.CategoryCommunity))

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, target, nil))
	if w.Code != http.StatusOK || !m.NotificationPreferences().Categories.Community {
		t.Fatalf("GET = %d, community still on = %v", w.Code, m.NotificationPreferences().Categories.Community)
	}
	wantCSP := strings.Replace(cspAPI, "form-action 'none'", "form-action 'self'", 1)
	if csp := w.Header().Values("Content-Security-Policy"); len(csp) != 1 || csp[0] != wantCSP {
		t.Errorf("confirm page CSP = %q, want only %q", csp, wantCSP)
	}

	req := httptest.NewRequest(http.MethodPost, target, strings.NewReader("List-Unsubscribe=One-Click"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK || m.NotificationPreferences().Categories.Community {
		t.Fatalf("POST = %d, community still on = %v", w.Code, m.NotificationPreferences().Categories.Community)
	}
}

// F104: the profile body is a partial patch — absent keys stay nil, null
// clears the optional facts, wrong types are refused.
func TestProfileBodyPatch(t *testing.T) {
	var b profileBody
	if err := json.Unmarshal([]byte(`{"summary":"Fixed a typo","latitude":null,"momoNumber":"024 000 0000","contact":[]}`), &b); err != nil {
		t.Fatal(err)
	}
	p, err := b.patch()
	if err != nil {
		t.Fatalf("patch: %v", err)
	}
	if p.Summary == nil || *p.Summary != "Fixed a typo" || p.MoMoNumber == nil || *p.MoMoNumber != "024 000 0000" {
		t.Errorf("sent fields not decoded: %+v", p)
	}
	if p.Contact == nil || len(*p.Contact) != 0 {
		t.Errorf("an empty contact list must be an explicit clear, got %v", p.Contact)
	}
	if !p.ClearLatitude || p.Latitude != nil {
		t.Errorf("latitude null must clear it: %+v", p)
	}
	if p.History != nil || p.GESCategory != nil || p.VerificationArtifacts != nil || p.Longitude != nil || p.ClearLongitude {
		t.Errorf("absent fields must stay untouched: %+v", p)
	}

	var bad profileBody
	_ = json.Unmarshal([]byte(`{"latitude":"north","summary":7}`), &bad)
	if _, err := bad.patch(); err == nil {
		t.Error("wrong types must be refused")
	}
}
