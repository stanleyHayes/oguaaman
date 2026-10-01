package email

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"maps"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	resend "github.com/resend/resend-go/v2"
)

func TestNoopClient_reportsNotConfigured(t *testing.T) {
	s := New("", "Oguaa <noreply@example.com>", slog.New(slog.NewTextHandler(io.Discard, nil)))
	if Configured(s) {
		t.Fatal("unconfigured client reports Configured")
	}
	if err := s.Send(context.Background(), "a@example.com", "s", "<p>b</p>"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("Send err = %v, want ErrNotConfigured", err)
	}
}

// R23: SendWithHeaders puts the extra headers (List-Unsubscribe and
// List-Unsubscribe-Post on notification emails) on the message Resend sends.
func TestClientSendWithHeaders_passesHeadersToResend(t *testing.T) {
	sent := make(chan map[string]string, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Headers map[string]string `json:"headers"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		sent <- body.Headers
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"email-1"}`)
	}))
	defer srv.Close()
	rc := resend.NewClient("re_test")
	rc.BaseURL, _ = url.Parse(srv.URL + "/")
	c := &Client{c: rc, from: "Oguaa <noreply@example.com>", log: slog.New(slog.NewTextHandler(io.Discard, nil))}

	want := map[string]string{
		"List-Unsubscribe":      "<https://api.example.com/api/notifications/unsubscribe?token=t>",
		"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
	}
	if err := c.SendWithHeaders(context.Background(), "a@example.com", "s", "<p>b</p>", want); err != nil {
		t.Fatalf("SendWithHeaders: %v", err)
	}
	if got := <-sent; !maps.Equal(got, want) {
		t.Errorf("headers sent to Resend = %v, want %v", got, want)
	}
}
