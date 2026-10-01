package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"github.com/oguaa/backend/internal/domain"
)

// PushConfig carries the Web Push VAPID keys. Expo push needs no key.
type PushConfig struct {
	VAPIDPublic  string
	VAPIDPrivate string
	VAPIDSubject string // "mailto:you@oguaa.gh" or an https: URL — required by the push services
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

// PushPreferences reports the members who switched a push off (K14): their
// push channel is off or — for an optional category — that category is.
// *mongo.MemberRepo implements it.
type PushPreferences interface {
	NotificationOptOuts(ctx context.Context, channel, category string) ([]string, error)
}

// PushSender fans a payload out to members' Web Push + Expo subscriptions.
// Web Push is active only when VAPID keys are configured; Expo always works.
// Expo messages go out in batches of at most 100 (Expo refuses a larger
// request outright), dead devices are pruned (web 404/410, Expo
// DeviceNotRegistered), and members who switched push off are skipped. It
// degrades to a no-op sender when the repo is nil, mirroring the
// email/WhatsApp channels.
type PushSender struct {
	repo    domain.PushRepository
	cfg     PushConfig
	client  *http.Client
	log     *slog.Logger
	prefs   PushPreferences
	expoURL string
}

const (
	// expoPushURL is Expo's push API (docs.expo.dev/push-notifications/sending-notifications).
	expoPushURL = "https://exp.host/--/api/v2/push/send"
	// expoBatchSize is Expo's per-request limit: one message over it fails
	// the whole request (PUSH_TOO_MANY_NOTIFICATIONS).
	expoBatchSize = 100
	// maxDevicesPerMember caps a member's registered devices. A reinstall
	// mints a new token, and no single account may flood the fan-out.
	maxDevicesPerMember = 10
)

// expoTokenRE is the shape of an Expo push token.
var expoTokenRE = regexp.MustCompile(`^Expo(nent)?PushToken\[[^\[\]\s]{1,256}\]$`)

func NewPushSender(repo domain.PushRepository, cfg PushConfig, log *slog.Logger) *PushSender {
	if log == nil {
		log = slog.Default()
	}
	cfg.VAPIDSubject = normalizeSubject(cfg.VAPIDSubject)
	return &PushSender{repo: repo, cfg: cfg, client: &http.Client{Timeout: 15 * time.Second}, log: log, expoURL: expoPushURL}
}

// WithPreferences makes the fan-out honour members' notification preferences
// (K14). Returns the sender for chaining.
func (p *PushSender) WithPreferences(prefs PushPreferences) *PushSender {
	if p != nil {
		p.prefs = prefs
	}
	return p
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

// Register stores a subscription for the member (web endpoint or expo token)
// and keeps the member within maxDevicesPerMember (oldest dropped first).
func (p *PushSender) Register(ctx context.Context, sub domain.PushSubscription) error {
	if p == nil || p.repo == nil {
		return fmt.Errorf("push is not configured")
	}
	if err := validateSubscription(&sub); err != nil {
		return err
	}
	sub.CreatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if err := p.repo.Upsert(ctx, sub); err != nil {
		return err
	}
	p.enforceDeviceCap(ctx, sub.MemberID)
	return nil
}

// validateSubscription checks a subscription and sets its id (the endpoint or
// token, which dedupes re-registrations).
func validateSubscription(sub *domain.PushSubscription) error {
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
		sub.ExpoToken = strings.TrimSpace(sub.ExpoToken)
		if sub.ExpoToken == "" {
			return fmt.Errorf("an expo subscription needs a token")
		}
		if !expoTokenRE.MatchString(sub.ExpoToken) {
			return fmt.Errorf("that is not an Expo push token")
		}
		sub.ID = sub.ExpoToken
	default:
		return fmt.Errorf("unknown push platform %q", sub.Platform)
	}
	return nil
}

// enforceDeviceCap drops a member's oldest registrations beyond the cap.
func (p *PushSender) enforceDeviceCap(ctx context.Context, memberID string) {
	subs, err := p.repo.ByMembers(ctx, []string{memberID})
	if err != nil || len(subs) <= maxDevicesPerMember {
		return
	}
	sort.SliceStable(subs, func(i, j int) bool { return registeredAt(subs[i]).Before(registeredAt(subs[j])) })
	for _, s := range subs[:len(subs)-maxDevicesPerMember] {
		_ = p.repo.DeleteByID(ctx, memberID, s.ID)
	}
}

func registeredAt(s domain.PushSubscription) time.Time {
	t, _ := time.Parse(time.RFC3339Nano, s.CreatedAt)
	return t
}

// Unregister removes a member's subscription by its id (endpoint or token).
func (p *PushSender) Unregister(ctx context.Context, memberID, id string) error {
	if p == nil || p.repo == nil {
		return nil
	}
	return p.repo.DeleteByID(ctx, memberID, id)
}

// UnregisterAll drops every device a member registered — part of account
// erasure, so an anonymised account can't keep pushing to a real handset.
func (p *PushSender) UnregisterAll(ctx context.Context, memberID string) error {
	if p == nil || p.repo == nil {
		return nil
	}
	return p.repo.DeleteByMember(ctx, memberID)
}

// BroadcastAll sends to every registered subscription whose member still
// wants the push. Runs the sends in the caller's goroutine budget; callers
// invoke it in a goroutine.
func (p *PushSender) BroadcastAll(ctx context.Context, payload PushPayload) {
	if p == nil || p.repo == nil {
		return
	}
	category := notificationCategory(payload.Kind)
	if category == domain.CategoryProduct {
		// Product news is opt-in; a town-wide broadcast can never carry it.
		p.log.Warn("push: refusing to broadcast a product message", "kind", payload.Kind)
		return
	}
	subs, err := p.repo.All(ctx)
	if err != nil {
		p.log.Error("push: load subscriptions", "err", err)
		return
	}
	p.send(ctx, p.withoutOptOuts(ctx, subs, category), payload)
}

// SendToMembers sends a push to the devices of the given members only (a
// targeted alert, e.g. to safety staff), honouring their push preferences.
// Callers invoke it in a goroutine, like BroadcastAll.
func (p *PushSender) SendToMembers(ctx context.Context, memberIDs []string, payload PushPayload) {
	if p == nil || p.repo == nil || len(memberIDs) == 0 {
		return
	}
	subs, err := p.repo.ByMembers(ctx, memberIDs)
	if err != nil {
		p.log.Error("push: load member subscriptions", "err", err)
		return
	}
	p.send(ctx, p.withoutOptOuts(ctx, subs, notificationCategory(payload.Kind)), payload)
}

// withoutOptOuts drops the subscriptions of members who switched push (or an
// optional category) off. A lookup failure fails OPEN for safety and service
// messages — an alert must not be lost to a database hiccup — and CLOSED for
// optional categories.
func (p *PushSender) withoutOptOuts(ctx context.Context, subs []domain.PushSubscription, category string) []domain.PushSubscription {
	if p.prefs == nil || len(subs) == 0 {
		return subs
	}
	optional := ""
	if domain.CategoryIsOptional(category) {
		optional = category
	}
	ids, err := p.prefs.NotificationOptOuts(ctx, domain.ChannelPush, optional)
	if err != nil {
		p.log.Warn("push: preference lookup failed", "err", err, "category", category)
		if optional != "" {
			return nil
		}
		return subs
	}
	if len(ids) == 0 {
		return subs
	}
	skip := make(map[string]bool, len(ids))
	for _, id := range ids {
		skip[id] = true
	}
	out := make([]domain.PushSubscription, 0, len(subs))
	for _, s := range subs {
		if !skip[s.MemberID] {
			out = append(out, s)
		}
	}
	return out
}

func (p *PushSender) send(ctx context.Context, subs []domain.PushSubscription, payload PushPayload) {
	body, _ := json.Marshal(payload)
	var expo []domain.PushSubscription
	for _, s := range subs {
		switch s.Platform {
		case domain.PushWeb:
			p.sendWeb(ctx, s, body)
		case domain.PushExpo:
			expo = append(expo, s)
		}
	}
	for start := 0; start < len(expo); start += expoBatchSize {
		p.sendExpoBatch(ctx, expo[start:min(start+expoBatchSize, len(expo))], payload, true)
	}
}

func (p *PushSender) sendWeb(ctx context.Context, s domain.PushSubscription, body []byte) {
	if !p.webEnabled() {
		return
	}
	resp, err := webpush.SendNotificationWithContext(ctx, body, &webpush.Subscription{
		Endpoint: s.Endpoint,
		Keys:     webpush.Keys{P256dh: s.P256dh, Auth: s.Auth},
	}, &webpush.Options{
		Subscriber:      vapidSubscriber(p.cfg.VAPIDSubject),
		VAPIDPublicKey:  p.cfg.VAPIDPublic,
		VAPIDPrivateKey: p.cfg.VAPIDPrivate,
		TTL:             120,
		Urgency:         webpush.UrgencyHigh,
	})
	if err != nil {
		p.log.Warn("push: web send", "err", err)
		return
	}
	defer func() { _ = resp.Body.Close() }()
	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
		// A gone/expired endpoint is pruned so we stop trying it.
		_ = p.repo.DeleteByID(ctx, s.MemberID, s.ID)
	case resp.StatusCode >= 300:
		// 400/403/413/429: the push service refused the alert (a bad VAPID
		// JWT, an oversized or throttled message). Say so, by host only.
		p.log.Warn("push: web push refused", "status", resp.StatusCode, "host", endpointHost(s.Endpoint), "memberId", s.MemberID)
	}
}

// vapidSubscriber is the contact webpush-go signs into the VAPID JWT. The
// library prefixes "mailto:" to anything that isn't an https: URL, so a
// "mailto:" subject must be passed bare — else the claim reads
// "mailto:mailto:…", which Apple's push service rejects.
func vapidSubscriber(subject string) string {
	return strings.TrimPrefix(subject, "mailto:")
}

func endpointHost(raw string) string {
	if u, err := url.Parse(raw); err == nil {
		return u.Hostname()
	}
	return ""
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

// expoTicket is Expo's per-message answer, in message order. A
// DeviceNotRegistered error means the app is gone and the token must go too.
type expoTicket struct {
	Status  string `json:"status"` // ok | error
	Message string `json:"message"`
	Details struct {
		Error string `json:"error"`
	} `json:"details"`
}

// expoRequestError is a request-level refusal (the whole batch failed).
type expoRequestError struct {
	Code    string          `json:"code"`
	Message string          `json:"message"`
	Details json.RawMessage `json:"details"`
}

type expoResponse struct {
	Data   []expoTicket       `json:"data"`
	Errors []expoRequestError `json:"errors"`
}

func expoMessages(subs []domain.PushSubscription, payload PushPayload) []expoMessage {
	// iOS critical alerts (ring through silent/DND) require the critical-alert
	// entitlement on the app; the flag is harmless without it.
	var sound any = "default"
	if payload.Ring {
		sound = map[string]any{"critical": true, "name": "default", "volume": 1.0}
	}
	msgs := make([]expoMessage, 0, len(subs))
	for _, s := range subs {
		msgs = append(msgs, expoMessage{
			To: s.ExpoToken, Title: payload.Title, Body: payload.Body, Sound: sound,
			Priority: "high", ChannelID: "alerts",
			Data: map[string]any{"url": payload.URL, "severity": payload.Severity, "kind": payload.Kind, "ring": payload.Ring},
		})
	}
	return msgs
}

// sendExpoBatch posts one batch (≤ expoBatchSize). When Expo refuses it
// because the tokens belong to more than one Expo project
// (PUSH_TOO_MANY_EXPERIENCE_IDS — e.g. a stray token from another app), the
// batch is split per project and each part sent once more, so one foreign
// token can't silence everyone else's alert.
func (p *PushSender) sendExpoBatch(ctx context.Context, subs []domain.PushSubscription, payload PushPayload, splitProjects bool) {
	res, status, err := p.postExpo(ctx, expoMessages(subs, payload))
	if err != nil {
		p.log.Warn("push: expo send", "err", err)
		return
	}
	if groups := res.projectGroups(); splitProjects && len(groups) > 1 {
		for _, tokens := range groups {
			p.sendExpoBatch(ctx, subsWithTokens(subs, tokens), payload, false)
		}
		return
	}
	if status >= 300 || len(res.Errors) > 0 {
		p.log.Warn("push: expo refused the batch", "status", status, "codes", res.errorCodes(), "size", len(subs))
		return
	}
	p.pruneDeadExpoTokens(ctx, subs, res.Data)
}

func (p *PushSender) postExpo(ctx context.Context, msgs []expoMessage) (expoResponse, int, error) {
	var res expoResponse
	buf, err := json.Marshal(msgs)
	if err != nil {
		return res, 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.expoURL, bytes.NewReader(buf))
	if err != nil {
		return res, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		return res, 0, err
	}
	defer func() { _ = resp.Body.Close() }()
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&res); err != nil && resp.StatusCode < 300 {
		return res, resp.StatusCode, fmt.Errorf("expo response: %w", err)
	}
	return res, resp.StatusCode, nil
}

// projectGroups returns Expo's per-project token grouping from a
// PUSH_TOO_MANY_EXPERIENCE_IDS refusal, or nil for any other answer.
func (r expoResponse) projectGroups() [][]string {
	for _, e := range r.Errors {
		if e.Code != "PUSH_TOO_MANY_EXPERIENCE_IDS" {
			continue
		}
		var byProject map[string][]string
		if json.Unmarshal(e.Details, &byProject) != nil {
			return nil
		}
		groups := make([][]string, 0, len(byProject))
		for _, tokens := range byProject {
			if len(tokens) > 0 {
				groups = append(groups, tokens)
			}
		}
		return groups
	}
	return nil
}

func (r expoResponse) errorCodes() []string {
	codes := make([]string, 0, len(r.Errors))
	for _, e := range r.Errors {
		codes = append(codes, e.Code)
	}
	return codes
}

func subsWithTokens(subs []domain.PushSubscription, tokens []string) []domain.PushSubscription {
	want := make(map[string]bool, len(tokens))
	for _, t := range tokens {
		want[t] = true
	}
	out := make([]domain.PushSubscription, 0, len(tokens))
	for _, s := range subs {
		if want[s.ExpoToken] {
			out = append(out, s)
		}
	}
	return out
}

// pruneDeadExpoTokens drops the tokens Expo reports as no longer registered.
// Tickets come back in message order.
func (p *PushSender) pruneDeadExpoTokens(ctx context.Context, subs []domain.PushSubscription, tickets []expoTicket) {
	failed := 0
	for i, t := range tickets {
		if i >= len(subs) || t.Status != "error" {
			continue
		}
		if t.Details.Error == "DeviceNotRegistered" {
			_ = p.repo.DeleteByID(ctx, subs[i].MemberID, subs[i].ID)
			continue
		}
		failed++
	}
	if failed > 0 {
		p.log.Warn("push: expo rejected some messages", "count", failed)
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
