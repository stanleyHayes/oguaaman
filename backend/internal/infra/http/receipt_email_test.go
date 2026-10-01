package http

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// Phone-registered members are never refused (R09) and never share one
// placeholder receipt address (F148): each gets m-<id>@receipts.oguaaman.com.
func TestReceiptEmail(t *testing.T) {
	phoneOnly := &domain.Member{ID: "m-1", Phone: "0240000000"}
	withEmail := &domain.Member{ID: "m-2", Email: "ama@example.com"}
	cases := []struct {
		name         string
		authRequired bool
		typed        string
		member       *domain.Member
		want         string
		wantStatus   int
	}{
		{"typed wins", true, "kofi@example.com", withEmail, "kofi@example.com", 0},
		{"member email", true, "", withEmail, "ama@example.com", 0},
		{"phone-only member gets a per-member address", true, "", phoneOnly, "m-m-1@receipts.oguaaman.com", 0},
		{"phone-only member's typed email wins", true, "kofi@example.com", phoneOnly, "kofi@example.com", 0},
		{"object id member", true, "", &domain.Member{ID: "65f0a1b2c3d4e5f601234567"}, "m-65f0a1b2c3d4e5f601234567@receipts.oguaaman.com", 0},
		{"no member with auth on", true, "", nil, "", http.StatusBadRequest},
		{"malformed typed email", true, "not-an-email", withEmail, "", http.StatusBadRequest},
		{"dev server without auth", false, "", nil, devReceiptEmail, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := &Handler{authRequired: tc.authRequired}
			rec := httptest.NewRecorder()
			got, ok := h.receiptEmail(rec, tc.typed, tc.member)
			if tc.wantStatus != 0 {
				if ok || rec.Code != tc.wantStatus {
					t.Fatalf("ok=%v status=%d, want refusal %d", ok, rec.Code, tc.wantStatus)
				}
				return
			}
			if !ok || got != tc.want {
				t.Fatalf("got %q ok=%v, want %q", got, ok, tc.want)
			}
		})
	}
}
