// Package service holds the platform's business logic: the listing engine,
// moderation, notifications/remembrance, auth, and the AI writing assistant —
// independent of HTTP, GraphQL, gRPC, and MongoDB. Methods are split across
// files by concern (queries, directory, engine, notifications, admin).
package service

import "github.com/oguaa/backend/internal/domain"

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
}

func New(l domain.ListingRepository, m domain.MemberRepository, o domain.OrganizationRepository, p domain.PlaceRepository, md domain.ModerationRepository, n domain.NotificationRepository, f domain.FollowRepository, oc domain.OrgClaimRepository, nw domain.NewsRepository, rp domain.ReportRepository, tl domain.TimelineRepository) *Service {
	return &Service{listings: l, members: m, orgs: o, places: p, mod: md, notifs: n, follows: f, claims: oc, news: nw, reports: rp, timeline: tl}
}
