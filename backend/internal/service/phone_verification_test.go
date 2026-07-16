package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

type phoneVerifyRepo struct {
	stubMembers
	m *domain.Member
}

func (r *phoneVerifyRepo) ByID(context.Context, string) (*domain.Member, error) { return r.m, nil }
func (r *phoneVerifyRepo) ByIdentifier(context.Context, string) (*domain.Member, error) {
	return r.m, nil
}
func (r *phoneVerifyRepo) SetPhoneVerification(_ context.Context, _ string, codeHash, expiresAt string) error {
	r.m.PhoneVerified = false
	r.m.PhoneVerificationCodeHash = codeHash
	r.m.PhoneVerificationExpiresAt = expiresAt
	return nil
}
func (r *phoneVerifyRepo) SetPhoneVerified(_ context.Context, _ string, verified bool) error {
	r.m.PhoneVerified = verified
	if verified {
		r.m.PhoneVerificationCodeHash = ""
		r.m.PhoneVerificationExpiresAt = ""
	}
	return nil
}

func TestPhoneVerificationFlow(t *testing.T) {
	ctx := context.Background()
	repo := &phoneVerifyRepo{m: &domain.Member{ID: "m-1", Phone: "+233240000001", Email: "ama@oguaa.test", PhoneVerified: false}}
	svc := NewAuthService(repo, "secret")

	member, code, expiresAt, err := svc.StartPhoneVerification(ctx, "m-1")
	if err != nil {
		t.Fatalf("StartPhoneVerification: %v", err)
	}
	if member.PhoneVerified {
		t.Fatal("verification should start as unverified")
	}
	if code == "" || expiresAt == "" {
		t.Fatal("verification code and expiry should be returned")
	}
	if repo.m.PhoneVerificationCodeHash == "" {
		t.Fatal("verification hash should be stored")
	}

	if _, err := svc.ConfirmPhoneVerification(ctx, "m-1", "000000"); !errors.Is(err, ErrInvalidPhoneVerificationCode) {
		t.Fatalf("ConfirmPhoneVerification wrong code = %v, want ErrInvalidPhoneVerificationCode", err)
	}

	confirmed, err := svc.ConfirmPhoneVerification(ctx, "m-1", code)
	if err != nil {
		t.Fatalf("ConfirmPhoneVerification: %v", err)
	}
	if !confirmed.PhoneVerified {
		t.Fatal("member should be marked verified after confirming the code")
	}
	if repo.m.PhoneVerificationCodeHash != "" || repo.m.PhoneVerificationExpiresAt != "" {
		t.Fatal("verification state should be cleared after success")
	}
}
