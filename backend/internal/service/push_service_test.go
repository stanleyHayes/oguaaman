package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

type fakePushRepo struct {
	subs map[string]domain.PushSubscription
}

func newFakePushRepo() *fakePushRepo {
	return &fakePushRepo{subs: map[string]domain.PushSubscription{}}
}

func (f *fakePushRepo) Upsert(_ context.Context, s domain.PushSubscription) error {
	f.subs[s.ID] = s
	return nil
}
func (f *fakePushRepo) DeleteByID(_ context.Context, memberID, id string) error {
	if s, ok := f.subs[id]; ok && s.MemberID == memberID {
		delete(f.subs, id)
	}
	return nil
}
func (f *fakePushRepo) All(_ context.Context) ([]domain.PushSubscription, error) {
	out := make([]domain.PushSubscription, 0, len(f.subs))
	for _, s := range f.subs {
		out = append(out, s)
	}
	return out, nil
}
func (f *fakePushRepo) ByMembers(_ context.Context, ids []string) ([]domain.PushSubscription, error) {
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

func TestPushRegister_Validation(t *testing.T) {
	repo := newFakePushRepo()
	p := NewPushSender(repo, PushConfig{}, nil)
	ctx := context.Background()

	// Web without keys → error.
	if err := p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: domain.PushWeb, Endpoint: "https://push/x"}); err == nil {
		t.Error("web sub without keys should fail")
	}
	// Web with keys → stored, id = endpoint.
	if err := p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: domain.PushWeb, Endpoint: "https://push/x", P256dh: "k", Auth: "a"}); err != nil {
		t.Fatalf("valid web sub: %v", err)
	}
	if _, ok := repo.subs["https://push/x"]; !ok {
		t.Error("web sub not stored under endpoint id")
	}
	// Expo needs a token.
	if err := p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: domain.PushExpo}); err == nil {
		t.Error("expo sub without token should fail")
	}
	if err := p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: domain.PushExpo, ExpoToken: "ExponentPushToken[abc]"}); err != nil {
		t.Fatalf("valid expo sub: %v", err)
	}
	if _, ok := repo.subs["ExponentPushToken[abc]"]; !ok {
		t.Error("expo sub not stored under token id")
	}
	// Unknown platform.
	if err := p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: "sms"}); err == nil {
		t.Error("unknown platform should fail")
	}
}

func TestPushSubjectNormalised(t *testing.T) {
	p := NewPushSender(newFakePushRepo(), PushConfig{VAPIDSubject: "hello@oguaa.gh"}, nil)
	if p.cfg.VAPIDSubject != "mailto:hello@oguaa.gh" {
		t.Errorf("subject = %q, want mailto:-prefixed", p.cfg.VAPIDSubject)
	}
}

func TestPushUnregister(t *testing.T) {
	repo := newFakePushRepo()
	p := NewPushSender(repo, PushConfig{}, nil)
	ctx := context.Background()
	_ = p.Register(ctx, domain.PushSubscription{MemberID: "m1", Platform: domain.PushExpo, ExpoToken: "tok"})
	// Another member can't delete it.
	_ = p.Unregister(ctx, "m2", "tok")
	if _, ok := repo.subs["tok"]; !ok {
		t.Error("sub should survive delete by a non-owner")
	}
	_ = p.Unregister(ctx, "m1", "tok")
	if _, ok := repo.subs["tok"]; ok {
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
}
