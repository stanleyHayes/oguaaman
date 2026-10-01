package http

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

const maxUploadBytes = 8 << 20 // 8 MB

// msgImageTooLarge refuses an image whose dimensions exceed the decode cap.
var msgImageTooLarge = fmt.Sprintf("That image is too large in dimensions. Resize it (under %d megapixels) and try again.",
	service.MaxUploadMegapixels)

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
//
// The file is public, so its metadata is stripped first (GPS position, device,
// timestamps — service.StripImageMetadata), and the uploader is recorded so the
// file can be deleted with their account. Identity documents must not come
// here: they go to POST /api/uploads/private.
func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if h.rateLimited(w, r, "upload:"+clientKey(r), 40, time.Hour) {
		return
	}
	data, ok := readUploadedFile(w, r, maxUploadBytes, "The image is too large (max 8 MB) or the upload is malformed.")
	if !ok {
		return
	}
	// Sniff the content type from the bytes — don't trust the client header.
	ct := http.DetectContentType(data[:min(512, len(data))])
	ext, ok := extByContentType[ct]
	if !ok {
		fail(w, http.StatusBadRequest, "Unsupported file type. Use JPG, PNG, WebP or GIF.")
		return
	}
	clean, err := service.StripImageMetadata(r.Context(), data, ct)
	if errors.Is(err, service.ErrImageTooLarge) {
		fail(w, http.StatusBadRequest, msgImageTooLarge)
		return
	}
	if r.Context().Err() != nil {
		return // the client went away while the upload waited its turn
	}
	if err != nil {
		fail(w, http.StatusBadRequest, "We couldn't read that image. Try saving it again as a JPG or PNG.")
		return
	}
	if err := os.MkdirAll(h.uploadDir, 0o755); err != nil {
		h.handleErr(w, err)
		return
	}
	name := randomName() + ext
	if err := os.WriteFile(filepath.Join(h.uploadDir, name), clean, 0o644); err != nil {
		fail(w, http.StatusBadRequest, "Upload failed while saving. Please try again.")
		return
	}
	h.recordUpload(r, m, name)
	writeJSON(w, http.StatusCreated, map[string]string{"url": h.publicURL(r, "/uploads/"+name)})
}

// recordUpload remembers who uploaded name, so erasure can find the file.
// Best-effort: the upload itself has already succeeded.
func (h *Handler) recordUpload(r *http.Request, m *domain.Member, name string) {
	if m == nil || h.rights.Uploads == nil {
		return
	}
	rec := domain.UploadRecord{Name: name, OwnerID: m.ID, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	if err := h.rights.Uploads.Record(r.Context(), rec); err != nil {
		h.log.Warn("upload ownership not recorded", "file", name, "err", err)
	}
}

// CloudinarySignature — POST /api/uploads/cloudinary-signature (contract K9).
// Signs one direct upload into the member's own Cloudinary folder. Optional
// body {"resourceType": "image" | "video"}. 503 signed_uploads_unavailable
// when Cloudinary is not configured; clients then use POST /api/uploads.
func (h *Handler) CloudinarySignature(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rights.Media == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "signed_uploads_unavailable"})
		return
	}
	if h.rateLimited(w, r, "cloudinary-sign:"+m.ID, 60, time.Hour) {
		return
	}
	var in struct {
		ResourceType string `json:"resourceType"`
	}
	_ = decodeBody(r, &in) // the body is optional
	writeJSON(w, http.StatusOK, h.rights.Media.SignUpload(m.ID, in.ResourceType))
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
