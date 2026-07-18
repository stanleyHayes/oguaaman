package mongo

import (
	"errors"

	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

// Collection names.
const (
	collMembers       = "members"
	collOrgs          = "organizations"
	collPlaces        = "places"
	collListings      = "listings"
	collModeration    = "moderation_records"
	collNotifications = "notifications"
	collFollows       = "follows"
	collMemberFollows = "member_follows"
	collOrgClaims     = "org_claims"
	collNews          = "news"
	collReports       = "reports"
	collAIUsage       = "ai_usage"
	collPledges       = "pledges"
	collTickets       = "tickets"
	collSubscriptions = "subscriptions"
	collPromotions    = "promotions"
	collPlans         = "plans"
	collTimeline      = "timeline"
	collListingViews  = "listing_views"
	collDirectives    = "directives"
	collStripeIntents = "stripe_intents"

	collCivicBehaviours = "civic_behaviours"
	collCivicLessons    = "civic_lessons"
	collGoals           = "goals"
)

// notFound maps the driver's no-documents sentinel to a domain NotFoundError.
func notFound(entity string, err error) error {
	if errors.Is(err, mongo.ErrNoDocuments) {
		return &domain.NotFoundError{Entity: entity}
	}
	return err
}

// toInt coerces a BSON-decoded number (int32/int64/float64) to int.
func toInt(v any) int {
	switch n := v.(type) {
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	case int:
		return n
	default:
		return 0
	}
}
