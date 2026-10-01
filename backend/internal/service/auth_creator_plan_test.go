package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

type creatorSignupMembers struct {
	stubMembers
	member       *domain.Member
	insertCalls  int
	intentWrites int
}

func (r *creatorSignupMembers) ByIdentifier(_ context.Context, identifier string) (*domain.Member, error) {
	if r.member == nil || (r.member.Email != identifier && r.member.Phone != identifier) {
		return nil, &domain.NotFoundError{Entity: "member"}
	}
	return r.member, nil
}

func (r *creatorSignupMembers) Insert(_ context.Context, member domain.Member) error {
	r.member = &member
	r.insertCalls++
	return nil
}

func (r *creatorSignupMembers) SetCreatorTypes(_ context.Context, _ string, creatorTypes []string) error {
	r.member.CreatorTypes = append([]string(nil), creatorTypes...)
	return nil
}

func (r *creatorSignupMembers) SetCreatorPlanIntent(_ context.Context, _ string, planSlug string) error {
	r.member.CreatorPlanIntent = planSlug
	r.intentWrites++
	return nil
}

// signupInput is an adult, consenting sign-up request.
func signupInput(identifier, name, password string, creatorTypes []string, planIntent string) RegisterInput {
	return RegisterInput{
		Identifier: identifier, DisplayName: name, DateOfBirth: "1990-01-01", Password: password,
		CreatorTypes: creatorTypes, CreatorPlanIntent: planIntent, AcceptTerms: true, Platform: "web",
	}
}

func TestRegisterCreatorDefaultsToFreeStarterIntent(t *testing.T) {
	repo := &creatorSignupMembers{}
	plans := &fakePlans{rows: []domain.Plan{{
		ID: "plan-starter", Slug: domain.DefaultCreatorPlanIntentSlug, Name: "Starter",
		Audience: "any", Interval: "free", Prices: map[string]int64{"default": 0}, Active: true,
	}}}
	auth := NewAuthService(repo, "secret").WithPlans(plans)

	_, member, err := auth.Register(context.Background(), signupInput("creator@oguaa.test", "Ama Creator", "creator-pass", []string{domain.CreatorArtist}, ""))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if member.CreatorPlanIntent != domain.DefaultCreatorPlanIntentSlug {
		t.Fatalf("creatorPlanIntent = %q, want %q", member.CreatorPlanIntent, domain.DefaultCreatorPlanIntentSlug)
	}
	if repo.intentWrites != 1 {
		t.Fatalf("plan intent writes = %d, want 1", repo.intentWrites)
	}
}

func TestRegisterCreatorPersistsActivePaidPlanAsIntentOnly(t *testing.T) {
	repo := &creatorSignupMembers{}
	plans := &fakePlans{rows: []domain.Plan{{
		ID: "plan-supporter", Slug: "supporter", Name: "Supporter", Audience: "business",
		Interval: "month", Prices: map[string]int64{"default": 3_000, "business": 5_000}, Active: true,
	}}}
	auth := NewAuthService(repo, "secret").WithPlans(plans)

	_, member, err := auth.Register(context.Background(), signupInput("business@oguaa.test", "Esi Business", "creator-pass", []string{domain.CreatorBusiness}, "supporter"))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if member.CreatorPlanIntent != "supporter" {
		t.Fatalf("creatorPlanIntent = %q, want supporter", member.CreatorPlanIntent)
	}
	// AuthService has no subscription repository: persisting this field cannot
	// grant paid access. Payment confirmation remains the entitlement boundary.
}

func TestPropertyCreatorUsesBusinessPlanAudience(t *testing.T) {
	if !creatorPlanEligible("business", []string{domain.CreatorProperty}) {
		t.Fatal("property managers should be eligible for business-audience plans")
	}
	if creatorPlanEligible("creator", []string{domain.CreatorProperty}) {
		t.Fatal("property managers should not leak into the non-business creator audience")
	}
}

func TestRegisterCreatorRejectsPlanForDifferentAudience(t *testing.T) {
	repo := &creatorSignupMembers{}
	plans := &fakePlans{rows: []domain.Plan{{
		ID: "plan-business", Slug: "business", Audience: "business", Interval: "month",
		Prices: map[string]int64{"default": 3_000}, Active: true,
	}}}
	auth := NewAuthService(repo, "secret").WithPlans(plans)

	_, _, err := auth.Register(context.Background(), signupInput("artist@oguaa.test", "Ama Artist", "creator-pass", []string{domain.CreatorArtist}, "business"))
	var validation *domain.ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("Register error = %v, want ValidationError", err)
	}
	if repo.insertCalls != 0 {
		t.Fatalf("insert calls = %d, want 0", repo.insertCalls)
	}
}

func TestRegisterCreatorRejectsInactiveOrUnknownPlanBeforeInsert(t *testing.T) {
	tests := []struct {
		name  string
		plans []domain.Plan
		slug  string
	}{
		{
			name: "inactive",
			plans: []domain.Plan{{ID: "plan-off", Slug: "off", Audience: "any", Interval: "month",
				Prices: map[string]int64{"default": 3_000}, Active: false},
			},
			slug: "off",
		},
		{
			name: "unknown",
			slug: "missing",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			repo := &creatorSignupMembers{}
			auth := NewAuthService(repo, "secret").WithPlans(&fakePlans{rows: test.plans})
			_, _, err := auth.Register(context.Background(), signupInput("creator@oguaa.test", "Ama Creator", "creator-pass", []string{domain.CreatorArtist}, test.slug))
			var validation *domain.ValidationError
			if !errors.As(err, &validation) {
				t.Fatalf("Register error = %v, want ValidationError", err)
			}
			if repo.insertCalls != 0 {
				t.Fatalf("insert calls = %d, want 0", repo.insertCalls)
			}
		})
	}
}

func TestRegisterCitizenStoresNoPlanIntent(t *testing.T) {
	repo := &creatorSignupMembers{}
	auth := NewAuthService(repo, "secret")

	_, member, err := auth.Register(context.Background(), signupInput("citizen@oguaa.test", "Kojo Citizen", "citizen-pass", nil, "supporter"))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if member.CreatorPlanIntent != "" || repo.intentWrites != 0 {
		t.Fatalf("citizen plan intent = %q with %d writes, want none", member.CreatorPlanIntent, repo.intentWrites)
	}
}
