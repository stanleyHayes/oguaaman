package service

import (
	"context"
	"strings"
	"testing"
)

// C3: a promotion or business plan started in the creator studio returns the
// payer there; anything else keeps the portal callback.
func TestReturnToCreatorCallbacks(t *testing.T) {
	ctx := context.Background()
	promos, _, _ := promosFixture(true, 7_000)
	promos.WithCreatorURL("https://creator.test/")
	auth, _, ref, err := promos.StartPromotionFrom(ctx, "b-1", "m-yaw", "yaw@example.com", 7, ReturnToCreator)
	if err != nil || !strings.HasSuffix(auth, "?cb=https://creator.test/work?promo_ref="+ref) {
		t.Fatalf("creator promotion callback: %q %v", auth, err)
	}
	auth, _, ref, _ = promos.StartPromotionFrom(ctx, "b-1", "m-yaw", "yaw@example.com", 7, "elsewhere")
	if !strings.HasSuffix(auth, "?cb=http://localhost:5173/me?promo_ref="+ref) {
		t.Fatalf("portal promotion callback: %q", auth)
	}

	subs, _, _ := subsFixture(true, 5_000)
	subs.plans = creatorPlans()
	auth, _, ref, err = subs.StartSubscriptionFrom(ctx, "castle-view-guesthouse", "m-yaw", "yaw@example.com", "supporter", ReturnToCreator)
	if err != nil || !strings.HasSuffix(auth, "?cb=http://localhost:5175/grow?sub_ref="+ref) {
		t.Fatalf("creator subscription callback: %q %v", auth, err)
	}
	auth, _, ref, _ = subs.StartSubscription(ctx, "castle-view-guesthouse", "m-yaw", "yaw@example.com", "supporter")
	if !strings.HasSuffix(auth, "?cb=http://localhost:5173/business/castle-view-guesthouse?sub_ref="+ref) {
		t.Fatalf("portal subscription callback: %q", auth)
	}
}
