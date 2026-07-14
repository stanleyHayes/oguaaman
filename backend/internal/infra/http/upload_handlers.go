package http

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxUploadBytes = 8 << 20 // 8 MB

// extByContentType maps the image types we accept to a file extension.
var extByContentType = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

// Upload accepts a single image file (multipart field "file") and stores it as a
// first-party asset, returning its public URL. This gives every client one
// uniform path for covers, crests, and memorial portraits — no third-party
// upload widget required. Requires a signed-in member when AUTH_REQUIRED=true.
func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuth(w, r); !ok {
		return
	}
	if h.rateLimited(w, r, "upload:"+clientKey(r), 40, time.Hour) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes+1024)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		fail(w, http.StatusBadRequest, "The image is too large (max 8 MB) or the upload is malformed.")
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		fail(w, http.StatusBadRequest, "Choose an image file to upload (field \"file\").")
		return
	}
	defer func() { _ = file.Close() }()

	// Sniff the content type from the first 512 bytes — don't trust the client header.
	head := make([]byte, 512)
	n, _ := io.ReadFull(file, head)
	ct := http.DetectContentType(head[:n])
	ext, ok := extByContentType[ct]
	if !ok {
		fail(w, http.StatusBadRequest, "Unsupported file type. Use JPG, PNG, WebP or GIF.")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		h.handleErr(w, err)
		return
	}

	if err := os.MkdirAll(h.uploadDir, 0o755); err != nil {
		h.handleErr(w, err)
		return
	}
	name := randomName() + ext
	dst, err := os.Create(filepath.Join(h.uploadDir, name))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	defer func() { _ = dst.Close() }()
	if _, err := io.Copy(dst, io.LimitReader(file, maxUploadBytes)); err != nil {
		fail(w, http.StatusBadRequest, "Upload failed while saving. Please try again.")
		return
	}

	_ = hdr // filename is intentionally ignored — we generate our own
	writeJSON(w, http.StatusCreated, map[string]string{"url": h.publicURL(r, "/uploads/"+name)})
}

// publicURL builds the absolute URL for an uploaded asset. It uses the configured
// PUBLIC_API_URL when set, otherwise derives scheme+host from the request so
// dev "just works" across the Vite origins.
func (h *Handler) publicURL(r *http.Request, path string) string {
	if h.uploadBase != "" {
		return strings.TrimRight(h.uploadBase, "/") + path
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + r.Host + path
}

func randomName() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "img-fallback"
	}
	return hex.EncodeToString(b)
}
