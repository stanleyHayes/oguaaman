package service

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
)

// ── fakes for the data-rights tests (names prefixed "er" to stay private to
// this area) ─────────────────────────────────────────────────────────────────

// erMembers serves members by id/identifier and records erasures: the ids
// anonymised, the tombstone id each went to, and the reserved erasure ids.
type erMembers struct {
	stubMembers
	byID       map[string]*domain.Member
	anonymized []string
	tombstones []string
	erasureIDs map[string]string
}

func (m *erMembers) ByID(_ context.Context, id string) (*domain.Member, error) {
	if mem, ok := m.byID[id]; ok {
		cp := *mem
		return &cp, nil
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}
func (m *erMembers) ByIdentifier(_ context.Context, ident string) (*domain.Member, error) {
	for _, mem := range m.byID {
		if mem.Email == ident || mem.Phone == ident {
			cp := *mem
			return &cp, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}
func (m *erMembers) ReserveErasureID(_ context.Context, id, candidate string) (string, error) {
	if m.erasureIDs == nil {
		m.erasureIDs = map[string]string{}
	}
	if _, ok := m.erasureIDs[id]; !ok {
		m.erasureIDs[id] = candidate
	}
	return m.erasureIDs[id], nil
}
func (m *erMembers) Anonymize(_ context.Context, id, tombstoneID string) error {
	m.anonymized = append(m.anonymized, id)
	m.tombstones = append(m.tombstones, tombstoneID)
	return nil
}

// erData is a MemberDataRepository that records every erase call in order and
// can be told to fail one step.
type erData struct {
	calls       []string
	failOn      string
	obligations []string
	records     *domain.MemberRecords
	exportErr   error
	// retainedMedia / retainedErr script RetainedMediaRefs; mediaNeedles and
	// stepsBeforeScan record what it was asked and which steps ran first.
	retainedMedia   []string
	retainedErr     error
	mediaNeedles    [][]string
	stepsBeforeScan []string
	// reassigned records each ReassignToTombstone call as "from->to".
	reassigned []string
}

func (d *erData) step(name string) error {
	d.calls = append(d.calls, name)
	if name == d.failOn {
		return errors.New("boom")
	}
	return nil
}
func (d *erData) ExportRecords(context.Context, string) (*domain.MemberRecords, error) {
	if d.exportErr != nil {
		return nil, d.exportErr
	}
	return d.records, nil
}
func (d *erData) OpenObligations(context.Context, string) ([]string, error) {
	return d.obligations, nil
}
func (d *erData) DeleteNotifications(context.Context, string) error   { return d.step("notifications") }
func (d *erData) DeleteFollows(context.Context, string) error         { return d.step("follows") }
func (d *erData) DeleteOrgRoles(context.Context, string) error        { return d.step("orgRoles") }
func (d *erData) SuspendAgentProfile(context.Context, string) error   { return d.step("agent") }
func (d *erData) PseudonymiseAgentJobs(context.Context, string) error { return d.step("agentJobs") }
func (d *erData) AnonymiseAuthorship(context.Context, string) error   { return d.step("authorship") }
func (d *erData) PseudonymiseReports(context.Context, string) error   { return d.step("reports") }
func (d *erData) UnpublishListings(context.Context, string) (int, error) {
	return 0, d.step("listings")
}
func (d *erData) PseudonymiseOrders(context.Context, string) error         { return d.step("orders") }
func (d *erData) PseudonymiseArtistBookings(context.Context, string) error { return d.step("bookings") }
func (d *erData) StripPaymentContacts(context.Context, string) error       { return d.step("payments") }
func (d *erData) ScrubBusinessVerifications(context.Context, string) error { return d.step("kyc") }
func (d *erData) DeleteUsageCounters(context.Context, string) error        { return d.step("usage") }
func (d *erData) RetainedMediaRefs(_ context.Context, _ string, needles []string) ([]string, error) {
	d.mediaNeedles = append(d.mediaNeedles, needles)
	d.stepsBeforeScan = append([]string{}, d.calls...)
	return d.retainedMedia, d.retainedErr
}
func (d *erData) ReassignToTombstone(_ context.Context, memberID, tombstoneID string) error {
	d.reassigned = append(d.reassigned, memberID+"->"+tombstoneID)
	return d.step("reassign")
}

// erCodes is an in-memory deletion-code store.
type erCodes struct {
	rows map[string]domain.AccountDeletionCode
}

func (c *erCodes) Save(_ context.Context, rec domain.AccountDeletionCode) error {
	if c.rows == nil {
		c.rows = map[string]domain.AccountDeletionCode{}
	}
	c.rows[rec.MemberID] = rec
	return nil
}
func (c *erCodes) Get(_ context.Context, id string) (*domain.AccountDeletionCode, error) {
	if rec, ok := c.rows[id]; ok {
		return &rec, nil
	}
	return nil, nil
}
func (c *erCodes) IncrementAttempts(_ context.Context, id string) error {
	rec := c.rows[id]
	rec.Attempts++
	c.rows[id] = rec
	return nil
}
func (c *erCodes) Delete(_ context.Context, id string) error {
	delete(c.rows, id)
	return nil
}

// erUploads / erFiles track first-party upload ownership and file deletion.
type erUploads struct{ recs []domain.UploadRecord }

func (u *erUploads) Record(_ context.Context, rec domain.UploadRecord) error {
	u.recs = append(u.recs, rec)
	return nil
}
func (u *erUploads) ByOwner(_ context.Context, owner string) ([]domain.UploadRecord, error) {
	out := []domain.UploadRecord{}
	for _, r := range u.recs {
		if r.OwnerID == owner {
			out = append(out, r)
		}
	}
	return out, nil
}
func (u *erUploads) DeleteByOwner(_ context.Context, owner string) error {
	keep := u.recs[:0]
	for _, r := range u.recs {
		if r.OwnerID != owner {
			keep = append(keep, r)
		}
	}
	u.recs = keep
	return nil
}

type erFiles struct{ removed []string }

func (f *erFiles) RemoveUpload(name string) error {
	f.removed = append(f.removed, name)
	return nil
}

// erMedia is the external media host: each member's assets sit under
// "oguaa/m/<id>", and every deletion is recorded with what it had to keep.
type erMedia struct {
	deleted []string
	kept    [][]string
}

func (m *erMedia) MemberFolder(id string) string { return "oguaa/m/" + id }
func (m *erMedia) DeleteMemberMedia(_ context.Context, id string, keep []string) error {
	m.deleted = append(m.deleted, id)
	m.kept = append(m.kept, keep)
	return nil
}

// erDevices / erApple record the remaining erasure hooks.
type erDevices struct{ deleted []string }

func (d *erDevices) DeleteByMember(_ context.Context, id string) error {
	d.deleted = append(d.deleted, id)
	return nil
}

type erApple struct{ forgotten []string }

func (a *erApple) ForgetAppleTransactions(_ context.Context, id string) error {
	a.forgotten = append(a.forgotten, id)
	return nil
}

// erMail captures delivered messages.
type erMail struct{ bodies []string }

func (m *erMail) Send(_ context.Context, _, _, html string) error {
	m.bodies = append(m.bodies, html)
	return nil
}

func quietLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

type erasureFixture struct {
	svc     *ErasureService
	members *erMembers
	data    *erData
	codes   *erCodes
	uploads *erUploads
	files   *erFiles
	media   *erMedia
	devices *erDevices
	apple   *erApple
	mail    *erMail
}

func newErasureFixture(t *testing.T) *erasureFixture {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte("correct horse"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	f := &erasureFixture{
		members: &erMembers{byID: map[string]*domain.Member{
			"m1": {ID: "m1", Email: "ama@example.com", PasswordHash: string(hash)},
			"m2": {ID: "m2", Email: "kofi@example.com"},
		}},
		data: &erData{}, codes: &erCodes{}, files: &erFiles{}, media: &erMedia{}, devices: &erDevices{}, apple: &erApple{}, mail: &erMail{},
		uploads: &erUploads{recs: []domain.UploadRecord{{Name: "a.jpg", OwnerID: "m1"}, {Name: "b.jpg", OwnerID: "m2"}}},
	}
	f.svc = NewErasureService(ErasureDeps{
		Members: f.members, Data: f.data, Codes: f.codes, Blocks: &fakeBlockRepo{}, Devices: f.devices,
		Uploads: f.uploads, Files: f.files, Media: f.media, Apple: f.apple, Email: f.mail, Log: quietLog(),
	})
	return f
}

// K6 / P048 / A016 / G098: every personal-data store is visited, and the member
// document is anonymised last.
func TestEraseMemberCoversEveryStoreAndAnonymisesLast(t *testing.T) {
	f := newErasureFixture(t)
	res, err := f.svc.DeleteWithPassword(context.Background(), "m1", "correct horse")
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if !res.Deleted || len(res.Retained) == 0 {
		t.Fatalf("result = %+v, want deleted with a retained list", res)
	}
	want := []string{"listings", "authorship", "reports", "follows", "notifications", "orgRoles", "agent",
		"agentJobs", "orders", "bookings", "payments", "kyc", "usage", "reassign"}
	// R07: nothing is matched by the member's (unverified) email address, so
	// there is no affiliate step: seller-registered affiliates go through the
	// privacy-request queue.
	if strings.Join(f.data.calls, ",") != strings.Join(want, ",") {
		t.Errorf("erase steps = %v, want %v", f.data.calls, want)
	}
	if len(f.members.anonymized) != 1 || f.members.anonymized[0] != "m1" {
		t.Errorf("member document not anonymised: %v", f.members.anonymized)
	}
	if len(f.files.removed) != 1 || f.files.removed[0] != "a.jpg" {
		t.Errorf("removed files = %v, want only the member's own a.jpg", f.files.removed)
	}
	if recs, _ := f.uploads.ByOwner(context.Background(), "m1"); len(recs) != 0 {
		t.Errorf("upload records survive: %v", recs)
	}
	if len(f.devices.deleted) != 1 || len(f.apple.forgotten) != 1 {
		t.Errorf("devices=%v apple=%v, want both erased once", f.devices.deleted, f.apple.forgotten)
	}
}

// A failing step stops the erasure BEFORE the member document changes, so the
// member can retry (they could not sign in again afterwards).
func TestEraseMemberFailureLeavesAccountRetryable(t *testing.T) {
	f := newErasureFixture(t)
	f.data.failOn = "orders"
	if _, err := f.svc.EraseMember(context.Background(), "m1"); err == nil {
		t.Fatal("expected the failing step to fail the erasure")
	}
	if len(f.members.anonymized) != 0 {
		t.Error("member document anonymised despite an unfinished erasure")
	}
}

// R15: member ids minted at sign-up embed the person's name, so the erasure
// moves every record it keeps onto a new random id — the tombstone's — after
// every step that finds records by the old id has run, and the tombstone is
// written under that id.
func TestEraseMovesKeptRecordsOntoARandomTombstoneID(t *testing.T) {
	f := newErasureFixture(t)
	f.members.byID["usr-kwame-mensah-482913"] = &domain.Member{ID: "usr-kwame-mensah-482913"}
	if _, err := f.svc.EraseMember(context.Background(), "usr-kwame-mensah-482913"); err != nil {
		t.Fatal(err)
	}
	tomb := f.members.erasureIDs["usr-kwame-mensah-482913"]
	suffix, ok := strings.CutPrefix(tomb, "erased-")
	if _, err := hex.DecodeString(suffix); !ok || err != nil || len(suffix) != 16 {
		t.Fatalf("tombstone id = %q, want erased- and 16 random hex digits", tomb)
	}
	if strings.Join(f.data.reassigned, ",") != "usr-kwame-mensah-482913->"+tomb {
		t.Errorf("reassigned = %v, want the kept records moved onto %s", f.data.reassigned, tomb)
	}
	if last := f.data.calls[len(f.data.calls)-1]; last != "reassign" {
		t.Errorf("records moved before every step that finds them by the old id ran: %v", f.data.calls)
	}
	if strings.Join(f.members.tombstones, ",") != tomb || strings.Join(f.members.anonymized, ",") != "usr-kwame-mensah-482913" {
		t.Errorf("anonymised %v into %v, want the member's record replaced by the tombstone %s",
			f.members.anonymized, f.members.tombstones, tomb)
	}
	// A second member gets a different random id.
	if _, err := f.svc.EraseMember(context.Background(), "m2"); err != nil {
		t.Fatal(err)
	}
	if other := f.members.erasureIDs["m2"]; other == tomb || !strings.HasPrefix(other, "erased-") {
		t.Errorf("second tombstone id = %q (first %q), want a fresh random id", other, tomb)
	}
}

// R15: an erasure interrupted while moving records resumes onto the SAME
// tombstone id (it is reserved on the member record first), so no kept record
// is left pointing at an id no tombstone carries.
func TestErasureRetryReusesTheReservedTombstoneID(t *testing.T) {
	f := newErasureFixture(t)
	f.data.failOn = "reassign"
	if _, err := f.svc.EraseMember(context.Background(), "m1"); err == nil {
		t.Fatal("expected the interrupted move to fail the erasure")
	}
	if len(f.members.anonymized) != 0 {
		t.Fatal("member record replaced before its records were moved")
	}
	f.data.failOn = ""
	if _, err := f.svc.EraseMember(context.Background(), "m1"); err != nil {
		t.Fatal(err)
	}
	tomb := f.members.erasureIDs["m1"]
	want := "m1->" + tomb
	if len(f.data.reassigned) != 2 || f.data.reassigned[0] != want || f.data.reassigned[1] != want {
		t.Errorf("reassigned = %v, want both attempts onto %s", f.data.reassigned, tomb)
	}
	if strings.Join(f.members.tombstones, ",") != tomb {
		t.Errorf("tombstone ids = %v, want %s", f.members.tombstones, tomb)
	}
}

// R15: erasing a tombstone again (a steward re-running a request) keeps it
// where it is: its erasure id is its own, and nothing moves.
func TestErasingATombstoneAgainLeavesItInPlace(t *testing.T) {
	f := newErasureFixture(t)
	const tomb = "erased-0123456789abcdef"
	f.members.byID[tomb] = &domain.Member{ID: tomb, Suspended: true, ErasedAt: "2026-09-30T00:00:00Z", ErasureID: tomb}
	f.members.erasureIDs = map[string]string{tomb: tomb}
	if _, err := f.svc.EraseMember(context.Background(), tomb); err != nil {
		t.Fatal(err)
	}
	if len(f.data.reassigned) != 0 {
		t.Errorf("records moved off a tombstone onto itself: %v", f.data.reassigned)
	}
	if strings.Join(f.members.tombstones, ",") != tomb {
		t.Errorf("tombstone ids = %v, want it replaced in place", f.members.tombstones)
	}
}

// R15: the deletion response promises what the erasure now does.
func TestRetainedStatementSaysKeptRecordsLoseTheAccountID(t *testing.T) {
	var payments, placeholder bool
	for _, s := range RetainedAfterErasure() {
		payments = payments || strings.HasPrefix(s, "Payment records") && strings.Contains(s, "account id are removed")
		placeholder = placeholder || strings.Contains(s, "placeholder") && strings.Contains(s, "without your old account id")
	}
	if !payments || !placeholder {
		t.Errorf("retained statement does not say kept records lose the account id: %v", RetainedAfterErasure())
	}
}

// R16: files the member uploaded that content outliving the erasure still
// shows (an institution's crest, an article's cover) are kept, on disk and on
// the media host; everything else they uploaded is deleted. The lookup runs
// before any step takes content down.
func TestEraseKeepsUploadsRetainedContentStillShows(t *testing.T) {
	f := newErasureFixture(t)
	f.uploads.recs = append(f.uploads.recs, domain.UploadRecord{Name: "crest.png", OwnerID: "m1"})
	f.data.retainedMedia = []string{
		"https://api.oguaaman.com/uploads/crest.png",
		"Opening day ![hall](https://res.cloudinary.com/demo/image/upload/v1/oguaa/m/m1/hall.jpg) at the castle.",
	}
	if _, err := f.svc.EraseMember(context.Background(), "m1"); err != nil {
		t.Fatal(err)
	}
	want := []string{"/uploads/a.jpg", "/uploads/crest.png", "oguaa/m/m1/"}
	if len(f.data.mediaNeedles) != 1 || strings.Join(f.data.mediaNeedles[0], "|") != strings.Join(want, "|") {
		t.Fatalf("retained content searched for %v, want %v", f.data.mediaNeedles, want)
	}
	if len(f.data.stepsBeforeScan) != 0 {
		t.Errorf("steps %v ran before the uploads still shown were found", f.data.stepsBeforeScan)
	}
	if strings.Join(f.files.removed, ",") != "a.jpg" {
		t.Errorf("removed files = %v, want only a.jpg (crest.png is still shown)", f.files.removed)
	}
	if len(f.media.deleted) != 1 || f.media.deleted[0] != "m1" ||
		strings.Join(f.media.kept[0], "|") != strings.Join(f.data.retainedMedia, "|") {
		t.Errorf("media host: deleted %v keeping %v, want m1's media minus what retained content shows", f.media.deleted, f.media.kept)
	}
	if recs, _ := f.uploads.ByOwner(context.Background(), "m1"); len(recs) != 0 {
		t.Errorf("upload records still link files to the erased member: %v", recs)
	}
}

// R16: when retained content cannot be read, nothing is deleted — a file
// deletion cannot be undone — and the erasure fails so it can be retried.
func TestEraseDeletesNoFileWhenRetainedContentCannotBeChecked(t *testing.T) {
	f := newErasureFixture(t)
	f.data.retainedErr = errors.New("listings: timeout")
	if _, err := f.svc.EraseMember(context.Background(), "m1"); err == nil {
		t.Fatal("expected the erasure to fail")
	}
	if len(f.files.removed) != 0 || len(f.media.deleted) != 0 {
		t.Errorf("deleted files %v / media %v without knowing what is still shown", f.files.removed, f.media.deleted)
	}
	if recs, _ := f.uploads.ByOwner(context.Background(), "m1"); len(recs) != 1 {
		t.Errorf("upload records = %v, want them kept for the retry", recs)
	}
	if len(f.data.calls) != 0 || len(f.members.anonymized) != 0 {
		t.Errorf("erasure went on after the failure: steps %v, anonymised %v", f.data.calls, f.members.anonymized)
	}
}

// R16: a member with no uploads (and no media host) costs no content scan.
func TestEraseSkipsTheScanWhenTheMemberUploadedNothing(t *testing.T) {
	f := newErasureFixture(t)
	f.svc.d.Media = nil
	f.uploads.recs = nil
	if _, err := f.svc.EraseMember(context.Background(), "m1"); err != nil {
		t.Fatal(err)
	}
	if len(f.data.mediaNeedles) != 0 {
		t.Errorf("scanned retained content for %v with nothing to look for", f.data.mediaNeedles)
	}
}

func TestDeleteWithPasswordRejectsWrongPassword(t *testing.T) {
	f := newErasureFixture(t)
	if _, err := f.svc.DeleteWithPassword(context.Background(), "m1", "wrong"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("err = %v, want ErrInvalidCredentials", err)
	}
	// A password-less (invited) account cannot be deleted by password at all.
	if _, err := f.svc.DeleteWithPassword(context.Background(), "m2", ""); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("password-less: err = %v, want ErrInvalidCredentials", err)
	}
	if len(f.data.calls) != 0 || len(f.members.anonymized) != 0 {
		t.Error("something was erased after a failed password check")
	}
}

// P057: open escrow or unfulfilled paid orders block deletion until settled.
func TestDeletionBlockedByOpenObligations(t *testing.T) {
	f := newErasureFixture(t)
	f.data.obligations = []string{"1 Oguaa Outside job(s) with money held in escrow"}
	_, err := f.svc.DeleteWithPassword(context.Background(), "m1", "correct horse")
	var blocked *DeletionBlockedError
	if !errors.As(err, &blocked) || len(blocked.Blockers) != 1 {
		t.Fatalf("err = %v, want DeletionBlockedError", err)
	}
	if len(f.data.calls) != 0 || len(f.members.anonymized) != 0 {
		t.Error("a blocked deletion still erased data")
	}
}

// K6 public flow: no enumeration, a working code deletes, wrong codes are
// counted and exhaust the code.
func TestPublicDeletionRequestFlow(t *testing.T) {
	ctx := context.Background()
	f := newErasureFixture(t)

	if code, err := f.svc.StartDeletionRequest(ctx, "nobody@example.com"); err != nil || code != "" {
		t.Fatalf("unknown identifier: code=%q err=%v, want silent no-op", code, err)
	}
	if len(f.codes.rows) != 0 || len(f.mail.bodies) != 0 {
		t.Fatal("unknown identifier produced a code or a message")
	}

	code, err := f.svc.StartDeletionRequest(ctx, "  AMA@example.com ")
	if err != nil || len(code) != 6 {
		t.Fatalf("start: code=%q err=%v", code, err)
	}
	if len(f.mail.bodies) != 1 || !strings.Contains(f.mail.bodies[0], code) {
		t.Fatalf("the code was not emailed to the account: %v", f.mail.bodies)
	}
	if rec := f.codes.rows["m1"]; rec.CodeHash == "" || strings.Contains(rec.CodeHash, code) {
		t.Fatal("the code must be stored only as a hash")
	}

	wrong := "111111"
	if code == wrong {
		wrong = "222222"
	}
	if _, err := f.svc.ConfirmDeletionRequest(ctx, "ama@example.com", wrong); !errors.Is(err, ErrDeletionCodeInvalid) {
		t.Fatalf("wrong code: err = %v", err)
	}
	if f.codes.rows["m1"].Attempts != 1 {
		t.Fatalf("attempts = %d, want 1", f.codes.rows["m1"].Attempts)
	}
	res, err := f.svc.ConfirmDeletionRequest(ctx, "ama@example.com", code)
	if err != nil || !res.Deleted {
		t.Fatalf("confirm: res=%+v err=%v", res, err)
	}
	if len(f.members.anonymized) != 1 {
		t.Fatal("confirmed request did not erase the account")
	}
	if _, ok := f.codes.rows["m1"]; ok {
		t.Error("the used code survived the erasure")
	}
}

func TestDeletionCodeExhaustedOrExpired(t *testing.T) {
	ctx := context.Background()
	f := newErasureFixture(t)
	code, _ := f.svc.StartDeletionRequest(ctx, "ama@example.com")

	rec := f.codes.rows["m1"]
	rec.Attempts = maxDeletionCodeAttempts
	f.codes.rows["m1"] = rec
	if _, err := f.svc.ConfirmDeletionRequest(ctx, "ama@example.com", code); !errors.Is(err, ErrDeletionCodeInvalid) {
		t.Fatalf("exhausted code: err = %v", err)
	}

	code, _ = f.svc.StartDeletionRequest(ctx, "ama@example.com")
	rec = f.codes.rows["m1"]
	rec.ExpiresAt = time.Now().Add(-time.Minute)
	f.codes.rows["m1"] = rec
	if _, err := f.svc.ConfirmDeletionRequest(ctx, "ama@example.com", code); !errors.Is(err, ErrDeletionCodeInvalid) {
		t.Fatalf("expired code: err = %v", err)
	}
	if len(f.members.anonymized) != 0 {
		t.Error("an exhausted or expired code deleted the account")
	}
}

// K7 / F031 / G097: the export carries every section, fails loudly when one
// cannot be read, and strips other people's contact details.
func TestExportMemberSectionsAndRedaction(t *testing.T) {
	ctx := context.Background()
	members := &erMembers{byID: map[string]*domain.Member{
		"m1": {ID: "m1", DisplayName: "Ama", Email: "ama@example.com", Phone: "+233200000001", DateOfBirth: "1990-01-02"},
	}}
	data := &erData{records: &domain.MemberRecords{
		SellerOrders: []domain.CommerceOrder{{Reference: "ord-1", BuyerName: "Kofi", BuyerEmail: "kofi@example.com",
			BuyerPhone: "+233200000002", DeliveryAddress: "House 4"}},
		ArtistBookingsReceived: []domain.ArtistBooking{{RequesterName: "Esi", RequesterEmail: "esi@example.com", RequesterPhone: "+2331"}},
		PushDevices:            []domain.PushSubscription{{ID: "ExponentPushToken[abcdefghijkl]", ExpoToken: "ExponentPushToken[abcdefghijkl]", Auth: "secret"}},
	}}
	exp, err := NewExportService(members, data).ExportMember(ctx, "m1")
	if err != nil {
		t.Fatal(err)
	}
	if exp.Profile.Email != "ama@example.com" || exp.Profile.Phone == "" || exp.Profile.DateOfBirth == "" {
		t.Errorf("own identifiers missing from the member's own export: %+v", exp.Profile)
	}
	o := exp.SellerOrders[0]
	if o.BuyerName != "Kofi" || o.BuyerEmail != "" || o.BuyerPhone != "" || o.DeliveryAddress != "" {
		t.Errorf("seller order not redacted: %+v", o)
	}
	b := exp.ArtistBookingsReceived[0]
	if b.RequesterEmail != "" || b.RequesterPhone != "" {
		t.Errorf("booking requester contact leaked: %+v", b)
	}
	p := exp.PushDevices[0]
	if p.Auth != "" || strings.Contains(p.ExpoToken, "abcdef") {
		t.Errorf("device credentials leaked: %+v", p)
	}
	if len(exp.Processing.Recipients) == 0 || exp.Processing.AutomatedDecisions == "" {
		t.Error("processing section missing")
	}

	data.exportErr = errors.New("export section tickets: timeout")
	if _, err := NewExportService(members, data).ExportMember(ctx, "m1"); err == nil {
		t.Error("a failed section must fail the export, not return an incomplete one")
	}
}

// R07: the export never carries records matched by the member's unverified
// email address (affiliate accounts), and both the export and the deletion
// response point to the privacy-request queue for them instead.
func TestExportAndErasureDoNotReachAffiliatesByEmail(t *testing.T) {
	members := &erMembers{byID: map[string]*domain.Member{"m1": {ID: "m1", Email: "kofi@gmail.com"}}}
	exp, err := NewExportService(members, &erData{records: &domain.MemberRecords{}}).ExportMember(context.Background(), "m1")
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(exp)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "affiliateAccounts") {
		t.Error("the export still has an affiliate section matched by email")
	}
	has := func(list []string) bool {
		for _, s := range list {
			if strings.Contains(s, "Affiliate") && strings.Contains(s, "privacy/request") {
				return true
			}
		}
		return false
	}
	if !has(exp.Processing.Retention) || !has(RetainedAfterErasure()) {
		t.Error("the retained/processing text does not send affiliate requests to the privacy-request queue")
	}
}

// R28: the export carries the member's consent history, age confirmation,
// notification choices (defaults when never chosen) and AI consent — all
// private on the member record — and a tributes-written section.
func TestExportIncludesConsentAndPreferenceRecords(t *testing.T) {
	ctx := context.Background()
	consent := domain.Consent{TermsVersion: "2026-10-01", PrivacyVersion: "2026-10-01", AcceptedAt: "2026-10-02T09:00:00Z", Platform: "ios"}
	members := &erMembers{byID: map[string]*domain.Member{
		"m1": {ID: "m1", Consent: &consent, ConsentHistory: []domain.Consent{consent},
			AdultVerifiedAt: "2026-10-02T09:00:00Z", AIConsentAt: "2026-10-03T10:00:00Z",
			NotificationPrefs: &domain.NotificationPrefs{
				Categories:       domain.NotificationCategories{Safety: true, Product: true},
				ProductConsentAt: "2026-10-04T11:00:00Z",
			}},
		"m2": {ID: "m2"},
	}}
	data := &erData{records: &domain.MemberRecords{TributesWritten: []domain.TributeWritten{
		{MemorialSlug: "in-memory-of-nana", Tribute: domain.Tribute{ID: "t1", Message: "Rest well"}},
	}}}
	exp, err := NewExportService(members, data).ExportMember(ctx, "m1")
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(exp)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	profile := got["profile"].(map[string]any)
	for _, key := range []string{"consent", "consentHistory", "adultVerifiedAt", "notificationPreferences", "aiConsentAt"} {
		if profile[key] == nil {
			t.Errorf("profile.%s missing from the export", key)
		}
	}
	prefs := profile["notificationPreferences"].(map[string]any)
	if prefs["productConsentAt"] != "2026-10-04T11:00:00Z" {
		t.Errorf("marketing consent record missing: %v", prefs)
	}
	if tw, ok := got["tributesWritten"].([]any); !ok || len(tw) != 1 {
		t.Errorf("tributesWritten = %v, want the member's tribute", got["tributesWritten"])
	}

	// A member who never chose gets the defaults, not an empty object.
	exp, err = NewExportService(members, data).ExportMember(ctx, "m2")
	if err != nil {
		t.Fatal(err)
	}
	if d := exp.Profile.NotificationPreferences.NotificationPrefs; d != domain.DefaultNotificationPrefs() {
		t.Errorf("never-chosen prefs = %+v, want the defaults", d)
	}
	if exp.Profile.ConsentHistory == nil {
		t.Error("consentHistory should be an empty list, not null")
	}
}
