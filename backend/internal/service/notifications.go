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
// `monthDay` ("MM-DD", empty = today). Returns the number of notices created.
// This is what the daily scheduler calls (spec §8.11).
func (s *Service) RunRemembrance(ctx context.Context, monthDay string) (int, error) {
	if monthDay == "" {
		monthDay = time.Now().UTC().Format("01-02")
	}
	created, err := s.remembranceNotices(ctx, monthDay)
	if err != nil {
		return created, err
	}
	n, err := s.birthdayNotices(ctx, monthDay)
	return created + n, err
}

// remembranceNotices handles memorials — anniversary of passing or observed
// birthday. The audience is everyone who "remembers" the memorial PLUS the
// followers of its creator (the default audience for a member's posts,
// spec §8.11), de-duplicated.
func (s *Service) remembranceNotices(ctx context.Context, monthDay string) (int, error) {
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
		matchDeath := monthDayOf(asString(m.Details, "diedDate")) == monthDay
		matchBirthday := boolOf(m.Details["observeBirthday"]) && monthDayOf(asString(m.Details, "birthday")) == monthDay
		if !matchDeath && !matchBirthday {
			continue
		}
		created += s.notifyRemembranceAudience(ctx, m, matchBirthday && !matchDeath)
	}
	return created, nil
}

// notifyRemembranceAudience inserts the "Today we remember…" notice for the
// memorial's followers and its creator's followers, de-duplicated. Returns the
// number of notices created.
func (s *Service) notifyRemembranceAudience(ctx context.Context, m *domain.Listing, birthday bool) int {
	audience := map[string]bool{}
	if fol, e := s.follows.Followers(ctx, m.ID); e == nil {
		for _, id := range fol {
			audience[id] = true
		}
	}
	if fol, e := s.follows.MemberFollowers(ctx, m.OwnerID); e == nil {
		for _, id := range fol {
			audience[id] = true
		}
	}
	created := 0
	for memberID := range audience {
		title := reminderTitle(m.Title, birthday)
		body := remembranceBody(m, birthday)
		_ = s.notifs.Insert(ctx, domain.Notification{
			ID:       "ntf-" + fmt.Sprintf("%d-%s", time.Now().UnixNano(), memberID),
			MemberID: memberID, Kind: "remembrance",
			Title:     title,
			Body:      body,
			Link:      "/memoriam/" + m.Slug,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		})
		s.notifyOutOfBand(ctx, memberID, title, body, "/memoriam/"+m.Slug)
		created++
	}
	return created
}

// birthdayNotices broadcasts a living member's birthday to their followers,
// opt-in only. Returns the number of notices created.
func (s *Service) birthdayNotices(ctx context.Context, monthDay string) (int, error) {
	created := 0
	members, err := s.members.All(ctx)
	if err != nil {
		return created, err
	}
	for i := range members {
		mem := &members[i]
		if !mem.BroadcastBirthday || monthDayOf(mem.Birthday) != monthDay {
			continue
		}
		fol, _ := s.follows.MemberFollowers(ctx, mem.ID)
		for _, memberID := range fol {
			title := "Today is " + mem.DisplayName + "'s birthday"
			body := "Wish " + mem.DisplayName + " a happy birthday — Afehyia pa!"
			_ = s.notifs.Insert(ctx, domain.Notification{
				ID:       "ntf-" + fmt.Sprintf("%d-%s", time.Now().UnixNano(), memberID),
				MemberID: memberID, Kind: "birthday",
				Title:     title,
				Body:      body,
				Link:      "/members/" + mem.Slug,
				CreatedAt: time.Now().UTC().Format(time.RFC3339),
			})
			s.notifyOutOfBand(ctx, memberID, title, body, "/members/"+mem.Slug)
			created++
		}
	}
	return created, nil
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
