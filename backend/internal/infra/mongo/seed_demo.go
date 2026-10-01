package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
)

// SeedDemo writes a self-contained Creator Monetization showcase into a
// development or staging database WITHOUT dropping anything:
//   - the plan catalog (insert-if-absent: staff-set prices are never reverted),
//   - a subscribed demo creator (Adwoa Boateng, an @oguaa.test identity),
//   - a fully-filled business she owns (media, sections, products, services,
//     info) with reviews + an aggregate star rating,
//   - an artist she owns that is accepting donations,
//   - three approved fundraising campaigns.
//
// Everything except the plans is illustration: every listing is stamped
// Demo=true (kept out of sitemaps and public listing feeds), every id is listed
// by FabricatedSeedIDs so cmd/purgefabricated can move it, and cmd/seeddemo
// refuses to run with GO_ENV=production. The showcase rows are ReplaceOne
// upserts on ids only this command writes, so a re-run restores the showcase.
//
// It returns the number of documents written.
func SeedDemo(ctx context.Context, db *mongo.Database) (int, error) {
	n := 0
	up := func(coll string, id string, doc any) error {
		_, err := db.Collection(coll).ReplaceOne(ctx, bson.M{"_id": id}, doc, options.Replace().SetUpsert(true))
		if err == nil {
			n++
		}
		return err
	}

	// 1 · Plans (creator plans, take-rates, storefront caps) — only the ones
	// that are missing. Staff edit prices in place; never overwrite them.
	for _, p := range seedPlans {
		inserted, err := insertIfAbsent(ctx, db.Collection(collPlans), p.ID, p)
		if err != nil {
			return n, err
		}
		if inserted {
			n++
		}
	}

	// 2 · The demo creator — subscribed to Creator Pro, campaign-vetted. Shares
	// the documented local-development seed password so you can sign in as her.
	pw, err := SeedPassword()
	if err != nil {
		return n, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		return n, err
	}
	if err := up(collMembers, demoCreatorID, demoCreator(string(hash))); err != nil {
		return n, err
	}

	// 3 · A fully-filled business she owns, with reviews and its aggregate rating.
	business := demoBusiness()
	if err := up(collListings, business.ID, business); err != nil {
		return n, err
	}
	reviews := demoReviews()
	sum := 0
	for _, rv := range reviews {
		if err := up(collReviews, rv.ID, rv); err != nil {
			return n, err
		}
		sum += rv.Rating
	}
	avg := float64(int(float64(sum)/float64(len(reviews))*10+0.5)) / 10
	if _, err := db.Collection(collListings).UpdateOne(ctx, bson.M{"_id": demoBusinessID},
		bson.M{"$set": bson.M{"details.ratingAvg": avg, "details.ratingCount": len(reviews)}}); err != nil {
		return n, err
	}

	// 4 · An artist she owns, accepting donations (with some activity).
	artist := demoArtist()
	if err := up(collListings, artist.ID, artist); err != nil {
		return n, err
	}
	for _, booking := range demoArtistBookings() {
		if err := up(collArtistBookings, booking.ID, booking); err != nil {
			return n, err
		}
	}

	// 5 · Three approved fundraising campaigns she owns.
	for _, c := range demoCampaigns() {
		if err := up(collListings, c.ID, c); err != nil {
			return n, err
		}
	}
	return n, nil
}

const (
	demoFuture  = "2027-06-30T00:00:00Z"
	demoCreated = "2026-05-01T09:00:00Z"
)

func demoCreator(passwordHash string) bson.M {
	return bson.M{
		"_id": demoCreatorID, "slug": "adwoa-boateng", "displayName": "Adwoa Boateng", "initials": "AB",
		"bio":    "Cook, caterer and highlife singer from Cape Coast. Feeding the neighbourhood and raising money for the causes I love.",
		"townId": "oguaa", "role": domain.RoleMember, "schoolIds": []string{},
		"creatorTypes": []string{domain.CreatorArtist, domain.CreatorBusiness, domain.CreatorOrganiser},
		"creatorPlan":  "creator-pro", "creatorSubscribedUntil": demoFuture, "campaignerVetted": true,
		"phoneVerified": true, "suspended": false, "joinedAt": demoCreated,
		"email": "adwoa-demo" + domain.DemoMemberEmailSuffix, "passwordHash": passwordHash,
	}
}

// demoBusiness is the showcase shop. Demo=true keeps it out of the sitemap and
// public feeds; its id is purged by cmd/purgefabricated.
func demoBusiness() domain.Listing {
	return domain.Listing{
		ID: demoBusinessID, Demo: true, Slug: "adwoas-kitchen-catering", Type: domain.TypeBusiness, OwnerID: demoCreatorID,
		Title: "Adwoa's Kitchen & Catering", Status: domain.StatusApproved, Featured: true,
		Tags: []string{"food", "catering", "oguaa"}, TownID: "oguaa",
		CoverImageURL: seedImg("kenkey.jpg"), Handle: "adwoas-kitchen",
		CreatedAt: demoCreated, SubmittedAt: demoCreated, PublishedAt: demoCreated,
		Sections: []domain.ProfileSection{
			{ID: "sf-about", Type: "richtext", Title: "Our story", Tone: "green", Body: "Adwoa's Kitchen started as a lunch stand outside Cape Coast Castle in 2018. Today we cook for weddings, outdoorings and Fetu Afahye durbars across the coast — the same recipes, at any scale. Every plate is cooked to order with fish landed that morning at Bakaano."},
			{ID: "sf-quote", Type: "quote", Title: "— Adwoa Boateng, owner", Tone: "clay", Body: "If it's not good enough for my own family's table, it doesn't leave my kitchen."},
		},
		Photos: []domain.MediaAsset{
			{ID: "sf-p1", URL: seedImg("kenkey.jpg"), Kind: "photo", Alt: "A steaming plate of kenkey and fried fish", Caption: "Bakaano kenkey with fresh-fried tilapia", Moderation: "approved"},
			{ID: "sf-p2", URL: seedImg("fishermen.jpg"), Kind: "photo", Alt: "Fishermen landing the morning catch", Caption: "We buy the catch at dawn", Moderation: "approved"},
			{ID: "sf-p3", URL: seedImg("downtown.jpg"), Kind: "photo", Alt: "Cape Coast street scene", Caption: "Serving the neighbourhood since 2018", Moderation: "approved"},
			{ID: "sf-p4", URL: seedImg("beach.jpg"), Kind: "photo", Alt: "Cape Coast beach", Caption: "Beach-side catering a speciality", Moderation: "approved"},
		},
		Products: []domain.StoreItem{
			{ID: "prod-1", Name: "Kenkey & fried fish", Description: "Ga kenkey, fresh-fried tilapia, shito and pepper.", PricePesewas: 3500, Available: true},
			{ID: "prod-2", Name: "Jollof rice (takeaway)", Description: "Smoky party jollof with chicken.", PricePesewas: 4000, Available: true},
			{ID: "prod-3", Name: "Waakye special", Description: "Rice & beans with the full works — gari, spaghetti, egg, meat.", PricePesewas: 4500, Available: true},
			{ID: "prod-4", Name: "Fufu & light soup", Description: "Pounded fufu with goat light soup.", PricePesewas: 5000, Available: true},
			{ID: "prod-5", Name: "Banku & tilapia", Description: "Banku with grilled tilapia and hot pepper.", PricePesewas: 5500, Available: true},
			{ID: "prod-6", Name: "Bottled pepper sauce (250ml)", Description: "Our signature shito — take it home.", PricePesewas: 3000, Available: true},
		},
		Services: []domain.StoreItem{
			{ID: "svc-1", Name: "Event catering", Description: "Weddings, outdoorings, funerals — full-service catering with serving staff.", PricePesewas: 5000, Unit: "per head, from", Available: true},
			{ID: "svc-2", Name: "Durbar & festival cooking", Description: "Large-batch cooking for Fetu Afahye and community durbars.", PricePesewas: 200000, Unit: "per day, from", Available: true},
			{ID: "svc-3", Name: "Cookery classes", Description: "Learn Cape Coast classics — small group sessions at our kitchen.", PricePesewas: 15000, Unit: "per person", Available: true},
		},
		Details: map[string]any{
			"category": "Restaurant & Catering", "description": "Home-style Cape Coast cooking and full-service event catering — kenkey, jollof, waakye and durbar-scale spreads.",
			"address": "Near Bakaano landing beach, Cape Coast", "openingHours": "Mon–Sat, 9am–9pm",
			"contact":         []map[string]any{{"label": "WhatsApp", "url": "https://wa.me/233200000000"}, {"label": "Instagram", "url": "https://instagram.com/adwoaskitchen"}},
			"plan":            "featured",
			"subscribedUntil": demoFuture,
		},
	}
}

func demoReviews() []domain.Review {
	slug := demoBusiness().Slug
	return []domain.Review{
		{ID: "rev-demo-1", ListingID: demoBusinessID, ListingSlug: slug, MemberID: "m-review-1", AuthorName: "Kojo Anan", Rating: 5, Body: "Best jollof in Cape Coast, and Adwoa catered my sister's wedding flawlessly. 200 guests, everyone fed hot food on time.", CreatedAt: "2026-06-10T12:00:00Z"},
		{ID: "rev-demo-2", ListingID: demoBusinessID, ListingSlug: slug, MemberID: "m-review-2", AuthorName: "Efua Sam", Rating: 5, Body: "The banku and tilapia is exactly how my grandmother used to make it. I come every Friday.", CreatedAt: "2026-06-18T18:30:00Z"},
		{ID: "rev-demo-3", ListingID: demoBusinessID, ListingSlug: slug, MemberID: "m-review-3", AuthorName: "Yaw Mensah", Rating: 4, Body: "Great food and fair prices. Can get busy at lunch so order ahead on WhatsApp.", CreatedAt: "2026-06-25T13:15:00Z"},
		{ID: "rev-demo-4", ListingID: demoBusinessID, ListingSlug: slug, MemberID: "m-review-4", AuthorName: "Ama Darko", Rating: 5, Body: "Booked the cookery class for my daughter's birthday — the kids loved it and learned to make shito!", CreatedAt: "2026-07-02T10:00:00Z"},
		{ID: "rev-demo-5", ListingID: demoBusinessID, ListingSlug: slug, MemberID: "m-review-5", AuthorName: "Kwesi Bonsu", Rating: 5, Body: "Catered our office end-of-year durbar. Professional, punctual, and the waakye was unreal.", CreatedAt: "2026-07-12T16:45:00Z"},
	}
}

func demoArtist() domain.Listing {
	return domain.Listing{
		ID: demoArtistID, Demo: true, Slug: "adwoa-b", Type: domain.TypeArtist, OwnerID: demoCreatorID,
		Title: "Adwoa B", Status: domain.StatusApproved, Tags: []string{"highlife", "gospel", "oguaa"}, TownID: "oguaa",
		CoverImageURL: seedImg("fetu-queenmother.jpg"), CreatedAt: demoCreated, SubmittedAt: demoCreated, PublishedAt: demoCreated,
		Details: map[string]any{
			"actName": "Adwoa B", "genres": []string{"Highlife", "Gospel"},
			"bio": "Cape Coast highlife and gospel singer. Sunday mornings at Emintsimadze, festival stages at Fetu Afahye. Recording my first EP with your support.",
			"streamingLinks": []map[string]any{
				{"label": "Spotify", "url": "https://open.spotify.com/"},
				{"label": "Apple Music", "url": "https://music.apple.com/"},
				{"label": "YouTube Music", "url": "https://music.youtube.com/"},
				{"label": "Audiomack", "url": "https://audiomack.com/"},
				{"label": "Boomplay", "url": "https://www.boomplay.com/"},
				{"label": "TIDAL", "url": "https://tidal.com/"},
			},
			"socials": []map[string]any{{"label": "Instagram", "url": "https://instagram.com/"}},
			"booking": "https://example.org/book/adwoa-b",
			"releases": []map[string]any{
				{"id": "adwoa-release-1", "title": "Sunday by the Sea", "kind": "ep", "year": 2026, "coverImageUrl": seedImg("fetu-queenmother.jpg"), "description": "Highlife warmth and gospel harmonies recorded for the coast.", "url": "https://open.spotify.com/", "tracks": []map[string]any{{"title": "Sunday by the Sea"}, {"title": "Emintsimadze"}, {"title": "Carry Me Home"}, {"title": "Medaase"}}},
				{"id": "adwoa-release-2", "title": "Afahye Morning", "kind": "single", "year": 2025, "tracks": []map[string]any{{"title": "Afahye Morning"}}},
			},
			// Existing donation activity so the "tip jar" shows numbers.
			"donationsNetPesewas": int64(48500), "donorCount": 17,
		},
	}
}

func demoArtistBookings() []domain.ArtistBooking {
	artist := demoArtist()
	return []domain.ArtistBooking{
		{ID: "artist-booking-demo-1", ArtistID: demoArtistID, ArtistSlug: artist.Slug, ArtistName: artist.Title, ArtistOwnerID: demoCreatorID, RequesterID: memberAkua, RequesterName: "Akua Mensah", RequesterEmail: "akua@example.com", RequesterPhone: "+233 24 000 0000", EventType: "Wedding reception", EventDate: "2026-10-17", Location: "Elmina Beach Resort", AudienceSize: 280, BudgetPesewas: 450000, Message: "A warm 75-minute highlife set after dinner. Sound system is available at the venue.", Status: domain.ArtistBookingNew, CreatedAt: "2026-07-24T14:30:00Z", UpdatedAt: "2026-07-24T14:30:00Z"},
		{ID: "artist-booking-demo-2", ArtistID: demoArtistID, ArtistSlug: artist.Slug, ArtistName: artist.Title, ArtistOwnerID: demoCreatorID, RequesterID: memberKojo, RequesterName: "Kojo Annan", RequesterEmail: "kojo@example.com", EventType: "Corporate event", EventDate: "2026-09-05", Location: "UCC New Examination Centre", AudienceSize: 500, BudgetPesewas: 700000, Message: "Opening-night performance for a regional alumni conference.", Status: domain.ArtistBookingReviewing, CreatedAt: "2026-07-22T09:10:00Z", UpdatedAt: "2026-07-23T08:00:00Z"},
		{ID: "artist-booking-demo-3", ArtistID: demoArtistID, ArtistSlug: artist.Slug, ArtistName: artist.Title, ArtistOwnerID: demoCreatorID, RequesterID: memberNana, RequesterName: "Nana Essien", RequesterPhone: "+233 20 000 0000", EventType: "Church programme", EventDate: "2026-11-29", Location: "Christ Church, Cape Coast", AudienceSize: 350, Message: "Thanksgiving service with a 30-minute gospel-highlife feature.", Status: domain.ArtistBookingAccepted, ArtistNote: "Date held pending final programme.", CreatedAt: "2026-07-18T11:45:00Z", UpdatedAt: "2026-07-19T15:20:00Z"},
	}
}

// demoCampaigns are three fundraising campaigns with invented totals. Demo=true
// keeps them off the sitemap and out of public feeds.
func demoCampaigns() []domain.Listing {
	campaigns := []domain.Listing{
		{ID: "lst-demo-camp-1", Slug: "recording-studio-youth-choir", Type: domain.TypeProject, OwnerID: demoCreatorID,
			Title: "A recording studio for the youth choir", Status: domain.StatusApproved, Tags: []string{"campaign", "music"}, TownID: "oguaa",
			CoverImageURL: seedImg("christ-church.jpg"), CreatedAt: "2026-06-05T09:00:00Z", SubmittedAt: "2026-06-05T09:00:00Z", PublishedAt: "2026-06-06T09:00:00Z",
			Details: map[string]any{"campaign": true, "category": "music", "goalPesewas": int64(1500000), "raisedPesewas": int64(842000), "backers": 63, "deadline": "2026-12-31T23:59:59Z",
				"description": "The Emintsimadze youth choir has the voices but nowhere to record. We're building a small acoustically-treated room with a mic, interface and monitors so our young singers can release the songs they write. Every cedi is receipted."}},
		{ID: "lst-demo-camp-2", Slug: "fetu-afahye-youth-costumes", Type: domain.TypeProject, OwnerID: demoCreatorID,
			Title: "Costumes for the Fetu Afahye youth troupe", Status: domain.StatusApproved, Tags: []string{"campaign", "culture"}, TownID: "oguaa",
			CoverImageURL: seedImg("fetu-procession.jpg"), CreatedAt: "2026-06-20T09:00:00Z", SubmittedAt: "2026-06-20T09:00:00Z", PublishedAt: "2026-06-21T09:00:00Z",
			Details: map[string]any{"campaign": true, "category": "culture", "goalPesewas": int64(600000), "raisedPesewas": int64(214500), "backers": 41, "deadline": "2026-08-20T23:59:59Z",
				"description": "Forty young dancers keep the Asafo traditions alive at Fetu Afahye every year. Their costumes are threadbare. Help us kit out the troupe with new regalia, drums and dancing shoes before this year's festival."}},
		{ID: "lst-demo-camp-3", Slug: "bakaano-library-rebuild", Type: domain.TypeProject, OwnerID: demoCreatorID,
			Title: "Rebuild the Bakaano community library", Status: domain.StatusApproved, Tags: []string{"campaign", "education"}, TownID: "bakaano",
			CoverImageURL: seedImg("classroom-block-ghana.jpg"), CreatedAt: "2026-07-01T09:00:00Z", SubmittedAt: "2026-07-01T09:00:00Z", PublishedAt: "2026-07-02T09:00:00Z",
			Details: map[string]any{"campaign": true, "category": "education", "goalPesewas": int64(2500000), "raisedPesewas": int64(391000), "backers": 28, "deadline": "2027-03-31T23:59:59Z",
				"description": "The lagoon-side library that a generation of Bakaano children grew up in has flooded one too many times. We're raising funds to rebuild it on higher ground with new shelving, 1,000 books and a solar reading lamp corner."}},
	}
	for i := range campaigns {
		campaigns[i].Demo = true
	}
	return campaigns
}

// Fixed IDs for the demo showcase records (idempotent upserts).
const (
	demoCreatorID  = "m-demo-adwoa"
	demoBusinessID = "lst-demo-adwoa-kitchen"
	demoArtistID   = "lst-demo-adwoa-b"
)
