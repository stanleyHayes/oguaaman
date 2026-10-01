package service

import (
	"context"
	"errors"
	"regexp"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// erRequests is an in-memory PrivacyRequestRepository.
type erRequests struct{ rows []domain.PrivacyRequest }

func (r *erRequests) Insert(_ context.Context, pr domain.PrivacyRequest) error {
	r.rows = append(r.rows, pr)
	return nil
}
func (r *erRequests) ByID(_ context.Context, id string) (*domain.PrivacyRequest, error) {
	for i := range r.rows {
		if r.rows[i].ID == id {
			pr := r.rows[i]
			return &pr, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "privacy request"}
}
func (r *erRequests) All(context.Context) ([]domain.PrivacyRequest, error) { return r.rows, nil }
func (r *erRequests) Transition(_ context.Context, id, status, closedAt string, ev domain.PrivacyRequestEvent) error {
	for i := range r.rows {
		if r.rows[i].ID == id {
			r.rows[i].Status, r.rows[i].ClosedAt, r.rows[i].UpdatedAt = status, closedAt, ev.At
			r.rows[i].History = append(r.rows[i].History, ev)
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "privacy request"}
}
func (r *erRequests) ByMember(_ context.Context, id string) ([]domain.PrivacyRequest, error) {
	out := []domain.PrivacyRequest{}
	for _, pr := range r.rows {
		if pr.MemberID == id {
			out = append(out, pr)
		}
	}
	return out, nil
}

// erNotifs records inserted notifications.
type erNotifs struct {
	stubNotifs
	sent []domain.Notification
}

func (n *erNotifs) Insert(_ context.Context, x domain.Notification) error {
	n.sent = append(n.sent, x)
	return nil
}

func validRequest() PrivacyRequestInput {
	return PrivacyRequestInput{
		Type: "deletion", Name: "Ama Mensah", Contact: "ama@example.com",
		Details: "Please remove the memorial page that shows my home address.", TargetURL: "https://citizen.oguaaman.com/memoriam/x",
	}
}

// K10 / G099: a request gets a quotable reference, a deadline, and alerts the
// stewards; signed-in requests are linked to the account.
func TestPrivacyRequestSubmit(t *testing.T) {
	ctx := context.Background()
	repo := &erRequests{}
	notifs := &erNotifs{}
	svc := NewPrivacyRequestService(repo, stewardDir{}, notifs, quietLog())
	now := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return now }

	pr, err := svc.Submit(ctx, validRequest(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^DR-[A-Z2-9]{6}$`).MatchString(pr.Reference) {
		t.Errorf("reference %q does not look like DR-XXXXXX", pr.Reference)
	}
	if pr.Status != domain.PrivacyStatusReceived || pr.IdentityCheck != "unverified" || pr.MemberID != "" {
		t.Errorf("anonymous request = %+v", pr)
	}
	if pr.DueAt != now.AddDate(0, 0, 40).Format(time.RFC3339) {
		t.Errorf("due %s, want 40 days out", pr.DueAt)
	}
	if len(notifs.sent) != 1 || notifs.sent[0].MemberID != "m-steward" {
		t.Errorf("steward alerts = %+v, want one to the steward only", notifs.sent)
	}

	obj := validRequest()
	obj.Type = "objection"
	pr2, err := svc.Submit(ctx, obj, &domain.Member{ID: "m-9"})
	if err != nil {
		t.Fatal(err)
	}
	if pr2.DueAt != now.AddDate(0, 0, 21).Format(time.RFC3339) || pr2.MemberID != "m-9" || pr2.IdentityCheck != "signed_in" {
		t.Errorf("signed-in objection = %+v, want due in 21 days and linked", pr2)
	}
}

type stewardDir struct{ stubMembers }

func (stewardDir) All(context.Context) ([]domain.Member, error) {
	return []domain.Member{
		{ID: "m-steward", Role: domain.RoleSteward},
		{ID: "m-curator", Role: domain.RoleCurator},
		{ID: "m-gone", Role: domain.RoleSteward, Suspended: true},
	}, nil
}

func TestPrivacyRequestValidation(t *testing.T) {
	svc := NewPrivacyRequestService(&erRequests{}, nil, nil, quietLog())
	cases := map[string]func(*PrivacyRequestInput){
		"unknown type":      func(in *PrivacyRequestInput) { in.Type = "marketing" },
		"missing name":      func(in *PrivacyRequestInput) { in.Name = " " },
		"no contact":        func(in *PrivacyRequestInput) { in.Contact = "" },
		"garbage contact":   func(in *PrivacyRequestInput) { in.Contact = "call me maybe" },
		"short details":     func(in *PrivacyRequestInput) { in.Details = "pls" },
		"javascript target": func(in *PrivacyRequestInput) { in.TargetURL = "javascript:alert(1)" },
	}
	for name, mutate := range cases {
		in := validRequest()
		mutate(&in)
		var ve *domain.ValidationError
		if _, err := svc.Submit(context.Background(), in, nil); !errors.As(err, &ve) {
			t.Errorf("%s: err = %v, want a validation error", name, err)
		}
	}
	ok := validRequest()
	ok.Contact, ok.TargetURL = "+233 20 000 0000", "/news/some-story"
	if _, err := svc.Submit(context.Background(), ok, nil); err != nil {
		t.Errorf("phone contact + site path: %v", err)
	}
}

func TestPrivacyRequestQueueTransitions(t *testing.T) {
	ctx := context.Background()
	repo := &erRequests{}
	svc := NewPrivacyRequestService(repo, nil, nil, quietLog())
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return start }
	pr, _ := svc.Submit(ctx, validRequest(), nil)

	svc.now = func() time.Time { return start.AddDate(0, 0, 45) }
	rows, _ := svc.List(ctx)
	if len(rows) != 1 || !rows[0].Overdue {
		t.Fatalf("queue = %+v, want the request flagged overdue after 45 days", rows)
	}

	var ve *domain.ValidationError
	if _, err := svc.Transition(ctx, pr.ID, "refused", "", &domain.Member{ID: "m-s"}); !errors.As(err, &ve) {
		t.Errorf("refusal without a reason: err = %v", err)
	}
	if _, err := svc.Transition(ctx, pr.ID, "shredded", "", nil); !errors.As(err, &ve) {
		t.Errorf("unknown status: err = %v", err)
	}
	row, err := svc.Transition(ctx, pr.ID, "completed", "Memorial address removed.", &domain.Member{ID: "m-s"})
	if err != nil {
		t.Fatal(err)
	}
	if row.Status != "completed" || row.ClosedAt == "" || row.Overdue || len(row.History) != 2 || row.History[1].ActorID != "m-s" {
		t.Errorf("completed row = %+v", row)
	}
}

// G099: the daily reminder counts open requests due within a week or overdue,
// ignores closed ones, and sends nothing when none are close.
func TestPrivacyRequestDueSoonReminder(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	due := func(days int) string { return now.AddDate(0, 0, days).Format(time.RFC3339) }
	repo := &erRequests{rows: []domain.PrivacyRequest{
		{ID: "a", Status: domain.PrivacyStatusReceived, DueAt: due(3)},
		{ID: "b", Status: domain.PrivacyStatusInProgress, DueAt: due(-2)},
		{ID: "c", Status: domain.PrivacyStatusCompleted, DueAt: due(-5)},
		{ID: "d", Status: domain.PrivacyStatusReceived, DueAt: due(30)},
	}}
	notifs := &erNotifs{}
	svc := NewPrivacyRequestService(repo, stewardDir{}, notifs, quietLog())
	svc.now = func() time.Time { return now }

	n, err := svc.AlertDueSoon(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 || len(notifs.sent) != 1 || notifs.sent[0].MemberID != "m-steward" {
		t.Fatalf("reminder: n=%d sent=%+v, want 2 requests in one steward notice", n, notifs.sent)
	}

	repo.rows = repo.rows[2:] // only the closed and the far-off request remain
	notifs.sent = nil
	if n, _ := svc.AlertDueSoon(ctx); n != 0 || len(notifs.sent) != 0 {
		t.Errorf("nothing due: n=%d sent=%d, want no reminder", n, len(notifs.sent))
	}
}
