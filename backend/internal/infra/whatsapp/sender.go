// Package whatsapp delivers OTP codes via WhatsApp Business Cloud API.
// When WHATSAPP_TOKEN / WHATSAPP_PHONE_ID are absent, it falls back to a
// no-op (the code is returned in the API response for dev/sim use).
package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// OTPSender delivers one-time codes via WhatsApp.
type OTPSender interface {
	SendOTP(ctx context.Context, phone, code string) error
}

// Client uses the Meta WhatsApp Business Cloud API
// (graph.facebook.com/v20.0/{phoneNumberID}/messages).
type Client struct {
	token   string
	phoneID string
	log     *slog.Logger
	hc      *http.Client
}

// NoopSender logs and succeeds without calling any external API.
type NoopSender struct{ log *slog.Logger }

// New returns a live WhatsApp client when token and phoneID are set,
// otherwise a NoopSender.
func New(token, phoneID string, log *slog.Logger) OTPSender {
	if token == "" || phoneID == "" {
		log.Info("WhatsApp OTP SKIPPED — set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID to enable")
		return &NoopSender{log: log}
	}
	log.Info("WhatsApp OTP via Meta Cloud API")
	return &Client{
		token:   token,
		phoneID: phoneID,
		log:     log,
		hc:      &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *Client) SendOTP(ctx context.Context, phone, code string) error {
	body := map[string]any{
		"messaging_product": "whatsapp",
		"to":                phone,
		"type":              "text",
		"text": map[string]string{
			"body": fmt.Sprintf("Your Oguaa verification code is *%s*. It expires in 10 minutes. Do not share it.", code),
		},
	}
	b, _ := json.Marshal(body)
	url := fmt.Sprintf("https://graph.facebook.com/v20.0/%s/messages", c.phoneID)
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
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		c.log.Error("whatsapp non-2xx", "phone", phone, "status", resp.StatusCode)
		return fmt.Errorf("whatsapp API returned %d", resp.StatusCode)
	}
	return nil
}

func (n *NoopSender) SendOTP(_ context.Context, phone, _ string) error {
	n.log.Debug("WhatsApp OTP skipped (no credentials)", "phone", phone)
	return nil
}
