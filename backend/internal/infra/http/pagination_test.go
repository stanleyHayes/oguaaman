package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// pageOf clamps skip/limit and computes totalPages from the FULL length.
func TestPageOf_slicingAndTotals(t *testing.T) {
	all := []int{1, 2, 3, 4, 5, 6, 7}

	p := pageOf(all, 1, 3)
	if p.Total != 7 || p.Page != 1 || p.PageSize != 3 || p.TotalPages != 3 {
		t.Fatalf("page1 meta = %+v", p)
	}
	if len(p.Items) != 3 || p.Items[0] != 1 || p.Items[2] != 3 {
		t.Fatalf("page1 items = %v", p.Items)
	}

	// Last (partial) page.
	if p := pageOf(all, 3, 3); len(p.Items) != 1 || p.Items[0] != 7 {
		t.Fatalf("page3 items = %v", p.Items)
	}

	// Out-of-range page → empty, non-nil slice (marshals to []), totals intact.
	oob := pageOf(all, 9, 3)
	if len(oob.Items) != 0 || oob.Items == nil {
		t.Fatalf("oob items = %v (want empty non-nil)", oob.Items)
	}
	if oob.Total != 7 || oob.TotalPages != 3 {
		t.Fatalf("oob totals = %+v", oob)
	}
	if b, _ := json.Marshal(oob.Items); string(b) != "[]" {
		t.Fatalf("oob items JSON = %s (want [])", b)
	}
}

// pageParams: absent ?page → off; present → clamped page/pageSize.
func TestPageParams_presenceAndClamp(t *testing.T) {
	cases := []struct {
		url          string
		wantOn       bool
		wantPage     int
		wantPageSize int
	}{
		{"/x", false, 0, 0},
		{"/x?page=1", true, 1, defaultPageSize},
		{"/x?page=0", true, 1, defaultPageSize},            // floor page at 1
		{"/x?page=3&pageSize=10", true, 3, 10},             // explicit size
		{"/x?page=2&pageSize=0", true, 2, 1},               // floor pageSize at 1
		{"/x?page=2&pageSize=99999", true, 2, maxPageSize}, // cap pageSize
		{"/x?page=abc", true, 1, defaultPageSize},          // invalid page → 1
	}
	for _, c := range cases {
		r := httptest.NewRequest(http.MethodGet, c.url, nil)
		page, pageSize, on := pageParams(r)
		if on != c.wantOn || (on && (page != c.wantPage || pageSize != c.wantPageSize)) {
			t.Errorf("%s → page=%d size=%d on=%v (want page=%d size=%d on=%v)",
				c.url, page, pageSize, on, c.wantPage, c.wantPageSize, c.wantOn)
		}
	}
}

// End-to-end through a real handler: ?page absent → plain array (unchanged);
// ?page present → { items, total, page, pageSize, totalPages } envelope.
func TestInstitutionsHandler_optionalPagination(t *testing.T) {
	orgs := fakeOrgs{list: []domain.Organization{
		{ID: "1", Slug: "a", Kind: "heritage", Verified: true},
		{ID: "2", Slug: "b", Kind: "heritage", Verified: true},
		{ID: "3", Slug: "c", Kind: "heritage", Verified: true},
	}}
	h := &Handler{svc: service.New(service.Deps{Orgs: orgs})}

	// Backward-compat: no ?page → the plain array, unchanged.
	req := httptest.NewRequest(http.MethodGet, "/api/institutions", nil)
	w := httptest.NewRecorder()
	h.Institutions(w, req)
	var plain []domain.Organization
	if err := json.Unmarshal(w.Body.Bytes(), &plain); err != nil {
		t.Fatalf("plain array decode: %v (body=%s)", err, w.Body.String())
	}
	if len(plain) != 3 {
		t.Fatalf("plain array len = %d, want 3", len(plain))
	}

	// ?page present → envelope with the page slice + full total.
	req = httptest.NewRequest(http.MethodGet, "/api/institutions?page=1&pageSize=2", nil)
	w = httptest.NewRecorder()
	h.Institutions(w, req)
	var env Page[domain.Organization]
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("envelope decode: %v (body=%s)", err, w.Body.String())
	}
	if env.Total != 3 || env.Page != 1 || env.PageSize != 2 || env.TotalPages != 2 || len(env.Items) != 2 {
		t.Fatalf("envelope = %+v", env)
	}
}
