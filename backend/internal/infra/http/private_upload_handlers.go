package http

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── private documents: government ID and KYC (decision D6, contract K8) ─────

const msgPrivateUnavailable = "Private document uploads are temporarily unavailable."

// UploadPrivate — POST /api/uploads/private (multipart "file", optional
// "purpose": agent_id | business_kyc). Stores the document encrypted and
// returns only an opaque reference — never a URL.
func (h *Handler) UploadPrivate(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, "Sign in to upload a private document.")
		return
	}
	svc := h.rights.PrivateUploads
	if !svc.Available() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "private_uploads_unavailable", "message": msgPrivateUnavailable})
		return
	}
	if h.rateLimited(w, r, "private-upload:"+m.ID, service.PrivateUploadsPerHour, time.Hour) {
		return
	}
	data, ok := readUploadedFile(w, r, service.MaxPrivateUploadBytes, "The document must be 5 MB or smaller.")
	if !ok {
		return
	}
	ct := http.DetectContentType(data[:min(512, len(data))])
	if _, ok := service.PrivateUploadTypes[ct]; !ok {
		fail(w, http.StatusBadRequest, "Upload a JPG, PNG, WebP or PDF document.")
		return
	}
	u, err := svc.Store(r.Context(), m.ID, r.FormValue("purpose"), ct, data)
	var ve *domain.ValidationError
	if errors.As(err, &ve) {
		fail(w, http.StatusBadRequest, ve.Error())
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"ref": u.Ref(), "id": u.ID, "contentType": u.ContentType, "size": u.Size, "purpose": u.Purpose,
	})
}

// MyPrivateUpload — GET /api/me/private-uploads/{id}. The owner reads their
// own document back. Anyone else gets 404.
func (h *Handler) MyPrivateUpload(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	f, err := h.rights.PrivateUploads.OpenOwn(r.Context(), m.ID, r.PathValue("id"))
	h.writePrivateFile(w, f, err)
}

// AdminPrivateUpload — GET /api/admin/private-uploads/{id}. Vetting staff
// (vetting officers, curators; stewards pass) read a document for review.
// Every read is written to the audit log.
func (h *Handler) AdminPrivateUpload(w http.ResponseWriter, r *http.Request) {
	staff, ok := h.requireRole(w, r, domain.RoleVettingOfficer, domain.RoleCurator)
	if !ok {
		return
	}
	f, err := h.rights.PrivateUploads.OpenForStaff(r.Context(), staff, r.PathValue("id"))
	h.writePrivateFile(w, f, err)
}

func (h *Handler) writePrivateFile(w http.ResponseWriter, f *service.PrivateFile, err error) {
	if errors.Is(err, service.ErrPrivateUploadsUnavailable) {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "private_uploads_unavailable", "message": msgPrivateUnavailable})
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	hdr := w.Header()
	hdr.Set("Content-Type", f.Upload.ContentType)
	hdr.Set("Content-Length", strconv.Itoa(len(f.Data)))
	hdr.Set("Cache-Control", "no-store")
	hdr.Set("X-Content-Type-Options", "nosniff")
	hdr.Set("Content-Disposition", `inline; filename="document-`+f.Upload.ID[:8]+service.PrivateUploadTypes[f.Upload.ContentType]+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(f.Data)
}

// readUploadedFile reads the multipart "file" field, refusing anything larger
// than limit. It writes the error response itself and reports ok=false.
func readUploadedFile(w http.ResponseWriter, r *http.Request, limit int64, tooLarge string) ([]byte, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, limit+64<<10)
	if err := r.ParseMultipartForm(limit); err != nil {
		fail(w, http.StatusBadRequest, tooLarge)
		return nil, false
	}
	defer func() { _ = r.MultipartForm.RemoveAll() }()
	file, _, err := r.FormFile("file")
	if err != nil {
		fail(w, http.StatusBadRequest, `Choose a file to upload (field "file").`)
		return nil, false
	}
	defer func() { _ = file.Close() }()
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		fail(w, http.StatusBadRequest, "The upload failed. Please try again.")
		return nil, false
	}
	if int64(len(data)) > limit {
		fail(w, http.StatusBadRequest, tooLarge)
		return nil, false
	}
	if len(data) == 0 {
		fail(w, http.StatusBadRequest, "That file is empty.")
		return nil, false
	}
	return data, true
}
