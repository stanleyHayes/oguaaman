// Package service holds the platform's business logic: the listing engine,
// moderation, notifications/remembrance, auth, and the AI writing assistant —
// independent of HTTP, GraphQL, gRPC, and MongoDB. Methods are split across
// files by concern (queries, directory, engine, notifications, admin).
package service

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/oguaa/backend/internal/domain"
)

// EmailSender delivers transactional emails.
type EmailSender interface {
	Send(ctx context.Context, to, subject, html string) error
}

// HeaderEmailSender is an EmailSender that can also set extra message headers
// (List-Unsubscribe on notification emails). Senders without it get the plain
// Send and the email keeps only its footer link.
type HeaderEmailSender interface {
	EmailSender
	SendWithHeaders(ctx context.Context, to, subject, html string, headers map[string]string) error
}

// MessageSender delivers transactional phone messages (WhatsApp).
type MessageSender interface {
	SendMessage(ctx context.Context, phone, body string) error
}

// Service is the application core. Delivery layers (HTTP/GraphQL/gRPC) depend only on this.
type Service struct {
	listings        domain.ListingRepository
	members         domain.MemberRepository
	orgs            domain.OrganizationRepository
	places          domain.PlaceRepository
	mod             domain.ModerationRepository
	notifs          domain.NotificationRepository
	follows         domain.FollowRepository
	blocks          domain.BlockRepository
	claims          domain.OrgClaimRepository
	news            domain.NewsRepository
	reports         domain.ReportRepository
	timeline        domain.TimelineRepository
	plans           domain.PlanRepository
	directives      domain.DirectiveRepository
	civicBehaviours domain.CivicBehaviourRepository
	civicLessons    domain.CivicLessonRepository
	goals           domain.GoalRepository
	agents          domain.AgentRepository
	reviews         domain.ReviewRepository
	agentReviews    domain.AgentReviewRepository
	email           EmailSender
	wa              MessageSender
	push            *PushSender
	log             *slog.Logger

	// outbound holds what email/WhatsApp copies need (ConfigureOutbound).
	outbound outboundConfig
	// production (GO_ENV=production): staff accounts without two-factor act as
	// plain members in service-level role checks too (D9, see actingRole).
	production bool
}

// Deps are the repositories the Service core is built from.
type Deps struct {
	Listings        domain.ListingRepository
	Members         domain.MemberRepository
	Orgs            domain.OrganizationRepository
	Places          domain.PlaceRepository
	Mod             domain.ModerationRepository
	Notifs          domain.NotificationRepository
	Follows         domain.FollowRepository
	Blocks          domain.BlockRepository
	Claims          domain.OrgClaimRepository
	News            domain.NewsRepository
	Reports         domain.ReportRepository
	Timeline        domain.TimelineRepository
	Plans           domain.PlanRepository
	Directives      domain.DirectiveRepository
	CivicBehaviours domain.CivicBehaviourRepository
	CivicLessons    domain.CivicLessonRepository
	Goals           domain.GoalRepository
	Agents          domain.AgentRepository
	Reviews         domain.ReviewRepository
	AgentReviews    domain.AgentReviewRepository
	Email           EmailSender
	WhatsApp        MessageSender
	Push            *PushSender
	Log             *slog.Logger
	// Production withholds staff powers from staff accounts without two-factor (D9).
	Production bool
}

func New(d Deps) *Service {
	l := d.Log
	if l == nil {
		l = slog.Default()
	}
	return &Service{
		listings: d.Listings, members: d.Members, orgs: d.Orgs, places: d.Places,
		// Every in-app notice passes the member's notification preferences (K14).
		mod: d.Mod, notifs: gateNotifications(d.Notifs, d.Members), follows: d.Follows, blocks: d.Blocks, claims: d.Claims,
		news: d.News, reports: d.Reports, timeline: d.Timeline, plans: d.Plans,
		directives:      d.Directives,
		civicBehaviours: d.CivicBehaviours, civicLessons: d.CivicLessons,
		goals: d.Goals, agents: d.Agents, reviews: d.Reviews, agentReviews: d.AgentReviews,
		email: d.Email, wa: d.WhatsApp, push: d.Push, log: l,
		production: d.Production,
	}
}

// actingRole is the role a member may act with. In production a staff
// account without two-factor acts as a plain member (D9) — the same rule the
// request middleware applies to the session copy, so a service check that
// re-reads the member by id can't hand the powers back.
func (s *Service) actingRole(ctx context.Context, memberID string) string {
	m, err := s.members.ByID(ctx, memberID)
	if err != nil || m == nil {
		return ""
	}
	if staffMFAHeldBack(s.production, m) {
		return domain.RoleMember
	}
	return m.Role
}

// staffMFAHeldBack reports whether D9 withholds m's staff powers: production,
// a staff role, and two-factor off.
func staffMFAHeldBack(production bool, m *domain.Member) bool {
	return production && m != nil && domain.IsStaffRole(m.Role) && !m.MFAEnabled
}

// RegisterPush stores a member's push subscription (web endpoint or expo token).
func (s *Service) RegisterPush(ctx context.Context, sub domain.PushSubscription) error {
	if s.push == nil {
		return fmt.Errorf("push is not configured")
	}
	return s.push.Register(ctx, sub)
}

// UnregisterPush removes a member's push subscription by id.
func (s *Service) UnregisterPush(ctx context.Context, memberID, id string) error {
	if s.push == nil {
		return nil
	}
	return s.push.Unregister(ctx, memberID, id)
}

// UnregisterAllPush removes every device a member registered (account erasure).
func (s *Service) UnregisterAllPush(ctx context.Context, memberID string) error {
	if s.push == nil {
		return nil
	}
	return s.push.UnregisterAll(ctx, memberID)
}

// PushPublicKey returns the VAPID public key for browser subscription ("" when
// web push is not configured).
func (s *Service) PushPublicKey() string {
	if s.push == nil {
		return ""
	}
	return s.push.PublicKey()
}
