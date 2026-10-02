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
	"strings"
	"testing"
	"time"

	resend "github.com/resend/resend-go/v2"

	"github.com/oguaa/backend/internal/platform/emailtmpl"
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

// sentBody is the part of a Resend request these tests look at.
type sentBody struct {
	Subject string `json:"subject"`
	HTML    string `json:"html"`
	Text    string `json:"text"`
}

// captureClient is a Client whose Resend API is a test server that records
// each request body.
func captureClient(t *testing.T) (*Client, <-chan sentBody) {
	t.Helper()
	sent := make(chan sentBody, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body sentBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		sent <- body
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"email-1"}`)
	}))
	t.Cleanup(srv.Close)
	rc := resend.NewClient("re_test")
	rc.BaseURL, _ = url.Parse(srv.URL + "/")
	return &Client{c: rc, from: "Oguaa <noreply@example.com>", log: slog.New(slog.NewTextHandler(io.Discard, nil))}, sent
}

// A rendered email goes out as rendered, with the renderer's text part and
// without the packing comment.
func TestClientSend_renderedEmailKeepsItsTextPart(t *testing.T) {
	c, sent := captureClient(t)
	e, err := emailtmpl.Render(emailtmpl.VerificationCode("482913", 10*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Send(context.Background(), "a@example.com", emailtmpl.SubjectVerificationCode, e.Pack()); err != nil {
		t.Fatalf("Send: %v", err)
	}
	got := <-sent
	if got.HTML != e.HTML {
		t.Error("the rendered HTML was changed on the way out")
	}
	if got.Text != e.Text {
		t.Errorf("text part = %q, want the renderer's %q", got.Text, e.Text)
	}
	if strings.Contains(got.HTML, "oguaa-text:") {
		t.Error("the packing comment leaked into the sent HTML")
	}
}

// The safety net: bare HTML from any caller is sent inside the branded
// layout, with a transactional footer and a derived text part.
func TestClientSend_wrapsBareHTMLAndAddsText(t *testing.T) {
	c, sent := captureClient(t)
	bare := `<p>Your export is <b>ready</b>. <a href="https://citizen.oguaaman.com/me">Open your profile</a></p>`
	if err := c.Send(context.Background(), "a@example.com", "Export ready", bare); err != nil {
		t.Fatalf("Send: %v", err)
	}
	got := <-sent
	if !emailtmpl.IsBranded(got.HTML) {
		t.Fatalf("bare HTML was sent unbranded: %q", got.HTML)
	}
	for _, want := range []string{"<!doctype html>", "<b>ready</b>", `href="https://citizen.oguaaman.com/me"`, "Oguaa is operated by Dev Track (BN843072020)", `href="mailto:hello@oguaaman.com"`} {
		if !strings.Contains(got.HTML, want) {
			t.Errorf("sent HTML is missing %q", want)
		}
	}
	if strings.Contains(got.HTML, "Unsubscribe") {
		t.Error("a wrapped (transactional) email must not offer an unsubscribe link")
	}
	for _, want := range []string{"Your export is ready. Open your profile (https://citizen.oguaaman.com/me)", emailtmpl.OperatorLine} {
		if !strings.Contains(got.Text, want) {
			t.Errorf("text part is missing %q: %q", want, got.Text)
		}
	}
}
