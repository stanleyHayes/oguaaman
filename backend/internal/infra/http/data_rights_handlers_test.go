package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── minimal fakes (embedding the interface: only what a test calls exists) ──

type drMembers struct {
	domain.MemberRepository
	list       []domain.Member
	anonymized []string
}

func (d *drMembers) All(context.Context) ([]domain.Member, error) { return d.list, nil }
func (d *drMembers) find(match func(domain.Member) bool) (*domain.Member, error) {
	for _, m := range d.list {
		if match(m) {
			cp := m
			return &cp, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}
func (d *drMembers) ByID(_ context.Context, id string) (*domain.Member, error) {
	return d.find(func(m domain.Member) bool { return m.ID == id })
}
func (d *drMembers) BySlug(_ context.Context, slug string) (*domain.Member, error) {
	return d.find(func(m domain.Member) bool { return m.Slug == slug })
}
func (d *drMembers) ByIdentifier(_ context.Context, ident string) (*domain.Member, error) {
	return d.find(func(m domain.Member) bool { return m.Email == ident })
}
func (d *drMembers) ReserveErasureID(_ context.Context, _, candidate string) (string, error) {
	return candidate, nil
}
func (d *drMembers) Anonymize(_ context.Context, id, _ string) error {
	d.anonymized = append(d.anonymized, id)
	return nil
}

// drData succeeds at every erase step; export and obligations are scripted.
type drData struct {
	obligations []string
	exportErr   error
}

func (d *drData) ExportRecords(context.Context, string) (*domain.MemberRecords, error) {
	if d.exportErr != nil {
		return nil, d.exportErr
	}
	return &domain.MemberRecords{}, nil
}
func (d *drData) OpenObligations(context.Context, string) ([]string, error) {
	return d.obligations, nil
}
func (d *drData) DeleteNotifications(context.Context, string) error        { return nil }
func (d *drData) DeleteFollows(context.Context, string) error              { return nil }
func (d *drData) DeleteOrgRoles(context.Context, string) error             { return nil }
func (d *drData) SuspendAgentProfile(context.Context, string) error        { return nil }
func (d *drData) PseudonymiseAgentJobs(context.Context, string) error      { return nil }
func (d *drData) AnonymiseAuthorship(context.Context, string) error        { return nil }
func (d *drData) PseudonymiseReports(context.Context, string) error        { return nil }
func (d *drData) UnpublishListings(context.Context, string) (int, error)   { return 0, nil }
func (d *drData) PseudonymiseOrders(context.Context, string) error         { return nil }
func (d *drData) PseudonymiseArtistBookings(context.Context, string) error { return nil }
func (d *drData) StripPaymentContacts(context.Context, string) error       { return nil }
func (d *drData) ScrubBusinessVerifications(context.Context, string) error { return nil }
func (d *drData) DeleteUsageCounters(context.Context, string) error        { return nil }
func (d *drData) RetainedMediaRefs(context.Context, string, []string) ([]string, error) {
	return nil, nil
}
func (d *drData) ReassignToTombstone(context.Context, string, string) error { return nil }

type drPrivate struct {
	rows map[string]domain.PrivateUpload
}

func (p *drPrivate) Insert(_ context.Context, u domain.PrivateUpload) error {
	p.rows[u.ID] = u
	return nil
}
func (p *drPrivate) ByID(_ context.Context, id string) (*domain.PrivateUpload, error) {
	if u, ok := p.rows[id]; ok {
		return &u, nil
	}
	return nil, &domain.NotFoundError{Entity: "document"}
}
func (p *drPrivate) ByOwner(context.Context, string) ([]domain.PrivateUpload, error) { return nil, nil }
func (p *drPrivate) DeleteByOwner(context.Context, string) error                     { return nil }
func (p *drPrivate) OwnerUsage(_ context.Context, owner string) (int, int64, error) {
	n, total := 0, int64(0)
	for _, u := range p.rows {
		if u.OwnerID == owner {
			n++
			total += int64(u.Size)
		}
	}
	return n, total, nil
}

type drListings struct {
	domain.ListingRepository
	list []domain.Listing
}

func (l drListings) Find(_ context.Context, f domain.ListingFilter) ([]domain.Listing, error) {
	out := []domain.Listing{}
	for _, x := range l.list {
		if (f.OwnerID == "" || x.OwnerID == f.OwnerID) && (f.Status == "" || x.Status == f.Status) {
			out = append(out, x)
		}
	}
	return out, nil
}

type drOrgs struct{ domain.OrganizationRepository }

func (drOrgs) ByKind(context.Context, string) ([]domain.Organization, error) { return nil, nil }

type drPlaces struct{ domain.PlaceRepository }

func (drPlaces) All(context.Context) ([]domain.Place, error) { return nil, nil }

type drClaims struct{ domain.OrgClaimRepository }

func (drClaims) ManagedOrgIDs(context.Context, string) ([]string, error) { return nil, nil }

// ── fixture ──────────────────────────────────────────────────────────────────

type drFixture struct {
	h       *Handler
	members *drMembers
	data    *drData
}

func newDRFixture(t *testing.T) *drFixture {
	t.Helper()
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct horse"), bcrypt.MinCost)
	members := &drMembers{list: []domain.Member{
		{ID: "m1", Slug: "ama", DisplayName: "Ama", Email: "ama@example.com", PasswordHash: string(hash),
			Birthday: "1990-04-12", Role: domain.RoleSteward},
		{ID: "m2", Slug: "kofi", DisplayName: "Kofi", Email: "kofi@example.com"},
		{ID: "m3", Slug: "former-x", DisplayName: "Former member", Suspended: true},
	}}
	listings := drListings{list: []domain.Listing{
		{ID: "l1", OwnerID: "m2", Status: domain.StatusApproved, Title: "Live"},
		{ID: "l2", OwnerID: "m2", Status: domain.StatusRejected, Title: "Rejected", RejectionReason: "suspected scam"},
	}}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	svc := service.New(service.Deps{Members: members, Listings: listings, Orgs: drOrgs{}, Places: drPlaces{}, Claims: drClaims{}, Log: log})
	data := &drData{}
	private, err := service.NewPrivateUploadService(&drPrivate{rows: map[string]domain.PrivateUpload{}}, "test-secret", log)
	if err != nil {
		t.Fatal(err)
	}
	h := &Handler{svc: svc, authRequired: true, log: log, limiter: newRateLimiter(), uploadDir: t.TempDir()}
	h.WithDataRights(DataRightsDeps{
		Erasure:        service.NewErasureService(service.ErasureDeps{Members: members, Data: data, Log: log}),
		Export:         service.NewExportService(members, data),
		PrivateUploads: private,
	})
	return &drFixture{h: h, members: members, data: data}
}

// as returns r carrying m as the signed-in member.
func as(r *http.Request, m *domain.Member) *http.Request {
	if m == nil {
		return r
	}
	return r.WithContext(context.WithValue(r.Context(), memberCtxKey, m))
}

func jsonBody(v any) io.Reader {
	b, _ := json.Marshal(v)
	return bytes.NewReader(b)
}

// ── K5 through the router (the F021 reproduction) ────────────────────────────

func TestPublicMemberEndpointsCarryNoPrivateFields(t *testing.T) {
	f := newDRFixture(t)
	router := NewRouter(f.h, nil, nil, f.h.log)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/members", nil))
	body := w.Body.String()
	if w.Code != http.StatusOK {
		t.Fatalf("GET /api/members → %d", w.Code)
	}
	for _, leak := range []string{"1990", "birthday", "mfaEnabled", "suspended", "Former member", "ama@example.com"} {
		if strings.Contains(body, leak) {
			t.Errorf("anonymous GET /api/members leaks %q: %s", leak, body)
		}
	}

	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/members/kofi", nil))
	if strings.Contains(w.Body.String(), "suspected scam") || strings.Contains(w.Body.String(), `"rejected"`) {
		t.Errorf("anonymous profile shows a rejected listing: %s", w.Body.String())
	}
	var view struct {
		Blocked     *bool `json:"blocked"`
		BlockedByMe *bool `json:"blockedByMe"`
		BlockedMe   *bool `json:"blockedMe"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &view)
	if view.Blocked == nil || view.BlockedByMe == nil || view.BlockedMe == nil {
		t.Errorf("profile must carry blocked/blockedByMe/blockedMe: %s", w.Body.String())
	}

	// The owner sees their own listings at every status.
	w = httptest.NewRecorder()
	f.h.Member(w, as(withPath(httptest.NewRequest(http.MethodGet, "/api/members/kofi", nil), "slug", "kofi"), &domain.Member{ID: "m2"}))
	if !strings.Contains(w.Body.String(), "suspected scam") {
		t.Errorf("owner view misses their rejected listing: %s", w.Body.String())
	}
}

func withPath(r *http.Request, key, val string) *http.Request {
	r.SetPathValue(key, val)
	return r
}

// ── K6 ───────────────────────────────────────────────────────────────────────

func TestDeleteMyAccountResponses(t *testing.T) {
	f := newDRFixture(t)
	me := &domain.Member{ID: "m1"}

	w := httptest.NewRecorder()
	f.h.DeleteMyAccount(w, as(httptest.NewRequest(http.MethodDelete, "/api/me", jsonBody(map[string]string{"password": "nope"})), me))
	if w.Code != http.StatusForbidden {
		t.Fatalf("wrong password → %d, want 403", w.Code)
	}

	f.data.obligations = []string{"1 paid shop order(s) your customers are still waiting for"}
	w = httptest.NewRecorder()
	f.h.DeleteMyAccount(w, as(httptest.NewRequest(http.MethodDelete, "/api/me", jsonBody(map[string]string{"password": "correct horse"})), me))
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "blockers") {
		t.Fatalf("blocked deletion → %d %s, want 409 with blockers", w.Code, w.Body.String())
	}

	f.data.obligations = nil
	w = httptest.NewRecorder()
	f.h.DeleteMyAccount(w, as(httptest.NewRequest(http.MethodDelete, "/api/me", jsonBody(map[string]string{"password": "correct horse"})), me))
	var out struct {
		Deleted  bool     `json:"deleted"`
		Retained []string `json:"retained"`
	}
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &out) != nil || !out.Deleted || len(out.Retained) == 0 {
		t.Fatalf("delete → %d %s, want 200 {deleted:true, retained:[…]}", w.Code, w.Body.String())
	}
	if len(f.members.anonymized) != 1 {
		t.Error("the account was not erased")
	}
}

func TestPublicDeletionRequestNeverRevealsAccounts(t *testing.T) {
	f := newDRFixture(t)
	for _, ident := range []string{"nobody@example.com", "kofi@example.com"} {
		w := httptest.NewRecorder()
		f.h.StartAccountDeletion(w, httptest.NewRequest(http.MethodPost, "/api/account/deletion-requests", jsonBody(map[string]string{"identifier": ident})))
		if w.Code != http.StatusAccepted || strings.TrimSpace(w.Body.String()) != `{"ok":true}` {
			t.Errorf("%s → %d %s, want 202 {\"ok\":true}", ident, w.Code, w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	f.h.ConfirmAccountDeletion(w, httptest.NewRequest(http.MethodPost, "/api/account/deletion-requests/confirm",
		jsonBody(map[string]string{"identifier": "kofi@example.com", "code": "123456"})))
	if w.Code != http.StatusBadRequest {
		t.Errorf("confirm without a code on record → %d, want 400", w.Code)
	}
}

// ── K7 ───────────────────────────────────────────────────────────────────────

func TestExportFailsLoudlyWhenASectionFails(t *testing.T) {
	f := newDRFixture(t)
	me := &domain.Member{ID: "m1"}
	w := httptest.NewRecorder()
	f.h.ExportMyData(w, as(httptest.NewRequest(http.MethodGet, "/api/me/export", nil), me))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"processing"`) || !strings.Contains(w.Body.String(), "ama@example.com") {
		t.Fatalf("export → %d %s", w.Code, w.Body.String())
	}
	f.data.exportErr = errors.New("export section tickets: timeout")
	w = httptest.NewRecorder()
	f.h.ExportMyData(w, as(httptest.NewRequest(http.MethodGet, "/api/me/export", nil), &domain.Member{ID: "m2"}))
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("export with a failed section → %d, want 500", w.Code)
	}
}

// ── K8 ───────────────────────────────────────────────────────────────────────

func multipartFile(t *testing.T, content []byte, extra map[string]string) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", "upload.bin")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = fw.Write(content)
	for k, v := range extra {
		_ = mw.WriteField(k, v)
	}
	_ = mw.Close()
	return &buf, mw.FormDataContentType()
}

func TestPrivateUploadRoundTripAndAccessControl(t *testing.T) {
	f := newDRFixture(t)
	owner := &domain.Member{ID: "m2", Role: domain.RoleMember}
	pdf := []byte("%PDF-1.4\nGhana Card front\n%%EOF")

	body, ct := multipartFile(t, pdf, map[string]string{"purpose": "agent_id"})
	r := httptest.NewRequest(http.MethodPost, "/api/uploads/private", body)
	r.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	f.h.UploadPrivate(w, as(r, owner))
	var out struct {
		Ref string `json:"ref"`
		ID  string `json:"id"`
	}
	if w.Code != http.StatusCreated || json.Unmarshal(w.Body.Bytes(), &out) != nil || !strings.HasPrefix(out.Ref, "private:") {
		t.Fatalf("upload → %d %s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "http") {
		t.Errorf("a private upload must never return a URL: %s", w.Body.String())
	}

	get := func(fn http.HandlerFunc, m *domain.Member) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		fn(rec, as(withPath(httptest.NewRequest(http.MethodGet, "/x", nil), "id", out.ID), m))
		return rec
	}
	if rec := get(f.h.MyPrivateUpload, owner); rec.Code != http.StatusOK || !bytes.Equal(rec.Body.Bytes(), pdf) ||
		rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("owner read → %d (cache %q)", rec.Code, rec.Header().Get("Cache-Control"))
	}
	if rec := get(f.h.MyPrivateUpload, &domain.Member{ID: "m-other"}); rec.Code != http.StatusNotFound {
		t.Errorf("another member's read → %d, want 404", rec.Code)
	}
	if rec := get(f.h.AdminPrivateUpload, &domain.Member{ID: "m-other", Role: domain.RoleMember}); rec.Code != http.StatusForbidden {
		t.Errorf("non-staff admin read → %d, want 403", rec.Code)
	}
	if rec := get(f.h.AdminPrivateUpload, &domain.Member{ID: "m-vet", Role: domain.RoleVettingOfficer}); rec.Code != http.StatusOK {
		t.Errorf("vetting officer read → %d, want 200", rec.Code)
	}

	// Anything but an image or PDF is refused, whatever the client claims.
	body, ct = multipartFile(t, []byte("<html><script>alert(1)</script></html>"), nil)
	r = httptest.NewRequest(http.MethodPost, "/api/uploads/private", body)
	r.Header.Set("Content-Type", ct)
	w = httptest.NewRecorder()
	f.h.UploadPrivate(w, as(r, owner))
	if w.Code != http.StatusBadRequest {
		t.Errorf("html upload → %d, want 400", w.Code)
	}
}

// ── G086 / K9 ────────────────────────────────────────────────────────────────

func TestPublicUploadStripsMetadataAndSignatureNeedsConfig(t *testing.T) {
	f := newDRFixture(t)
	me := &domain.Member{ID: "m2"}
	// A tiny JPEG with an EXIF comment (JPEG APP1) in front of the image data.
	jpegWithExif := []byte{0xFF, 0xD8}
	exif := append([]byte("Exif\x00\x00MM\x00\x2a\x00\x00\x00\x08\x00\x00"), []byte("GPS-HOME")...)
	seg := []byte{0xFF, 0xE1, byte((len(exif) + 2) >> 8), byte(len(exif) + 2)}
	jpegWithExif = append(append(jpegWithExif, seg...), exif...)
	jpegWithExif = append(jpegWithExif, tinyJPEGBody(t)...)

	body, ct := multipartFile(t, jpegWithExif, nil)
	r := httptest.NewRequest(http.MethodPost, "/api/uploads", body)
	r.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	f.h.Upload(w, as(r, me))
	if w.Code != http.StatusCreated {
		t.Fatalf("upload → %d %s", w.Code, w.Body.String())
	}
	files, _ := os.ReadDir(f.h.uploadDir)
	if len(files) != 1 {
		t.Fatalf("stored files = %d, want 1", len(files))
	}
	stored, _ := os.ReadFile(filepath.Join(f.h.uploadDir, files[0].Name()))
	if bytes.Contains(stored, []byte("GPS-HOME")) || bytes.Contains(stored, []byte("Exif")) {
		t.Error("EXIF metadata was stored with the public upload")
	}

	w = httptest.NewRecorder()
	f.h.CloudinarySignature(w, as(httptest.NewRequest(http.MethodPost, "/api/uploads/cloudinary-signature", nil), me))
	if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "signed_uploads_unavailable") {
		t.Errorf("unconfigured signature → %d %s, want 503 signed_uploads_unavailable", w.Code, w.Body.String())
	}
}

// tinyJPEGBody returns a real JPEG without its SOI marker.
func tinyJPEGBody(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := encodeTestJPEG(&buf); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()[2:]
}

func encodeTestJPEG(w io.Writer) error {
	return jpeg.Encode(w, image.NewRGBA(image.Rect(0, 0, 8, 8)), nil)
}
