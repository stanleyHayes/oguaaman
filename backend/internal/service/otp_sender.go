package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// HubtelOTPSender delivers OTP codes over SMS via Hubtel (Ghana's main provider).
// It posts to the Hubtel send-message API with HTTP Basic auth (ClientID:Secret).
// The endpoint is configurable so the integration survives API-path changes
// without a code edit. This is the production implementation of OTPSender; the
// dev default stays LogOTPSender (auth_service.go).
type HubtelOTPSender struct {
	clientID     string
	clientSecret string
	senderID     string // approved alphanumeric sender id, e.g. "Oguaa"
	endpoint     string
	http         *http.Client
	log          *slog.Logger
}

// DefaultHubtelEndpoint is Hubtel's send-message REST endpoint.
const DefaultHubtelEndpoint = "https://sms.hubtel.com/v1/messages/send"

func NewHubtelOTPSender(clientID, clientSecret, senderID, endpoint string, log *slog.Logger) *HubtelOTPSender {
	if strings.TrimSpace(endpoint) == "" {
		endpoint = DefaultHubtelEndpoint
	}
	if strings.TrimSpace(senderID) == "" {
		senderID = "Oguaa"
	}
	return &HubtelOTPSender{
		clientID: clientID, clientSecret: clientSecret, senderID: senderID,
		endpoint: endpoint, http: &http.Client{Timeout: 15 * time.Second}, log: log,
	}
}

func (s *HubtelOTPSender) Send(ctx context.Context, identifier, code string) error {
	// Email identifiers are not SMS-deliverable; an email OTP channel is a separate
	// (deferred) integration. Don't fail the request — just note it.
	if strings.Contains(identifier, "@") {
		s.log.Warn("OTP not sent: Hubtel is SMS-only and the identifier is an email", "identifier", identifier)
		return nil
	}
	payload, _ := json.Marshal(map[string]string{
		"From":    s.senderID,
		"To":      identifier,
		"Content": fmt.Sprintf("Your Oguaa code is %s. It expires shortly — Akwaaba.", code),
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(s.clientID+":"+s.clientSecret)))

	resp, err := s.http.Do(req)
	if err != nil {
		return fmt.Errorf("hubtel send failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("hubtel send returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	s.log.Info("OTP sent via Hubtel", "to", identifier)
	return nil
}
