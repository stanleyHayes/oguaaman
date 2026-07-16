package http

import (
	"log/slog"
	"net/http"

	"github.com/oguaa/backend/internal/infra/http/seedimg"
)

// NewRouter wires the routes (Go 1.22+ method+pattern ServeMux) and middleware.
// gql is the GraphQL handler mounted at /graphql (playground on GET); pass nil
// to disable it.
func NewRouter(h *Handler, gql http.Handler, allowedOrigins []string, log *slog.Logger) http.Handler {
	mux := http.NewServeMux()

	if gql != nil {
		mux.Handle("/graphql", gql)
	}

	// Curated seed imagery (embedded — see internal/infra/http/seedimg). The more
	// specific pattern wins over the disk-served uploads below.
	mux.Handle("GET /uploads/seed/", http.StripPrefix("/uploads/seed/", http.FileServerFS(seedimg.FS)))

	// First-party uploaded images, served statically.
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(h.uploadDir))))

	mux.HandleFunc("GET /api/health", h.Health)
	mux.HandleFunc("GET /api/home", h.Home)

	mux.HandleFunc("POST /api/auth/register", h.AuthRegister)
	mux.HandleFunc("POST /api/auth/login", h.AuthLogin)
	mux.HandleFunc("POST /api/auth/mfa", h.AuthMFA)
	mux.HandleFunc("GET /api/auth/me", h.AuthMe)
	mux.HandleFunc("POST /api/me/phone/verify/start", h.StartPhoneVerification)
	mux.HandleFunc("POST /api/me/phone/verify/confirm", h.ConfirmPhoneVerification)
	mux.HandleFunc("POST /api/me/mfa/setup", h.MFASetup)
	mux.HandleFunc("POST /api/me/mfa/confirm", h.MFAConfirm)
	mux.HandleFunc("POST /api/me/mfa/disable", h.MFADisable)
	mux.HandleFunc("GET /api/me/export", h.ExportMyData)
	mux.HandleFunc("DELETE /api/me", h.DeleteMyAccount)

	mux.HandleFunc("GET /api/artists", h.Artists)
	mux.HandleFunc("GET /api/artists/{slug}", h.Artist)
	mux.HandleFunc("GET /api/genres", h.Genres)
	mux.HandleFunc("GET /api/music/legacy", h.MusicLegacy)

	mux.HandleFunc("GET /api/people", h.People)
	mux.HandleFunc("GET /api/people/{slug}", h.Person)

	mux.HandleFunc("GET /api/search", h.Search)
	mux.HandleFunc("GET /api/diaspora", h.DiasporaMembers)

	// Adopt-a-project + pledges via Paystack (spec §4/§6/§15).
	mux.HandleFunc("GET /api/projects", h.Projects)
	mux.HandleFunc("GET /api/projects/{slug}", h.Project)
	mux.HandleFunc("POST /api/projects/{slug}/pledge", h.Pledge)
	mux.HandleFunc("GET /api/pledges/confirm", h.ConfirmPledge)
	mux.HandleFunc("GET /api/me/pledges", h.MyPledges)
	mux.HandleFunc("POST /api/payments/paystack/webhook", h.PaystackWebhook)

	// Community safety — rescue & early recovery (auto-published; curators transition).
	mux.HandleFunc("GET /api/incidents", h.Incidents)
	mux.HandleFunc("GET /api/incidents/{slug}", h.Incident)
	mux.HandleFunc("POST /api/incidents", h.SubmitIncident)
	mux.HandleFunc("POST /api/admin/incidents/{id}/status", h.AdminIncidentStatus)

	// Lost & found — lost items, found items, missing people (auto-published;
	// the owner or a curator resolves the notice).
	mux.HandleFunc("GET /api/lost-found", h.LostFound)
	mux.HandleFunc("GET /api/lost-found/{slug}", h.LostFoundBySlug)
	mux.HandleFunc("POST /api/lost-found", h.SubmitLostFound)
	mux.HandleFunc("POST /api/lost-found/{slug}/resolve", h.ResolveLostFound)

	mux.HandleFunc("GET /api/memorials", h.Memorials)
	mux.HandleFunc("GET /api/memorials/{slug}", h.Memorial)
	mux.HandleFunc("POST /api/memorials/{slug}/candle", h.Candle)
	mux.HandleFunc("POST /api/memorials/{slug}/tributes", h.Tribute)
	mux.HandleFunc("GET /api/memorials/{slug}/follow", h.FollowState)
	mux.HandleFunc("POST /api/memorials/{slug}/follow", h.FollowMemorial)
	mux.HandleFunc("DELETE /api/memorials/{slug}/follow", h.UnfollowMemorial)
	mux.HandleFunc("POST /api/memorials/{slug}/keeper-claim", h.KeeperClaim)

	mux.HandleFunc("GET /api/notifications", h.Notifications)
	mux.HandleFunc("GET /api/notifications/unread-count", h.UnreadCount)
	mux.HandleFunc("POST /api/notifications/read-all", h.MarkAllNotificationsRead)
	mux.HandleFunc("POST /api/notifications/{id}/read", h.MarkNotificationRead)

	mux.HandleFunc("GET /api/businesses", h.Businesses)
	mux.HandleFunc("GET /api/businesses/{slug}", h.Business)
	// Business subscriptions (Phase 7): the Supporter plan via Paystack.
	mux.HandleFunc("POST /api/businesses/{slug}/subscribe", h.Subscribe)
	mux.HandleFunc("GET /api/subscriptions/confirm", h.ConfirmSubscription)
	mux.HandleFunc("GET /api/me/subscriptions", h.MySubscriptions)
	mux.HandleFunc("GET /api/admin/subscriptions", h.AdminSubscriptions)

	// Paid promotions (Phase 8): self-serve featured placements via Paystack.
	mux.HandleFunc("POST /api/listings/{id}/promote", h.Promote)
	mux.HandleFunc("GET /api/promotions/confirm", h.ConfirmPromotion)
	mux.HandleFunc("GET /api/admin/promotions", h.AdminPromotions)
	mux.HandleFunc("GET /api/admin/revenue", h.AdminRevenue)
	mux.HandleFunc("GET /api/plans", h.Plans)
	mux.HandleFunc("GET /api/admin/plans", h.AdminPlans)
	mux.HandleFunc("POST /api/admin/plans", h.AdminCreatePlan)
	mux.HandleFunc("POST /api/admin/plans/{id}", h.AdminUpdatePlan)
	mux.HandleFunc("DELETE /api/admin/plans/{id}", h.AdminDeletePlan)

	mux.HandleFunc("GET /api/events", h.Events)
	// Event ticketing (Phase 6): detail with tiers, purchase, confirm, check-in.
	mux.HandleFunc("GET /api/events/{slug}", h.Event)
	mux.HandleFunc("POST /api/events/{slug}/tickets", h.BuyTicket)
	mux.HandleFunc("GET /api/tickets/confirm", h.ConfirmTicket)
	mux.HandleFunc("GET /api/me/tickets", h.MyTickets)
	mux.HandleFunc("GET /api/admin/events/{slug}/tickets", h.AdminEventTickets)
	mux.HandleFunc("POST /api/admin/tickets/{code}/checkin", h.AdminCheckIn)
	mux.HandleFunc("GET /api/festivals", h.Festivals)
	mux.HandleFunc("GET /api/festivals/{slug}", h.Festival)
	mux.HandleFunc("GET /api/history", h.History)
	mux.HandleFunc("GET /api/opportunities", h.Opportunities)
	mux.HandleFunc("GET /api/memories", h.Memories)
	mux.HandleFunc("GET /api/featured", h.Featured)

	mux.HandleFunc("GET /api/news", h.News)
	mux.HandleFunc("GET /api/news/{slug}", h.NewsArticle)

	mux.HandleFunc("GET /api/places", h.Places)
	mux.HandleFunc("GET /api/schools", h.Schools)
	mux.HandleFunc("GET /api/institutions", h.Institutions)
	mux.HandleFunc("GET /api/institutions/{slug}", h.Institution)

	// Open Graph (spec §11): crawler-facing meta shim + 1200×630 card renderer.
	// The portal's nginx maps bot user-agents onto /api/og/page/*.
	mux.HandleFunc("GET /api/og/page/{path...}", h.OGPage)
	mux.HandleFunc("GET /api/og/image/{path...}", h.OGImage)

	// Institution management (spec §8.13): claim → steward-verify → manage.
	mux.HandleFunc("GET /api/me/institutions", h.MyInstitutions)
	mux.HandleFunc("POST /api/me/creator-types", h.SetMyCreatorTypes)
	mux.HandleFunc("GET /api/creator/overview", h.CreatorOverview)
	mux.HandleFunc("GET /api/creator/earnings", h.CreatorEarnings)
	mux.HandleFunc("POST /api/institutions/{slug}/claim", h.ClaimInstitution)
	mux.HandleFunc("POST /api/institutions/{slug}/profile", h.UpdateInstitutionProfile)
	mux.HandleFunc("POST /api/institutions/{slug}/offices", h.SetInstitutionOffices)
	mux.HandleFunc("POST /api/institutions/{slug}/gallery", h.SetInstitutionGallery)
	mux.HandleFunc("POST /api/institutions/{slug}/sections", h.SetInstitutionSections)
	mux.HandleFunc("POST /api/institutions/{slug}/events", h.PostInstitutionEvent)
	// Team management (Creator plan §4.1.2): invite → accept/decline → scopes.
	mux.HandleFunc("GET /api/institutions/{slug}/team", h.OrgTeam)
	mux.HandleFunc("POST /api/institutions/{slug}/team/invite", h.InviteToTeam)
	mux.HandleFunc("POST /api/institutions/{slug}/team/{memberId}/scope", h.SetTeamScope)
	mux.HandleFunc("DELETE /api/institutions/{slug}/team/{memberId}", h.RevokeTeamMember)
	mux.HandleFunc("GET /api/me/invitations", h.MyInvitations)
	mux.HandleFunc("POST /api/claims/{id}/respond", h.RespondToInvite)
	// Request-a-new-institution (Creator plan §4.1.1) + the kind catalog.
	mux.HandleFunc("GET /api/institution-kinds", h.InstitutionKinds)
	mux.HandleFunc("POST /api/institution-requests", h.RequestInstitution)
	mux.HandleFunc("GET /api/me/institution-requests", h.MyInstitutionRequests)

	mux.HandleFunc("GET /api/members", h.MembersList)
	mux.HandleFunc("GET /api/members/{slug}", h.Member)
	mux.HandleFunc("GET /api/members/{slug}/follow", h.MemberFollowState)
	mux.HandleFunc("POST /api/members/{slug}/follow", h.FollowMember)
	mux.HandleFunc("DELETE /api/members/{slug}/follow", h.UnfollowMember)
	mux.HandleFunc("POST /api/me/profile", h.SetMyProfile)
	mux.HandleFunc("POST /api/me/birthday", h.SetMyBirthday)
	mux.HandleFunc("POST /api/me/photo", h.SetMyPhoto)
	mux.HandleFunc("POST /api/me/affiliations", h.SetMyAffiliations)
	mux.HandleFunc("POST /api/me/schooling", h.SetMySchooling)
	mux.HandleFunc("POST /api/me/diaspora", h.SetMyDiaspora)
	mux.HandleFunc("GET /api/me/connections", h.MyConnections)
	mux.HandleFunc("GET /api/stats", h.Stats)

	mux.HandleFunc("GET /api/admin/queue", h.Queue)
	mux.HandleFunc("POST /api/admin/moderate", h.Moderate)
	mux.HandleFunc("GET /api/admin/listings", h.AdminListings)
	mux.HandleFunc("GET /api/admin/audit", h.AdminAudit)
	mux.HandleFunc("POST /api/admin/listings/{id}/unpublish", h.AdminUnpublish)
	mux.HandleFunc("POST /api/admin/listings/{id}/feature", h.AdminFeature)
	mux.HandleFunc("POST /api/admin/members/invite", h.AdminInviteMember)
	mux.HandleFunc("POST /api/admin/members/{id}/role", h.AdminSetRole)
	mux.HandleFunc("POST /api/admin/members/{id}/suspend", h.AdminSuspend)
	mux.HandleFunc("GET /api/admin/institutions", h.AdminInstitutions)
	mux.HandleFunc("POST /api/admin/institutions", h.AdminCreateInstitution)
	mux.HandleFunc("POST /api/admin/institutions/{id}/verify", h.AdminVerify)
	mux.HandleFunc("POST /api/admin/run-remembrance", h.AdminRunRemembrance)
	mux.HandleFunc("GET /api/admin/claims", h.AdminClaims)
	mux.HandleFunc("POST /api/admin/claims/{id}/review", h.AdminReviewClaim)

	mux.HandleFunc("GET /api/admin/pledges", h.AdminPledges)
	mux.HandleFunc("GET /api/admin/pledges/totals", h.AdminPledgeTotals)
	mux.HandleFunc("GET /api/admin/reports", h.AdminReports)
	mux.HandleFunc("POST /api/admin/reports/{id}/resolve", h.AdminResolveReport)
	mux.HandleFunc("POST /api/admin/memorials/{id}/grant-keeper", h.GrantKeeper)

	mux.HandleFunc("GET /api/admin/news", h.AdminNewsList)
	mux.HandleFunc("POST /api/admin/news", h.AdminNewsCreate)
	mux.HandleFunc("GET /api/admin/news/{id}", h.AdminNewsGet)
	mux.HandleFunc("POST /api/admin/news/{id}", h.AdminNewsUpdate)
	mux.HandleFunc("POST /api/admin/news/{id}/publish", h.AdminNewsPublish)
	mux.HandleFunc("DELETE /api/admin/news/{id}", h.AdminNewsDelete)

	mux.HandleFunc("POST /api/listings", h.Submit)
	mux.HandleFunc("POST /api/listings/{id}/edit", h.EditListing)
	mux.HandleFunc("POST /api/listings/{id}/report", h.Report)
	mux.HandleFunc("POST /api/listings/{id}/view", h.RecordView)
	mux.HandleFunc("POST /api/uploads", h.Upload)
	mux.HandleFunc("POST /api/ai", h.AI)

	return Logging(log, CORS(allowedOrigins, h.Auth(mux)))
}
