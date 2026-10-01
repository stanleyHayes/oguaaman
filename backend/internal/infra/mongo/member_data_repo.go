package mongo

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// Collections owned by the member-data / data-rights code.
const (
	collUploads              = "uploads"
	collPrivateUploads       = "private_uploads"
	collPrivacyRequests      = "privacy_requests"
	collAccountDeletionCodes = "account_deletion_codes"
	// collTributes is where tributes live if they move out of the memorial
	// document; erasure anonymises them there too (a no-op until then).
	collTributes = "tributes"
)

// Placeholder identities written over erased authors and parties.
const (
	formerMember = "Former member"
	formerAgent  = "Former agent"
)

// Frequently used field names and operators.
const (
	fMemberID       = "memberId"
	fOwnerID        = "ownerId"
	fAuthorID       = "authorId"
	fPostedByOrgID  = "postedByOrgId"
	fClientMemberID = "clientMemberId"
	fAgentMemberID  = "agentMemberId"
	opSet           = "$set"
	opIn            = "$in"
	opOr            = "$or"
	opNor           = "$nor"
)

// ownListings matches the listings that are the member's own, not posted on
// behalf of an institution: erasure takes these down (UnpublishListings).
func ownListings(memberID string) bson.M {
	return bson.M{fOwnerID: memberID, fPostedByOrgID: bson.M{opIn: bson.A{nil, ""}}}
}

// unpublishedNewsBy matches the member's news that never went live: erasure
// deletes these drafts (AnonymiseAuthorship, NewsRepo.EraseAuthor).
func unpublishedNewsBy(memberID string) bson.M {
	return bson.M{fAuthorID: memberID, "status": bson.M{"$ne": domain.NewsPublished}}
}

// MemberDataRepo reaches one member's personal data across every collection
// that holds it, for the Act 843 export and erasure flows
// (domain.MemberDataRepository). It deliberately reads and writes the other
// collections directly, through narrow member-scoped operations, so the
// data-rights code never depends on a feature repository remembering to offer
// an erase method.
type MemberDataRepo struct{ db *mongo.Database }

func NewMemberDataRepo(db *mongo.Database) *MemberDataRepo { return &MemberDataRepo{db: db} }

func (r *MemberDataRepo) coll(name string) *mongo.Collection { return r.db.Collection(name) }

// findMemberDocs decodes every document matching filter into a fresh slice.
func findMemberDocs[T any](ctx context.Context, c *mongo.Collection, filter any, opts ...options.Lister[options.FindOptions]) ([]T, error) {
	cur, err := c.Find(ctx, filter, opts...)
	if err != nil {
		return nil, err
	}
	out := []T{}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// suffixFilter matches counter documents whose _id ends in ":<memberID>" —
// ai_usage ("<day>:<member>") and listing_views ("<listing>:<day>:<member>").
func suffixFilter(memberID string) bson.M {
	return bson.M{"_id": bson.M{"$regex": ":" + regexp.QuoteMeta(memberID) + "$"}}
}

// ownedBusinessIDs lists the ids of business listings the member owns.
func (r *MemberDataRepo) ownedBusinessIDs(ctx context.Context, memberID string) ([]string, error) {
	rows, err := findMemberDocs[struct {
		ID string `bson:"_id"`
	}](ctx, r.coll(collListings), bson.M{fOwnerID: memberID, "type": domain.TypeBusiness},
		options.Find().SetProjection(bson.M{"_id": 1}))
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	return ids, nil
}

// ── export ───────────────────────────────────────────────────────────────────

type exportSection struct {
	name string
	load func(ctx context.Context, rec *domain.MemberRecords) error
}

// ExportRecords loads every section; any failure fails the whole export.
func (r *MemberDataRepo) ExportRecords(ctx context.Context, memberID string) (*domain.MemberRecords, error) {
	rec := &domain.MemberRecords{}
	sections := append(r.paymentSections(memberID), r.activitySections(memberID)...)
	sections = append(sections, r.accountSections(memberID)...)
	for _, s := range sections {
		if err := s.load(ctx, rec); err != nil {
			return nil, fmt.Errorf("export section %s: %w", s.name, err)
		}
	}
	return rec, nil
}

// paymentSections: ledgers and commerce records naming the member.
func (r *MemberDataRepo) paymentSections(id string) []exportSection {
	byMember := bson.M{fMemberID: id}
	return []exportSection{
		{"tickets", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.Tickets, err = findMemberDocs[domain.Ticket](ctx, r.coll(collTickets), byMember)
			return err
		}},
		{"subscriptions", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.Subscriptions, err = findMemberDocs[domain.Subscription](ctx, r.coll(collSubscriptions), byMember)
			return err
		}},
		{"pledges", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.Pledges, err = findMemberDocs[domain.Pledge](ctx, r.coll(collPledges), byMember)
			return err
		}},
		{"promotions", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.Promotions, err = findMemberDocs[domain.Promotion](ctx, r.coll(collPromotions), byMember)
			return err
		}},
		{"stripePayments", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.StripeIntents, err = findMemberDocs[domain.StripeIntent](ctx, r.coll(collStripeIntents), byMember,
				options.Find().SetProjection(bson.M{"clientSecret": 0}))
			return err
		}},
		{"applePurchases", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.AppleTransactions, err = findMemberDocs[domain.AppleTransactionRecord](ctx, r.coll(collAppleTransactions), byMember)
			return err
		}},
		{"orders", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.Orders, err = findMemberDocs[domain.CommerceOrder](ctx, r.coll(collCommerceOrders), bson.M{"buyerId": id})
			return err
		}},
		{"sellerOrders", func(ctx context.Context, rec *domain.MemberRecords) error {
			ids, err := r.ownedBusinessIDs(ctx, id)
			if err != nil || len(ids) == 0 {
				rec.SellerOrders = []domain.CommerceOrder{}
				return err
			}
			rec.SellerOrders, err = findMemberDocs[domain.CommerceOrder](ctx, r.coll(collCommerceOrders), bson.M{"listingId": bson.M{opIn: ids}})
			return err
		}},
		{"businessVerifications", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.BusinessVerifications, err = findMemberDocs[domain.BusinessVerification](ctx, r.coll(collBusinessVerifications), bson.M{fOwnerID: id})
			return err
		}},
		{"agentJobs", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.AgentJobs, err = findMemberDocs[domain.AgentJob](ctx, r.coll(collAgentJobs),
				bson.M{opOr: bson.A{bson.M{fClientMemberID: id}, bson.M{fAgentMemberID: id}}})
			return err
		}},
	}
}

// activitySections: what the member published, wrote, booked or reported.
func (r *MemberDataRepo) activitySections(id string) []exportSection {
	return []exportSection{
		{"listings", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.Listings, err = findMemberDocs[domain.Listing](ctx, r.coll(collListings), bson.M{fOwnerID: id})
			return err
		}},
		{"artistBookingsMade", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.ArtistBookingsMade, err = findMemberDocs[domain.ArtistBooking](ctx, r.coll(collArtistBookings), bson.M{"requesterId": id})
			return err
		}},
		{"artistBookingsReceived", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.ArtistBookingsReceived, err = findMemberDocs[domain.ArtistBooking](ctx, r.coll(collArtistBookings), bson.M{"artistOwnerId": id})
			return err
		}},
		{"agentProfile", func(ctx context.Context, rec *domain.MemberRecords) error {
			var a domain.Agent
			err := r.coll(collAgents).FindOne(ctx, bson.M{fMemberID: id}).Decode(&a)
			if err == nil {
				rec.Agent = &a
				return nil
			}
			if errors.Is(err, mongo.ErrNoDocuments) {
				return nil
			}
			return err
		}},
		{"agentReviewsWritten", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.AgentReviewsWritten, err = findMemberDocs[domain.AgentReview](ctx, r.coll(collAgentReviews), bson.M{fClientMemberID: id})
			return err
		}},
		{"businessReviewsWritten", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.Reviews, err = findMemberDocs[domain.Review](ctx, r.coll(collReviews), bson.M{fMemberID: id})
			return err
		}},
		{"tributesWritten", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.TributesWritten, err = r.tributesWritten(ctx, id)
			return err
		}},
		{"newsArticles", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.News, err = findMemberDocs[domain.NewsArticle](ctx, r.coll(collNews), bson.M{fAuthorID: id})
			return err
		}},
		{"reportsFiled", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.Reports, err = findMemberDocs[domain.Report](ctx, r.coll(collReports), bson.M{"reporterId": id})
			return err
		}},
		{"institutionRoles", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.OrgClaims, err = findMemberDocs[domain.OrgClaim](ctx, r.coll(collOrgClaims), bson.M{fMemberID: id})
			return err
		}},
		{"uploads", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.Uploads, err = findMemberDocs[domain.UploadRecord](ctx, r.coll(collUploads), bson.M{fOwnerID: id})
			return err
		}},
		{"privateDocuments", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.PrivateUploads, err = findMemberDocs[domain.PrivateUpload](ctx, r.coll(collPrivateUploads), bson.M{fOwnerID: id},
				options.Find().SetProjection(bson.M{"ciphertext": 0}))
			return err
		}},
	}
}

// tributesWritten loads the tributes the member left, on any memorial, with
// only that member's tributes taken from each memorial.
func (r *MemberDataRepo) tributesWritten(ctx context.Context, memberID string) ([]domain.TributeWritten, error) {
	memorials, err := findMemberDocs[domain.Listing](ctx, r.coll(collListings), bson.M{fTributes + "." + fMemberID: memberID},
		options.Find().SetProjection(bson.M{"_id": 1, "slug": 1, "title": 1, fTributes: 1}))
	if err != nil {
		return nil, err
	}
	return tributesBy(memorials, memberID), nil
}

// tributesBy picks memberID's tributes out of the memorials that hold them.
func tributesBy(memorials []domain.Listing, memberID string) []domain.TributeWritten {
	out := []domain.TributeWritten{}
	for _, l := range memorials {
		for _, t := range l.Tributes {
			if t.MemberID == memberID {
				out = append(out, domain.TributeWritten{MemorialID: l.ID, MemorialSlug: l.Slug, MemorialTitle: l.Title, Tribute: t})
			}
		}
	}
	return out
}

// accountSections: the social graph, devices, notices and account logs.
func (r *MemberDataRepo) accountSections(id string) []exportSection {
	return []exportSection{
		{"following", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.Following, err = findMemberDocs[domain.MemberFollow](ctx, r.coll(collMemberFollows), bson.M{"followerId": id})
			return err
		}},
		{"followerCount", func(ctx context.Context, rec *domain.MemberRecords) error {
			n, err := r.coll(collMemberFollows).CountDocuments(ctx, bson.M{fMemberID: id})
			rec.FollowerCount = int(n)
			return err
		}},
		{"memorialsRemembered", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.MemorialsRemembered, err = findMemberDocs[domain.Follow](ctx, r.coll(collFollows), bson.M{fMemberID: id})
			return err
		}},
		{"blocks", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			// Only blocks the member made: who blocked them is the other
			// member's private choice.
			rec.Blocks, err = findMemberDocs[domain.MemberBlock](ctx, r.coll(collMemberBlocks), bson.M{"blockerId": id})
			return err
		}},
		{"notifications", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.Notifications, err = findMemberDocs[domain.Notification](ctx, r.coll(collNotifications), bson.M{fMemberID: id})
			return err
		}},
		{"pushDevices", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.PushDevices, err = findMemberDocs[domain.PushSubscription](ctx, r.coll(collPushSubs), bson.M{fMemberID: id})
			return err
		}},
		{"writingAssistantUsage", func(ctx context.Context, rec *domain.MemberRecords) error {
			rows, err := findMemberDocs[struct {
				ID    string `bson:"_id"`
				Count int    `bson:"count"`
			}](ctx, r.coll(collAIUsage), suffixFilter(id))
			rec.AIUsage = make([]domain.AIUsageDay, 0, len(rows))
			for _, row := range rows {
				day := row.ID[:max(0, len(row.ID)-len(id)-1)]
				rec.AIUsage = append(rec.AIUsage, domain.AIUsageDay{Day: day, Count: row.Count})
			}
			return err
		}},
		{"privacyRequests", func(ctx context.Context, rec *domain.MemberRecords) (err error) {
			rec.PrivacyRequests, err = findMemberDocs[domain.PrivacyRequest](ctx, r.coll(collPrivacyRequests), bson.M{fMemberID: id})
			return err
		}},
	}
}

// ── deletion blockers ────────────────────────────────────────────────────────

// OpenObligations lists what must be settled before the account can go:
// escrow holding money for or from the member, and paid orders their shop
// still owes a customer.
func (r *MemberDataRepo) OpenObligations(ctx context.Context, memberID string) ([]string, error) {
	out := []string{}
	jobs, err := r.coll(collAgentJobs).CountDocuments(ctx, bson.M{
		"$and": bson.A{
			bson.M{opOr: bson.A{bson.M{fClientMemberID: memberID}, bson.M{fAgentMemberID: memberID}}},
			bson.M{opOr: bson.A{
				bson.M{"status": bson.M{opIn: bson.A{domain.JobStatusFunded, domain.JobStatusDelivered, domain.JobStatusDisputed}}},
				bson.M{"escrow.status": domain.EscrowRefundDue}, // a late payment awaiting its refund
			}},
		},
	})
	if err != nil {
		return nil, err
	}
	if jobs > 0 {
		out = append(out, fmt.Sprintf("%d Oguaa Outside job(s) with money held in escrow — complete, cancel or settle them first.", jobs))
	}
	ids, err := r.ownedBusinessIDs(ctx, memberID)
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return out, nil
	}
	orders, err := r.coll(collCommerceOrders).CountDocuments(ctx, bson.M{
		"listingId": bson.M{opIn: ids},
		"status":    bson.M{opIn: bson.A{domain.OrderPaid, domain.OrderProcessing, domain.OrderReady}},
	})
	if err != nil {
		return nil, err
	}
	if orders > 0 {
		out = append(out, fmt.Sprintf("%d paid shop order(s) your customers are still waiting for — fulfil or refund them first.", orders))
	}
	return out, nil
}

// ── erasure (every method is idempotent) ─────────────────────────────────────

func (r *MemberDataRepo) DeleteNotifications(ctx context.Context, memberID string) error {
	_, err := r.coll(collNotifications).DeleteMany(ctx, bson.M{fMemberID: memberID})
	return err
}

func (r *MemberDataRepo) DeleteFollows(ctx context.Context, memberID string) error {
	if _, err := r.coll(collFollows).DeleteMany(ctx, bson.M{fMemberID: memberID}); err != nil {
		return err
	}
	_, err := r.coll(collMemberFollows).DeleteMany(ctx, bson.M{opOr: bson.A{
		bson.M{"followerId": memberID}, bson.M{fMemberID: memberID},
	}})
	return err
}

func (r *MemberDataRepo) DeleteOrgRoles(ctx context.Context, memberID string) error {
	if _, err := r.coll(collOrgClaims).DeleteMany(ctx, bson.M{fMemberID: memberID}); err != nil {
		return err
	}
	// Public rosters name office holders; leave the office, vacate the holder.
	_, err := r.coll(collOrgs).UpdateMany(ctx,
		bson.M{"offices.holderId": memberID},
		bson.M{
			opSet:   bson.M{"offices.$[o].holderName": "", "offices.$[o].verified": false},
			opUnset: bson.M{"offices.$[o].holderId": ""},
		},
		options.UpdateMany().SetArrayFilters([]any{bson.M{"o.holderId": memberID}}),
	)
	return err
}

func (r *MemberDataRepo) SuspendAgentProfile(ctx context.Context, memberID string) error {
	var a struct {
		ID string `bson:"_id"`
	}
	err := r.coll(collAgents).FindOne(ctx, bson.M{fMemberID: memberID}).Decode(&a)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil
	}
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	// The slug carries the agent's name; replace it with one derived from the
	// opaque agent id, here and everywhere it was copied.
	formerSlug := "former-" + a.ID
	if _, err := r.coll(collAgents).UpdateOne(ctx, bson.M{"_id": a.ID}, bson.M{
		opSet: bson.M{
			"status": domain.AgentStatusSuspended, "slug": formerSlug, "displayName": formerAgent,
			"headline": "", "bio": "", "rates": "", "services": bson.A{}, "coverageAreas": bson.A{},
			"guarantor": bson.M{"name": "", "phone": ""}, "updatedAt": now,
		},
		opUnset: bson.M{"idDocUrl": "", "payoutMethod": "", "payoutDetail": "", "rejectionReason": ""},
	}); err != nil {
		return err
	}
	if _, err := r.coll(collAgentJobs).UpdateMany(ctx, bson.M{"agentId": a.ID},
		bson.M{opSet: bson.M{"agentSlug": formerSlug, "agentName": formerAgent}}); err != nil {
		return err
	}
	_, err = r.coll(collAgentReviews).UpdateMany(ctx, bson.M{"agentId": a.ID},
		bson.M{opSet: bson.M{"agentSlug": formerSlug}})
	return err
}

func (r *MemberDataRepo) PseudonymiseAgentJobs(ctx context.Context, memberID string) error {
	_, err := r.coll(collAgentJobs).UpdateMany(ctx, bson.M{fClientMemberID: memberID}, bson.M{
		opSet:   bson.M{"clientName": formerMember},
		opUnset: bson.M{"clientEmail": ""},
	})
	return err
}

func (r *MemberDataRepo) AnonymiseAuthorship(ctx context.Context, memberID string) error {
	if _, err := r.coll(collReviews).UpdateMany(ctx, bson.M{fMemberID: memberID}, authorErasure("")); err != nil {
		return err
	}
	if _, err := r.coll(collAgentReviews).UpdateMany(ctx, bson.M{fClientMemberID: memberID}, bson.M{
		opSet: bson.M{"clientName": formerMember}, opUnset: bson.M{fClientMemberID: ""},
	}); err != nil {
		return err
	}
	if err := r.anonymiseTributes(ctx, memberID); err != nil {
		return err
	}
	// Published articles keep their text under an anonymous byline; drafts
	// that were never published go entirely.
	if _, err := r.coll(collNews).UpdateMany(ctx, bson.M{fAuthorID: memberID, "status": domain.NewsPublished},
		bson.M{opSet: bson.M{"authorName": formerMember}}); err != nil {
		return err
	}
	_, err := r.coll(collNews).DeleteMany(ctx, unpublishedNewsBy(memberID))
	return err
}

// fMemberSlug is the author's public handle copied onto reviews and tributes.
// It is derived from the name chosen at sign-up, so erasure removes it too.
const fMemberSlug = "memberSlug"

// authorErasure renames an authored record (or, with prefix "tributes.$[t].",
// every matching embedded tribute) to "Former member" and removes both links
// back to the member: the id and the name-derived public slug.
func authorErasure(prefix string) bson.M {
	return bson.M{
		opSet:   bson.M{prefix + "authorName": formerMember},
		opUnset: bson.M{prefix + fMemberID: "", prefix + fMemberSlug: ""},
	}
}

// fTributes is the memorial field that embeds tributes (domain.Listing.Tributes,
// written by ListingRepo.AddTribute).
const fTributes = "tributes"

// tributeAuthorErasure builds the update that renames every tribute the member
// wrote on any memorial to "Former member" and drops the link back to them.
func tributeAuthorErasure(memberID string) (filter, update bson.M, arrayFilters []any) {
	filter = bson.M{fTributes + "." + fMemberID: memberID}
	return filter, authorErasure(fTributes + ".$[t]."), []any{bson.M{"t." + fMemberID: memberID}}
}

// anonymiseTributes renames tributes linked to the member, embedded in the
// memorial (tributes[].memberId) or kept in their own collection. Tributes
// written before sign-in was required carry no member link and cannot be
// found this way.
func (r *MemberDataRepo) anonymiseTributes(ctx context.Context, memberID string) error {
	filter, update, arrayFilters := tributeAuthorErasure(memberID)
	if _, err := r.coll(collListings).UpdateMany(ctx, filter, update,
		options.UpdateMany().SetArrayFilters(arrayFilters)); err != nil {
		return err
	}
	_, err := r.coll(collTributes).UpdateMany(ctx, bson.M{fMemberID: memberID}, authorErasure(""))
	return err
}

func (r *MemberDataRepo) PseudonymiseReports(ctx context.Context, memberID string) error {
	_, err := r.coll(collReports).UpdateMany(ctx, bson.M{"reporterId": memberID},
		bson.M{opUnset: bson.M{"reporterId": "", "reporterName": ""}})
	return err
}

func (r *MemberDataRepo) UnpublishListings(ctx context.Context, memberID string) (int, error) {
	res, err := r.coll(collListings).UpdateMany(ctx, ownListings(memberID),
		bson.M{
			opSet: bson.M{"status": domain.StatusUnpublished, "featured": false},
			opUnset: bson.M{
				"details.contact": "", "details.contactInfo": "", "details.whatsapp": "",
				"details.phone": "", "details.email": "",
			},
		})
	if err != nil {
		return 0, err
	}
	// A memorial keeper is a member; an erased keeper keeps no rights.
	if _, err := r.coll(collListings).UpdateMany(ctx, bson.M{"details.keeperId": memberID},
		bson.M{opUnset: bson.M{"details.keeperId": ""}}); err != nil {
		return 0, err
	}
	return int(res.ModifiedCount), nil
}

func (r *MemberDataRepo) PseudonymiseOrders(ctx context.Context, memberID string) error {
	_, err := r.coll(collCommerceOrders).UpdateMany(ctx, bson.M{"buyerId": memberID}, bson.M{
		opSet:   bson.M{"buyerName": formerMember, "buyerEmail": "", "buyerPhone": ""},
		opUnset: bson.M{"deliveryAddress": "", "note": "", "buyerId": ""},
	})
	return err
}

func (r *MemberDataRepo) PseudonymiseArtistBookings(ctx context.Context, memberID string) error {
	_, err := r.coll(collArtistBookings).UpdateMany(ctx, bson.M{"requesterId": memberID}, bson.M{
		opSet:   bson.M{"requesterName": formerMember},
		opUnset: bson.M{"requesterEmail": "", "requesterPhone": "", "message": "", "requesterId": ""},
	})
	return err
}

func (r *MemberDataRepo) StripPaymentContacts(ctx context.Context, memberID string) error {
	for _, name := range []string{collPledges, collTickets, collSubscriptions, collPromotions, collStripeIntents} {
		if _, err := r.coll(name).UpdateMany(ctx, bson.M{fMemberID: memberID}, bson.M{opUnset: bson.M{"email": ""}}); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
	}
	return nil
}

func (r *MemberDataRepo) ScrubBusinessVerifications(ctx context.Context, memberID string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := r.coll(collBusinessVerifications).UpdateMany(ctx, bson.M{fOwnerID: memberID}, bson.M{
		opSet: bson.M{
			"status": domain.BusinessVerificationRevoked, "ghanaCardNumber": "", "businessPhone": "",
			"ghanaPostGPS": "", "documents": bson.A{}, "settlementAccountNo": "", "settlementName": "",
			"reviewNote": "Owner deleted their Oguaa account.", "updatedAt": now,
		},
	})
	return err
}

func (r *MemberDataRepo) DeleteUsageCounters(ctx context.Context, memberID string) error {
	if _, err := r.coll(collAIUsage).DeleteMany(ctx, suffixFilter(memberID)); err != nil {
		return err
	}
	_, err := r.coll(collListingViews).DeleteMany(ctx, suffixFilter(memberID))
	return err
}

// ── the erased member's id on kept records ───────────────────────────────────

// Member-reference fields named more than once below.
const (
	fReviewedByID = "reviewedById"
	fCreatedByID  = "createdById"
	fTargetID     = "targetId"
)

// memberTarget narrows a report or moderation record to those about a member
// (their targetId is then a member id).
var memberTarget = bson.M{"targetType": domain.ReportTargetMember}

// memberRef is one place a kept record stores a member id: field, or — when
// elem is set — field inside each element of the array elem. where, when
// set, limits it to the documents that hold a member id there.
type memberRef struct {
	coll, elem, field string
	where             bson.M
}

// keptMemberRefs is every member reference that survives an erasure. The
// erase steps delete or unlink the others (notifications, follows,
// institution claims, reviews, tributes, reports filed, orders and bookings
// made). A field that stores a member id on a kept record belongs here, or
// an erased member's name-bearing id outlives them on it.
var keptMemberRefs = []memberRef{
	// Payment ledgers, escrow and verification: kept for tax, accounting and
	// disputes; never public.
	{coll: collTickets, field: fMemberID},
	{coll: collPledges, field: fMemberID},
	{coll: collSubscriptions, field: fMemberID},
	{coll: collPromotions, field: fMemberID},
	{coll: collStripeIntents, field: fMemberID},
	{coll: collAgentJobs, field: fClientMemberID},
	{coll: collAgentJobs, field: fAgentMemberID},
	{coll: collAgents, field: fMemberID},
	{coll: collBusinessVerifications, field: fOwnerID},
	{coll: collArtistBookings, field: "artistOwnerId"},
	// Content: institution listings stay up (the member's own are taken
	// down, not deleted) and so do published articles.
	{coll: collListings, field: fOwnerID},
	{coll: collNews, field: fAuthorID},
	// Staff decisions and audit trails.
	{coll: collListings, field: fReviewedByID},
	{coll: collListings, field: "details.postReviewedBy"},
	{coll: collListings, elem: "details.statusHistory", field: "by"},
	{coll: collAgents, field: "verifiedById"},
	{coll: collBusinessVerifications, field: fReviewedByID},
	{coll: collReports, field: "targetOwnerId"},
	{coll: collReports, field: fReviewedByID},
	{coll: collReports, field: fTargetID, where: memberTarget},
	{coll: collModeration, field: "moderatorId"},
	{coll: collModeration, field: fTargetID, where: memberTarget},
	{coll: collOrgClaims, field: "invitedById"},
	{coll: collOrgClaims, field: fReviewedByID},
	{coll: collDirectives, field: fCreatedByID},
	{coll: collGoals, field: fCreatedByID},
	{coll: collGoals, field: fReviewedByID},
	{coll: collPrivacyRequests, field: fMemberID},
	{coll: collPrivacyRequests, elem: "history", field: "actorId"},
}

// ReassignToTombstone rewrites every kept reference. Each update matches only
// the old id, so running it again finishes what an interrupted run left.
func (r *MemberDataRepo) ReassignToTombstone(ctx context.Context, memberID, tombstoneID string) error {
	if memberID == "" || tombstoneID == "" || memberID == tombstoneID {
		return nil
	}
	for _, ref := range keptMemberRefs {
		filter, update, opts := ref.reassign(memberID, tombstoneID)
		if _, err := r.coll(ref.coll).UpdateMany(ctx, filter, update, opts); err != nil {
			return fmt.Errorf("%s %s: %w", ref.coll, ref.field, err)
		}
	}
	return nil
}

// reassign builds the update that moves ref from one member id to another.
func (ref memberRef) reassign(from, to string) (filter, update bson.M, opts *options.UpdateManyOptionsBuilder) {
	filter = bson.M{}
	for k, v := range ref.where {
		filter[k] = v
	}
	opts = options.UpdateMany()
	if ref.elem == "" {
		filter[ref.field] = from
		return filter, bson.M{opSet: bson.M{ref.field: to}}, opts
	}
	filter[ref.elem+"."+ref.field] = from
	update = bson.M{opSet: bson.M{ref.elem + ".$[e]." + ref.field: to}}
	return filter, update, opts.SetArrayFilters([]any{bson.M{"e." + ref.field: from}})
}

// ── uploads still shown by retained content ──────────────────────────────────

// retainedMediaSource is a collection whose documents can show an uploaded
// file, narrowed to the documents a member's erasure leaves in place.
type retainedMediaSource struct {
	coll   string
	filter bson.M
}

// retainedMediaSources lists every kind of content that can display an
// uploaded file — listings (cover, gallery, storefront, sections, details),
// news (cover image and Markdown body) and institution pages (crest, gallery,
// sections) — without what the erasure itself takes down: the member's own
// listings and their unpublished drafts. A new kind of content that can show
// uploads belongs here, or erasure will delete files it displays.
func retainedMediaSources(memberID string) []retainedMediaSource {
	return []retainedMediaSource{
		{collListings, bson.M{opNor: bson.A{ownListings(memberID)}}},
		{collNews, bson.M{opNor: bson.A{unpublishedNewsBy(memberID)}}},
		{collOrgs, bson.M{}},
	}
}

// RetainedMediaRefs reads every retained document whole, because uploads can
// sit in any field (free-form listing details, section blocks, Markdown).
// Erasure is rare, and it must never delete a file a kept page still shows.
func (r *MemberDataRepo) RetainedMediaRefs(ctx context.Context, memberID string, needles []string) ([]string, error) {
	if len(needles) == 0 {
		return nil, nil
	}
	refs := map[string]bool{}
	for _, src := range retainedMediaSources(memberID) {
		if err := r.scanMediaRefs(ctx, src, needles, refs); err != nil {
			return nil, fmt.Errorf("%s: %w", src.coll, err)
		}
	}
	out := make([]string, 0, len(refs))
	for ref := range refs {
		out = append(out, ref)
	}
	slices.Sort(out)
	return out, nil
}

// scanMediaRefs streams one source's documents into collectMediaRefs.
func (r *MemberDataRepo) scanMediaRefs(ctx context.Context, src retainedMediaSource, needles []string, refs map[string]bool) error {
	cur, err := r.coll(src.coll).Find(ctx, src.filter)
	if err != nil {
		return err
	}
	defer func() { _ = cur.Close(ctx) }()
	for cur.Next(ctx) {
		if err := collectMediaRefs(cur.Current, needles, refs); err != nil {
			return err
		}
	}
	return cur.Err()
}

// collectMediaRefs walks a stored document at every depth and records each
// string that contains one of needles — a URL field, or a body of text with
// the file inline.
func collectMediaRefs(doc bson.Raw, needles []string, refs map[string]bool) error {
	elems, err := doc.Elements()
	if err != nil {
		return err
	}
	for _, e := range elems {
		if err := collectValueRefs(e.Value(), needles, refs); err != nil {
			return err
		}
	}
	return nil
}

func collectValueRefs(v bson.RawValue, needles []string, refs map[string]bool) error {
	switch v.Type {
	case bson.TypeString:
		s := v.StringValue()
		if slices.ContainsFunc(needles, func(n string) bool { return strings.Contains(s, n) }) {
			refs[s] = true
		}
	case bson.TypeEmbeddedDocument:
		return collectMediaRefs(v.Document(), needles, refs)
	case bson.TypeArray:
		vals, err := v.Array().Values()
		if err != nil {
			return err
		}
		for _, x := range vals {
			if err := collectValueRefs(x, needles, refs); err != nil {
				return err
			}
		}
	}
	return nil
}
