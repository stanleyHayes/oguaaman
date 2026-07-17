package service

import (
	"context"
	"errors"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
)

type pwResetRepo struct {
	stubMembers
	m *domain.Member
}

func (r *pwResetRepo) ByIdentifier(_ context.Context, identifier string) (*domain.Member, error) {
	if r.m == nil || (identifier != r.m.Email && identifier != r.m.Phone) {
		return nil, &domain.NotFoundError{Entity: "member"}
	}
	return r.m, nil
}
func (r *pwResetRepo) SetPasswordReset(_ context.Context, _ string, codeHash, expiresAt string) error {
	r.m.PasswordResetCodeHash = codeHash
	r.m.PasswordResetExpiresAt = expiresAt
	return nil
}
func (r *pwResetRepo) SetPasswordHash(_ context.Context, _ string, hash string) error {
	r.m.PasswordHash = hash
	return nil
}

func TestPasswordResetFlow(t *testing.T) {
	ctx := context.Background()
	repo := &pwResetRepo{m: &domain.Member{ID: "m-1", Email: "ama@oguaa.test", Phone: "+233240000001"}}
	svc := NewAuthService(repo, "secret")

	member, code, err := svc.StartPasswordReset(ctx, "ama@oguaa.test")
	if err != nil {
		t.Fatalf("StartPasswordReset: %v", err)
	}
	if member == nil || code == "" {
		t.Fatal("a reset member and plaintext code should be returned")
	}
	if repo.m.PasswordResetCodeHash == "" || repo.m.PasswordResetExpiresAt == "" {
		t.Fatal("reset hash and expiry should be stored")
	}

	// Wrong code is rejected.
	if err := svc.ConfirmPasswordReset(ctx, "ama@oguaa.test", "000000", "newsecret1"); !errors.Is(err, ErrInvalidResetCode) {
		t.Fatalf("ConfirmPasswordReset wrong code = %v, want ErrInvalidResetCode", err)
	}
	// Short password is rejected.
	if err := svc.ConfirmPasswordReset(ctx, "ama@oguaa.test", code, "short"); !errors.Is(err, ErrResetPasswordTooShort) {
		t.Fatalf("ConfirmPasswordReset short password = %v, want ErrResetPasswordTooShort", err)
	}

	// Correct code + valid password sets the new hash and clears reset state.
	if err := svc.ConfirmPasswordReset(ctx, "ama@oguaa.test", code, "brand-new-pass"); err != nil {
		t.Fatalf("ConfirmPasswordReset: %v", err)
	}
	if bcrypt.CompareHashAndPassword([]byte(repo.m.PasswordHash), []byte("brand-new-pass")) != nil {
		t.Fatal("password hash should match the new password")
	}
	if repo.m.PasswordResetCodeHash != "" || repo.m.PasswordResetExpiresAt != "" {
		t.Fatal("reset state should be cleared after success")
	}
	// Code can't be reused once cleared.
	if err := svc.ConfirmPasswordReset(ctx, "ama@oguaa.test", code, "brand-new-pass"); !errors.Is(err, ErrResetNotStarted) {
		t.Fatalf("reused code = %v, want ErrResetNotStarted", err)
	}
}

func TestStartPasswordResetUnknownAccount(t *testing.T) {
	ctx := context.Background()
	repo := &pwResetRepo{m: &domain.Member{ID: "m-1", Email: "ama@oguaa.test"}}
	svc := NewAuthService(repo, "secret")

	// An unknown identifier must not reveal non-existence — sentinel that the
	// handler maps to a generic success.
	if _, _, err := svc.StartPasswordReset(ctx, "nobody@oguaa.test"); !errors.Is(err, ErrResetAccountNotFound) {
		t.Fatalf("StartPasswordReset unknown = %v, want ErrResetAccountNotFound", err)
	}
}
