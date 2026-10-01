package http

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// F027: /uploads/ must serve files but never list a directory.
func TestUploadsNeverListDirectories(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "abc123.jpg"), []byte("\xff\xd8\xff\xe0jpeg"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "nested", "inner.jpg"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".secret"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	h := staticFiles("/uploads/", http.Dir(dir))

	cases := []struct {
		path string
		want int
	}{
		{"/uploads/", http.StatusNotFound},
		{"/uploads/nested/", http.StatusNotFound},
		{"/uploads/nested", http.StatusNotFound},
		{"/uploads/.secret", http.StatusNotFound},
		{"/uploads/abc123.jpg", http.StatusOK},
		{"/uploads/nested/inner.jpg", http.StatusOK},
	}
	for _, tc := range cases {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if w.Code != tc.want {
			t.Errorf("GET %s → %d, want %d", tc.path, w.Code, tc.want)
		}
		if strings.Contains(w.Body.String(), "abc123.jpg") && tc.path != "/uploads/abc123.jpg" {
			t.Errorf("GET %s leaked a file name: %q", tc.path, w.Body.String())
		}
	}
}

// The embedded seed imagery is served the same way (no listing).
func TestSeedImagesNeverListDirectories(t *testing.T) {
	h := &Handler{uploadDir: t.TempDir()}
	router := NewRouter(h, nil, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/uploads/seed/", nil))
	if w.Code != http.StatusNotFound {
		t.Errorf("GET /uploads/seed/ → %d, want 404", w.Code)
	}
	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/uploads/", nil))
	if w.Code != http.StatusNotFound {
		t.Errorf("GET /uploads/ → %d, want 404", w.Code)
	}
}
