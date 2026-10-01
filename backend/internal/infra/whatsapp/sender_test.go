package whatsapp

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func quietLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

const testPhone = "+233241234567"

func TestNoopSender_reportsNotConfigured(t *testing.T) {
	s := New("", "", quietLog())
	if Configured(s) {
		t.Fatal("unconfigured sender reports Configured")
	}
	if err := s.SendOTP(context.Background(), testPhone, "123456"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("SendOTP err = %v, want ErrNotConfigured", err)
	}
	if err := s.SendMessage(context.Background(), testPhone, "hi"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("SendMessage err = %v, want ErrNotConfigured", err)
	}
}

// captureServer records the last JSON body posted to it.
func captureServer(t *testing.T, got *map[string]any) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(got); err != nil {
			t.Errorf("decode: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestClient_sendOTPUsesTemplateWhenConfigured(t *testing.T) {
	var got map[string]any
	srv := captureServer(t, &got)
	s := NewWithOptions("tok", "pid", Options{OTPTemplate: "oguaa_code", TemplateLang: "en_GB", BaseURL: srv.URL}, quietLog())
	if !Configured(s) {
		t.Fatal("live client reports not configured")
	}
	if err := s.SendOTP(context.Background(), testPhone, "482913"); err != nil {
		t.Fatalf("SendOTP: %v", err)
	}
	if got["type"] != "template" {
		t.Fatalf("type = %v, want template", got["type"])
	}
	tpl, _ := got["template"].(map[string]any)
	if tpl["name"] != "oguaa_code" {
		t.Fatalf("template name = %v", tpl["name"])
	}
	if lang, _ := tpl["language"].(map[string]any); lang["code"] != "en_GB" {
		t.Fatalf("language = %v", tpl["language"])
	}
	b, _ := json.Marshal(tpl["components"])
	want := `[{"parameters":[{"text":"482913","type":"text"}],"type":"body"},{"index":"0","parameters":[{"text":"482913","type":"text"}],"sub_type":"url","type":"button"}]`
	if string(b) != want {
		t.Fatalf("components = %s\nwant %s", b, want)
	}
}

func TestClient_sendOTPWithoutTemplateIsText(t *testing.T) {
	var got map[string]any
	srv := captureServer(t, &got)
	s := NewWithOptions("tok", "pid", Options{BaseURL: srv.URL}, quietLog())
	if err := s.SendOTP(context.Background(), testPhone, "482913"); err != nil {
		t.Fatalf("SendOTP: %v", err)
	}
	if got["type"] != "text" {
		t.Fatalf("type = %v, want text", got["type"])
	}
}
