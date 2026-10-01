package service

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// erPrivate is an in-memory PrivateUploadRepository.
type erPrivate struct {
	rows map[string]domain.PrivateUpload
}

func (p *erPrivate) Insert(_ context.Context, u domain.PrivateUpload) error {
	if p.rows == nil {
		p.rows = map[string]domain.PrivateUpload{}
	}
	p.rows[u.ID] = u
	return nil
}
func (p *erPrivate) ByID(_ context.Context, id string) (*domain.PrivateUpload, error) {
	if u, ok := p.rows[id]; ok {
		return &u, nil
	}
	return nil, &domain.NotFoundError{Entity: "document"}
}
func (p *erPrivate) ByOwner(_ context.Context, owner string) ([]domain.PrivateUpload, error) {
	out := []domain.PrivateUpload{}
	for _, u := range p.rows {
		if u.OwnerID == owner {
			u.Ciphertext = nil
			out = append(out, u)
		}
	}
	return out, nil
}
func (p *erPrivate) OwnerUsage(_ context.Context, owner string) (int, int64, error) {
	n, total := 0, int64(0)
	for _, u := range p.rows {
		if u.OwnerID == owner {
			n++
			total += int64(u.Size)
		}
	}
	return n, total, nil
}
func (p *erPrivate) DeleteByOwner(_ context.Context, owner string) error {
	for id, u := range p.rows {
		if u.OwnerID == owner {
			delete(p.rows, id)
		}
	}
	return nil
}

var testPDF = []byte("%PDF-1.4\n% Ghana Card GHA-123456789-0 scan\n%%EOF\n")

func newPrivateSvc(t *testing.T, repo *erPrivate, log *slog.Logger) *PrivateUploadService {
	t.Helper()
	svc, err := NewPrivateUploadService(repo, "a-strong-test-secret", log)
	if err != nil {
		t.Fatal(err)
	}
	return svc
}

// K8 / D6 / G088: documents are encrypted at rest and readable only by their
// owner and by staff; staff reads are audited.
func TestPrivateUploadsAreSealedAndOwnerOnly(t *testing.T) {
	ctx := context.Background()
	repo := &erPrivate{}
	var audit bytes.Buffer
	svc := newPrivateSvc(t, repo, slog.New(slog.NewTextHandler(&audit, nil)))

	u, err := svc.Store(ctx, "m-owner", "agent_id", "application/pdf", testPDF)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(u.Ref(), domain.PrivateRefPrefix) || u.Purpose != domain.PrivatePurposeAgentID {
		t.Fatalf("stored upload = %+v", u)
	}
	stored := repo.rows[u.ID]
	if bytes.Contains(stored.Ciphertext, []byte("Ghana Card")) || len(stored.Ciphertext) == 0 {
		t.Fatal("document is not encrypted at rest")
	}

	got, err := svc.OpenOwn(ctx, "m-owner", u.ID)
	if err != nil || !bytes.Equal(got.Data, testPDF) {
		t.Fatalf("owner read: err=%v", err)
	}
	var nf *domain.NotFoundError
	if _, err := svc.OpenOwn(ctx, "m-someone-else", u.ID); !errors.As(err, &nf) {
		t.Fatalf("another member's read: err = %v, want NotFound", err)
	}

	staff := &domain.Member{ID: "m-vet", Role: domain.RoleVettingOfficer}
	if got, err := svc.OpenForStaff(ctx, staff, u.Ref()); err != nil || !bytes.Equal(got.Data, testPDF) {
		t.Fatalf("staff read: err=%v", err)
	}
	if line := audit.String(); !strings.Contains(line, "private_upload.staff_read") || !strings.Contains(line, "m-vet") ||
		strings.Contains(line, "m-owner") {
		t.Errorf("staff read audit line = %q (want the staff id, the event, and a pseudonymised owner)", line)
	}

	if ok, _ := svc.OwnsRef(ctx, "m-owner", u.Ref()); !ok {
		t.Error("OwnsRef: owner not recognised")
	}
	if ok, _ := svc.OwnsRef(ctx, "m-someone-else", u.Ref()); ok {
		t.Error("OwnsRef: accepted someone else's document")
	}
}

// A sealed blob is bound to its record: moved into another record it fails.
func TestPrivateUploadCiphertextIsBoundToItsRecord(t *testing.T) {
	ctx := context.Background()
	repo := &erPrivate{}
	svc := newPrivateSvc(t, repo, quietLog())
	a, _ := svc.Store(ctx, "m1", "", "application/pdf", testPDF)
	b, _ := svc.Store(ctx, "m1", "", "application/pdf", []byte("%PDF-1.4 other"))
	rowB := repo.rows[b.ID]
	rowB.Ciphertext = repo.rows[a.ID].Ciphertext
	repo.rows[b.ID] = rowB
	if _, err := svc.OpenOwn(ctx, "m1", b.ID); err == nil {
		t.Fatal("a ciphertext swapped between records still decrypted")
	}
}

func TestPrivateUploadsRefuseWithoutKeyAndValidate(t *testing.T) {
	ctx := context.Background()
	off, err := NewPrivateUploadService(&erPrivate{}, "", quietLog())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := off.Store(ctx, "m1", "", "application/pdf", testPDF); !errors.Is(err, ErrPrivateUploadsUnavailable) {
		t.Fatalf("no key: err = %v, want ErrPrivateUploadsUnavailable", err)
	}
	svc := newPrivateSvc(t, &erPrivate{}, quietLog())
	var ve *domain.ValidationError
	if _, err := svc.Store(ctx, "m1", "", "text/html", []byte("<script>")); !errors.As(err, &ve) {
		t.Errorf("html accepted: err = %v", err)
	}
	if _, err := svc.Store(ctx, "m1", "", "application/pdf", make([]byte, MaxPrivateUploadBytes+1)); !errors.As(err, &ve) {
		t.Errorf("oversized document accepted: err = %v", err)
	}
	if _, err := svc.Store(ctx, "", "", "application/pdf", testPDF); err == nil {
		t.Error("anonymous upload accepted")
	}
}

// R08: one member cannot fill the shared database with private documents —
// at most MaxPrivateUploadsPerOwner documents and MaxPrivateUploadBytesPerOwner
// bytes each, refused with a clear 400 (ValidationError) beyond that.
func TestPrivateUploadQuotaPerOwner(t *testing.T) {
	ctx := context.Background()
	quotaErr := func(err error) bool {
		var ve *domain.ValidationError
		return errors.As(err, &ve) && strings.Contains(ve.Message, "limit for private documents")
	}

	t.Run("count", func(t *testing.T) {
		svc := newPrivateSvc(t, &erPrivate{}, quietLog())
		for i := range MaxPrivateUploadsPerOwner {
			if _, err := svc.Store(ctx, "m-owner", "", "application/pdf", testPDF); err != nil {
				t.Fatalf("upload %d: %v", i+1, err)
			}
		}
		if _, err := svc.Store(ctx, "m-owner", "", "application/pdf", testPDF); !quotaErr(err) {
			t.Fatalf("upload past the count quota: err = %v, want the quota message", err)
		}
		if _, err := svc.Store(ctx, "m-other", "", "application/pdf", testPDF); err != nil {
			t.Fatalf("another member is limited by someone else's quota: %v", err)
		}
	})

	t.Run("bytes", func(t *testing.T) {
		repo := &erPrivate{}
		svc := newPrivateSvc(t, repo, quietLog())
		big := bytes.Repeat([]byte{'x'}, MaxPrivateUploadBytes)
		for i := range MaxPrivateUploadBytesPerOwner / MaxPrivateUploadBytes {
			if _, err := svc.Store(ctx, "m-owner", "", "application/pdf", big); err != nil {
				t.Fatalf("upload %d: %v", i+1, err)
			}
		}
		if _, err := svc.Store(ctx, "m-owner", "", "application/pdf", testPDF); !quotaErr(err) {
			t.Fatalf("upload past the size quota: err = %v, want the quota message", err)
		}
		if len(repo.rows) != MaxPrivateUploadBytesPerOwner/MaxPrivateUploadBytes {
			t.Errorf("stored %d documents, want the refused one not stored", len(repo.rows))
		}
	})
}
