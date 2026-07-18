package http

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

type signupMembers struct{ domain.MemberRepository }

func (signupMembers) ByIdentifier(context.Context, string) (*domain.Member, error) {
	return nil, &domain.NotFoundError{Entity: "member"}
}

func (signupMembers) Insert(context.Context, domain.Member) error { return nil }

func (signupMembers) SetCreatorTypes(context.Context, string, []string) error { return nil }

func (signupMembers) SetCreatorPlanIntent(context.Context, string, string) error { return nil }

type signupPlans struct {
	domain.PlanRepository
	plan *domain.Plan
}

func (p signupPlans) BySlug(context.Context, string) (*domain.Plan, error) {
	if p.plan == nil {
		return nil, &domain.NotFoundError{Entity: "plan"}
	}
	return p.plan, nil
}

func TestAuthRegisterMapsCreatorPlanValidationToBadRequest(t *testing.T) {
	tests := []struct {
		name string
		plan *domain.Plan
	}{
		{name: "unknown"},
		{name: "inactive", plan: &domain.Plan{Slug: "supporter", Audience: "any", Interval: "month", Prices: map[string]int64{"default": 3_000}}},
		{name: "ineligible", plan: &domain.Plan{Slug: "supporter", Audience: "business", Interval: "month", Prices: map[string]int64{"default": 3_000}, Active: true}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			auth := service.NewAuthService(signupMembers{}, "secret").WithPlans(signupPlans{plan: test.plan})
			h := NewHandler(HandlerDeps{Auth: auth})
			body := `{"identifier":"artist@oguaa.test","displayName":"Ama Artist","dateOfBirth":"1990-01-01","password":"creator-pass","creatorTypes":["artist"],"creatorPlanIntent":"supporter"}`
			req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(body))
			res := httptest.NewRecorder()

			h.AuthRegister(res, req)

			if res.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", res.Code, http.StatusBadRequest, res.Body.String())
			}
			if !strings.Contains(res.Body.String(), "plan") {
				t.Fatalf("body = %q, want useful plan validation message", res.Body.String())
			}
		})
	}
}
