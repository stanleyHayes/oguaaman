package service

import (
	"context"
	"crypto/rand"
	"fmt"
	"log/slog"
	"math/big"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/oguaa/backend/internal/domain"
)

// ── data-rights requests (contract K10; Act 843 ss. 32–35) ───────────────────
//
// A public, sign-in-optional intake for access, correction, deletion and
// objection requests, with a reference the requester can quote, a response
// deadline, a steward queue and an auditable status history.

// Response windows. Requests are due within 40 days, objections within 21.
const (
	privacyRequestDueDays   = 40
	privacyObjectionDueDays = 21
)

// Input limits.
const (
	privacyNameMax    = 120
	privacyContactMax = 200
	privacyDetailsMin = 10
	privacyDetailsMax = 4000
	privacyTargetMax  = 500
	privacyNoteMax    = 2000
)

// referenceAlphabet avoids look-alike characters (0/O, 1/I) so a reference
// read out over the phone survives.
const referenceAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// PrivacyRequestInput is the public request form.
type PrivacyRequestInput struct {
	Type      string `json:"type"`
	Name      string `json:"name"`
	Contact   string `json:"contact"`
	Details   string `json:"details"`
	TargetURL string `json:"targetUrl"`
}

// PrivacyRequestView is a queue row: the request plus deadline signals.
type PrivacyRequestView struct {
	domain.PrivacyRequest
	Overdue   bool `json:"overdue"`
	DueInDays int  `json:"dueInDays"`
}

// PrivacyRequestService runs the intake and the steward queue.
type PrivacyRequestService struct {
	repo    domain.PrivacyRequestRepository
	members domain.MemberRepository       // optional: finds stewards to alert
	notifs  domain.NotificationRepository // optional: steward alert
	log     *slog.Logger
	now     func() time.Time
}

func NewPrivacyRequestService(repo domain.PrivacyRequestRepository, members domain.MemberRepository, notifs domain.NotificationRepository, log *slog.Logger) *PrivacyRequestService {
	if log == nil {
		log = slog.Default()
	}
	return &PrivacyRequestService{repo: repo, members: members, notifs: notifs, log: log, now: func() time.Time { return time.Now().UTC() }}
}

// Submit validates and files a request. requester is the signed-in member, or
// nil for an anonymous request.
func (s *PrivacyRequestService) Submit(ctx context.Context, in PrivacyRequestInput, requester *domain.Member) (*domain.PrivacyRequest, error) {
	in, err := cleanPrivacyInput(in)
	if err != nil {
		return nil, err
	}
	ref, err := newPrivacyReference()
	if err != nil {
		return nil, err
	}
	now := s.now()
	at := now.Format(time.RFC3339)
	pr := domain.PrivacyRequest{
		ID: newID("pr-"), Reference: ref, Type: in.Type, Status: domain.PrivacyStatusReceived,
		Name: in.Name, Contact: in.Contact, Details: in.Details, TargetURL: in.TargetURL,
		IdentityCheck: "unverified", ReceivedAt: at, UpdatedAt: at,
		DueAt:   now.AddDate(0, 0, privacyDueDays(in.Type)).Format(time.RFC3339),
		History: []domain.PrivacyRequestEvent{{Status: domain.PrivacyStatusReceived, At: at}},
	}
	if requester != nil {
		pr.MemberID, pr.IdentityCheck = requester.ID, "signed_in"
	}
	if err := s.repo.Insert(ctx, pr); err != nil {
		return nil, err
	}
	s.alertStewards(ctx, pr)
	return &pr, nil
}

// List is the steward queue, soonest deadline first, with overdue flags.
func (s *PrivacyRequestService) List(ctx context.Context) ([]PrivacyRequestView, error) {
	rows, err := s.repo.All(ctx)
	if err != nil {
		return nil, err
	}
	now := s.now()
	out := make([]PrivacyRequestView, 0, len(rows))
	for _, r := range rows {
		out = append(out, s.view(r, now))
	}
	return out, nil
}

// Transition moves a request to a new status with a note, recording who did it.
func (s *PrivacyRequestService) Transition(ctx context.Context, id, status, note string, actor *domain.Member) (*PrivacyRequestView, error) {
	status = strings.TrimSpace(status)
	if !domain.ValidPrivacyStatus(status) {
		return nil, &domain.ValidationError{Message: "Status must be received, in_progress, completed or refused."}
	}
	note = strings.TrimSpace(note)
	if utf8.RuneCountInString(note) > privacyNoteMax {
		return nil, &domain.ValidationError{Message: "Keep the note under 2,000 characters."}
	}
	if status == domain.PrivacyStatusRefused && note == "" {
		return nil, &domain.ValidationError{Message: "Say why the request is refused — the requester must be told the reason."}
	}
	now := s.now()
	ev := domain.PrivacyRequestEvent{Status: status, Note: note, At: now.Format(time.RFC3339)}
	if actor != nil {
		ev.ActorID = actor.ID
	}
	closedAt := ""
	if status == domain.PrivacyStatusCompleted || status == domain.PrivacyStatusRefused {
		closedAt = ev.At
	}
	if err := s.repo.Transition(ctx, id, status, closedAt, ev); err != nil {
		return nil, err
	}
	pr, err := s.repo.ByID(ctx, id)
	if err != nil {
		return nil, err
	}
	v := s.view(*pr, now)
	return &v, nil
}

func (s *PrivacyRequestService) view(r domain.PrivacyRequest, now time.Time) PrivacyRequestView {
	v := PrivacyRequestView{PrivacyRequest: r}
	if due, err := time.Parse(time.RFC3339, r.DueAt); err == nil {
		v.DueInDays = int(due.Sub(now).Hours() / 24)
		open := r.Status == domain.PrivacyStatusReceived || r.Status == domain.PrivacyStatusInProgress
		v.Overdue = open && now.After(due)
	}
	return v
}

// alertStewards drops an in-app notice for every steward. Best-effort: the
// request is already filed and shows in the queue either way.
func (s *PrivacyRequestService) alertStewards(ctx context.Context, pr domain.PrivacyRequest) {
	due := pr.DueAt
	if len(due) >= 10 {
		due = due[:10]
	}
	s.notifyStewards(ctx, "n-pr-", "New privacy request "+pr.Reference,
		"A "+pr.Type+" request is waiting. Reply by "+due+".", pr.ReceivedAt)
}

// privacyDueSoonDays is how close to its deadline an open request must be for
// the daily steward reminder.
const privacyDueSoonDays = 7

// AlertDueSoon sends stewards one reminder listing how many open requests are
// due within a week and how many are overdue. It returns the number of
// requests in the reminder (0 = nothing sent). Run it once a day.
func (s *PrivacyRequestService) AlertDueSoon(ctx context.Context) (int, error) {
	rows, err := s.List(ctx)
	if err != nil {
		return 0, err
	}
	dueSoon, overdue := 0, 0
	for _, r := range rows {
		open := r.Status == domain.PrivacyStatusReceived || r.Status == domain.PrivacyStatusInProgress
		switch {
		case !open:
		case r.Overdue:
			overdue++
		case r.DueInDays <= privacyDueSoonDays:
			dueSoon++
		}
	}
	if dueSoon+overdue == 0 {
		return 0, nil
	}
	body := fmt.Sprintf("%d privacy request(s) due within %d days and %d overdue. Act 843 sets the deadlines.",
		dueSoon, privacyDueSoonDays, overdue)
	s.notifyStewards(ctx, "n-prdue-", "Privacy requests need a reply", body, s.now().Format(time.RFC3339))
	return dueSoon + overdue, nil
}

// notifyStewards drops the same in-app notice for every active steward.
func (s *PrivacyRequestService) notifyStewards(ctx context.Context, idPrefix, title, body, at string) {
	if s.members == nil || s.notifs == nil {
		return
	}
	all, err := s.members.All(ctx)
	if err != nil {
		s.log.Warn("privacy request: steward alert skipped", "err", err)
		return
	}
	for _, m := range all {
		if m.Role != domain.RoleSteward || m.Suspended {
			continue
		}
		if err := s.notifs.Insert(ctx, domain.Notification{
			ID: newID(idPrefix), MemberID: m.ID, Kind: "privacy_request",
			Title: title, Body: body, Link: "/privacy-requests", CreatedAt: at,
		}); err != nil {
			s.log.Warn("privacy request: steward alert failed", "err", err)
		}
	}
}

func privacyDueDays(t string) int {
	if t == domain.PrivacyRequestObjection {
		return privacyObjectionDueDays
	}
	return privacyRequestDueDays
}

// cleanPrivacyInput trims and validates the form.
func cleanPrivacyInput(in PrivacyRequestInput) (PrivacyRequestInput, error) {
	in.Type = strings.ToLower(strings.TrimSpace(in.Type))
	in.Name = strings.TrimSpace(in.Name)
	in.Contact = strings.TrimSpace(in.Contact)
	in.Details = strings.TrimSpace(in.Details)
	in.TargetURL = strings.TrimSpace(in.TargetURL)
	switch {
	case !domain.ValidPrivacyRequestType(in.Type):
		return in, &domain.ValidationError{Message: "Choose a request type: access, correction, deletion, objection or other."}
	case utf8.RuneCountInString(in.Name) < 2 || utf8.RuneCountInString(in.Name) > privacyNameMax:
		return in, &domain.ValidationError{Message: "Tell us your name (2–120 characters)."}
	case !validContact(in.Contact):
		return in, &domain.ValidationError{Message: "Give an email address or phone number we can reply to."}
	case utf8.RuneCountInString(in.Details) < privacyDetailsMin || utf8.RuneCountInString(in.Details) > privacyDetailsMax:
		return in, &domain.ValidationError{Message: "Describe your request in 10 to 4,000 characters."}
	}
	target, ok := cleanTargetURL(in.TargetURL)
	if !ok {
		return in, &domain.ValidationError{Message: "The link to the page must be a web address (https://…)."}
	}
	in.TargetURL = target
	return in, nil
}

// validContact accepts an email address or a phone number.
func validContact(c string) bool {
	if c == "" || utf8.RuneCountInString(c) > privacyContactMax {
		return false
	}
	if at := strings.Index(c, "@"); at > 0 {
		return strings.Contains(c[at+1:], ".") && !strings.ContainsAny(c, " <>")
	}
	digits := 0
	for _, r := range c {
		switch {
		case r >= '0' && r <= '9':
			digits++
		case strings.ContainsRune("+-() ", r):
		default:
			return false
		}
	}
	return digits >= 7 && digits <= 15
}

// cleanTargetURL accepts an http(s) URL or a site path ("/memoriam/…").
func cleanTargetURL(u string) (string, bool) {
	if u == "" {
		return "", true
	}
	if utf8.RuneCountInString(u) > privacyTargetMax {
		return "", false
	}
	if strings.HasPrefix(u, "/") && !strings.HasPrefix(u, "//") {
		return u, true
	}
	safe := safeURL(u)
	if lower := strings.ToLower(safe); strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "http://") {
		return safe, true
	}
	return "", false
}

// newPrivacyReference mints "DR-XXXXXX".
func newPrivacyReference() (string, error) {
	var b strings.Builder
	b.WriteString("DR-")
	alphabetSize := big.NewInt(int64(len(referenceAlphabet)))
	for range 6 {
		n, err := rand.Int(rand.Reader, alphabetSize)
		if err != nil {
			return "", err
		}
		b.WriteByte(referenceAlphabet[n.Int64()])
	}
	return b.String(), nil
}
