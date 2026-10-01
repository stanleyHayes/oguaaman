package service

import (
	"context"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
)

// ── account erasure (Act 843 s.33, Apple 5.1.1(v), Google Play; contract K6) ─
//
// EraseMember is the ONE erasure path: DELETE /api/me, the public deletion
// request flow and staff-actioned requests all end here. It walks every
// collection that holds the member's personal data — not just the member
// document — deleting what has no reason to survive and stripping identity and
// contact details from the records the law or the platform must keep
// (payments, reports, published content). The member document goes last, so a
// failure part-way leaves an account the member can still retry from.

// FileRemover deletes a first-party upload by file name.
type FileRemover interface {
	RemoveUpload(name string) error
}

// MediaEraser deletes a member's media from an external host (Cloudinary).
type MediaEraser interface {
	// MemberFolder is where every asset the member uploaded is stored; it is
	// part of each asset's delivery URL.
	MemberFolder(memberID string) string
	// DeleteMemberMedia deletes the member's assets, except those a string in
	// keep points at (content that outlives the erasure still shows them).
	DeleteMemberMedia(ctx context.Context, memberID string, keep []string) error
}

// AppleForgetter releases a member's App Store purchase records. The IAP
// service keeps them pseudonymised so a receipt can never be redeemed twice.
type AppleForgetter interface {
	ForgetAppleTransactions(ctx context.Context, memberID string) error
}

// DeviceEraser removes a member's registered push devices.
type DeviceEraser interface {
	DeleteByMember(ctx context.Context, memberID string) error
}

// NewsAuthorEraser rewrites the member's news bylines to "Former member" and
// deletes their unpublished drafts, so nothing can go live under the erased
// name (F071).
type NewsAuthorEraser interface {
	EraseAuthor(ctx context.Context, memberID, formerName string) error
}

// ErasureDeps wires the erasure service. Optional dependencies may be nil.
type ErasureDeps struct {
	Members  domain.MemberRepository
	Data     domain.MemberDataRepository
	Codes    domain.AccountDeletionCodeRepository
	Blocks   domain.BlockRepository
	Devices  DeviceEraser
	News     NewsAuthorEraser
	Private  domain.PrivateUploadRepository
	Uploads  domain.UploadRepository
	Files    FileRemover
	Media    MediaEraser
	Apple    AppleForgetter
	Email    EmailSender
	WhatsApp MessageSender
	Log      *slog.Logger
}

// ErasureService deletes accounts.
type ErasureService struct{ d ErasureDeps }

func NewErasureService(d ErasureDeps) *ErasureService {
	if d.Log == nil {
		d.Log = slog.Default()
	}
	return &ErasureService{d: d}
}

// ErasureResult is the response body of every successful deletion.
type ErasureResult struct {
	Deleted  bool     `json:"deleted"`
	Retained []string `json:"retained"`
}

// DeletionBlockedError lists what the member must settle before deleting.
type DeletionBlockedError struct{ Blockers []string }

func (e *DeletionBlockedError) Error() string {
	return "account deletion is blocked: " + strings.Join(e.Blockers, " ")
}

// ErrDeletionCodeInvalid is returned for a wrong, expired or used-up code.
var ErrDeletionCodeInvalid = errors.New("that code didn't work — request a new code and try again")

const (
	deletionCodeTTL         = 15 * time.Minute
	maxDeletionCodeAttempts = 5
)

// RetainedAfterErasure is the plain-English list of what survives an erasure
// and why. It is returned to the member with every deletion.
func RetainedAfterErasure() []string {
	return []string{
		"Payment records — tickets, pledges and donations, subscriptions, promotions, shop orders and escrow jobs keep their amounts, references and dates, because tax, accounting and payment-dispute rules require them. Your name, email, phone number, delivery address and account id are removed from them; a record that must stay linked to an account points at a new random id instead.",
		"App Store purchase references — kept without your identity so the same receipt can never be redeemed twice.",
		"Reports you made — kept without your name so moderation decisions stay accountable.",
		"Reviews, tributes and published news articles you wrote — kept under \"Former member\" so conversations and memorials still make sense. Your name is removed from them.",
		"Business registration details from a verified shop (legal name, registration and tax numbers) — kept for marketplace and tax records. Your Ghana Card number, ID documents, phone, address and settlement account are deleted.",
		"Listings you posted on behalf of an institution — they belong to that institution and stay with it.",
		"Photos and videos you uploaded that still appear on content that stays up — an institution's page or listings, a published news article, or another member's page — stay with that content, no longer linked to you. Everything else you uploaded is deleted.",
		affiliateRecordsNotice,
		"Moderation, audit and privacy-request records — kept so we can show how the platform was run and how your request was handled.",
		"An anonymous, locked account placeholder (\"Former member\") under that new random id, so records that must stay linked to an account (payments, institution listings, published news) stay consistent without your old account id. It holds no personal details and can never sign in.",
	}
}

// DeleteWithPassword re-checks the signed-in member's password, then deletes
// the account (DELETE /api/me).
func (s *ErasureService) DeleteWithPassword(ctx context.Context, memberID, password string) (*ErasureResult, error) {
	m, err := s.d.Members.ByID(ctx, memberID)
	if err != nil {
		return nil, err
	}
	if m.PasswordHash == "" || bcrypt.CompareHashAndPassword([]byte(m.PasswordHash), []byte(password)) != nil {
		return nil, ErrInvalidCredentials
	}
	return s.deleteAccount(ctx, m.ID)
}

// DeletionBlockers lists obligations that must be settled first (open escrow,
// paid orders awaiting fulfilment). Empty means the account can be deleted.
func (s *ErasureService) DeletionBlockers(ctx context.Context, memberID string) ([]string, error) {
	if s.d.Data == nil {
		return nil, nil
	}
	return s.d.Data.OpenObligations(ctx, memberID)
}

// DeleteAccountByStaff erases a member on a steward's instruction (a verified
// deletion request from someone who cannot use the self-service flows), after
// the same obligation checks, and audits who did it.
func (s *ErasureService) DeleteAccountByStaff(ctx context.Context, memberID string, staff *domain.Member) (*ErasureResult, error) {
	res, err := s.deleteAccount(ctx, memberID)
	if err == nil {
		actor := ""
		if staff != nil {
			actor = staff.ID
		}
		s.d.Log.Info("account erased by staff", "type", "audit", "event", "account.erased_by_staff",
			"member", pseudonym(memberID), "staffId", actor)
	}
	return res, err
}

func (s *ErasureService) deleteAccount(ctx context.Context, memberID string) (*ErasureResult, error) {
	blockers, err := s.DeletionBlockers(ctx, memberID)
	if err != nil {
		return nil, err
	}
	if len(blockers) > 0 {
		return nil, &DeletionBlockedError{Blockers: blockers}
	}
	return s.EraseMember(ctx, memberID)
}

// ── public deletion requests (people who cannot sign in) ────────────────────

// StartDeletionRequest sends a 6-digit confirmation code to the account's
// email/phone when identifier matches an account. It reports nothing about
// whether one does; the returned code is for the caller to echo in local
// development only.
func (s *ErasureService) StartDeletionRequest(ctx context.Context, identifier string) (string, error) {
	m, err := s.lookup(ctx, identifier)
	if err != nil || m == nil || s.d.Codes == nil {
		return "", err
	}
	code, err := newVerificationCode()
	if err != nil {
		return "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	now := time.Now().UTC()
	if err := s.d.Codes.Save(ctx, domain.AccountDeletionCode{
		MemberID: m.ID, CodeHash: string(hash), ExpiresAt: now.Add(deletionCodeTTL), CreatedAt: now,
	}); err != nil {
		return "", err
	}
	s.deliverDeletionCode(ctx, m, code)
	return code, nil
}

// ConfirmDeletionRequest checks the code and deletes the account.
func (s *ErasureService) ConfirmDeletionRequest(ctx context.Context, identifier, code string) (*ErasureResult, error) {
	m, err := s.lookup(ctx, identifier)
	if err != nil {
		return nil, err
	}
	if m == nil || s.d.Codes == nil {
		return nil, ErrDeletionCodeInvalid
	}
	rec, err := s.d.Codes.Get(ctx, m.ID)
	if err != nil {
		return nil, err
	}
	if rec == nil {
		return nil, ErrDeletionCodeInvalid
	}
	if time.Now().After(rec.ExpiresAt) || rec.Attempts >= maxDeletionCodeAttempts {
		_ = s.d.Codes.Delete(ctx, m.ID)
		return nil, ErrDeletionCodeInvalid
	}
	if bcrypt.CompareHashAndPassword([]byte(rec.CodeHash), []byte(normalizeVerificationCode(code))) != nil {
		if err := s.d.Codes.IncrementAttempts(ctx, m.ID); err != nil {
			return nil, err
		}
		return nil, ErrDeletionCodeInvalid
	}
	return s.deleteAccount(ctx, m.ID)
}

// lookup resolves an email/phone to a live account; (nil, nil) when none.
func (s *ErasureService) lookup(ctx context.Context, identifier string) (*domain.Member, error) {
	identifier = normalizeIdentifier(identifier)
	if identifier == "" {
		return nil, nil
	}
	m, err := s.d.Members.ByIdentifier(ctx, identifier)
	var nf *domain.NotFoundError
	if errors.As(err, &nf) {
		return nil, nil
	}
	return m, err
}

func (s *ErasureService) deliverDeletionCode(ctx context.Context, m *domain.Member, code string) {
	body := fmt.Sprintf("Your Oguaa account deletion code is %s. It expires in %d minutes. "+
		"If you did not ask to delete your account, ignore this message and nothing will change.", code, int(deletionCodeTTL.Minutes()))
	if s.d.Email != nil && strings.TrimSpace(m.Email) != "" {
		if err := s.d.Email.Send(ctx, m.Email, "Your Oguaa account deletion code", "<p>"+html.EscapeString(body)+"</p>"); err != nil {
			s.d.Log.Warn("deletion code email failed", "member", pseudonym(m.ID), "err", err)
		}
	}
	if s.d.WhatsApp != nil && strings.TrimSpace(m.Phone) != "" {
		if err := s.d.WhatsApp.SendMessage(ctx, m.Phone, body); err != nil {
			s.d.Log.Warn("deletion code whatsapp failed", "member", pseudonym(m.ID), "err", err)
		}
	}
}

// ── the erasure itself ───────────────────────────────────────────────────────

type erasureStep struct {
	name string
	run  func(ctx context.Context, memberID string) error
}

// EraseMember erases one member's personal data everywhere it is held. Each
// step is idempotent; on error nothing about the member document has changed
// yet and the whole erasure can simply run again.
func (s *ErasureService) EraseMember(ctx context.Context, memberID string) (*ErasureResult, error) {
	if memberID == "" {
		return nil, &domain.NotFoundError{Entity: "member"}
	}
	for _, st := range s.steps() {
		if err := st.run(ctx, memberID); err != nil {
			return nil, fmt.Errorf("erase %s: %w", st.name, err)
		}
	}
	tombstoneID, err := s.moveToTombstone(ctx, memberID)
	if err != nil {
		return nil, fmt.Errorf("erase member id: %w", err)
	}
	if err := s.d.Members.Anonymize(ctx, memberID, tombstoneID); err != nil {
		return nil, fmt.Errorf("erase member record: %w", err)
	}
	s.d.Log.Info("account erased", "type", "audit", "event", "account.erased", "member", pseudonym(memberID),
		"tombstone", tombstoneID)
	return &ErasureResult{Deleted: true, Retained: RetainedAfterErasure()}, nil
}

// moveToTombstone gives the erased member a new random id — their
// tombstone's — and moves every record the erasure keeps onto it. Member ids
// minted at sign-up embed the person's name, and the kept records (payments,
// institution listings, published news) must not carry it. The id is
// reserved on the member record before anything moves, so a retried erasure
// reuses it; erasing a tombstone again keeps its id. Without the member-data
// store nothing can be moved, so the tombstone stays under the old id.
func (s *ErasureService) moveToTombstone(ctx context.Context, memberID string) (string, error) {
	if s.d.Data == nil {
		return memberID, nil
	}
	suffix, err := randomHex(8)
	if err != nil {
		return "", err
	}
	tombstoneID, err := s.d.Members.ReserveErasureID(ctx, memberID, erasedIDPrefix+suffix)
	if err != nil {
		return "", err
	}
	switch tombstoneID {
	case "":
		return "", errors.New("no erasure id was reserved")
	case memberID:
		return memberID, nil // already a tombstone
	}
	if err := s.d.Data.ReassignToTombstone(ctx, memberID, tombstoneID); err != nil {
		return "", err
	}
	return tombstoneID, nil
}

// erasedIDPrefix starts every tombstone id ("erased-" + 16 random hex digits).
const erasedIDPrefix = "erased-"

// steps lists the erasure steps, skipping dependencies that are not wired.
func (s *ErasureService) steps() []erasureStep {
	d := s.d
	all := []erasureStep{{"uploaded files", s.eraseFiles}}
	if d.Private != nil {
		all = append(all, erasureStep{"private documents", d.Private.DeleteByOwner})
	}
	if d.Data != nil {
		all = append(all, s.dataSteps()...)
	}
	if d.Blocks != nil {
		all = append(all, erasureStep{"blocks", d.Blocks.DeleteByMember})
	}
	if d.Devices != nil {
		all = append(all, erasureStep{"push devices", d.Devices.DeleteByMember})
	}
	if d.News != nil {
		all = append(all, erasureStep{"news bylines", func(ctx context.Context, id string) error {
			return d.News.EraseAuthor(ctx, id, formerMemberName)
		}})
	}
	if d.Apple != nil {
		all = append(all, erasureStep{"apple purchases", d.Apple.ForgetAppleTransactions})
	}
	if d.Codes != nil {
		all = append(all, erasureStep{"deletion codes", d.Codes.Delete})
	}
	return all
}

func (s *ErasureService) dataSteps() []erasureStep {
	data := s.d.Data
	return []erasureStep{
		{"listings", func(ctx context.Context, id string) error {
			_, err := data.UnpublishListings(ctx, id)
			return err
		}},
		{"authorship", data.AnonymiseAuthorship},
		{"reports", data.PseudonymiseReports},
		{"follows", data.DeleteFollows},
		{"notifications", data.DeleteNotifications},
		{"institution roles", data.DeleteOrgRoles},
		{"agent profile", data.SuspendAgentProfile},
		{"agent jobs", data.PseudonymiseAgentJobs},
		{"orders", data.PseudonymiseOrders},
		{"artist bookings", data.PseudonymiseArtistBookings},
		{"payment contacts", data.StripPaymentContacts},
		{"business verification", data.ScrubBusinessVerifications},
		{"usage counters", data.DeleteUsageCounters},
	}
}

// eraseFiles deletes the files the member uploaded — first-party uploads and
// media on the external host — except those still shown by content the
// erasure keeps (institution pages and listings, published news, other
// members' pages), which would otherwise break for everyone, irreversibly.
// It runs before any step takes content down, and fails the erasure (to be
// retried) if it cannot tell which files are still in use. The deletions
// themselves are best-effort (a missing file is already gone; a media-host
// outage is logged for staff follow-up) — they must not trap the member in
// an account they have asked to leave. The ownership records go once the
// files did; a kept file stays with its content, unlinked from the member.
func (s *ErasureService) eraseFiles(ctx context.Context, memberID string) error {
	d := s.d
	recs, err := s.uploadRecords(ctx, memberID)
	if err != nil {
		return err
	}
	keep, err := s.uploadsStillShown(ctx, memberID, recs)
	if err != nil {
		return err
	}
	if d.Media != nil {
		if err := d.Media.DeleteMemberMedia(ctx, memberID, keep); err != nil {
			d.Log.Error("erasure: external media not deleted — follow up manually", "member", pseudonym(memberID),
				"folder", d.Media.MemberFolder(memberID), "err", err)
		}
	}
	if d.Uploads == nil {
		return nil
	}
	s.removeUploadFiles(recs, keep)
	return d.Uploads.DeleteByOwner(ctx, memberID)
}

// uploadRecords lists the member's first-party uploads (none when upload
// ownership is not tracked).
func (s *ErasureService) uploadRecords(ctx context.Context, memberID string) ([]domain.UploadRecord, error) {
	if s.d.Uploads == nil {
		return nil, nil
	}
	return s.d.Uploads.ByOwner(ctx, memberID)
}

// removeUploadFiles deletes the upload files that no kept content shows.
func (s *ErasureService) removeUploadFiles(recs []domain.UploadRecord, keep []string) {
	if s.d.Files == nil {
		return
	}
	for _, rec := range recs {
		if uploadShown(keep, rec.Name) {
			continue
		}
		if err := s.d.Files.RemoveUpload(rec.Name); err != nil {
			s.d.Log.Error("erasure: upload file not deleted — follow up manually", "file", rec.Name, "err", err)
		}
	}
}

// uploadsStillShown returns the strings in retained content that point at a
// file the member uploaded: one of their first-party uploads, or anything in
// their folder on the media host.
func (s *ErasureService) uploadsStillShown(ctx context.Context, memberID string, recs []domain.UploadRecord) ([]string, error) {
	if s.d.Data == nil {
		return nil, nil
	}
	needles := make([]string, 0, len(recs)+1)
	for _, rec := range recs {
		needles = append(needles, uploadPath(rec.Name))
	}
	if s.d.Media != nil {
		needles = append(needles, s.d.Media.MemberFolder(memberID)+"/")
	}
	if len(needles) == 0 {
		return nil, nil
	}
	refs, err := s.d.Data.RetainedMediaRefs(ctx, memberID, needles)
	if err != nil {
		return nil, fmt.Errorf("find uploads still shown: %w", err)
	}
	return refs, nil
}

// uploadPath is where a first-party upload is served.
func uploadPath(name string) string { return "/uploads/" + name }

// uploadShown reports whether a retained string points at the upload.
func uploadShown(refs []string, name string) bool {
	path := uploadPath(name)
	for _, ref := range refs {
		if strings.Contains(ref, path) {
			return true
		}
	}
	return false
}
