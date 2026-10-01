package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oguaa/backend/internal/service"
)

// K16 and the code-delivery sentinels map centrally to 503.
func TestHandleErr_sentinels(t *testing.T) {
	h := &Handler{log: discardLog()}
	cases := []struct {
		err       error
		wantError string
	}{
		{fmt.Errorf("start: %w", service.ErrPaymentsUnavailable), "payments_unavailable"},
		{service.ErrCodeNotDelivered, msgCodeNotDelivered},
		{service.ErrPhoneCodeUnavailable, msgPhoneCodeUnavailable},
	}
	for _, c := range cases {
		rec := httptest.NewRecorder()
		h.handleErr(rec, c.err)
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("%v: status %d, want 503", c.err, rec.Code)
		}
		var body map[string]string
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body["error"] != c.wantError {
			t.Fatalf("%v: error = %q, want %q", c.err, body["error"], c.wantError)
		}
	}
	rec := httptest.NewRecorder()
	if !h.paymentsUnavailable(rec, service.ErrPaymentsUnavailable) {
		t.Fatal("paymentsUnavailable did not claim the sentinel")
	}
	var body map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["message"] != msgPaymentsUnavailable {
		t.Fatalf("message = %q", body["message"])
	}
	if h.paymentsUnavailable(httptest.NewRecorder(), nil) {
		t.Fatal("paymentsUnavailable claimed a nil error")
	}
}
