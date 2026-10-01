package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// F037: an invite typed with capitals is stored lowercased, so the invitee's
// normalised sign-in / reset lookup finds it.
func TestInviteMemberLowercasesEmail(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo()
	svc := New(Deps{Members: repo})
	m, err := svc.InviteMember(ctx, "  Kofi.Mensah@Gmail.com ", "Kofi Mensah", domain.RoleCurator)
	if err != nil {
		t.Fatal(err)
	}
	if m.Email != "kofi.mensah@gmail.com" {
		t.Fatalf("invite email = %q, want lowercased", m.Email)
	}
	if _, err := svc.InviteMember(ctx, "KOFI.MENSAH@gmail.com", "Kofi M", domain.RoleCurator); err == nil {
		t.Fatal("a second invite differing only in case should be refused as a duplicate")
	}
	auth := NewAuthService(repo, "secret")
	if _, _, err := auth.StartPasswordReset(ctx, "kofi.mensah@gmail.com"); err != nil {
		t.Fatalf("invitee cannot start the claim flow: %v", err)
	}
}

// failingSender stands in for any channel that did not deliver.
type failingSender struct{ calls int }

func (f *failingSender) Send(context.Context, string, string, string) error {
	f.calls++
	return errors.New("provider rejected the message")
}
func (f *failingSender) SendOTP(context.Context, string, string) error {
	f.calls++
	return errors.New("not configured")
}
func (f *failingSender) SendMessage(context.Context, string, string) error {
	f.calls++
	return errors.New("not configured")
}

// okSender accepts every message.
type okSender struct{ calls int }

func (o *okSender) Send(context.Context, string, string, string) error { o.calls++; return nil }
func (o *okSender) SendOTP(context.Context, string, string) error      { o.calls++; return nil }
func (o *okSender) SendMessage(context.Context, string, string) error  { o.calls++; return nil }

const (
	testMemberPhone = "+233241234567"
	testMemberEmail = "ama@example.com"
)

func verifyRepo(email, phone string) *phoneVerifyRepo {
	return &phoneVerifyRepo{m: &domain.Member{ID: "m-1", Email: email, Phone: phone}}
}

// F025/F106: a phone-only member in production with no phone channel is told
// plainly, and no code is issued or echoed.
func TestStartPhoneVerification_phoneOnlyWithoutChannelInProduction(t *testing.T) {
	repo := verifyRepo("", testMemberPhone)
	auth := NewAuthService(repo, "secret").WithProduction(true)
	m, code, _, err := auth.StartPhoneVerification(context.Background(), "m-1")
	if !errors.Is(err, ErrPhoneCodeUnavailable) {
		t.Fatalf("err = %v, want ErrPhoneCodeUnavailable", err)
	}
	if m != nil || code != "" {
		t.Fatalf("got member=%v code=%q, want neither", m, code)
	}
	if repo.m.PhoneVerificationCodeHash != "" {
		t.Fatal("a code was issued although nothing could deliver it")
	}
}

// F025/F106: a sender that reports failure (e.g. "not configured") never
// counts as delivered.
func TestStartPhoneVerification_failedSenderIsNotDelivered(t *testing.T) {
	wa := &failingSender{}
	auth := NewAuthService(verifyRepo("", testMemberPhone), "secret").WithProduction(true).WithOTPSender(wa)
	if _, code, _, err := auth.StartPhoneVerification(context.Background(), "m-1"); !errors.Is(err, ErrCodeNotDelivered) || code != "" {
		t.Fatalf("got code=%q err=%v, want ErrCodeNotDelivered and no code", code, err)
	}
	if wa.calls != 1 {
		t.Fatalf("WhatsApp tried %d times, want 1", wa.calls)
	}
}

// F030/P076: an email send failure in production never puts the code in the
// response.
func TestStartPhoneVerification_emailFailureNeverEchoesInProduction(t *testing.T) {
	auth := NewAuthService(verifyRepo(testMemberEmail, ""), "secret").WithProduction(true).WithNotifiers(&failingSender{}, nil)
	if _, code, _, err := auth.StartPhoneVerification(context.Background(), "m-1"); !errors.Is(err, ErrCodeNotDelivered) || code != "" {
		t.Fatalf("got code=%q err=%v, want ErrCodeNotDelivered and no code", code, err)
	}
}

// A delivered code is never echoed; outside production an undelivered one is
// (local development without providers).
func TestStartPhoneVerification_deliveredOrDevEcho(t *testing.T) {
	ctx := context.Background()
	mail := &okSender{}
	auth := NewAuthService(verifyRepo(testMemberEmail, ""), "secret").WithProduction(true).WithNotifiers(mail, nil)
	if _, code, exp, err := auth.StartPhoneVerification(ctx, "m-1"); err != nil || code != "" || exp == "" {
		t.Fatalf("delivered: code=%q exp=%q err=%v, want no code and an expiry", code, exp, err)
	}
	if mail.calls != 1 {
		t.Fatalf("email sent %d times, want 1", mail.calls)
	}
	dev := NewAuthService(verifyRepo("", testMemberPhone), "secret")
	if _, code, _, err := dev.StartPhoneVerification(ctx, "m-1"); err != nil || code == "" {
		t.Fatalf("dev: code=%q err=%v, want the code echoed", code, err)
	}
}

// F025: in production a reset for a phone number with no phone channel is
// refused up front — for every phone number, so it reveals nothing — and a
// reset never returns the code.
func TestStartPasswordReset_productionDelivery(t *testing.T) {
	ctx := context.Background()
	member := &domain.Member{ID: "m-1", Email: testMemberEmail, Phone: testMemberPhone, PasswordHash: "x"}
	prod := NewAuthService(newAuthRepo(member), "secret").WithProduction(true).WithNotifiers(&okSender{}, nil)
	for _, id := range []string{testMemberPhone, "+233200000000"} {
		if _, _, err := prod.StartPasswordReset(ctx, id); !errors.Is(err, ErrPhoneCodeUnavailable) {
			t.Fatalf("reset for %s = %v, want ErrPhoneCodeUnavailable", id, err)
		}
	}
	if _, code, err := prod.StartPasswordReset(ctx, testMemberEmail); err != nil || code != "" {
		t.Fatalf("email reset: code=%q err=%v, want no code", code, err)
	}
}

// D4/K16: production without a Paystack key gets the disabled client, which
// never reports a payment as made.
func TestPaystackFor(t *testing.T) {
	ctx := context.Background()
	sim := SimulatedPaystack{}
	if _, ok := PaystackFor("", false, sim).(SimulatedPaystack); !ok {
		t.Fatal("dev without a key should simulate")
	}
	prod := PaystackFor("", true, sim)
	if prod.Simulated() {
		t.Fatal("production must never simulate")
	}
	if check, err := prod.Verify(ctx, "ref"); check.Outcome == PaymentPaid || !errors.Is(err, ErrPaymentsUnavailable) {
		t.Fatalf("Verify = %v, %v; want no payment, ErrPaymentsUnavailable", check, err)
	}
	if _, _, err := prod.Initialize(ctx, testMemberEmail, 100, "GHS", "ref", "cb"); !errors.Is(err, ErrPaymentsUnavailable) {
		t.Fatalf("Initialize err = %v", err)
	}
	if _, _, err := prod.InitializeSplit(ctx, testMemberEmail, 100, "GHS", "ref", "cb", "sub", 5); !errors.Is(err, ErrPaymentsUnavailable) {
		t.Fatalf("InitializeSplit err = %v", err)
	}
	if _, err := prod.CreateSubaccount(ctx, "Biz", "001", "123"); !errors.Is(err, ErrPaymentsUnavailable) {
		t.Fatalf("CreateSubaccount err = %v", err)
	}
	if PaystackFor("sk_live_x", true, sim).Simulated() {
		t.Fatal("a live key must give the live client")
	}
}
