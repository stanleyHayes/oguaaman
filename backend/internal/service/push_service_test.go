package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

type fakePushRepo struct {
	mu   sync.Mutex
	subs map[string]domain.PushSubscription
}

func newFakePushRepo() *fakePushRepo {
	return &fakePushRepo{subs: map[string]domain.PushSubscription{}}
}

func (f *fakePushRepo) Upsert(_ context.Context, s domain.PushSubscription) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.subs[s.ID] = s
	return nil
}
func (f *fakePushRepo) DeleteByID(_ context.Context, memberID, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if s, ok := f.subs[id]; ok && s.MemberID == memberID {
		delete(f.subs, id)
	}
	return nil
}
func (f *fakePushRepo) DeleteByMember(_ context.Context, memberID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	for id, s := range f.subs {
		if s.MemberID == memberID {
			delete(f.subs, id)
		}
	}
	return nil
}
func (f *fakePushRepo) All(_ context.Context) ([]domain.PushSubscription, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]domain.PushSubscription, 0, len(f.subs))
	for _, s := range f.subs {
		out = append(out, s)
	}
	return out, nil
}
func (f *fakePushRepo) ByMembers(_ context.Context, ids []string) ([]domain.PushSubscription, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	want := map[string]bool{}
	for _, id := range ids {
		want[id] = true
	}
	out := []domain.PushSubscription{}
	for _, s := range f.subs {
		if want[s.MemberID] {
			out = append(out, s)
		}
	}
	return out, nil
}

func (f *fakePushRepo) has(id string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.subs[id]
	return ok
}

func expoToken(name string) string { return "ExponentPushToken[" + name + "]" }

func TestPushRegister_Validation(t *testing.T) {
	repo := newFakePushRepo()
	p := NewPushSender(repo, PushConfig{}, nil)
	ctx := context.Background()

	// Web without keys → error.
	if err := p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: domain.PushWeb, Endpoint: "https://fcm.googleapis.com/x"}); err == nil {
		t.Error("web sub without keys should fail")
	}
	// Web with keys → stored, id = endpoint.
	if err := p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: domain.PushWeb, Endpoint: "https://fcm.googleapis.com/x", P256dh: "k", Auth: "a"}); err != nil {
		t.Fatalf("valid web sub: %v", err)
	}
	if !repo.has("https://fcm.googleapis.com/x") {
		t.Error("web sub not stored under endpoint id")
	}
	// Expo needs a token, and a real Expo token at that.
	if err := p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: domain.PushExpo}); err == nil {
		t.Error("expo sub without token should fail")
	}
	for _, bad := range []string{"x1", "tok", "ExponentPushToken[]", "ExponentPushToken[a b]", "https://evil.example/x"} {
		if err := p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: domain.PushExpo, ExpoToken: bad}); err == nil {
			t.Errorf("malformed expo token %q should be refused", bad)
		}
	}
	for _, good := range []string{"ExponentPushToken[abc]", "ExpoPushToken[xyz-123_Q]"} {
		if err := p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: domain.PushExpo, ExpoToken: good}); err != nil {
			t.Fatalf("valid expo sub %q: %v", good, err)
		}
		if !repo.has(good) {
			t.Errorf("expo sub not stored under token id %q", good)
		}
	}
	// Unknown platform.
	if err := p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: "sms"}); err == nil {
		t.Error("unknown platform should fail")
	}
}

// One member can hold at most maxDevicesPerMember registrations.
func TestPushRegister_capsDevicesPerMember(t *testing.T) {
	repo := newFakePushRepo()
	p := NewPushSender(repo, PushConfig{}, nil)
	ctx := context.Background()
	for i := 0; i < maxDevicesPerMember+5; i++ {
		if err := p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: domain.PushExpo, ExpoToken: expoToken(fmt.Sprintf("dev%02d", i))}); err != nil {
			t.Fatalf("register %d: %v", i, err)
		}
	}
	subs, _ := repo.ByMembers(ctx, []string{"m1"})
	if len(subs) != maxDevicesPerMember {
		t.Errorf("member holds %d devices, want %d", len(subs), maxDevicesPerMember)
	}
	if !repo.has(expoToken(fmt.Sprintf("dev%02d", maxDevicesPerMember+4))) {
		t.Error("the newest registration must survive the cap")
	}
}

func TestPushEndpointSSRFGuard(t *testing.T) {
	repo := newFakePushRepo()
	p := NewPushSender(repo, PushConfig{}, nil)
	ctx := context.Background()
	web := func(ep string) domain.PushSubscription {
		return domain.PushSubscription{MemberID: "m1", Platform: domain.PushWeb, Endpoint: ep, P256dh: "k", Auth: "a"}
	}
	// Rejected: internal / arbitrary hosts (SSRF vectors).
	for _, bad := range []string{
		"http://fcm.googleapis.com/x",              // not https
		"https://169.254.169.254/latest/meta-data", // cloud metadata
		"https://localhost:8080/api/x",
		"https://evil.example.com/x",
		"https://fcm.googleapis.com.evil.com/x", // suffix trick
	} {
		if err := p.Register(ctx, web(bad)); err == nil {
			t.Errorf("endpoint %q should be rejected", bad)
		}
	}
	// Allowed: real push services (incl. subdomains).
	for _, ok := range []string{
		"https://fcm.googleapis.com/fcm/send/abc",
		"https://updates.push.services.mozilla.com/wpush/v2/xyz",
		"https://web.push.apple.com/abc",
		"https://ABC.notify.windows.com/w/?token=1",
	} {
		if err := p.Register(ctx, web(ok)); err != nil {
			t.Errorf("endpoint %q should be allowed: %v", ok, err)
		}
	}
}

func TestPushSubjectNormalised(t *testing.T) {
	p := NewPushSender(newFakePushRepo(), PushConfig{VAPIDSubject: "hello@oguaa.gh"}, nil)
	if p.cfg.VAPIDSubject != "mailto:hello@oguaa.gh" {
		t.Errorf("subject = %q, want mailto:-prefixed", p.cfg.VAPIDSubject)
	}
}

// F123: webpush-go adds "mailto:" itself, so the subscriber must be bare.
func TestVAPIDSubscriberIsNotDoublePrefixed(t *testing.T) {
	cases := map[string]string{
		"mailto:hello@oguaa.gh": "hello@oguaa.gh",
		"https://oguaa.gh":      "https://oguaa.gh",
	}
	for in, want := range cases {
		if got := vapidSubscriber(in); got != want {
			t.Errorf("vapidSubscriber(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPushUnregister(t *testing.T) {
	repo := newFakePushRepo()
	p := NewPushSender(repo, PushConfig{}, nil)
	ctx := context.Background()
	tok := expoToken("tok")
	_ = p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: domain.PushExpo, ExpoToken: tok})
	// Another member can't delete it.
	_ = p.Unregister(ctx, "m2", tok)
	if !repo.has(tok) {
		t.Error("sub should survive delete by a non-owner")
	}
	_ = p.Unregister(ctx, "m1", tok)
	if repo.has(tok) {
		t.Error("owner delete should remove the sub")
	}
}

// A nil PushSender (push not configured) must never panic.
func TestNilPushSenderSafe(t *testing.T) {
	var p *PushSender
	if p.PublicKey() != "" {
		t.Error("nil sender PublicKey should be empty")
	}
	p.BroadcastAll(context.Background(), PushPayload{Title: "x"})
	if err := p.Unregister(context.Background(), "m", "id"); err != nil {
		t.Errorf("nil sender Unregister: %v", err)
	}
	if p.WithPreferences(nil) != nil {
		t.Error("WithPreferences on a nil sender stays nil")
	}
}

// fakeExpo is an Expo push endpoint that enforces the 100-message limit and
// the one-project rule, and reports DeviceNotRegistered for "dead" tokens.
type fakeExpo struct {
	mu        sync.Mutex
	batches   [][]string
	delivered map[string]int
}

func (f *fakeExpo) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var msgs []expoMessage
	if err := json.NewDecoder(r.Body).Decode(&msgs); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	tokens := make([]string, 0, len(msgs))
	projects := map[string][]string{}
	for _, m := range msgs {
		tokens = append(tokens, m.To)
		project := "@oguaa/app"
		if strings.Contains(m.To, "foreign") {
			project = "@someone/else"
		}
		projects[project] = append(projects[project], m.To)
	}
	f.mu.Lock()
	f.batches = append(f.batches, tokens)
	f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	if len(msgs) > expoBatchSize {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"errors": []map[string]any{{"code": "PUSH_TOO_MANY_NOTIFICATIONS"}}})
		return
	}
	if len(projects) > 1 {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"errors": []map[string]any{{"code": "PUSH_TOO_MANY_EXPERIENCE_IDS", "details": projects}}})
		return
	}
	tickets := make([]map[string]any, 0, len(msgs))
	f.mu.Lock()
	for _, tok := range tokens {
		if strings.Contains(tok, "dead") {
			tickets = append(tickets, map[string]any{"status": "error", "message": "gone", "details": map[string]any{"error": "DeviceNotRegistered"}})
			continue
		}
		f.delivered[tok]++
		tickets = append(tickets, map[string]any{"status": "ok", "id": "t-" + tok})
	}
	f.mu.Unlock()
	_ = json.NewEncoder(w).Encode(map[string]any{"data": tickets})
}

func expoFixture(t *testing.T, n int, names ...string) (*PushSender, *fakePushRepo, *fakeExpo) {
	t.Helper()
	fe := &fakeExpo{delivered: map[string]int{}}
	srv := httptest.NewServer(fe)
	t.Cleanup(srv.Close)
	repo := newFakePushRepo()
	for i := 0; i < n; i++ {
		tok := expoToken(fmt.Sprintf("dev%03d", i))
		repo.subs[tok] = domain.PushSubscription{ID: tok, MemberID: fmt.Sprintf("m%03d", i), Platform: domain.PushExpo, ExpoToken: tok}
	}
	for _, name := range names {
		tok := expoToken(name)
		repo.subs[tok] = domain.PushSubscription{ID: tok, MemberID: "m-" + name, Platform: domain.PushExpo, ExpoToken: tok}
	}
	p := NewPushSender(repo, PushConfig{}, nil)
	p.expoURL = srv.URL
	return p, repo, fe
}

// F109/F115: 250 devices go out in batches of ≤ 100, every live device gets
// the alert, and a DeviceNotRegistered token is pruned.
func TestBroadcastAll_expoBatchesAndPrunesDeadTokens(t *testing.T) {
	p, repo, fe := expoFixture(t, 249, "dead")
	p.BroadcastAll(context.Background(), PushPayload{Title: "Safety alert", Kind: "incident", Severity: "critical", Ring: true})

	total := 0
	for _, b := range fe.batches {
		if len(b) > expoBatchSize {
			t.Errorf("a batch of %d exceeds Expo's limit", len(b))
		}
		total += len(b)
	}
	if len(fe.batches) != 3 || total != 250 {
		t.Errorf("batches = %d carrying %d messages; want 3 carrying 250", len(fe.batches), total)
	}
	if len(fe.delivered) != 249 {
		t.Errorf("delivered to %d devices, want 249", len(fe.delivered))
	}
	if repo.has(expoToken("dead")) {
		t.Error("a DeviceNotRegistered token must be pruned")
	}
	if !repo.has(expoToken("dev000")) {
		t.Error("live tokens must be kept")
	}
}

// One token from another Expo project must not silence everyone else.
func TestBroadcastAll_splitsMixedExpoProjects(t *testing.T) {
	p, _, fe := expoFixture(t, 5, "foreign-1")
	p.BroadcastAll(context.Background(), PushPayload{Title: "Safety alert", Kind: "directive"})
	if len(fe.delivered) != 6 {
		t.Errorf("delivered to %d devices, want all 6 after splitting by project", len(fe.delivered))
	}
	for tok, n := range fe.delivered {
		if n != 1 {
			t.Errorf("%s got %d copies", tok, n)
		}
	}
}

// fixedOptOuts reports a fixed opt-out list.
type fixedOptOuts struct {
	ids                     []string
	gotChannel, gotCategory string
}

func (f *fixedOptOuts) NotificationOptOuts(_ context.Context, channel, category string) ([]string, error) {
	f.gotChannel, f.gotCategory = channel, category
	return f.ids, nil
}

// K14: members who switched push off are skipped; safety ignores category
// opt-outs (only the channel counts); product news is never broadcast.
func TestBroadcastAll_honoursPushPreferences(t *testing.T) {
	p, _, fe := expoFixture(t, 3)
	prefs := &fixedOptOuts{ids: []string{"m001"}}
	p.WithPreferences(prefs)

	p.BroadcastAll(context.Background(), PushPayload{Title: "Safety alert", Kind: "incident"})
	if fe.delivered[expoToken("dev001")] != 0 || len(fe.delivered) != 2 {
		t.Errorf("delivered = %v; the opted-out member must be skipped", fe.delivered)
	}
	if prefs.gotChannel != domain.ChannelPush || prefs.gotCategory != "" {
		t.Errorf("safety asked (%q, %q); want the push channel only", prefs.gotChannel, prefs.gotCategory)
	}

	before := len(fe.batches)
	p.BroadcastAll(context.Background(), PushPayload{Title: "New feature!", Kind: "product"})
	if len(fe.batches) != before {
		t.Error("product news must never be broadcast")
	}
}
