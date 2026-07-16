// Package email provides transactional email delivery via Resend.
// When RESEND_API_KEY is not set the client logs a line and skips silently —
// in-app notifications still work, email is just not sent.
package email

import (
	"context"
	"log/slog"

	resend "github.com/resend/resend-go/v2"
)

// Sender is the interface consumed by services that need to send email.
type Sender interface {
	Send(ctx context.Context, to, subject, html string) error
}

// Client sends transactional emails via Resend.
type Client struct {
	c    *resend.Client
	from string
	log  *slog.Logger
}

// NoopClient is returned when RESEND_API_KEY is absent; it logs and does nothing.
type NoopClient struct{ log *slog.Logger }

// New returns a live Resend client when apiKey is non-empty, else a NoopClient.
func New(apiKey, from string, log *slog.Logger) Sender {
	if apiKey == "" {
		log.Info("email delivery SKIPPED — set RESEND_API_KEY to enable")
		return &NoopClient{log: log}
	}
	log.Info("email delivery via Resend")
	return &Client{c: resend.NewClient(apiKey), from: from, log: log}
}

func (c *Client) Send(_ context.Context, to, subject, html string) error {
	params := &resend.SendEmailRequest{
		From:    c.from,
		To:      []string{to},
		Subject: subject,
		Html:    html,
	}
	_, err := c.c.Emails.Send(params)
	if err != nil {
		c.log.Error("resend send failed", "to", to, "subject", subject, "err", err)
	}
	return err
}

func (n *NoopClient) Send(_ context.Context, to, subject, _ string) error {
	n.log.Debug("email skipped (no RESEND_API_KEY)", "to", to, "subject", subject)
	return nil
}
