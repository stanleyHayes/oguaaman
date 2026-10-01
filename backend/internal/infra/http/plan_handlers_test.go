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

// adminPlans is an in-memory plan catalog for the admin plan handlers.
type adminPlans struct{ rows []domain.Plan }

func (p *adminPlans) All(context.Context) ([]domain.Plan, error) { return p.rows, nil }
func (p *adminPlans) Get(_ context.Context, id string) (*domain.Plan, error) {
	for i := range p.rows {
		if p.rows[i].ID == id {
			return &p.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "plan"}
}
func (p *adminPlans) BySlug(_ context.Context, slug string) (*domain.Plan, error) {
	for i := range p.rows {
		if p.rows[i].Slug == slug {
			return &p.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "plan"}
}
func (p *adminPlans) Insert(_ context.Context, plan domain.Plan) error {
	p.rows = append(p.rows, plan)
	return nil
}
func (p *adminPlans) Update(_ context.Context, plan domain.Plan) error {
	for i := range p.rows {
		if p.rows[i].ID == plan.ID {
			p.rows[i] = plan
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "plan"}
}
func (p *adminPlans) Delete(context.Context, string) error { return nil }

func updatePlanRequest(id, body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/api/admin/plans/"+id, bytes.NewBufferString(body))
	req.SetPathValue("id", id)
	return req
}

const creatorSupporterEdit = `{"name":"Creator Supporter","slug":"creator-supporter","audience":"creator","interval":"month","prices":{"default":3000},"takeRatePercent":%s}`

// A curator's form mistake is a 400 with the reason, not a 500 (F150).
func TestAdminUpdatePlan_validationIsBadRequest(t *testing.T) {
	plans := &adminPlans{rows: []domain.Plan{
		{ID: "plan-creator-supporter", Slug: "creator-supporter", Name: "Creator Supporter", Audience: "creator", Interval: "month", Prices: map[string]int64{"default": 3_000}, TakeRatePercent: 15, Active: true},
	}}
	h := NewHandler(HandlerDeps{Svc: service.New(service.Deps{Plans: plans})})

	res := httptest.NewRecorder()
	h.AdminUpdatePlan(res, updatePlanRequest("plan-creator-supporter", strings.Replace(creatorSupporterEdit, "%s", "95", 1)))
	if res.Code != http.StatusBadRequest || !strings.Contains(res.Body.String(), "take-rate") {
		t.Fatalf("take-rate 95: status = %d body = %s, want 400 naming the take-rate", res.Code, res.Body.String())
	}
	if plans.rows[0].TakeRatePercent != 15 {
		t.Errorf("a rejected edit must not change the plan; take-rate = %d", plans.rows[0].TakeRatePercent)
	}

	res = httptest.NewRecorder()
	h.AdminUpdatePlan(res, updatePlanRequest("plan-missing", strings.Replace(creatorSupporterEdit, "%s", "10", 1)))
	if res.Code != http.StatusNotFound {
		t.Errorf("unknown plan: status = %d, want 404", res.Code)
	}

	res = httptest.NewRecorder()
	h.AdminUpdatePlan(res, updatePlanRequest("plan-creator-supporter", strings.Replace(creatorSupporterEdit, "%s", "10", 1)))
	if res.Code != http.StatusOK || plans.rows[0].TakeRatePercent != 10 {
		t.Errorf("valid edit: status = %d take-rate = %d, want 200 / 10", res.Code, plans.rows[0].TakeRatePercent)
	}
}
