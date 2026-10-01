package service

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── notifications & follows (spec §8.2, §8.11) ───────────────────────────────

func (s *Service) Notifications(ctx context.Context, memberID string) ([]domain.Notification, error) {
	ns, err := s.notifs.ByMember(ctx, memberID)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(ns, func(i, j int) bool { return ns[i].CreatedAt > ns[j].CreatedAt })
	return ns, nil
}
func (s *Service) UnreadCount(ctx context.Context, memberID string) (int, error) {
	return s.notifs.UnreadCount(ctx, memberID)
}
func (s *Service) MarkNotificationRead(ctx context.Context, id, memberID string) error {
	return s.notifs.MarkRead(ctx, id, memberID)
}
func (s *Service) MarkAllNotificationsRead(ctx context.Context, memberID string) error {
	return s.notifs.MarkAllRead(ctx, memberID)
}

// FollowMemorial records that a member remembers a memorial and opts into its
// yearly remembrance (spec §8.11). Returns the updated remembered count.
func (s *Service) FollowMemorial(ctx context.Context, memberID, slug string) (int, error) {
	l, err := s.listings.GetBySlug(ctx, domain.TypeMemorial, slug)
	if err != nil {
		return 0, err
	}
	if err := s.follows.Add(ctx, memberID, l.ID); err != nil {
		return 0, err
	}
	followers, _ := s.follows.Followers(ctx, l.ID)
	return len(followers), nil
}
func (s *Service) UnfollowMemorial(ctx context.Context, memberID, slug string) (int, error) {
	l, err := s.listings.GetBySlug(ctx, domain.TypeMemorial, slug)
	if err != nil {
		return 0, err
	}
	if err := s.follows.Remove(ctx, memberID, l.ID); err != nil {
		return 0, err
	}
	followers, _ := s.follows.Followers(ctx, l.ID)
	return len(followers), nil
}
func (s *Service) IsFollowing(ctx context.Context, memberID, slug string) (bool, error) {
	l, err := s.listings.GetBySlug(ctx, domain.TypeMemorial, slug)
	if err != nil {
		return false, err
	}
	return s.follows.IsFollowing(ctx, memberID, l.ID)
}

// RunRemembrance creates a gentle "Today we remember…" notification for every
// follower of each memorial whose passing anniversary (or observed birthday) is
// `monthDay` ("MM-DD", empty = today), plus opted-in living members' birthday
// notes to their followers. It returns the number of NEW notices: each notice
// has a deterministic id for its day, so re-running a day — a restart, a
// second instance, the admin "run now" — neither duplicates a notice nor
// re-sends its email or WhatsApp copy. This is what the daily scheduler calls
// (spec §8.11).
func (s *Service) RunRemembrance(ctx context.Context, monthDay string) (int, error) {
	now := time.Now().UTC()
	if monthDay == "" {
		monthDay = now.Format("01-02")
	}
	if len(monthDay) != 5 || monthDayOf(monthDay) != monthDay {
		return 0, &domain.ValidationError{Message: "date must be MM-DD, e.g. 07-13"}
	}
	run := remembranceRun{monthDay: monthDay, year: now.Year()}
	created, err := s.remembranceNotices(ctx, run)
	if err != nil {
		return created, err
	}
	n, err := s.birthdayNotices(ctx, run)
	return created + n, err
}

// remembranceRun is one day's remembrance fan-out.
type remembranceRun struct {
	monthDay string // "MM-DD" being observed
	year     int
}

// observes reports whether an anniversary (a full date or "MM-DD") falls on
// this run. A 29 February date is observed on 28 February in non-leap years;
// otherwise it would pass unmarked three years in four.
func (r remembranceRun) observes(date string) bool {
	md := monthDayOf(date)
	if md == "" {
		return false
	}
	return md == r.monthDay || (md == "02-29" && r.monthDay == "02-28" && !isLeapYear(r.year))
}

// noticeID is the deterministic id of one recipient's notice about one subject
// on this day.
func (r remembranceRun) noticeID(kind, subjectID, memberID string) string {
	return fmt.Sprintf("ntf-%s-%s-%s-%04d-%s", kind, subjectID, memberID, r.year, r.monthDay)
}

func isLeapYear(y int) bool { return y%4 == 0 && (y%100 != 0 || y%400 == 0) }

// remembranceNotices handles memorials — anniversary of passing or observed
// birthday. The audience is everyone who "remembers" the memorial PLUS the
// followers of its creator (the default audience for a member's posts,
// spec §8.11), de-duplicated.
func (s *Service) remembranceNotices(ctx context.Context, run remembranceRun) (int, error) {
	created := 0
	memorials, err := s.Memorials(ctx)
	if err != nil {
		return created, err
	}
	for i := range memorials {
		m := &memorials[i]
		if !boolOf(m.Details["remindersEnabled"]) {
			continue
		}
		matchDeath := run.observes(asString(m.Details, "diedDate"))
		matchBirthday := boolOf(m.Details["observeBirthday"]) && run.observes(asString(m.Details, "birthday"))
		if !matchDeath && !matchBirthday {
			continue
		}
		created += s.notifyRemembranceAudience(ctx, m, matchBirthday && !matchDeath, run)
	}
	return created, nil
}

// notifyRemembranceAudience sends the "Today we remember…" notice to the
// memorial's followers and its creator's followers (minus anyone the creator
// has blocked, or who blocked them), de-duplicated. Returns the number of
// notices created.
func (s *Service) notifyRemembranceAudience(ctx context.Context, m *domain.Listing, birthday bool, run remembranceRun) int {
	audience := map[string]bool{}
	if fol, e := s.follows.Followers(ctx, m.ID); e == nil {
		for _, id := range fol {
			audience[id] = true
		}
	}
	if fol, e := s.follows.MemberFollowers(ctx, m.OwnerID); e == nil {
		for _, id := range s.withoutBlocked(ctx, m.OwnerID, fol) {
			audience[id] = true
		}
	}
	title := reminderTitle(m.Title, birthday)
	body := remembranceBody(m, birthday)
	created := 0
	for memberID := range audience {
		if s.deliverOnce(ctx, domain.Notification{
			ID: run.noticeID("rem", m.ID, memberID), MemberID: memberID, Kind: "remembrance",
			Title: title, Body: body, Link: "/memoriam/" + m.Slug,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}) {
			created++
		}
	}
	return created
}

// birthdayNotices broadcasts a living member's birthday to their followers,
// opt-in only (and never to someone blocked either way). Returns the number
// of notices created.
func (s *Service) birthdayNotices(ctx context.Context, run remembranceRun) (int, error) {
	created := 0
	members, err := s.members.All(ctx)
	if err != nil {
		return created, err
	}
	for i := range members {
		mem := &members[i]
		if !mem.BroadcastBirthday || !run.observes(mem.Birthday) {
			continue
		}
		fol, _ := s.follows.MemberFollowers(ctx, mem.ID)
		title := "Today is " + mem.DisplayName + "'s birthday"
		body := "Wish " + mem.DisplayName + " a happy birthday — Afehyia pa!"
		for _, memberID := range s.withoutBlocked(ctx, mem.ID, fol) {
			if s.deliverOnce(ctx, domain.Notification{
				ID: run.noticeID("bday", mem.ID, memberID), MemberID: memberID, Kind: "birthday",
				Title: title, Body: body, Link: "/members/" + mem.Slug,
				CreatedAt: time.Now().UTC().Format(time.RFC3339),
			}) {
				created++
			}
		}
	}
	return created, nil
}

// deliverOnce stores a notice under its deterministic id and, only when it is
// new (and the member's preferences let it through), mirrors it out of band.
func (s *Service) deliverOnce(ctx context.Context, n domain.Notification) bool {
	inserted, err := s.notifs.InsertOnce(ctx, n)
	if err != nil {
		if s.log != nil {
			s.log.Warn("scheduled notice failed", "memberId", n.MemberID, "kind", n.Kind, "err", err)
		}
		return false
	}
	if !inserted {
		return false // already sent for this day, or switched off by the member
	}
	s.notifyOutOfBandAs(ctx, n.MemberID, n.Kind, n.Title, n.Body, n.Link)
	return true
}

// withoutBlocked drops the members hidden from subjectID by a block in either
// direction.
func (s *Service) withoutBlocked(ctx context.Context, subjectID string, ids []string) []string {
	if s.blocks == nil || subjectID == "" || len(ids) == 0 {
		return ids
	}
	hidden, err := s.blocks.HiddenFor(ctx, subjectID)
	if err != nil || len(hidden) == 0 {
		return ids
	}
	skip := make(map[string]bool, len(hidden))
	for _, id := range hidden {
		skip[id] = true
	}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if !skip[id] {
			out = append(out, id)
		}
	}
	return out
}

func remembranceBody(m *domain.Listing, birthday bool) string {
	name := m.Title
	if h := asString(m.Details, "honorific"); h != "" {
		name = h + " " + name
	}
	if birthday {
		return "On " + name + "'s birthday, the community pauses to remember. Light a candle or leave a word."
	}
	return "On the anniversary of " + name + "'s passing, we remember together. Da yie."
}

func boolOf(v any) bool { b, _ := v.(bool); return b }
