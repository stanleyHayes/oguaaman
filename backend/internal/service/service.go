// Package service holds the platform's business logic: the listing engine,
// moderation, notifications/remembrance, auth, and the AI writing assistant —
// independent of HTTP, GraphQL, gRPC, and MongoDB. Methods are split across
// files by concern (queries, directory, engine, notifications, admin).
package service

import (
	"context"
	"log/slog"

	"github.com/oguaa/backend/internal/domain"
)

// EmailSender delivers transactional emails.
type EmailSender interface {
	Send(ctx context.Context, to, subject, html string) error
}

// MessageSender delivers transactional phone messages (WhatsApp).
type MessageSender interface {
	SendMessage(ctx context.Context, phone, body string) error
}

// Service is the application core. Delivery layers (HTTP/GraphQL/gRPC) depend only on this.
type Service struct {
	listings domain.ListingRepository
	members  domain.MemberRepository
	orgs     domain.OrganizationRepository
	places   domain.PlaceRepository
	mod      domain.ModerationRepository
	notifs   domain.NotificationRepository
	follows  domain.FollowRepository
	claims   domain.OrgClaimRepository
	news     domain.NewsRepository
	reports  domain.ReportRepository
	timeline domain.TimelineRepository
	plans    domain.PlanRepository
	email    EmailSender
	wa       MessageSender
	log      *slog.Logger
}

// Deps are the repositories the Service core is built from.
type Deps struct {
	Listings domain.ListingRepository
	Members  domain.MemberRepository
	Orgs     domain.OrganizationRepository
	Places   domain.PlaceRepository
	Mod      domain.ModerationRepository
	Notifs   domain.NotificationRepository
	Follows  domain.FollowRepository
	Claims   domain.OrgClaimRepository
	News     domain.NewsRepository
	Reports  domain.ReportRepository
	Timeline domain.TimelineRepository
	Plans    domain.PlanRepository
	Email    EmailSender
	WhatsApp MessageSender
	Log      *slog.Logger
}

func New(d Deps) *Service {
	l := d.Log
	if l == nil {
		l = slog.Default()
	}
	return &Service{
		listings: d.Listings, members: d.Members, orgs: d.Orgs, places: d.Places,
		mod: d.Mod, notifs: d.Notifs, follows: d.Follows, claims: d.Claims,
		news: d.News, reports: d.Reports, timeline: d.Timeline, plans: d.Plans,
		email: d.Email, wa: d.WhatsApp, log: l,
	}
}
