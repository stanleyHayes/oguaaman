// Package whatsapp delivers OTP codes via WhatsApp Business Cloud API.
// When WHATSAPP_TOKEN / WHATSAPP_PHONE_ID are absent, New returns a NoopSender
// whose sends fail with ErrNotConfigured, so no caller mistakes an undelivered
// code for a delivered one.
package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// OTPSender delivers one-time codes via WhatsApp.
type OTPSender interface {
	SendOTP(ctx context.Context, phone, code string) error
}

// Sender supports both OTP and generic transactional messages.
type Sender interface {
	OTPSender
	SendMessage(ctx context.Context, phone, body string) error
}

// ErrNotConfigured is returned by the NoopSender: WhatsApp has no credentials,
// so nothing was sent.
var ErrNotConfigured = errors.New("whatsapp delivery is not configured")

// Options configures the live client.
type Options struct {
	// OTPTemplate is the name of an approved WhatsApp authentication template.
	// Meta only delivers business-initiated messages through templates outside
	// the 24-hour customer-service window, so codes go through it when set.
	// Empty = codes are sent as free-form text (delivered only inside the window).
	OTPTemplate string
	// TemplateLang is the template's language code (default "en").
	TemplateLang string
	// BaseURL overrides the Graph API origin (tests).
	BaseURL string
}

const defaultGraphBase = "https://graph.facebook.com"

// Client uses the Meta WhatsApp Business Cloud API
// (graph.facebook.com/v20.0/{phoneNumberID}/messages).
type Client struct {
	token   string
	phoneID string
	opts    Options
	log     *slog.Logger
	hc      *http.Client
}

// NoopSender is returned when WhatsApp is not configured. Every send fails
// with ErrNotConfigured.
type NoopSender struct{ log *slog.Logger }

// New returns a live WhatsApp client when token and phoneID are set,
// otherwise a NoopSender.
func New(token, phoneID string, log *slog.Logger) Sender {
	return NewWithOptions(token, phoneID, Options{}, log)
}

// NewWithOptions is New with template and endpoint options.
func NewWithOptions(token, phoneID string, opts Options, log *slog.Logger) Sender {
	if token == "" || phoneID == "" {
		log.Info("WhatsApp OTP SKIPPED — set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID to enable")
		return &NoopSender{log: log}
	}
	if opts.TemplateLang == "" {
		opts.TemplateLang = "en"
	}
	if opts.BaseURL == "" {
		opts.BaseURL = defaultGraphBase
	}
	if opts.OTPTemplate == "" {
		log.Warn("WhatsApp codes go out as free-form text, which Meta delivers only inside the 24-hour window — set WHATSAPP_OTP_TEMPLATE to an approved authentication template")
	}
	log.Info("WhatsApp OTP via Meta Cloud API", "otpTemplate", opts.OTPTemplate != "")
	return &Client{
		token:   token,
		phoneID: phoneID,
		opts:    opts,
		log:     log,
		hc:      &http.Client{Timeout: 10 * time.Second},
	}
}

// Configured reports whether s actually delivers messages (false for nil and
// for the NoopSender).
func Configured(s Sender) bool {
	if s == nil {
		return false
	}
	_, noop := s.(*NoopSender)
	return !noop
}

// SendOTP delivers a one-time code: through the approved authentication
// template when one is configured, else as free-form text.
func (c *Client) SendOTP(ctx context.Context, phone, code string) error {
	if c.opts.OTPTemplate != "" {
		return c.post(ctx, phone, otpTemplateMessage(phone, code, c.opts.OTPTemplate, c.opts.TemplateLang))
	}
	return c.SendMessage(ctx, phone, fmt.Sprintf("Your Oguaa verification code is *%s*. It expires in 10 minutes. Do not share it.", code))
}

// otpTemplateMessage builds an authentication-template message: the code fills
// the body placeholder and the copy-code button that Meta requires on
// authentication templates.
func otpTemplateMessage(phone, code, template, lang string) map[string]any {
	codeParam := []map[string]string{{"type": "text", "text": code}}
	return map[string]any{
		"messaging_product": "whatsapp",
		"to":                phone,
		"type":              "template",
		"template": map[string]any{
			"name":     template,
			"language": map[string]string{"code": lang},
			"components": []map[string]any{
				{"type": "body", "parameters": codeParam},
				{"type": "button", "sub_type": "url", "index": "0", "parameters": codeParam},
			},
		},
	}
}

// SendMessage sends free-form text. Meta delivers it only inside the 24-hour
// customer-service window.
func (c *Client) SendMessage(ctx context.Context, phone, message string) error {
	return c.post(ctx, phone, map[string]any{
		"messaging_product": "whatsapp",
		"to":                phone,
		"type":              "text",
		"text": map[string]string{
			"body": message,
		},
	})
}

func (c *Client) post(ctx context.Context, phone string, body map[string]any) error {
	b, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/v20.0/%s/messages", c.opts.BaseURL, c.phoneID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.hc.Do(req)
	if err != nil {
		c.log.Error("whatsapp send failed", "phone", phone, "err", err)
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		c.log.Error("whatsapp non-2xx", "phone", phone, "status", resp.StatusCode)
		return fmt.Errorf("whatsapp API returned %d", resp.StatusCode)
	}
	return nil
}

func (n *NoopSender) SendOTP(_ context.Context, phone, _ string) error {
	n.log.Debug("WhatsApp OTP not sent (no credentials)", "phone", phone)
	return ErrNotConfigured
}

func (n *NoopSender) SendMessage(_ context.Context, phone, body string) error {
	n.log.Debug("WhatsApp message not sent (no credentials)", "phone", phone, "bodyLen", len(body))
	return ErrNotConfigured
}
