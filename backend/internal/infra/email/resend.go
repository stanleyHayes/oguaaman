// Package email provides transactional email delivery via Resend.
// When RESEND_API_KEY is not set, New returns a NoopClient whose sends fail
// with ErrNotConfigured — in-app notifications still work, email is just not
// sent, and no caller mistakes an unsent code for a delivered one.
package email

import (
	"context"
	"errors"
	"log/slog"

	resend "github.com/resend/resend-go/v2"

	"github.com/oguaa/backend/internal/platform/emailtmpl"
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

// ErrNotConfigured is returned by the NoopClient: email has no API key, so
// nothing was sent.
var ErrNotConfigured = errors.New("email delivery is not configured")

// NoopClient is returned when RESEND_API_KEY is absent; every send fails with
// ErrNotConfigured.
type NoopClient struct{ log *slog.Logger }

// Configured reports whether s actually delivers email (false for nil and for
// the NoopClient).
func Configured(s Sender) bool {
	if s == nil {
		return false
	}
	_, noop := s.(*NoopClient)
	return !noop
}

// New returns a live Resend client when apiKey is non-empty, else a NoopClient.
func New(apiKey, from string, log *slog.Logger) Sender {
	if apiKey == "" {
		log.Info("email delivery SKIPPED — set RESEND_API_KEY to enable")
		return &NoopClient{log: log}
	}
	log.Info("email delivery via Resend")
	return &Client{c: resend.NewClient(apiKey), from: from, log: log}
}

// Send sends one email. html may come from emailtmpl (Email.Pack) or be any
// other HTML; see SendWithHeaders.
func (c *Client) Send(ctx context.Context, to, subject, html string) error {
	return c.SendWithHeaders(ctx, to, subject, html, nil)
}

// SendWithHeaders sends like Send, adding extra message headers (for example
// List-Unsubscribe and List-Unsubscribe-Post on notification emails).
//
// Every email goes out branded and with a plain-text part: HTML rendered by
// emailtmpl is sent as rendered (its packed text part becomes the text
// part), and any other HTML is wrapped in the branded layout with a
// transactional footer by emailtmpl.Prepare.
func (c *Client) SendWithHeaders(_ context.Context, to, subject, html string, headers map[string]string) error {
	msg := emailtmpl.Prepare(html, subject)
	params := &resend.SendEmailRequest{
		From:    c.from,
		To:      []string{to},
		Subject: subject,
		Html:    msg.HTML,
		Text:    msg.Text,
		Headers: headers,
	}
	_, err := c.c.Emails.Send(params)
	if err != nil {
		c.log.Error("resend send failed", "to", to, "subject", subject, "err", err)
	}
	return err
}

func (n *NoopClient) Send(_ context.Context, to, subject, _ string) error {
	n.log.Debug("email not sent (no RESEND_API_KEY)", "to", to, "subject", subject)
	return ErrNotConfigured
}
