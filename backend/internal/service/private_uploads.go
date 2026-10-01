package service

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── private uploads: government ID and KYC documents (decision D6, K8) ───────
//
// Identity documents must never sit behind a public URL. They are sealed with
// AES-256-GCM under a key derived (HKDF-SHA256, its own info string) from the
// MFA_ENC_KEY secret, stored in MongoDB (durable, unlike the API's disk), and
// read back only by their owner or by vetting staff — every staff read leaves
// an audit log line.

// privateUploadKeyInfo separates this key from every other use of the secret.
const privateUploadKeyInfo = "oguaa/private-uploads/v1"

// privateUploadKeyID labels ciphertext sealed with the key above.
const privateUploadKeyID = "v1"

// MaxPrivateUploadBytes caps one private document (contract K8: ≤ 5 MB).
const MaxPrivateUploadBytes = 5 << 20

// Per-member private document quota. Documents are stored inline in the
// database (a small shared cluster), so one account must not be able to fill
// it: an agent application or a business verification needs only a few.
const (
	MaxPrivateUploadsPerOwner     = 10
	MaxPrivateUploadBytesPerOwner = 25 << 20
	// PrivateUploadsPerHour is the per-member upload rate (enforced by the
	// HTTP handler's rate limiter).
	PrivateUploadsPerHour = 5
)

// msgPrivateQuotaFull is shown when a member has used their document quota.
const msgPrivateQuotaFull = "You've reached the limit for private documents on your account (10 documents or 25 MB in total). " +
	"Use the documents you've already uploaded, or ask us to remove old ones at citizen.oguaaman.com/privacy/request."

// PrivateUploadTypes are the content types accepted for private documents,
// detected from the bytes (never the client's header), with the file
// extension used when the document is downloaded.
var PrivateUploadTypes = map[string]string{
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
	"image/webp":      ".webp",
	"application/pdf": ".pdf",
}

// ErrPrivateUploadsUnavailable is returned when no encryption key is
// configured — documents are refused rather than stored in the clear.
var ErrPrivateUploadsUnavailable = errors.New("private document uploads are not configured")

// PrivateFile is a decrypted private document ready to stream.
type PrivateFile struct {
	Upload domain.PrivateUpload
	Data   []byte
}

// PrivateUploadService seals, stores and releases private documents.
type PrivateUploadService struct {
	repo domain.PrivateUploadRepository
	aead cipher.AEAD // nil = unavailable (no key)
	log  *slog.Logger
}

// NewPrivateUploadService derives the document key from secret. An empty
// secret yields a service that refuses every upload and read.
func NewPrivateUploadService(repo domain.PrivateUploadRepository, secret string, log *slog.Logger) (*PrivateUploadService, error) {
	if log == nil {
		log = slog.Default()
	}
	s := &PrivateUploadService{repo: repo, log: log}
	if strings.TrimSpace(secret) == "" {
		return s, nil
	}
	key, err := hkdf.Key(sha256.New, []byte(secret), nil, privateUploadKeyInfo, 32)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	if s.aead, err = cipher.NewGCM(block); err != nil {
		return nil, err
	}
	return s, nil
}

// Available reports whether documents can be stored.
func (s *PrivateUploadService) Available() bool { return s != nil && s.aead != nil && s.repo != nil }

// Store seals data for ownerID and returns the stored upload (use Ref() for
// the "private:<id>" reference). contentType must already be sniffed.
func (s *PrivateUploadService) Store(ctx context.Context, ownerID, purpose, contentType string, data []byte) (*domain.PrivateUpload, error) {
	if !s.Available() {
		return nil, ErrPrivateUploadsUnavailable
	}
	if ownerID == "" {
		return nil, &domain.ForbiddenError{Reason: "sign in to upload a private document"}
	}
	if _, ok := PrivateUploadTypes[contentType]; !ok {
		return nil, &domain.ValidationError{Message: "Upload a JPG, PNG, WebP or PDF document."}
	}
	if len(data) == 0 || len(data) > MaxPrivateUploadBytes {
		return nil, &domain.ValidationError{Message: "The document must be 5 MB or smaller."}
	}
	if err := s.checkQuota(ctx, ownerID, len(data)); err != nil {
		return nil, err
	}
	id, err := randomHex(16)
	if err != nil {
		return nil, err
	}
	sealed, err := s.seal(id, data)
	if err != nil {
		return nil, err
	}
	u := domain.PrivateUpload{
		ID: id, OwnerID: ownerID, Purpose: cleanPrivatePurpose(purpose), ContentType: contentType,
		Size: len(data), KeyID: privateUploadKeyID, Ciphertext: sealed,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if err := s.repo.Insert(ctx, u); err != nil {
		return nil, err
	}
	u.Ciphertext = nil
	return &u, nil
}

// checkQuota refuses a document that would take the owner past the
// per-member count or size quota.
func (s *PrivateUploadService) checkQuota(ctx context.Context, ownerID string, size int) error {
	count, used, err := s.repo.OwnerUsage(ctx, ownerID)
	if err != nil {
		return err
	}
	if count >= MaxPrivateUploadsPerOwner || used+int64(size) > MaxPrivateUploadBytesPerOwner {
		return &domain.ValidationError{Message: msgPrivateQuotaFull}
	}
	return nil
}

// OpenOwn returns the document to its owner. Anyone else gets NotFound, so the
// endpoint never confirms that someone else's document exists.
func (s *PrivateUploadService) OpenOwn(ctx context.Context, ownerID, id string) (*PrivateFile, error) {
	f, err := s.open(ctx, id)
	if err != nil {
		return nil, err
	}
	if ownerID == "" || f.Upload.OwnerID != ownerID {
		return nil, &domain.NotFoundError{Entity: "document"}
	}
	return f, nil
}

// OpenForStaff returns the document to vetting staff and writes an audit line
// naming who read which document, whose it is and when.
func (s *PrivateUploadService) OpenForStaff(ctx context.Context, staff *domain.Member, id string) (*PrivateFile, error) {
	f, err := s.open(ctx, id)
	if err != nil {
		return nil, err
	}
	staffID, staffRole := "", ""
	if staff != nil {
		staffID, staffRole = staff.ID, staff.Role
	}
	s.log.Info("private document read by staff",
		"type", "audit", "event", "private_upload.staff_read",
		"uploadId", f.Upload.ID, "purpose", f.Upload.Purpose, "owner", pseudonym(f.Upload.OwnerID),
		"staffId", staffID, "staffRole", staffRole, "at", time.Now().UTC().Format(time.RFC3339))
	return f, nil
}

// OwnsRef reports whether ref ("private:<id>") names a document ownerID
// uploaded — for features that accept a private reference in a form field.
func (s *PrivateUploadService) OwnsRef(ctx context.Context, ownerID, ref string) (bool, error) {
	id, ok := strings.CutPrefix(strings.TrimSpace(ref), domain.PrivateRefPrefix)
	if !ok || id == "" || s == nil || s.repo == nil {
		return false, nil
	}
	u, err := s.repo.ByID(ctx, id)
	var nf *domain.NotFoundError
	if errors.As(err, &nf) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return u.OwnerID == ownerID, nil
}

func (s *PrivateUploadService) open(ctx context.Context, id string) (*PrivateFile, error) {
	if !s.Available() {
		return nil, ErrPrivateUploadsUnavailable
	}
	id = strings.TrimPrefix(strings.TrimSpace(id), domain.PrivateRefPrefix)
	if !isHexID(id) {
		return nil, &domain.NotFoundError{Entity: "document"}
	}
	u, err := s.repo.ByID(ctx, id)
	if err != nil {
		return nil, err
	}
	plain, err := s.unseal(u.ID, u.Ciphertext)
	if err != nil {
		return nil, fmt.Errorf("private document %s cannot be decrypted: %w", u.ID, err)
	}
	meta := *u
	meta.Ciphertext = nil
	return &PrivateFile{Upload: meta, Data: plain}, nil
}

// seal encrypts data, binding the ciphertext to its record id (associated
// data) so a sealed blob cannot be swapped into another record.
func (s *PrivateUploadService) seal(id string, data []byte) ([]byte, error) {
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return s.aead.Seal(nonce, nonce, data, []byte(id)), nil
}

func (s *PrivateUploadService) unseal(id string, sealed []byte) ([]byte, error) {
	ns := s.aead.NonceSize()
	if len(sealed) < ns {
		return nil, errors.New("ciphertext too short")
	}
	return s.aead.Open(nil, sealed[:ns], sealed[ns:], []byte(id))
}

func cleanPrivatePurpose(p string) string {
	switch p = strings.TrimSpace(strings.ToLower(p)); p {
	case domain.PrivatePurposeAgentID, domain.PrivatePurposeBusinessKYC:
		return p
	}
	return domain.PrivatePurposeDocument
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func isHexID(id string) bool {
	if len(id) != 32 {
		return false
	}
	_, err := hex.DecodeString(id)
	return err == nil
}

// pseudonym is a short, stable, non-reversible stand-in for a member id in
// logs (member ids embed the display name chosen at sign-up).
func pseudonym(id string) string {
	if id == "" {
		return ""
	}
	sum := sha256.Sum256([]byte("oguaa-log:" + id))
	return hex.EncodeToString(sum[:6])
}
