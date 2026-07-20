package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"github.com/oguaa/backend/internal/domain"
)

// PushConfig carries the Web Push VAPID keys. Expo push needs no key.
type PushConfig struct {
	VAPIDPublic  string
	VAPIDPrivate string
	VAPIDSubject string // "mailto:you@oguaa.gh" — required by the push services
}

// PushPayload is the notification the client (service worker / Expo) renders.
// Ring=true (critical) tells the clients to ring like a call: a looping ringtone
// and a full-screen incoming-call prompt rather than a quiet banner.
type PushPayload struct {
	Title    string `json:"title"`
	Body     string `json:"body"`
	URL      string `json:"url"`
	Tag      string `json:"tag"`
	Severity string `json:"severity"` // high | critical
	Kind     string `json:"kind"`     // incident | directive
	Ring     bool   `json:"ring"`
}

// PushSender fans a payload out to members' Web Push + Expo subscriptions.
// Web Push is active only when VAPID keys are configured; Expo always works.
// Dead endpoints (404/410) are pruned. It degrades to a no-op sender when the
// repo is nil, mirroring the email/WhatsApp channels.
type PushSender struct {
	repo   domain.PushRepository
	cfg    PushConfig
	client *http.Client
	log    *slog.Logger
}

func NewPushSender(repo domain.PushRepository, cfg PushConfig, log *slog.Logger) *PushSender {
	if log == nil {
		log = slog.Default()
	}
	cfg.VAPIDSubject = normalizeSubject(cfg.VAPIDSubject)
	return &PushSender{repo: repo, cfg: cfg, client: &http.Client{Timeout: 15 * time.Second}, log: log}
}

func (p *PushSender) webEnabled() bool {
	return p != nil && p.cfg.VAPIDPublic != "" && p.cfg.VAPIDPrivate != ""
}

// PublicKey is the VAPID public key the browser needs to subscribe ("" = web
// push disabled, so the client stays on the in-app foreground ring only).
func (p *PushSender) PublicKey() string {
	if p == nil {
		return ""
	}
	return p.cfg.VAPIDPublic
}

// Register stores a subscription for the member (web endpoint or expo token).
func (p *PushSender) Register(ctx context.Context, sub domain.PushSubscription) error {
	if p == nil || p.repo == nil {
		return fmt.Errorf("push is not configured")
	}
	switch sub.Platform {
	case domain.PushWeb:
		if sub.Endpoint == "" || sub.P256dh == "" || sub.Auth == "" {
			return fmt.Errorf("a web push subscription needs endpoint + keys")
		}
		// SSRF guard: the server later POSTs to this endpoint, so only accept the
		// known browser push services — never an arbitrary/internal URL.
		if !allowedPushEndpoint(sub.Endpoint) {
			return fmt.Errorf("push endpoint is not a recognised push service")
		}
		sub.ID = sub.Endpoint
	case domain.PushExpo:
		if sub.ExpoToken == "" {
			return fmt.Errorf("an expo subscription needs a token")
		}
		sub.ID = sub.ExpoToken
	default:
		return fmt.Errorf("unknown push platform %q", sub.Platform)
	}
	sub.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	return p.repo.Upsert(ctx, sub)
}

// Unregister removes a member's subscription by its id (endpoint or token).
func (p *PushSender) Unregister(ctx context.Context, memberID, id string) error {
	if p == nil || p.repo == nil {
		return nil
	}
	return p.repo.DeleteByID(ctx, memberID, id)
}

// BroadcastAll sends to every registered subscription. Runs the sends in the
// caller's goroutine budget; callers invoke it in a goroutine.
func (p *PushSender) BroadcastAll(ctx context.Context, payload PushPayload) {
	if p == nil || p.repo == nil {
		return
	}
	subs, err := p.repo.All(ctx)
	if err != nil {
		p.log.Error("push: load subscriptions", "err", err)
		return
	}
	p.send(ctx, subs, payload)
}

func (p *PushSender) send(ctx context.Context, subs []domain.PushSubscription, payload PushPayload) {
	body, _ := json.Marshal(payload)
	var expoTokens []string
	for _, s := range subs {
		switch s.Platform {
		case domain.PushWeb:
			p.sendWeb(ctx, s, body)
		case domain.PushExpo:
			expoTokens = append(expoTokens, s.ExpoToken)
		}
	}
	if len(expoTokens) > 0 {
		p.sendExpo(ctx, expoTokens, payload)
	}
}

func (p *PushSender) sendWeb(ctx context.Context, s domain.PushSubscription, body []byte) {
	if !p.webEnabled() {
		return
	}
	urgency := webpush.UrgencyHigh
	resp, err := webpush.SendNotificationWithContext(ctx, body, &webpush.Subscription{
		Endpoint: s.Endpoint,
		Keys:     webpush.Keys{P256dh: s.P256dh, Auth: s.Auth},
	}, &webpush.Options{
		Subscriber:      p.cfg.VAPIDSubject,
		VAPIDPublicKey:  p.cfg.VAPIDPublic,
		VAPIDPrivateKey: p.cfg.VAPIDPrivate,
		TTL:             120,
		Urgency:         urgency,
	})
	if err != nil {
		p.log.Warn("push: web send", "err", err)
		return
	}
	defer func() { _ = resp.Body.Close() }()
	// A gone/expired endpoint should be pruned so we stop trying it.
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
		_ = p.repo.DeleteByID(ctx, s.MemberID, s.ID)
	}
}

// expoMessage is one Expo push message (https://docs.expo.dev/push-notifications).
type expoMessage struct {
	To        string         `json:"to"`
	Title     string         `json:"title"`
	Body      string         `json:"body"`
	Sound     any            `json:"sound"`               // "default" or {critical,name,volume}
	Priority  string         `json:"priority"`            // high
	ChannelID string         `json:"channelId,omitempty"` // Android channel
	Data      map[string]any `json:"data,omitempty"`
}

func (p *PushSender) sendExpo(ctx context.Context, tokens []string, payload PushPayload) {
	// iOS critical alerts (ring through silent/DND) require the critical-alert
	// entitlement on the app; the flag is harmless without it.
	var sound any = "default"
	if payload.Ring {
		sound = map[string]any{"critical": true, "name": "default", "volume": 1.0}
	}
	msgs := make([]expoMessage, 0, len(tokens))
	for _, t := range tokens {
		msgs = append(msgs, expoMessage{
			To: t, Title: payload.Title, Body: payload.Body, Sound: sound,
			Priority: "high", ChannelID: "alerts",
			Data: map[string]any{"url": payload.URL, "severity": payload.Severity, "kind": payload.Kind, "ring": payload.Ring},
		})
	}
	buf, _ := json.Marshal(msgs)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://exp.host/--/api/v2/push/send", bytes.NewReader(buf))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		p.log.Warn("push: expo send", "err", err)
		return
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		p.log.Warn("push: expo upstream", "status", resp.StatusCode)
	}
}

// pushEndpointHosts are the hosts of the legitimate Web Push services. A web
// push endpoint must be https and served from one of these (or a subdomain).
var pushEndpointHosts = []string{
	"fcm.googleapis.com",                // Chrome/Edge (FCM)
	"android.googleapis.com",            // legacy GCM/FCM
	"updates.push.services.mozilla.com", // Firefox autopush
	"web.push.apple.com",                // Safari / Apple
	"notify.windows.com",                // Windows WNS (*.notify.windows.com)
	"push.microsoft.com",                // Microsoft (*.push.microsoft.com)
}

// allowedPushEndpoint reports whether raw is an https URL served by a known push
// service — the SSRF allowlist for outbound Web Push requests.
func allowedPushEndpoint(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, h := range pushEndpointHosts {
		if host == h || strings.HasSuffix(host, "."+h) {
			return true
		}
	}
	return false
}

// normalizeSubject makes a VAPID subject valid (mailto: or https:) — a bare
// email is coerced to mailto:, which the push services require.
func normalizeSubject(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(s, "mailto:") || strings.HasPrefix(s, "https://") {
		return s
	}
	return "mailto:" + s
}
