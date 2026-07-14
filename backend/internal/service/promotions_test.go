package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// fakePromos is an in-memory PromotionRepository.
type fakePromos struct{ rows []domain.Promotion }

func (f *fakePromos) Insert(_ context.Context, p domain.Promotion) error {
	f.rows = append(f.rows, p)
	return nil
}
func (f *fakePromos) ByReference(_ context.Context, ref string) (*domain.Promotion, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			return &f.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "promotion"}
}
func (f *fakePromos) UpdateStatus(_ context.Context, ref, status, at string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			f.rows[i].Status = status
			if status == domain.PledgeSuccess {
				f.rows[i].ConfirmedAt = at
			}
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "promotion"}
}
func (f *fakePromos) All(context.Context) ([]domain.Promotion, error) { return f.rows, nil }
func (f *fakePromos) ByMember(_ context.Context, memberID string) ([]domain.Promotion, error) {
	out := []domain.Promotion{}
	for _, p := range f.rows {
		if p.MemberID == memberID {
			out = append(out, p)
		}
	}
	return out, nil
}

func promosFixture(verifyOK bool, verifyAmount int64) (*PromotionsService, *fakeRepo, *fakePromos) {
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "b-1", Slug: "castle-view-guesthouse", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusApproved, Title: "Castle View Guesthouse", Details: map[string]any{}},
		{ID: "b-2", Slug: "oguaa-prints", Type: domain.TypeBusiness, OwnerID: "m-yaw", Status: domain.StatusPending, Title: "Oguaa Prints", Details: map[string]any{}},
	}}
	promos := &fakePromos{}
	ps := &fakePaystack{verifyOK: verifyOK, verifyAmount: verifyAmount}
	svc := NewPromotionsService(listings, promos, ps, "http://localhost:5173")
	return svc, listings, promos
}

func TestStartPromotion_ownerOnly(t *testing.T) {
	svc, _, _ := promosFixture(true, 0)
	ctx := context.Background()

	// A stranger may not promote someone else's listing.
	_, _, err := svc.StartPromotion(ctx, "b-1", "m-stranger", "a@b.c", 7)
	var fb *domain.ForbiddenError
	if !errors.As(err, &fb) {
		t.Errorf("non-owner: expected ForbiddenError, got %v", err)
	}
	// An unapproved listing can't be promoted either.
	if _, _, err := svc.StartPromotion(ctx, "b-2", "m-yaw", "a@b.c", 7); !errors.As(err, &fb) {
		t.Errorf("unapproved: expected ForbiddenError, got %v", err)
	}
	// The owner can.
	_, ref, err := svc.StartPromotion(ctx, "b-1", "m-yaw", "yaw@oguaa.test", 7)
	if err != nil {
		t.Fatalf("owner promote failed: %v", err)
	}
	if !strings.HasPrefix(ref, "pro-") {
		t.Errorf("reference = %q, want pro-<ts>", ref)
	}
	if _, _, err := svc.StartPromotion(ctx, "b-1", "m-yaw", "", 7); err == nil {
		t.Error("expected a missing email to be rejected")
	}
}

func TestStartPromotion_rejectsInvalidDays(t *testing.T) {
	svc, _, promos := promosFixture(true, 0)
	ctx := context.Background()
	for _, days := range []int{0, 1, 10, 60, -7} {
		if _, _, err := svc.StartPromotion(ctx, "b-1", "m-yaw", "yaw@oguaa.test", days); !errors.Is(err, ErrPromotionDays) {
			t.Errorf("days=%d: expected ErrPromotionDays, got %v", days, err)
		}
	}
	if len(promos.rows) != 0 {
		t.Errorf("invalid days should not record a promotion, got %d rows", len(promos.rows))
	}
	for _, days := range []int{7, 14, 30} {
		if _, _, err := svc.StartPromotion(ctx, "b-1", "m-yaw", "yaw@oguaa.test", days); err != nil {
			t.Errorf("days=%d: unexpected error %v", days, err)
		}
	}
}

func TestStartPromotion_pricesAtTenCedisPerDay(t *testing.T) {
	svc, _, promos := promosFixture(true, 0)
	ctx := context.Background()
	if _, _, err := svc.StartPromotion(ctx, "b-1", "m-yaw", "yaw@oguaa.test", 30); err != nil {
		t.Fatalf("StartPromotion failed: %v", err)
	}
	if promos.rows[0].AmountPesewas != 30_000 {
		t.Errorf("amount = %d pesewas, want 30000 (30 days × GH₵ 10)", promos.rows[0].AmountPesewas)
	}
}

func TestConfirmPromotion_setsFeaturedUntil(t *testing.T) {
	svc, listings, promos := promosFixture(true, 7_000)
	ctx := context.Background()

	_, ref, err := svc.StartPromotion(ctx, "b-1", "m-yaw", "yaw@oguaa.test", 7)
	if err != nil {
		t.Fatalf("StartPromotion failed: %v", err)
	}
	if promos.rows[0].Status != domain.PledgePending {
		t.Errorf("new promotion status = %q, want pending", promos.rows[0].Status)
	}
	promo, err := svc.ConfirmPromotion(ctx, ref)
	if err != nil {
		t.Fatalf("ConfirmPromotion failed: %v", err)
	}
	if promo.Status != domain.PledgeSuccess {
		t.Errorf("confirmed status = %q, want success", promo.Status)
	}
	until, err := time.Parse(time.RFC3339, listings.listings[0].FeaturedUntil)
	if err != nil {
		t.Fatalf("featuredUntil %q is not RFC3339", listings.listings[0].FeaturedUntil)
	}
	if d := until.Sub(time.Now().UTC()); d < 6*24*time.Hour || d > 8*24*time.Hour {
		t.Errorf("featuredUntil is %v from now, want ~7 days", d)
	}
	if !listings.listings[0].Featured {
		t.Error("listing should be featured after confirmation")
	}

	// Idempotent: confirming again returns the same promotion, expiry unchanged.
	until1 := listings.listings[0].FeaturedUntil
	if _, err := svc.ConfirmPromotion(ctx, ref); err != nil {
		t.Fatalf("second confirm errored: %v", err)
	}
	if listings.listings[0].FeaturedUntil != until1 {
		t.Errorf("double-confirm changed the expiry: %q → %q", until1, listings.listings[0].FeaturedUntil)
	}
}

func TestConfirmPromotion_stacksOntoCurrentPeriod(t *testing.T) {
	svc, listings, _ := promosFixture(true, 14_000)
	ctx := context.Background()

	// The listing is already featured until 10 days from now; a new promotion
	// must extend from that date, not restart from today.
	existing := time.Now().UTC().Add(10 * 24 * time.Hour).Format(time.RFC3339)
	listings.listings[0].Featured = true
	listings.listings[0].FeaturedUntil = existing

	_, ref, err := svc.StartPromotion(ctx, "b-1", "m-yaw", "yaw@oguaa.test", 14)
	if err != nil {
		t.Fatalf("StartPromotion failed: %v", err)
	}
	if _, err := svc.ConfirmPromotion(ctx, ref); err != nil {
		t.Fatalf("ConfirmPromotion failed: %v", err)
	}
	want, _ := time.Parse(time.RFC3339, existing)
	want = want.Add(14 * 24 * time.Hour)
	got, _ := time.Parse(time.RFC3339, listings.listings[0].FeaturedUntil)
	if !got.Equal(want) {
		t.Errorf("stacked featuredUntil = %q, want %q (existing + 14 days)", listings.listings[0].FeaturedUntil, want.Format(time.RFC3339))
	}
}

func TestConfirmPromotion_failedVerification(t *testing.T) {
	svc, listings, promos := promosFixture(false, 0)
	ctx := context.Background()
	_, ref, err := svc.StartPromotion(ctx, "b-1", "m-yaw", "yaw@oguaa.test", 7)
	if err != nil {
		t.Fatalf("StartPromotion failed: %v", err)
	}
	if _, err := svc.ConfirmPromotion(ctx, ref); err == nil {
		t.Error("expected confirm to fail when verification fails")
	}
	if promos.rows[0].Status != domain.PledgeFailed {
		t.Errorf("promotion status = %q, want failed", promos.rows[0].Status)
	}
	if listings.listings[0].Featured {
		t.Error("failed promotion should not feature the listing")
	}
}
