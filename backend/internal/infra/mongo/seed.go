package mongo

import (
	"context"
	"log/slog"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
)

// ── shared seed constants ────────────────────────────────────────────────────
// Values repeated across the seed tables live here once: the brand palette,
// well-known member/institution ids, batch verification dates, editorial
// timestamps and common section labels.

const (
	// Brand palette (hex colours).
	colorClay      = "#B0503C"
	colorDeepGreen = "#123F2D"
	colorTeal      = "#0E7C6B"
	colorCrimson   = "#A4161A"
	colorRoyalBlue = "#1E4FA3"
	colorPaper     = "#FBFBFB"
	colorGreen     = "#1E6B3A"
	colorGold      = "#E3B23C"
	colorMaroon    = "#7C2D2D"
	colorInk       = "#161616"
	colorBrass     = "#C7A24A"
	colorLeafGreen = "#0E7C4A"
	colorBrown     = "#6B4423"
	colorCobalt    = "#0B3D91"
	colorBronze    = "#B07D32"
	colorForest    = "#1A2E22"

	// Seed members and the editorial byline.
	memberKojo   = "m-kojo"
	memberEfua   = "m-efua"
	memberNana   = "m-nana"
	memberAidoo  = "m-aidoo"
	memberAkua   = "m-akua"
	memberEfia   = "m-efia"
	newsroomName = "Oguaa Newsroom"

	// Institutions and places referenced across the seed tables.
	cityCapeCoast       = "Cape Coast"
	orgOguaaTraditional = "oguaa-traditional-area"
	schoolWesleyGirls   = "wesley-girls"
	schoolHolyChild     = "holy-child"
	schoolBakaanoBasic  = "bakaano-basic"
	mfantsipimURL       = "https://mfantsipim.com/"

	// Batch verification dates (VerifiedOn) and editorial timestamps.
	verifiedSchoolsBatch = "2026-05-14" // founding school roster
	verifiedRosterBatch  = "2026-06-07" // extended schools + heritage batch 1
	verifiedSitesBatch   = "2026-06-10" // heritage batch 2 + civic institutions
	seedTimelineDate     = "2026-06-15"
	newsFetuPublishedAt  = "2026-08-20T09:00:00Z"
	newsMobaPublishedAt  = "2026-05-02T10:00:00Z"
	newsFetuCmtAt        = "2026-07-06T09:00:00Z"
	newsWassceAt         = "2026-07-08T10:00:00Z"
	newsFishingAt        = "2026-07-10T08:00:00Z"
	newsDecongestAt      = "2026-07-11T09:30:00Z"
	newsCastleWorksAt    = "2026-07-12T11:00:00Z"

	// Seed image file names (served at /uploads/seed/ — see seedimg pkg).
	imgMfantsipimEntrance  = "mfantsipim-entrance.jpg"
	imgMfantsipimClassroom = "mfantsipim-classroom.jpg"
	imgClassroomGhana      = "classroom-ghana.jpg"
	imgFetuProcession      = "fetu-procession.jpg"
	imgFetuCrowd           = "fetu-crowd.jpg"
	imgBakatue2016         = "bakatue-2016.jpg"
	imgMarketWomen         = "market-women.jpg"

	// Repeated section chrome in institution profiles.
	titleAtAGlance        = "At a glance"
	titleGoodToKnow       = "Good to know"
	labelFromCapeCoast    = "From Cape Coast"
	subtitleBoardingHouse = "Boarding house"
	officePlaceholder     = "(office)"
)

// SeedPassword is the password shared by every seeded demo account. Demo data
// only — never reuse it for a real account.
const SeedPassword = "Oguaa-2026!"

// Seed resets the collections and loads the fact-checked Cape Coast seed data.
// It is idempotent: collections are dropped and reinserted. (See agent_plan.md §1.)
func Seed(ctx context.Context, db *mongo.Database) error {
	for _, name := range []string{collMembers, collOrgs, collPlaces, collListings, collModeration, collNotifications, collFollows, collMemberFollows, collOrgClaims, collNews, collReports, collAIUsage, collPledges, collTickets, collSubscriptions, collPromotions, collTimeline} {
		if err := db.Collection(name).Drop(ctx); err != nil {
			return err
		}
	}
	// Give every seeded member the shared demo password (hashed once).
	members := seedMembers
	if hash, err := bcrypt.GenerateFromPassword([]byte(SeedPassword), bcrypt.DefaultCost); err != nil {
		slog.Warn("seed: could not hash the seed password — seeded members will have no password", "err", err)
	} else {
		for i := range members {
			members[i].PasswordHash = string(hash)
		}
	}
	if err := insertAll(ctx, db.Collection(collMembers), members); err != nil {
		return err
	}
	allOrgs := append(append([]domain.Organization{}, seedOrgs...), seedExtraOrgs...)
	if err := insertAll(ctx, db.Collection(collOrgs), allOrgs); err != nil {
		return err
	}
	if err := insertAll(ctx, db.Collection(collPlaces), seedPlaces); err != nil {
		return err
	}
	allListings := append(append(append(seedListings(), seedExtraListings()...), seedIncidents()...), seedLostFound()...)
	if err := insertAll(ctx, db.Collection(collListings), allListings); err != nil {
		return err
	}
	if err := insertAll(ctx, db.Collection(collNews), seedNews); err != nil {
		return err
	}
	if err := insertAll(ctx, db.Collection(collTimeline), seedTimeline); err != nil {
		return err
	}
	return createIndexes(ctx, db)
}

// ── news / editorial seed ─────────────────────────────────────────────────────

var seedNews = []domain.NewsArticle{
	{
		ID: "news-fetu-2026", Slug: "fetu-afahye-2026-programme", Title: "Fetu Afahye 2026: the full week of programme",
		Summary: "The Oguaa Traditional Council unveils the calendar for this year's festival — from the ban on noise-making to the grand durbar.",
		Status:  domain.NewsPublished, AuthorID: memberNana, AuthorName: newsroomName, CoverColor: colorClay,
		CoverImageURL: seedImg("fetu-procession.jpg"),
		Tags:          []string{"festival", "culture"}, CreatedAt: newsFetuPublishedAt, UpdatedAt: newsFetuPublishedAt, PublishedAt: newsFetuPublishedAt,
		Body: "Cape Coast is preparing for **Fetu Afahye**, the festival of the Oguaa Traditional Area, held on the first Saturday of September.\n\n## The week ahead\n\n- **Monday** — the lifting of the ban on drumming and noise-making\n- **Wednesday** — purification of the 77 gods\n- **Friday** — the asafo companies parade through the streets\n- **Saturday** — the grand durbar of chiefs at Victoria Park\n\n> \"Fetu binds the living, the departed, and the gods of Oguaa.\" — the Oguaa Traditional Council\n\nVisitors are welcome. Come early; the streets fill fast.",
	},
	{
		ID: "news-moba-scholar", Slug: "moba-scholarship-2026", Title: "MOBA opens 2026 needs-based scholarships",
		Summary: "The Mfantsipim Old Boys Association invites applications from promising students who need support.",
		Status:  domain.NewsPublished, AuthorID: memberAkua, AuthorName: newsroomName, CoverColor: colorDeepGreen, CoverImageURL: seedImg(imgMfantsipimEntrance),
		Tags: []string{"education", "opportunity"}, CreatedAt: newsMobaPublishedAt, UpdatedAt: newsMobaPublishedAt, PublishedAt: newsMobaPublishedAt,
		Body: "The **Mfantsipim Old Boys Association (MOBA)** has opened its 2026 needs-based scholarship.\n\nThe scheme covers fees and books for students of proven need and promise. Applications are reviewed by the welfare committee.\n\n### How to apply\n\n1. Collect a form from the school office\n2. Attach your last report and a brief letter\n3. Submit before the end of term\n\nFor details, see the institution's page on Oguaa.",
	},
	{
		ID: "news-draft-tip", Slug: "newsroom-welcome-draft", Title: "Welcome to the Oguaa Newsroom (draft)",
		Summary: "An internal note — this one stays a draft until an editor publishes it.",
		Status:  domain.NewsDraft, AuthorID: memberNana, AuthorName: newsroomName, CoverColor: colorTeal,
		Tags: []string{}, CreatedAt: "2026-06-01T08:00:00Z", UpdatedAt: "2026-06-01T08:00:00Z",
		Body: "This is a **draft**. Write in Markdown, hit _Preview_ to see it rendered, then **Publish** when it's ready.",
	},
	{
		ID: "news-fetu-2026-committee", Slug: "fetu-afahye-2026-planning-committee", Title: "Fetu Afahye 2026 planning committee inaugurated",
		Summary: "The Oguaa Traditional Council has named the committee steering this year's festival, with subcommittees for security, sanitation and the durbar.",
		Status:  domain.NewsPublished, AuthorID: memberEfia, AuthorName: newsroomName, CoverColor: colorCrimson,
		CoverImageURL: seedImg("fetu-flagbearer.jpg"),
		Tags:          []string{"festival", "civic"}, CreatedAt: newsFetuCmtAt, UpdatedAt: newsFetuCmtAt, PublishedAt: newsFetuCmtAt,
		Body: "The **Oguaa Traditional Council** has inaugurated the planning committee for **Fetu Afahye 2026**, charging it to deliver a festival worthy of the town's growing homecoming crowds.\n\nThe committee, chaired by a senior member of the Council, will work through subcommittees on security, sanitation, protocol and the grand durbar at Victoria Park. The seven Asafo companies each hold a seat at the table.\n\n> \"Fetu belongs to all of Oguaa. We plan early so that the town, the companies and our visitors are all ready.\" — a Council spokesperson\n\nResidents with offers of support are asked to channel them through the Council secretariat.",
	},
	{
		ID: "news-wassce-2026", Slug: "cape-coast-schools-wassce-2026", Title: "Cape Coast schools post strong WASSCE showing",
		Summary: "Early returns suggest another solid year for the town's senior high schools — though headteachers caution the figures are still indicative.",
		Status:  domain.NewsPublished, AuthorID: memberEfia, AuthorName: newsroomName, CoverColor: colorDeepGreen,
		CoverImageURL: seedImg(imgClassroomGhana),
		Tags:          []string{"education"}, CreatedAt: newsWassceAt, UpdatedAt: newsWassceAt, PublishedAt: newsWassceAt,
		Body: "Cape Coast's senior high schools are celebrating another strong **WASSCE** season, with early school-level returns pointing to high pass rates across the metropolis.\n\nThe mission schools on the hills — Mfantsipim, Adisadel, Wesley Girls', Holy Child and St. Augustine's — all report performances in line with recent years, while the public co-educational schools say their numbers continue to climb. Headteachers are quick to add that the figures remain **indicative** until the official analysis is published.\n\nThe Metropolitan Education Directorate is expected to release its full breakdown in the coming weeks.",
	},
	{
		ID: "news-fishing-season-2026", Slug: "fishing-season-outlook-2026", Title: "A hopeful season on the water: the 2026 fishing outlook",
		Summary: "After Bakatue's generous first casting, Bakaano's fishermen read a fair season ahead — though fuel costs still bite.",
		Status:  domain.NewsPublished, AuthorID: memberEfia, AuthorName: newsroomName, CoverColor: colorTeal,
		CoverImageURL: seedImg("fishermen.jpg"),
		Tags:          []string{"fishing", "bakaano"}, CreatedAt: newsFishingAt, UpdatedAt: newsFishingAt, PublishedAt: newsFishingAt,
		Body: "The canoes are going out before dawn again, and the early landings at Bakaano have given the quarter reason to hope. Elders who read the season at Bakatue say the signs point to a **fair year on the water**.\n\nThe chief fisherman's office cautions that the season's true shape will not be known for some weeks, and canoe owners say fuel and premix costs remain their heaviest burden. Even so, the morning sales at Kotokuraba have been brisk.\n\nThe closed season dates will be announced by the fisheries authorities later this month; the community is asked to observe them fully.",
	},
	{
		ID: "news-kotokuraba-decongestion", Slug: "kotokuraba-market-decongestion-2026", Title: "Kotokuraba decongestion exercise enters second week",
		Summary: "The Metropolitan Assembly is clearing pavements and re-marking stalls around the market — traders asked to keep to their allotted spaces.",
		Status:  domain.NewsPublished, AuthorID: memberEfia, AuthorName: newsroomName, CoverColor: colorClay,
		CoverImageURL: seedImg(imgMarketWomen),
		Tags:          []string{"civic", "market"}, CreatedAt: newsDecongestAt, UpdatedAt: newsDecongestAt, PublishedAt: newsDecongestAt,
		Body: "The **Cape Coast Metropolitan Assembly** says its decongestion exercise around **Kotokuraba Market** has entered a second week, clearing blocked pavements and re-marking stall lines around the market gates.\n\nOfficials say the aim is to keep walkways and emergency access open, and that traders with stalls inside the market are unaffected. The Assembly has asked hawkers to use the spaces allocated to them and to direct grievances to the market office.\n\nThe Konkohemaa and the traders' union say they are working with the Assembly to keep the exercise orderly.",
	},
	{
		ID: "news-castle-conservation", Slug: "cape-coast-castle-conservation-2026", Title: "Conservation works begin at Cape Coast Castle",
		Summary: "Museums staff say the whitewashed walls and the museum galleries are due for careful restoration — the castle stays open to visitors.",
		Status:  domain.NewsPublished, AuthorID: memberEfia, AuthorName: newsroomName, CoverColor: colorBronze,
		CoverImageURL: seedImg("castle-museum.jpg"),
		Tags:          []string{"heritage", "castle"}, CreatedAt: newsCastleWorksAt, UpdatedAt: newsCastleWorksAt, PublishedAt: newsCastleWorksAt,
		Body: "A new phase of **conservation works** has begun at **Cape Coast Castle**, with staff of the Museums and Monuments authority supervising careful restoration of sections of the whitewashed walls and the museum galleries.\n\nOfficials say the works are routine care for a building that has faced the Atlantic for over three and a half centuries, and that the castle **remains open** for tours while the scaffolding is up. Some gallery rooms may close briefly on a rotating basis.\n\nVisitors are advised to confirm the day's tour schedule at the gate, especially in the afternoons.",
	},
}

// ── timeline seed (the history hub) ───────────────────────────────────────────
// 4-digit year strings sort lexically, which is chronological.

var seedTimeline = []domain.TimelineEntry{
	{ID: "tl-1482", Year: "1482", Title: "The Portuguese reach the Gold Coast", Summary: "Portuguese traders arrive on the coast the Fante call home, opening centuries of contact, trade, and contest.", Tags: []string{"coast", "trade"}, CreatedAt: seedTimelineDate},
	{ID: "tl-1555", Year: "1555", Title: "Oguaa is founded", Summary: "Oral tradition holds that the fishing settlement of Oguaa — \"the market\" — grows on the shore where Cape Coast stands today.", Tags: []string{"oguaa"}, CreatedAt: seedTimelineDate},
	{ID: "tl-1653", Year: "1653", Title: "Carolusborg rises", Summary: "Sweden builds the timber fort of Carolusborg on the rock above the sea — the first stone of what becomes Cape Coast Castle, changing hands among European powers for two centuries.", Tags: []string{"castle", "heritage"}, CreatedAt: seedTimelineDate},
	{ID: "tl-1757", Year: "1757", Title: "Philip Quaque's school", Summary: "Philip Quaque, the first African ordained in the Church of England, opens a school in the castle for African children — the seed of the coast's school tradition.", Tags: []string{"education"}, CreatedAt: seedTimelineDate},
	{ID: "tl-1876", Year: "1876", Title: "Mfantsipim is founded", Summary: "The first secondary school in the Gold Coast opens on the Cape Coast hill — the start of the town's life as the nation's capital of learning.", Tags: []string{"education", "school"}, CreatedAt: seedTimelineDate},
	{ID: "tl-1897", Year: "1897", Title: "The Aborigines' Rights Protection Society", Summary: "Formed in Cape Coast to defend Fante lands against colonial seizure — the coast's educated class finds its political voice.", Tags: []string{"heritage", "resistance"}, CreatedAt: seedTimelineDate},
	{ID: "tl-1932", Year: "1932", Title: "Fetu Afahye is banned", Summary: "After clashes between Asafo companies, the colonial administration bans the festival, sneering at it as a \"Black Christmas\".", Tags: []string{"festival"}, CreatedAt: seedTimelineDate},
	{ID: "tl-1948", Year: "1948", Title: "Fetu Afahye returns", Summary: "The festival is restored after years of community struggle — and it has only grown since.", Tags: []string{"festival"}, CreatedAt: seedTimelineDate},
	{ID: "tl-1957", Year: "1957", Title: "Independence", Summary: "Ghana becomes the first sub-Saharan African nation to gain independence — and Cape Coast, the old capital of learning, has schooled the generation that leads it.", Tags: []string{"independence"}, CreatedAt: seedTimelineDate},
	{ID: "tl-1979", Year: "1979", Title: "UNESCO World Heritage", Summary: "Cape Coast Castle and the forts of the Gold Coast are inscribed as World Heritage Sites — the wound of the coast held before the world.", Tags: []string{"heritage", "castle"}, CreatedAt: seedTimelineDate},
	{ID: "tl-2007", Year: "2007", Title: "The PANAFEST homecoming era", Summary: "The biennial festival of arts, emancipation and remembrance cements Cape Coast as the diaspora's pilgrimage city.", Tags: []string{"festival", "diaspora"}, CreatedAt: seedTimelineDate},
	{ID: "tl-2024", Year: "2024", Title: "Fetu Afahye @60", Summary: "The 60th anniversary of the festival draws the Asantehene, Otumfuo Osei Tutu II, to the grand durbar for the first time.", Tags: []string{"festival", "oguaa"}, CreatedAt: seedTimelineDate},
}

func insertAll[T any](ctx context.Context, coll *mongo.Collection, items []T) error {
	if len(items) == 0 {
		return nil
	}
	docs := make([]any, len(items))
	for i, it := range items {
		docs[i] = it
	}
	_, err := coll.InsertMany(ctx, docs)
	return err
}

func createIndexes(ctx context.Context, db *mongo.Database) error {
	idx := func(keys bson.D) mongo.IndexModel { return mongo.IndexModel{Keys: keys} }
	if _, err := db.Collection(collListings).Indexes().CreateMany(ctx, []mongo.IndexModel{
		idx(bson.D{{Key: "type", Value: 1}, {Key: "status", Value: 1}}),
		idx(bson.D{{Key: "slug", Value: 1}}),
		idx(bson.D{{Key: "ownerId", Value: 1}}),
		idx(bson.D{{Key: "schoolIds", Value: 1}}),
		idx(bson.D{{Key: "postedByOrgId", Value: 1}}),
	}); err != nil {
		return err
	}
	for _, c := range []string{collMembers, collOrgs, collPlaces} {
		if _, err := db.Collection(c).Indexes().CreateOne(ctx, idx(bson.D{{Key: "slug", Value: 1}})); err != nil {
			return err
		}
	}
	// Members sign in by email or phone: one account per identifier; sparse so
	// invited email-only or phone-only members don't collide on a null key.
	if _, err := db.Collection(collMembers).Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true).SetSparse(true),
	}); err != nil {
		return err
	}
	if _, err := db.Collection(collMembers).Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "phone", Value: 1}},
		Options: options.Index().SetUnique(true).SetSparse(true),
	}); err != nil {
		return err
	}
	// Social graph + notice indexes: follows/notifications are read by member on
	// every page load, and reports by status in the steward triage queue.
	if _, err := db.Collection(collFollows).Indexes().CreateMany(ctx, []mongo.IndexModel{
		idx(bson.D{{Key: "listingId", Value: 1}}),
		idx(bson.D{{Key: "memberId", Value: 1}}),
	}); err != nil {
		return err
	}
	if _, err := db.Collection(collMemberFollows).Indexes().CreateMany(ctx, []mongo.IndexModel{
		idx(bson.D{{Key: "memberId", Value: 1}}),
		idx(bson.D{{Key: "followerId", Value: 1}}),
	}); err != nil {
		return err
	}
	if _, err := db.Collection(collNotifications).Indexes().CreateOne(ctx, idx(bson.D{{Key: "memberId", Value: 1}, {Key: "read", Value: 1}})); err != nil {
		return err
	}
	if _, err := db.Collection(collReports).Indexes().CreateOne(ctx, idx(bson.D{{Key: "status", Value: 1}, {Key: "createdAt", Value: -1}})); err != nil {
		return err
	}
	// Pledges are looked up by Paystack reference on every callback/webhook.
	if _, err := db.Collection(collPledges).Indexes().CreateMany(ctx, []mongo.IndexModel{
		idx(bson.D{{Key: "reference", Value: 1}}),
		idx(bson.D{{Key: "memberId", Value: 1}}),
		idx(bson.D{{Key: "projectId", Value: 1}}),
	}); err != nil {
		return err
	}
	// Subscriptions are confirmed by reference and ledged by member/listing.
	if _, err := db.Collection(collSubscriptions).Indexes().CreateMany(ctx, []mongo.IndexModel{
		idx(bson.D{{Key: "reference", Value: 1}}),
		idx(bson.D{{Key: "memberId", Value: 1}}),
		idx(bson.D{{Key: "listingId", Value: 1}}),
	}); err != nil {
		return err
	}
	// Promotions are confirmed by reference and ledged by member/listing.
	if _, err := db.Collection(collPromotions).Indexes().CreateMany(ctx, []mongo.IndexModel{
		idx(bson.D{{Key: "reference", Value: 1}}),
		idx(bson.D{{Key: "memberId", Value: 1}}),
		idx(bson.D{{Key: "listingId", Value: 1}}),
	}); err != nil {
		return err
	}
	return nil
}

// ── helpers ──────────────────────────────────────────────────────────────────

func sl(label, url string) domain.SocialLink { return domain.SocialLink{Label: label, URL: url} }

// seedImg returns the relative URL of a curated seed image (embedded in the
// API, served at /uploads/seed/). Names are the file names under that path.
func seedImg(name string) string { return "/uploads/seed/" + name }

func streams() []domain.SocialLink {
	return []domain.SocialLink{
		sl("Audiomack", "https://audiomack.com"),
		sl("Boomplay", "https://www.boomplay.com"),
		sl("YouTube", "https://youtube.com"),
		sl("Spotify", "https://open.spotify.com"),
	}
}

// avatar returns a deterministic, generated illustrated avatar for a member
// (DiceBear "adventurer" — an illustration, not a real person's face, so no one
// is impersonated). Skin tones are biased to reflect the community and the
// background matches the cream palette. Demo imagery — members upload their own.
func avatar(seed string) string {
	return "https://api.dicebear.com/9.x/adventurer/png?seed=" + seed +
		"&skinColor=763900,8c5a2b,9a5b34&backgroundColor=ECE4D3"
}

// ── members ──────────────────────────────────────────────────────────────────

var seedMembers = []domain.Member{
	{ID: "m-ama", Slug: "ama-mensah", PhotoURL: avatar("ama-mensah"), DisplayName: "Ama Mensah", Initials: "AM", Bio: "Daughter of Madam Adwoa. Keeper of her memory.", TownID: "bakaano", AsafoID: "asafo-bentsir", SchoolIDs: []string{schoolWesleyGirls}, PhoneVerified: true, Role: "member", CreatorTypes: []string{domain.CreatorBusiness}, JoinedAt: "2026-01-12", Phone: "+233240000001", Email: "ama-mensah@oguaa.test"},
	{ID: memberKojo, Slug: "kojo-arthur", PhotoURL: avatar("kojo-arthur"), DisplayName: "Kojo Arthur", Initials: "KA", Bio: "Teacher. Mfantsipim '88.", TownID: "oguaa", AsafoID: "asafo-nkum", SchoolIDs: []string{"mfantsipim"}, Schooling: []domain.SchoolStint{{SchoolID: "mfantsipim", FromYear: 1984, ToYear: 1988}}, PhoneVerified: true, Role: "member", CreatorTypes: []string{domain.CreatorOrganiser}, JoinedAt: d20260120, Phone: "+233240000002", Email: "kojo-arthur@oguaa.test"},
	{ID: memberEfua, Slug: "efua-sam", PhotoURL: avatar("efua-sam"), DisplayName: "Efua Sam", Initials: "ES", TownID: "bakaano", SchoolIDs: []string{schoolHolyChild}, PhoneVerified: true, Role: "member", CreatorTypes: []string{domain.CreatorBusiness}, JoinedAt: "2026-02-01", Phone: "+233240000003", Email: "efua-sam@oguaa.test"},
	{ID: memberNana, Slug: "nana-essien", PhotoURL: avatar("nana-essien"), DisplayName: "Nana Kweku Essien", Initials: "NE", Bio: "PTA chair, Bakaano. Community steward.", TownID: "bakaano", SchoolIDs: []string{"mfantsipim"}, Schooling: []domain.SchoolStint{{SchoolID: "mfantsipim", FromYear: 1983, ToYear: 1987}}, PhoneVerified: true, Role: "steward", CreatorTypes: []string{domain.CreatorBusiness, domain.CreatorOrganiser, domain.CreatorArtist}, JoinedAt: "2025-12-02", Phone: "+233240000004", Email: "nana-essien@oguaa.test"},
	{ID: memberAidoo, Slug: "samuel-aidoo", PhotoURL: avatar("samuel-aidoo"), DisplayName: "Mr. Samuel Aidoo", Initials: "SA", Bio: "Headteacher, Bakaano M/A Basic School.", TownID: "bakaano", SchoolIDs: []string{schoolBakaanoBasic}, PhoneVerified: true, Role: "curator", CreatorTypes: []string{domain.CreatorInstitution}, JoinedAt: "2026-01-05", Phone: "+233240000005", Email: "samuel-aidoo@oguaa.test"},
	{ID: memberAkua, Slug: "akua-pratt", PhotoURL: avatar("akua-pratt"), DisplayName: "Akua Pratt", Initials: "AP", Bio: "Music curator. UCC '15.", TownID: "oguaa", SchoolIDs: []string{"ucc"}, PhoneVerified: true, Role: "curator", CreatorTypes: []string{domain.CreatorArtist, domain.CreatorBusiness, domain.CreatorOrganiser}, JoinedAt: "2026-01-08", Phone: "+233240000006", Email: "akua-pratt@oguaa.test"},
	{ID: "m-yaw", Slug: "yaw-ofori", PhotoURL: avatar("yaw-ofori"), DisplayName: "Yaw Ofori", Initials: "YO", Bio: "Manages Castle View Guesthouse.", TownID: "oguaa", SchoolIDs: []string{"adisadel"}, PhoneVerified: true, Role: "member", CreatorTypes: []string{domain.CreatorBusiness}, JoinedAt: "2026-02-14", Phone: "+233240000007", Email: "yaw-ofori@oguaa.test"},
	{ID: "m-esi", Slug: "esi-quayson", PhotoURL: avatar("esi-quayson"), DisplayName: "Esi Quayson", Initials: "EQ", Bio: "Fishmonger, Kotokuraba. Reps Bakaano hard.", TownID: "kotokuraba", AsafoID: "asafo-anaafo", SchoolIDs: []string{}, PhoneVerified: true, Role: "member", CreatorTypes: []string{domain.CreatorBusiness}, JoinedAt: d20260301, Phone: "+233240000008", Email: "esi-quayson@oguaa.test"},
	{ID: "m-efia", Slug: "efia-quagraine", PhotoURL: avatar("efia-quagraine"), DisplayName: "Efia Quagraine", Initials: "EQ", Bio: "Newsroom editor. Keeps the town informed.", TownID: "oguaa", SchoolIDs: []string{"ucc"}, PhoneVerified: true, Role: "editor", JoinedAt: "2026-01-15", Phone: "+233240000009", Email: "efia-quagraine@oguaa.test"},
	{ID: "m-kofi", Slug: "kofi-abban", PhotoURL: avatar("kofi-abban"), DisplayName: "Kofi Abban", Initials: "KA", Bio: "Moderation desk. Keeps the town tidy.", TownID: "oguaa", SchoolIDs: []string{"adisadel"}, PhoneVerified: true, Role: domain.RoleModerator, JoinedAt: d20260401, Phone: "+233240000010", Email: "kofi-abban@oguaa.test"},
}

// ── places ───────────────────────────────────────────────────────────────────

var seedPlaces = []domain.Place{
	// The town itself.
	{ID: "oguaa", Slug: "oguaa", Name: "Cape Coast (Oguaa)", Kind: domain.PlaceQuarter, Blurb: "The town that began as a market."},

	// Quarters & neighbourhoods (rep your area).
	{ID: "bakaano", Slug: "bakaano", Name: "Bakaano", Kind: domain.PlaceQuarter, ParentID: "oguaa", Blurb: "The lagoon-side fishing quarter."},
	{ID: "kotokuraba", Slug: "kotokuraba", Name: "Kotokuraba", Kind: domain.PlaceQuarter, ParentID: "oguaa", Blurb: "The 'crab-hamlet' — the central market."},
	{ID: "aboom", Slug: "aboom", Name: "Aboom", Kind: domain.PlaceQuarter, ParentID: "oguaa", Blurb: "An old quarter on the western side of town."},
	{ID: "aquarium", Slug: "aquarium", Name: "Aquarium", Kind: domain.PlaceQuarter, ParentID: "oguaa", Blurb: "The seaside neighbourhood by the old aquarium."},
	{ID: "kadadwen", Slug: "kadadwen", Name: "Kadadwen", Kind: domain.PlaceQuarter, ParentID: "oguaa"},
	{ID: "tantri", Slug: "tantri", Name: "Tantri", Kind: domain.PlaceQuarter, ParentID: "oguaa"},
	{ID: "ntsin-quarter", Slug: "ntsin-quarter", Name: "Ntsin", Kind: domain.PlaceQuarter, ParentID: "oguaa"},
	{ID: "amanful-quarter", Slug: "amanful-quarter", Name: "Amanful", Kind: domain.PlaceQuarter, ParentID: "oguaa", Blurb: "'New Town.'"},
	{ID: "pedu", Slug: "pedu", Name: "Pedu", Kind: domain.PlaceQuarter, ParentID: "oguaa"},
	{ID: "abura", Slug: "abura", Name: "Abura", Kind: domain.PlaceQuarter, ParentID: "oguaa"},
	{ID: "adisadel-estate", Slug: "adisadel-estate", Name: "Adisadel Estate", Kind: domain.PlaceQuarter, ParentID: "oguaa"},
	{ID: "ola", Slug: "ola", Name: "OLA Estate", Kind: domain.PlaceQuarter, ParentID: "oguaa"},
	{ID: "nkanfoa", Slug: "nkanfoa", Name: "Nkanfoa", Kind: domain.PlaceQuarter, ParentID: "oguaa"},
	{ID: "amamoma", Slug: "amamoma", Name: "Amamoma", Kind: domain.PlaceQuarter, ParentID: "oguaa", Blurb: "The UCC student quarter."},
	{ID: "ekon", Slug: "ekon", Name: "Ekon", Kind: domain.PlaceQuarter, ParentID: "oguaa"},
	{ID: "iture", Slug: "iture", Name: "Iture", Kind: domain.PlaceQuarter, ParentID: "oguaa"},

	// The 7 Asafo companies — "Etsikuw Esuon" (rep your Asafo). Cultural affiliation.
	{ID: "asafo-bentsir", Slug: "bentsir", Name: "Bentsir (No. 1)", Kind: domain.PlaceAsafo, ParentID: "oguaa", Blurb: "The No. 1 company.", Colors: []string{colorCrimson}},
	{ID: "asafo-anaafo", Slug: "anaafo", Name: "Anaafo (No. 2)", Kind: domain.PlaceAsafo, ParentID: "oguaa", Blurb: "'Low Town' — the No. 2 company.", Colors: []string{colorRoyalBlue, colorPaper}},
	{ID: "asafo-ntsin", Slug: "ntsin", Name: "Ntsin (No. 3)", Kind: domain.PlaceAsafo, ParentID: "oguaa", Blurb: "The No. 3 company.", Colors: []string{colorGreen}},
	{ID: "asafo-nkum", Slug: "nkum", Name: "Nkum (No. 4)", Kind: domain.PlaceAsafo, ParentID: "oguaa", Blurb: "The oldest, come with the paramount stool from Efutu.", Colors: []string{colorGold}},
	{ID: "asafo-amanful", Slug: "amanful-asafo", Name: "Amanful (No. 5)", Kind: domain.PlaceAsafo, ParentID: "oguaa", Blurb: "'New Town' — the No. 5 company.", Colors: []string{colorMaroon, colorInk}},
	{ID: "asafo-brofomba", Slug: "brofomba", Name: "Brofomba (No. 6)", Kind: domain.PlaceAsafo, ParentID: "oguaa", Blurb: "Abrofomba — the No. 6 company.", Colors: []string{colorPaper}},
	{ID: "asafo-akrampa", Slug: "akrampa", Name: "Akrampa (No. 7)", Kind: domain.PlaceAsafo, ParentID: "oguaa", Blurb: "Ankrampa — the No. 7 company.", Colors: []string{colorPaper, colorInk}},
}

// ── organizations ────────────────────────────────────────────────────────────

var seedOrgs = []domain.Organization{
	{ID: "mfantsipim", Slug: "mfantsipim", Kind: "school", Name: "Mfantsipim School", Motto: "Dwen Hwe Kan — Think and Look Ahead", Founded: 1876, Classification: "Senior High (Methodist, boys)", Summary: "Founded 3 April 1876 as the Wesleyan High School — the oldest secondary school in Ghana, which marked its 150th year in 2026.", History: "From its Cape Coast hill, Mfantsipim has shaped the nation's leaders, most famously the late UN Secretary-General Kofi Annan. Its rivalry with Adisadel is the oldest in Ghana.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedSchoolsBatch, HouseColors: []string{colorCrimson, colorInk}, OSAName: "MOBA", MemberCount: 318, RelatedOrgIDs: []string{"moba", orgOguaaTraditional}, CrestURL: seedImg("crests/mfantsipim.png"), Offices: []domain.Office{{ID: "o-mfan-head", Role: "Headmaster", HolderName: "Mr. K. A. Sagoe", Verified: true}, {ID: "o-mfan-moba", Role: "MOBA President", HolderName: "Dr. E. Brew", Verified: true}},
		Gallery: []domain.MediaAsset{
			{ID: "med-mfan-1", Kind: "photo", URL: seedImg("mfantsipim-campus.jpg"), Alt: "Kwabotwe Hill campus", Caption: "Kwabotwe Hill", Moderation: "approved"},
			{ID: "med-mfan-2", Kind: "photo", URL: seedImg(imgMfantsipimEntrance), Alt: "Founders' Day durbar", Caption: "Founders' Day", Moderation: "approved"},
			{ID: "med-mfan-3", Kind: "photo", URL: seedImg(imgMfantsipimClassroom), Alt: "The school chapel", Caption: "The Chapel", Moderation: "approved"},
			{ID: "med-mfan-4", Kind: "photo", URL: seedImg(imgClassroomGhana), Alt: "Speech & Prize-Giving Day", Caption: "Speech Day", Moderation: "approved"},
		},
		Sections: []domain.ProfileSection{
			{ID: "sec-mfan-story", Type: "richtext", Title: "Born on Kwabotwe Hill", Tone: "green", Body: "Mfantsipim — affectionately **Kwabotwe** — was founded on **3 April 1876** as the Wesleyan High School, the first secondary school in the Gold Coast. It has shaped the nation's leaders ever since, most famously the late UN Secretary-General Kofi Annan.\n\n| House | Colour |\n|---|---|\n| Pickup | Red |\n| Lockhart | Blue |\n| Aggrey | Green |\n| Balmer-Acquah | Gold |"},
			{ID: "sec-mfan-facilities", Type: "gallery", Title: "Facilities", Tone: "teal", Media: []domain.MediaAsset{
				{ID: "med-mfan-lib", Kind: "photo", URL: seedImg(imgMfantsipimClassroom), Alt: "The school library", Caption: "Aggrey Memorial Library", Moderation: "approved"},
				{ID: "med-mfan-lab", Kind: "photo", URL: seedImg(imgClassroomGhana), Alt: "A science laboratory", Caption: "Science laboratories", Moderation: "approved"},
				{ID: "med-mfan-class", Kind: "photo", URL: seedImg(imgMfantsipimClassroom), Alt: "A classroom block", Caption: "Classrooms", Moderation: "approved"},
				{ID: "med-mfan-hall", Kind: "photo", URL: seedImg(imgMfantsipimEntrance), Alt: "The assembly hall", Caption: "Assembly hall", Moderation: "approved"},
			}},
			{ID: "sec-mfan-stats", Type: "stats", Title: "By the numbers", Tone: "gold", Items: []domain.SectionItem{
				{ID: "itm-mfan-est", Label: "Established", Value: "1876"},
				{ID: "itm-mfan-students", Label: "Students", Value: "1,200+"},
				{ID: "itm-mfan-houses", Label: "Houses", Value: "8"},
				{ID: "itm-mfan-nsmq", Label: "NSMQ titles", Value: "3"},
			}},
			{ID: "sec-mfan-timeline", Type: "timeline", Title: "Milestones", Tone: "green", Items: []domain.SectionItem{
				{ID: "itm-mfan-t1", Label: "1876", Value: "Founded", Detail: "Established as the Wesleyan High School — the first secondary school in Ghana."},
				{ID: "itm-mfan-t2", Label: "1905", Value: "Renamed Mfantsipim", Detail: "United with the Collegiate School and took the name Mfantsipim."},
				{ID: "itm-mfan-t3", Label: "2026", Value: "150th anniversary", Detail: "A century and a half on Kwabotwe Hill."},
			}},
			{ID: "sec-mfan-alumni", Type: "team", Title: "Notable alumni", Tone: "maroon", Items: []domain.SectionItem{
				{ID: "itm-mfan-a1", Value: "Kofi Annan", Label: "Class of 1957", Detail: "7th Secretary-General of the United Nations; Nobel Peace laureate."},
				{ID: "itm-mfan-a2", Value: "S. R. B. Attoh Ahuma", Label: "Educator & nationalist", Detail: "Writer and pan-Africanist; an early shaper of the school."},
			}},
			{ID: "sec-mfan-faq", Type: "faq", Title: "Admissions", Tone: "teal", Items: []domain.SectionItem{
				{ID: "itm-mfan-f1", Label: "How are students admitted?", Value: "Through CSSPS placement after the BECE. Mfantsipim is a Category A school."},
				{ID: "itm-mfan-f2", Label: "Is it boarding or day?", Value: "Boarding, organised into eight houses."},
			}},
			{ID: "sec-mfan-docs", Type: "docs", Title: "Downloads", Tone: "gold", Items: []domain.SectionItem{
				{ID: "itm-mfan-d1", Label: "School prospectus", Detail: "PDF", URL: mfantsipimURL},
				{ID: "itm-mfan-d2", Label: "MOBA regulations", Detail: "PDF", URL: "https://mfantsipim.com/year-groups/"},
			}},
			{ID: "sec-mfan-houses", Type: "groups", Title: "Houses", Tone: "clay", Groups: []domain.SubEntity{
				{ID: "grp-mfan-pickup", Name: "Pickup", Subtitle: subtitleBoardingHouse, Colors: []string{colorCrimson}, Summary: "One of the school's senior houses.", Attrs: []domain.SectionItem{{Label: "Housemaster", Value: "Mr. K. Mensah"}, {Label: "Colour", Value: "Red"}}},
				{ID: "grp-mfan-lockhart", Name: "Lockhart", Subtitle: subtitleBoardingHouse, Colors: []string{"#1F4E79"}, Attrs: []domain.SectionItem{{Label: "Colour", Value: "Blue"}}},
				{ID: "grp-mfan-aggrey", Name: "Aggrey", Subtitle: subtitleBoardingHouse, Colors: []string{colorGreen}, Summary: "Named for Dr. J. E. K. Aggrey.", Attrs: []domain.SectionItem{{Label: "Colour", Value: "Green"}}},
				{ID: "grp-mfan-balmer", Name: "Balmer-Acquah", Subtitle: subtitleBoardingHouse, Colors: []string{colorBrass}, Attrs: []domain.SectionItem{{Label: "Colour", Value: "Gold"}}},
			}},
			{ID: "sec-mfan-divider", Type: "divider", Tone: "gold"},
			{ID: "sec-mfan-quote", Type: "quote", Title: "Kofi Annan, Class of 1957", Tone: "maroon", Body: "To live is to choose. But to choose well, you must know who you are and what you stand for."},
			{ID: "sec-mfan-cta", Type: "cta", Title: "Join the Kwabotwe family", Tone: "green", Body: "Prospective students and Old Boys — find your place on the hill.", Items: []domain.SectionItem{
				{ID: "itm-mfan-c1", Label: "Apply to Mfantsipim", URL: mfantsipimURL},
				{ID: "itm-mfan-c2", Label: "Join MOBA", URL: "https://www.moba.org/"},
			}},
			{ID: "sec-mfan-hero", Type: "hero", Tone: "green", Title: "150 years on Kwabotwe Hill", Body: "Ghana's oldest secondary school — Dwen Hwe Kan, Think and Look Ahead.", Items: []domain.SectionItem{{ID: "itm-mfan-h1", Label: "Apply", URL: mfantsipimURL}, {ID: "itm-mfan-h2", Label: "Our story", URL: "https://mfantsipim.com/history/"}}},
			{ID: "sec-mfan-testim", Type: "testimonials", Title: "In their words", Tone: "clay", Items: []domain.SectionItem{
				{ID: "itm-mfan-tm1", Value: "Mfantsipim taught me that to whom much is given, much is expected.", Label: "Kofi Annan", Detail: "Class of 1957"},
				{ID: "itm-mfan-tm2", Value: "The brotherhood of Botwe is for life.", Label: "Kojo Arthur", Detail: "MOBA '88"},
			}},
			{ID: "sec-mfan-contact", Type: "contact", Title: "Visit & contact", Tone: "teal", Body: "Kwabotwe Hill, Cape Coast, Central Region, Ghana.", Items: []domain.SectionItem{
				{ID: "itm-mfan-ct1", Label: "Office hours", Value: "Mon–Fri, 8:00–17:00"},
				{ID: "itm-mfan-ct2", Label: "Phone", Value: "+233 33 213 2153", URL: "tel:+233332132153"},
				{ID: "itm-mfan-ct3", Label: "Website", Value: "mfantsipim.com", URL: mfantsipimURL},
			}},
			{ID: "sec-mfan-fees", Type: "menu", Title: "School fees (per term)", Tone: "gold", Items: []domain.SectionItem{
				{ID: "itm-mfan-fee1", Label: "Boarding", Value: "₵1,800", Detail: "Tuition, lodging and three meals daily."},
				{ID: "itm-mfan-fee2", Label: "Day", Value: "₵1,100", Detail: "Tuition and lunch."},
				{ID: "itm-mfan-fee3", Label: "Admission (one-off)", Value: "₵450"},
			}},
			{ID: "sec-mfan-bell", Type: "schedule", Title: "A day on the hill", Tone: "green", Items: []domain.SectionItem{
				{ID: "itm-mfan-b1", Label: "5:30", Value: "Rising bell"},
				{ID: "itm-mfan-b2", Label: "7:00", Value: "Morning assembly", Detail: "Hymn, notices and the school prayer."},
				{ID: "itm-mfan-b3", Label: "8:00–14:30", Value: "Classes"},
				{ID: "itm-mfan-b4", Label: "19:30–21:30", Value: "Evening prep"},
			}},
			{ID: "sec-mfan-find", Type: "map", Title: "Find us", Tone: "teal", Body: "Mfantsipim School, Kwabotwe Hill, Cape Coast, Central Region, Ghana."},
		}},
	{ID: "adisadel", Slug: "adisadel", Kind: "school", Name: adisadelPage.name, Motto: adisadelPage.motto, Founded: adisadelPage.founded, Classification: adisadelPage.classification, Summary: "Founded 4 January 1910 as the SPG Grammar School; named St. Nicholas' in 1924 and Adisadel on its hilltop site around 1936 — hence the 'Santaclausians.'", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedSchoolsBatch, HouseColors: []string{colorInk, colorPaper}, OSAName: "Santaclausians", MemberCount: 241, CrestURL: seedImg("crests/adisadel.png"), Offices: adisadelOffices, Gallery: schoolGallery(adisadelPage), Sections: schoolOfficialSections(adisadelPage, adisadelOffices)},
	{ID: schoolWesleyGirls, Slug: schoolWesleyGirls, Kind: "school", Name: wesleyGirlsPage.name, Motto: wesleyGirlsPage.motto, Founded: wesleyGirlsPage.founded, Classification: wesleyGirlsPage.classification, Summary: "Traced to 1836 under Harriet Wrigley and reorganised into today's school around 1954 — a by-word for poise and excellence.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedSchoolsBatch, HouseColors: []string{colorGreen, colorGold}, OSAName: "Wey Gey Hey OGA", MemberCount: 277, CrestURL: seedImg("crests/wesley-girls.png"), Offices: wesleyGirlsOffices, Gallery: schoolGallery(wesleyGirlsPage), Sections: schoolOfficialSections(wesleyGirlsPage, wesleyGirlsOffices)},
	{ID: "st-augustines", Slug: "st-augustines", Kind: "school", Name: stAugustinesPage.name, Motto: stAugustinesPage.motto, Founded: stAugustinesPage.founded, Classification: stAugustinesPage.classification, Summary: "Founded 1930; the Augustinians' green and white come from the Irish flag of its founding fathers.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedSchoolsBatch, HouseColors: []string{colorLeafGreen, colorPaper}, OSAName: "APSU", MemberCount: 156, CrestURL: seedImg("crests/st-augustines.png"), Offices: stAugustinesOffices, Gallery: schoolGallery(stAugustinesPage), Sections: schoolOfficialSections(stAugustinesPage, stAugustinesOffices)},
	{ID: schoolHolyChild, Slug: schoolHolyChild, Kind: "school", Name: holyChildPage.name, Motto: holyChildPage.motto, Founded: holyChildPage.founded, Classification: holyChildPage.classification, Summary: "Founded 1946 by the Society of the Holy Child Jesus; known with affection as 'Angel's Hill.'", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedSchoolsBatch, HouseColors: []string{colorBrown, colorGold}, OSAName: "HOPSA", MemberCount: 132, CrestURL: seedImg("crests/holy-child.png"), Offices: holyChildOffices, Gallery: schoolGallery(holyChildPage), Sections: schoolOfficialSections(holyChildPage, holyChildOffices)},
	{ID: "ucc", Slug: "ucc", Kind: "school", Name: uccPage.name, Motto: uccPage.motto, Founded: uccPage.founded, Classification: uccPage.classification, Summary: "Opened as a university college in October 1962 and attained full, independent university status on 1 October 1971. Its Department of Music and Dance (est. 1975) keeps the Oguaa pipeline flowing.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedSchoolsBatch, HouseColors: []string{colorCobalt, colorBrass}, OSAName: "UCC Alumni", MemberCount: 402, CrestURL: seedImg("crests/ucc.png"), Offices: uccOffices, Gallery: schoolGallery(uccPage), Sections: schoolOfficialSections(uccPage, uccOffices)},
	{ID: schoolBakaanoBasic, Slug: schoolBakaanoBasic, Kind: "school", Name: bakaanoPage.name, Motto: bakaanoPage.motto, Founded: bakaanoPage.founded, Classification: bakaanoPage.classification, Summary: "A public basic school in Bakaano, Cape Coast, serving the lagoon-side community for over six decades. Recognised by the Ghana Education Service under the Cape Coast Metropolitan Education Directorate. Languages of instruction: English and Fante.", Jurisdiction: "Bakaano, Cape Coast", Verified: true, VerifiedOn: verifiedSchoolsBatch, HouseColors: []string{colorDeepGreen, colorBrass}, MemberCount: 412, RelatedOrgIDs: []string{orgOguaaTraditional}, CrestURL: seedImg("crests/bakaano-basic.png"), Offices: bakaanoOffices, Gallery: schoolGallery(bakaanoPage), Sections: schoolOfficialSections(bakaanoPage, bakaanoOffices)},
	{ID: orgOguaaTraditional, Slug: orgOguaaTraditional, Kind: "traditional-authority", Name: "Oguaa Traditional Area", OfficialTitle: "The Oguaa Traditional Council", Classification: "Traditional authority", Summary: "The traditional state of Oguaa, headed by the Omanhene Osabarimba Kwesi Atta II, who gives thanks each year to the 77 gods of Oguaa at Fetu Afahye.", Jurisdiction: "Oguaa (Cape Coast)", Verified: true, VerifiedOn: "2026-05-20", Offices: []domain.Office{{ID: "o-ota-omanhene", Role: "Omanhene", HolderName: "Osabarimba Kwesi Atta II", Verified: true}, {ID: "o-ota-okyeame", Role: "Okyeame (linguist)", HolderName: officePlaceholder, Verified: true}}},
	{ID: "moba", Slug: "moba", Kind: "association", Name: "Mfantsipim Old Boys Association", OfficialTitle: "MOBA", Classification: "Old Students Association", Summary: "The alumni network of Mfantsipim — scholarships, infrastructure, and a lifelong professional fellowship. The natural source of mentors and funders for Oguaa's youth.", Jurisdiction: "Worldwide", Verified: true, VerifiedOn: "2026-05-18", OSAName: "MOBA", RelatedOrgIDs: []string{"mfantsipim"}, Offices: []domain.Office{{ID: "o-moba-pres", Role: "President", HolderName: "Dr. E. Brew", Verified: true}}},

	// ── institution kinds opened beyond schools (spec §8.13) ──
	// Faith body.
	{ID: "wesley-cathedral", Slug: "wesley-methodist-cathedral", Kind: "faith", Name: "Wesley Methodist Cathedral", OfficialTitle: "Wesley Methodist Cathedral, Cape Coast", Classification: "Methodist church", Summary: "The mother church of Methodism on the Gold Coast, on Chapel Square in Cape Coast — heir to the faith that built Mfantsipim and Wesley Girls'.", History: "Cape Coast was the cradle of the Methodist Church in Ghana; the present cathedral has anchored the town's Methodist life for generations.", Jurisdiction: "Cape Coast Diocese", Verified: true, VerifiedOn: "2026-05-22", HouseColors: []string{colorMaroon, colorGold}, Offices: []domain.Office{{ID: "o-wes-min", Role: "Presiding Minister", HolderName: "Very Rev. (office)", Verified: true}, {ID: "o-wes-steward", Role: "Society Steward", HolderName: officePlaceholder, Verified: true}}},
	// Asafo company (traditional military/cultural institution).
	{ID: "asafo-bentsir-co", Slug: "bentsir-asafo-company", Kind: "asafo", Name: "Bentsir No. 1 Asafo Company", Classification: "Asafo company", Summary: "The No. 1 of Oguaa's seven Asafo companies — guardians of custom who lead the durbar at Fetu Afahye each September. Company colour: red.", History: "The Asafo (\"war people\") are the traditional companies of the Oguaa state; Bentsir carries the No. 1 standard. Leadership runs through the Supi (superior captain) and Safohen (captains).", Jurisdiction: "Oguaa Traditional Area", Verified: true, VerifiedOn: "2026-05-25", HouseColors: []string{colorCrimson}, RelatedOrgIDs: []string{orgOguaaTraditional}, Offices: []domain.Office{{ID: "o-bentsir-supi", Role: "Supi (superior captain)", HolderName: officePlaceholder, Verified: true}, {ID: "o-bentsir-safohen", Role: "Safohen (captain)", HolderName: officePlaceholder, Verified: true}}},
	// Market / trade association.
	{ID: "kotokuraba-traders", Slug: "kotokuraba-market-traders", Kind: "association", Name: "Kotokuraba Market Traders' Union", Classification: "Market traders' association", Summary: "The traders of Kotokuraba — Cape Coast's central market — organised under their Konkohemaa (market queen) to speak for the women and men who keep Oguaa fed.", Jurisdiction: "Kotokuraba, Cape Coast", Verified: false, Offices: []domain.Office{{ID: "o-kotok-queen", Role: "Konkohemaa (Market Queen)", HolderName: officePlaceholder, Verified: false}}},
	// Civic / local government.
	{ID: "ccma", Slug: "cape-coast-metropolitan-assembly", Kind: "civic", Name: "Cape Coast Metropolitan Assembly", OfficialTitle: "CCMA", Classification: "Local government", Summary: "The metropolitan assembly governing Cape Coast — the seat of the Central Region's capital, responsible for sanitation, markets, roads and local development.", Jurisdiction: "Cape Coast Metropolis", Verified: true, VerifiedOn: "2026-05-28", HouseColors: []string{colorCobalt, colorBrass}, Offices: []domain.Office{{ID: "o-ccma-mce", Role: "Metropolitan Chief Executive", HolderName: officePlaceholder, Verified: true}, {ID: "o-ccma-pm", Role: "Presiding Member", HolderName: officePlaceholder, Verified: true}}},
}

// seedExtraOrgs is appended to seedOrgs: the fuller fact-checked roster of Cape
// Coast schools (research, 2026-06-07) and the town's heritage sites, modelled as
// kind:"heritage" organizations so they reuse the institution rich-page engine
// (summary + history + Gallery + Sections) and are configurable from the admin.
var seedExtraOrgs = []domain.Organization{
	// ── more Cape Coast schools (verified roster) ──────────────────────────────
	{ID: "ghana-national-college", Slug: "ghana-national-college", Kind: "school", Name: ghanaNationalPage.name, Motto: ghanaNationalPage.motto, Founded: ghanaNationalPage.founded, Classification: ghanaNationalPage.classification, Summary: "Founded in 1948 by Dr. Kwame Nkrumah to school students expelled from the mission colleges for backing the independence struggle — fondly remembered as Osagyefo's own school.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorCrimson, colorCobalt}, OSAName: "Nananom (Past Students)", CrestURL: seedImg("crests/ghana-national-college.png"), Offices: ghanaNationalOffices, Gallery: schoolGallery(ghanaNationalPage), Sections: schoolOfficialSections(ghanaNationalPage, ghanaNationalOffices)},
	{ID: "aggrey-memorial", Slug: "aggrey-memorial-ame-zion-shs", Kind: "school", Name: aggreyPage.name, Motto: aggreyPage.motto, Founded: aggreyPage.founded, Classification: aggreyPage.classification, Summary: "Opened in 1940 to honour the scholar Dr. James Kwegyir Aggrey and later run by the A.M.E. Zion Church — among Cape Coast's earliest co-educational schools.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorMaroon, colorBrass}, OSAName: "Aggrey Memorial OSA", CrestURL: seedImg("crests/aggrey-memorial.png"), Offices: aggreyOffices, Gallery: schoolGallery(aggreyPage), Sections: schoolOfficialSections(aggreyPage, aggreyOffices)},
	{ID: "oguaa-shts", Slug: "oguaa-senior-high-technical", Kind: "school", Name: ostechPage.name, Founded: ostechPage.founded, Classification: ostechPage.classification, Summary: "Begun in 1991 and relocated to Ekon in 1997, OSTECH blends technical and academic streams for the town's young people.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorTeal, colorBrass}, OSAName: "OSTECH OSA", CrestURL: seedImg("crests/oguaa-shts.png"), Offices: ostechOffices, Gallery: schoolGallery(ostechPage), Sections: schoolOfficialSections(ostechPage, ostechOffices)},
	{ID: "academy-christ-king", Slug: "academy-of-christ-the-king", Kind: "school", Name: christKingPage.name, Founded: christKingPage.founded, Classification: christKingPage.classification, Summary: "Established in 1976 by the Mothers' Union of the Anglican Church — one of the metropolis's well-regarded co-educational senior high schools.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorCobalt, colorPaper}, OSAName: "ACKOSA", CrestURL: seedImg("crests/academy-christ-king.png"), Offices: christKingOffices, Gallery: schoolGallery(christKingPage), Sections: schoolOfficialSections(christKingPage, christKingOffices)},
	{ID: "cctu", Slug: "cape-coast-technical-university", Kind: "school", Name: cctuPage.name, Founded: cctuPage.founded, Classification: cctuPage.classification, Summary: "Founded in 1984 as Cape Coast Polytechnic and elevated to a technical university in 2016, training engineers, technicians and applied-science professionals for the Central Region.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorCobalt, colorBronze}, OSAName: "CCTU Alumni", CrestURL: seedImg("crests/cctu.png"), Offices: cctuOffices, Gallery: schoolGallery(cctuPage), Sections: schoolOfficialSections(cctuPage, cctuOffices)},
	{ID: "ola-college", Slug: "ola-college-of-education", Kind: "school", Name: olaPage.name, Founded: olaPage.founded, Classification: olaPage.classification, Summary: "Established in 1924 by the Missionary Sisters of Our Lady of Apostles — the first women's teacher-training college in Ghana and sub-Saharan Africa, which marked its centenary in 2024.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorRoyalBlue, colorPaper}, CrestURL: seedImg("crests/ola-college.png"), Offices: olaOffices, Gallery: schoolGallery(olaPage), Sections: schoolOfficialSections(olaPage, olaOffices)},
	{ID: "cc-deaf-blind", Slug: "cape-coast-school-for-the-deaf-and-blind", Kind: "school", Name: deafBlindPage.name, Motto: deafBlindPage.motto, Founded: deafBlindPage.founded, Classification: deafBlindPage.classification, Summary: "Opened in 1970 with fifteen pupils on the Cape Coast–Takoradi highway; a government special school for deaf and, later, visually-impaired children of the region.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorLeafGreen, colorBrass}, CrestURL: seedImg("crests/cc-deaf-blind.png"), Offices: deafBlindOffices, Gallery: schoolGallery(deafBlindPage), Sections: schoolOfficialSections(deafBlindPage, deafBlindOffices)},
	{ID: "philip-quaque-boys", Slug: "philip-quaque-boys-school", Kind: "school", Name: philipQuaquePage.name, Motto: philipQuaquePage.motto, Founded: philipQuaquePage.founded, Classification: philipQuaquePage.classification, Summary: "Founded beside Cape Coast Castle in 1766 by the Rev. Philip Quaque, the first African Anglican priest — widely honoured as the oldest formal European-style school in Ghana.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorMaroon, colorBrass}, CrestURL: seedImg("crests/philip-quaque-boys.png"), Offices: philipQuaqueOffices, Gallery: schoolGallery(philipQuaquePage), Sections: schoolOfficialSections(philipQuaquePage, philipQuaqueOffices)},
	{ID: "st-monicas-basic", Slug: "st-monicas-basic-school-cape-coast", Kind: "school", Name: stMonicasPage.name, Motto: stMonicasPage.motto, Founded: stMonicasPage.founded, Classification: stMonicasPage.classification, Summary: "Established on Aboom Road in 1926 by the Anglican Sisters of the Order of the Holy Paraclete as their first Gold Coast school.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorBrown, colorGold}, OSAName: "Union of Old St Monicans", CrestURL: seedImg("crests/st-monicas-basic.png"), Offices: stMonicasOffices, Gallery: schoolGallery(stMonicasPage), Sections: schoolOfficialSections(stMonicasPage, stMonicasOffices)},

	// ── heritage & visitor sites (configurable from the admin dashboard) ───────
	{ID: "h-castle", Slug: "cape-coast-castle", Kind: "heritage", Name: "Cape Coast Castle", OfficialTitle: "Cape Coast Castle & Museum", Classification: "UNESCO World Heritage · castle & museum", Summary: "The whitewashed fortress on the rock above the Atlantic — once the headquarters of the British slave trade, now a UNESCO World Heritage site and sacred ground for the diaspora's return. The reason the world comes to Oguaa.", History: "Begun in 1653 as a Swedish timber lodge, Carolusborg, and rebuilt in stone through the Danish years; the British seized it in 1664 and made it the headquarters of their West African trade. Above the chapel lay light; below it lay the dungeons and the Door of No Return. Inscribed by UNESCO in 1979; President Obama stood here in 2009, and it anchored Ghana's 2019 Year of Return. We hold this history soberly.", Jurisdiction: "Victoria Road, Cape Coast", Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorBronze, colorForest},
		Gallery: []domain.MediaAsset{
			{ID: "med-castle-1", Kind: "photo", URL: seedImg("castle-exterior.jpg"), Alt: "Cape Coast Castle from the shore", Caption: "The Castle from the shore", Moderation: "approved"},
			{ID: "med-castle-2", Kind: "photo", URL: seedImg("castle-courtyard.jpg"), Alt: "The castle courtyard", Caption: "The courtyard", Moderation: "approved"},
			{ID: "med-castle-3", Kind: "photo", URL: seedImg("castle-museum.jpg"), Alt: "Inside the castle museum", Caption: "The museum", Moderation: "approved"},
		},
		Sections: []domain.ProfileSection{
			{ID: "sec-castle-facts", Type: "stats", Title: "Visiting facts", Tone: "gold", Items: []domain.SectionItem{
				{ID: "itm-castle-built", Label: "Built", Value: "1653"},
				{ID: "itm-castle-unesco", Label: "UNESCO", Value: "1979"},
				{ID: "itm-castle-open", Label: "Open", Value: "9:00–16:30"},
				{ID: "itm-castle-tour", Label: "Guided tour", Value: "~45 min"},
			}},
			{ID: "sec-castle-time", Type: "timeline", Title: "Through the centuries", Tone: "maroon", Items: []domain.SectionItem{
				{ID: "itm-castle-1653", Label: "1653", Value: "Carolusborg rises", Detail: "The Swedes raise a timber lodge; it is rebuilt in stone in the Danish years."},
				{ID: "itm-castle-1664", Label: "1664", Value: "The British take the castle", Detail: "It becomes the headquarters of their West African trade."},
				{ID: "itm-castle-trade", Label: "17th–19th c.", Value: "The Door of No Return", Detail: "One of the largest holds of the transatlantic slave trade. Held soberly."},
				{ID: "itm-castle-1979", Label: "1979", Value: "A World Heritage Site", Detail: "UNESCO inscribes the castle on the World Heritage List."},
				{ID: "itm-castle-2009", Label: "2009", Value: "Obama at the door", Detail: "President Obama visits the Door of No Return with his family."},
				{ID: "itm-castle-2019", Label: "2019", Value: "Year of Return", Detail: "The diaspora walks back through the door, four hundred years on."},
			}},
			{ID: "sec-castle-faq", Type: "faq", Title: "Plan your visit", Items: []domain.SectionItem{
				{ID: "itm-castle-cost", Label: "What does it cost?", Value: "Reviewed in 2023: Ghanaian adults GHS 5, foreign adults GHS 40, foreign students GHS 30. Confirm on arrival; cash or mobile money."},
				{ID: "itm-castle-long", Label: "How long is the tour?", Value: "About 45 minutes through the dungeons, the condemned cell and the Door of No Return. Allow two to three hours in all."},
				{ID: "itm-castle-when", Label: "When is it open?", Value: "Daily, roughly 9:00 a.m. to 4:30 p.m. The guides do not soften the history; come ready."},
			}},
		}},
	{ID: "h-kakum", Slug: "kakum-national-park", Kind: "heritage", Name: "Kakum National Park", Classification: "Rainforest national park · canopy walkway", Summary: "A tropical rainforest a short drive north of Cape Coast, crossed by a famous canopy walkway — seven rope bridges strung up to forty metres above the forest floor.", History: "Protected as a national park and opened to visitors in 1995, with the celebrated canopy walkway built with Conservation International and the UN Development Programme. The forest shelters forest elephants, antelopes, hundreds of bird and butterfly species, and giant hardwoods centuries old.", Jurisdiction: "Abrafo, ~33 km north of Cape Coast", Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorDeepGreen, colorTeal},
		Gallery: []domain.MediaAsset{
			{ID: "med-kakum-1", Kind: "photo", URL: seedImg("kakum-canopy.jpg"), Alt: "The Kakum canopy walkway", Caption: "The canopy walkway", Moderation: "approved"},
			{ID: "med-kakum-2", Kind: "photo", URL: seedImg("kakum-canopy-2.jpg"), Alt: "High above the rainforest floor", Caption: "Forty metres up", Moderation: "approved"},
		},
		Sections: []domain.ProfileSection{
			{ID: "sec-kakum-over", Type: "richtext", Title: "The canopy walk", Tone: "green", Body: "The walkway is **seven bridges**, roughly **350 metres** of swaying rope strung up to **40 metres** above the rainforest floor. Go early — the first walks set off around 8:00 a.m., before the heat and the crowds, when the forest is loudest. Wear closed shoes and bring water."},
			{ID: "sec-kakum-facts", Type: "stats", Title: titleAtAGlance, Tone: "teal", Items: []domain.SectionItem{
				{ID: "itm-kakum-open", Label: "Opened", Value: "1995"},
				{ID: "itm-kakum-canopy", Label: "Canopy", Value: "40 m up"},
				{ID: "itm-kakum-bridges", Label: "Bridges", Value: "7"},
				{ID: "itm-kakum-dist", Label: labelFromCapeCoast, Value: "~33 km"},
			}},
			{ID: "sec-kakum-faq", Type: "faq", Title: "Plan your visit", Items: []domain.SectionItem{
				{ID: "itm-kakum-early", Label: "When should I go?", Value: "As early as you can. Gates open from around 6:00 a.m.; the first canopy walks are about 8:00 a.m., and the park closes mid-afternoon."},
				{ID: "itm-kakum-fees", Label: "What does it cost?", Value: "Roughly GHS 35 entry plus around GHS 100 for the canopy walk for foreign visitors; much less for Ghanaians. An estimate — confirm at the gate."},
			}},
		}},
	{ID: "h-elmina", Slug: "elmina-castle", Kind: "heritage", Name: "Elmina Castle (St. George's)", Classification: "UNESCO World Heritage · built 1482", Summary: "St. George's Castle at Elmina, a short drive west — built by the Portuguese in 1482, and by most accounts the oldest surviving European-built structure in sub-Saharan Africa.", History: "Raised by the Portuguese in 1482 as São Jorge da Mina, it passed to the Dutch in 1637 and the British in 1872, and like Cape Coast Castle it became a holding-place in the transatlantic slave trade. Inscribed by UNESCO in 1979 among Ghana's Forts and Castles. A second castle in one day is emotionally heavy; many visitors split the two across a trip.", Jurisdiction: "Elmina, ~13 km west of Cape Coast", Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorBronze, colorTeal},
		Gallery: []domain.MediaAsset{
			{ID: "med-elmina-1", Kind: "photo", URL: seedImg("elmina-castle.jpg"), Alt: "St. George's Castle, Elmina", Caption: "St. George's Castle", Moderation: "approved"},
			{ID: "med-elmina-2", Kind: "photo", URL: seedImg("elmina-pano.jpg"), Alt: "Elmina town and the Benya lagoon", Caption: "Elmina from above", Moderation: "approved"},
		},
		Sections: []domain.ProfileSection{
			{ID: "sec-elmina-facts", Type: "stats", Title: titleAtAGlance, Tone: "gold", Items: []domain.SectionItem{
				{ID: "itm-elmina-built", Label: "Built", Value: "1482"},
				{ID: "itm-elmina-unesco", Label: "UNESCO", Value: "1979"},
				{ID: "itm-elmina-open", Label: "Open", Value: "9:00–16:30"},
				{ID: "itm-elmina-dist", Label: labelFromCapeCoast, Value: "~13 km"},
			}},
			{ID: "sec-elmina-faq", Type: "faq", Title: titleGoodToKnow, Items: []domain.SectionItem{
				{ID: "itm-elmina-pair", Label: "Both castles in a day?", Value: "You can, but it is heavy going. Many travellers visit Elmina and Cape Coast on separate days, and pair Elmina with the Bakatue festival in July."},
			}},
		}},
	{ID: "h-fort-william", Slug: "fort-william-lighthouse", Kind: "heritage", Name: "Fort William Lighthouse", Classification: "19th-century fort & lighthouse", Summary: "The hilltop fort-turned-lighthouse above Cape Coast, its beam sweeping the coast — one of a chain of forts that crowd this short stretch of shore.", History: "Built by the British in the early nineteenth century on Dawson's Hill and later fitted as a lighthouse, Fort William still guides ships along the coast. Climb the hill for the best view of all of Oguaa — the roofs, the lagoon, and the canoes coming in.", Jurisdiction: "Dawson's Hill, Cape Coast", Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorDeepGreen, colorBrass},
		Gallery: []domain.MediaAsset{
			{ID: "med-fort-1", Kind: "photo", URL: seedImg("fort-william.jpg"), Alt: "Fort William on Dawson's Hill", Caption: "The fort on the hill", Moderation: "approved"},
			{ID: "med-fort-2", Kind: "photo", URL: seedImg("fort-william-lighthouse.jpg"), Alt: "The Fort William lighthouse beam", Caption: "The lighthouse", Moderation: "approved"},
		},
		Sections: []domain.ProfileSection{
			{ID: "sec-fort-faq", Type: "faq", Title: titleGoodToKnow, Items: []domain.SectionItem{
				{ID: "itm-fort-view", Label: "Why come up here?", Value: "For the view. From the lighthouse hill you can see the whole town laid out — the Castle, the Fosu Lagoon, and the fishing fleet on the shore."},
			}},
		}},
	{ID: "h-fosu", Slug: "fosu-lagoon", Kind: "heritage", Name: "Fosu Lagoon", Classification: "Lagoon · birdlife & rite", Summary: "The quiet lagoon behind the coastline, fringed with mangroves and herons — and tied to the rites of Fetu Afahye each September.", History: "The Fosu Lagoon has shaped Oguaa life for centuries. Each year before Fetu Afahye a ban on fishing the lagoon falls across the town, letting the water rest; the festival's Asafo canoe race brings it back to life. Today it is a haven for wading birds and a green breath at the town's edge.", Jurisdiction: cityCapeCoast, Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorTeal, colorDeepGreen},
		Gallery: []domain.MediaAsset{
			{ID: "med-fosu-1", Kind: "photo", URL: seedImg("fosu-lagoon.jpg"), Alt: "The Fosu Lagoon at rest", Caption: "The lagoon", Moderation: "approved"},
			{ID: "med-fosu-2", Kind: "photo", URL: seedImg("bakaano.jpg"), Alt: "Bakaano by the lagoon", Caption: "The lagoon-side quarter", Moderation: "approved"},
		},
		Sections: []domain.ProfileSection{
			{ID: "sec-fosu-faq", Type: "faq", Title: titleGoodToKnow, Items: []domain.SectionItem{
				{ID: "itm-fosu-fetu", Label: "What is the festival tie?", Value: "Before Fetu Afahye the lagoon is closed to fishing so the water can rest; the festival's canoe race on the Fosu marks its reopening."},
			}},
		}},
	{ID: "h-kotokuraba", Slug: "kotokuraba-market", Kind: "heritage", Name: "Kotokuraba Market", Classification: "Central market · the crab market", Summary: "The town's beating heart — the crab-sellers' market that gave Oguaa its name, and still the busiest trading ground on the coast.", History: "Kotokuraba — said to mean the river or village of crabs — was a crab-traders' selling-ground that grew into a market and gave the whole town its English name, Cape Coast, and its soul. Rebuilt in recent years, it remains where Oguaa actually lives: lose an hour here among the stalls, the cloth and the fish.", Jurisdiction: "Kotokuraba, Cape Coast", Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorClay, colorBrass},
		Gallery: []domain.MediaAsset{
			{ID: "med-kotok-1", Kind: "photo", URL: seedImg(imgMarketWomen), Alt: "Traders at Kotokuraba Market", Caption: "The market women", Moderation: "approved"},
			{ID: "med-kotok-2", Kind: "photo", URL: seedImg("downtown.jpg"), Alt: "Downtown Cape Coast near the market", Caption: "Around the market", Moderation: "approved"},
		},
		Sections: []domain.ProfileSection{
			{ID: "sec-kotok-faq", Type: "faq", Title: titleGoodToKnow, Items: []domain.SectionItem{
				{ID: "itm-kotok-buy", Label: "What's it good for?", Value: "Everything the town eats and wears — fresh fish from the Bakaano canoes, kenkey, produce, cloth and household goods. Come with small change and a slow pace."},
			}},
		}},
	{ID: "h-assin-manso", Slug: "assin-manso-slave-river", Kind: "heritage", Name: "Assin Manso Slave River", OfficialTitle: "Donkor Nsuo — the Slave River", Classification: "Ancestral memorial site", Summary: "Donkor Nsuo, the Slave River at Assin Manso — where the captured took their last bath on home soil before the march to the coast. A place of return, walked barefoot and in silence.", History: "On the old road north, Assin Manso was the last great market and resting-place on the forced march from the interior to the slave castles. At the river, Donkor Nsuo, the enslaved were bathed a final time. Today the Reverential Garden holds the reburied remains of returnees from across the diaspora, and a wall where the returning write their names. Held soberly.", Jurisdiction: "Assin Manso, ~40 km north of Cape Coast", Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorMaroon, colorForest}, Sections: []domain.ProfileSection{
		{ID: "sec-assin-faq", Type: "faq", Title: "Before you go", Items: []domain.SectionItem{
			{ID: "itm-assin-how", Label: "How is it visited?", Value: "Quietly. Many walk to the river barefoot and in silence. It is often paired with the Castle as part of the diaspora homecoming on Emancipation Day."},
		}},
	}},
	{ID: "h-bakaano-shore", Slug: "bakaano-fishing-shore", Kind: "heritage", Name: "Bakaano & the fishing shore", Classification: "Fishing harbour & landing beach", Summary: "Brightly painted canoes drawn up on the sand at dawn, the catch coming in, and the Atlantic that has shaped Oguaa life for centuries.", History: "Bakaano is Cape Coast's lagoon-side fishing quarter and landing beach, where the canoe fleet goes out before light and the catch is sold by the morning. The fish on your plate in town was in the ocean at dawn. The chief fisherman reads the lagoon and the sea, and at Bakatue the nets are blessed for the season.", Jurisdiction: "Bakaano, Cape Coast", Verified: true, VerifiedOn: verifiedRosterBatch, HouseColors: []string{colorTeal, colorClay},
		Gallery: []domain.MediaAsset{
			{ID: "med-bakaano-1", Kind: "photo", URL: seedImg("fishing-boats.jpg"), Alt: "Canoes drawn up on the Bakaano shore", Caption: "The canoe fleet", Moderation: "approved"},
			{ID: "med-bakaano-2", Kind: "photo", URL: seedImg("fishermen.jpg"), Alt: "Fishermen bringing in the catch", Caption: "The catch comes in", Moderation: "approved"},
			{ID: "med-bakaano-3", Kind: "photo", URL: seedImg("beach-boats.jpg"), Alt: "Boats on the landing beach", Caption: "The landing beach", Moderation: "approved"},
		},
		Sections: []domain.ProfileSection{
			{ID: "sec-bakaano-faq", Type: "faq", Title: titleGoodToKnow, Items: []domain.SectionItem{
				{ID: "itm-bakaano-when", Label: "When to come?", Value: "Early morning, when the canoes come in and the shore is busiest. Ask before photographing people at work."},
			}},
		}},

	// ── more heritage & visitor sites (batch 2, fact-checked) ──────────────────
	{ID: "h-fort-anomabu", Slug: "fort-william-anomabu", Kind: "heritage", Name: "Fort William, Anomabu", Classification: "UNESCO World Heritage · 18th-century fort", Summary: "A large British slave-trade fort on the Anomabu shore, a short drive east of Cape Coast. Begun in 1753, it became the busiest British slaving post on the Gold Coast.", History: "Two earlier forts stood here — a Dutch work of 1640 and the English Fort Charles of 1674. The present fort was begun in 1753 by the British, designed by the engineer John Apperly and completed by Richard Brew around 1760. First called Fort Anomabo, it was renamed Fort William in the 1830s for King William IV. It was the centre of British slave trading on this coast until abolition in 1807, and was inscribed by UNESCO in 1979.", Jurisdiction: "Anomabu, Mfantsiman Municipal, Central Region", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorBronze, colorForest}, Sections: []domain.ProfileSection{
		{ID: "sec-anomabu-facts", Type: "stats", Title: titleAtAGlance, Tone: "gold", Items: []domain.SectionItem{
			{ID: "itm-anomabu-begun", Label: "Begun", Value: "1753"},
			{ID: "itm-anomabu-unesco", Label: "UNESCO", Value: "1979"},
			{ID: "itm-anomabu-dist", Label: labelFromCapeCoast, Value: "~16 km east"},
			{ID: "itm-anomabu-by", Label: "Managed by", Value: "GMMB"},
		}},
	}},
	{ID: "h-fort-victoria", Slug: "fort-victoria-cape-coast", Kind: "heritage", Name: "Fort Victoria", Classification: "Hilltop watch-tower & monument", Summary: "A small round watch-tower on a hill on the western side of Cape Coast, with some of the best views over the old town and the Atlantic.", History: "Built in 1821 on the ruins of a 1712 fort, it was first called Phipps' Tower after Governor Phipps, then renamed Fort Victoria for Queen Victoria. One of three hilltop lookouts that guarded Cape Coast Castle and warned of Asante attacks, it is preserved today as a monument.", Jurisdiction: "Cape Coast, Central Region", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorDeepGreen, colorBrass}, Sections: []domain.ProfileSection{
		{ID: "sec-fortvic-facts", Type: "stats", Title: titleAtAGlance, Tone: "teal", Items: []domain.SectionItem{
			{ID: "itm-fortvic-built", Label: "Built", Value: "1821"},
			{ID: "itm-fortvic-was", Label: "First called", Value: "Phipps' Tower"},
			{ID: "itm-fortvic-use", Label: "Purpose", Value: "Lookout & signal post"},
		}},
	}},
	{ID: "h-victoria-park", Slug: "victoria-park-cape-coast", Kind: "heritage", Name: "Victoria Park", Classification: "Historic park & durbar ground", Summary: "The historic public park at the centre of Cape Coast — the grand durbar ground of Fetu Afahye, where the Oguaa chiefs, queen mothers and Asafo companies gather in full regalia.", History: "The park holds a bust of Queen Victoria, tied to Jacob Wilson Sey and the Aborigines' Rights Protection Society, whose deputation left Cape Coast in 1898 to petition the Crown against the 1897 Lands Bill. It is best known today as the climax venue of the annual Fetu Afahye, when the chiefs process in palanquins to the grand durbar.", Jurisdiction: "Central Cape Coast, Central Region", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorMaroon, colorBrass}, Sections: []domain.ProfileSection{
		{ID: "sec-vicpark-facts", Type: "stats", Title: titleAtAGlance, Tone: "clay", Items: []domain.SectionItem{
			{ID: "itm-vicpark-role", Label: "Role", Value: "Fetu Afahye durbar ground"},
			{ID: "itm-vicpark-bust", Label: "Monument", Value: "Queen Victoria bust"},
		}},
	}},
	{ID: "h-hans-cottage", Slug: "hans-cottage-botel", Kind: "heritage", Name: "Hans Cottage Botel", Classification: "Eco-tourism site & crocodile pond", Summary: "A well-known eco-tourism stop on the road between Cape Coast and Kakum, built around a natural lagoon that is home to crocodiles, weaverbirds and egrets.", History: "The site grew from a backyard fish pond carved out around 1979 by the Ghanaian entrepreneur Kwesi Hanson — its name comes from 'Hanson'. He reared tilapia and catfish, and it was later expanded into a crocodile pond and a lodge. It is now one of the most popular wildlife stops near Cape Coast, often paired with a Kakum visit.", Jurisdiction: "On the Cape Coast–Kakum road, ~11 km from Cape Coast", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorTeal, colorDeepGreen}, Sections: []domain.ProfileSection{
		{ID: "sec-hans-facts", Type: "stats", Title: titleAtAGlance, Tone: "green", Items: []domain.SectionItem{
			{ID: "itm-hans-origin", Label: "Origin", Value: "Fish pond, c.1979"},
			{ID: "itm-hans-see", Label: "Wildlife", Value: "Crocodiles, weaverbirds, egrets"},
			{ID: "itm-hans-dist", Label: labelFromCapeCoast, Value: "~11 km"},
		}},
	}},
	{ID: "h-brenu-beach", Slug: "brenu-akyinim-beach", Kind: "heritage", Name: "Brenu Akyinim Beach", Classification: "Beach & coastal visitor site", Summary: "A quiet, golden-sand, coconut-lined beach just west of Elmina — a calmer alternative to the busier town shores, and a favourite day trip from Cape Coast.", History: "Brenu Akyinim is a coastal community in the Eguafo-Abrem area near Elmina. Its long, clean beach, reached via the Elmina–Takoradi road, has seen low-key tourism while staying relatively undeveloped and tranquil compared with the castle towns.", Jurisdiction: "Eguafo-Abrem (KEEA), Central Region · ~20 km from Cape Coast", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorTeal, colorBrass}, Sections: []domain.ProfileSection{
		{ID: "sec-brenu-facts", Type: "stats", Title: titleAtAGlance, Tone: "teal", Items: []domain.SectionItem{
			{ID: "itm-brenu-setting", Label: "Setting", Value: "Golden sand & palms"},
			{ID: "itm-brenu-dist", Label: labelFromCapeCoast, Value: "~20 km west"},
		}},
	}},
	{ID: "h-biriwa-beach", Slug: "biriwa-beach", Kind: "heritage", Name: "Biriwa Beach", Classification: "Fishing-village beach", Summary: "A scenic beach at the rocky fishing village of Biriwa, on the coast east of Cape Coast — a characterful stop with a sheltered bay and a busy fishing community.", History: "Biriwa is a long-established Fante fishing community between Yamoransa and Anomabu. Its rocky shoreline and sheltered bay have supported artisanal fishing for generations, and a clifftop hotel now makes it a viewpoint and rest stop for travellers along the coast.", Jurisdiction: "Biriwa, Mfantsiman Municipal, Central Region · ~15 km east of Cape Coast", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorRoyalBlue, colorTeal}, Sections: []domain.ProfileSection{
		{ID: "sec-biriwa-facts", Type: "stats", Title: titleAtAGlance, Tone: "teal", Items: []domain.SectionItem{
			{ID: "itm-biriwa-char", Label: "Character", Value: "Rocky fishing village"},
			{ID: "itm-biriwa-dist", Label: labelFromCapeCoast, Value: "~15 km east"},
		}},
	}},
	{ID: "h-chapel-square", Slug: "chapel-square-cape-coast", Kind: "heritage", Name: "Chapel Square", Classification: "Historic civic square", Summary: "The historic open square at the heart of old Cape Coast, fronting the Wesley Methodist Cathedral near the Castle — one of the town's oldest civic spaces and a landmark of Ghana's early Methodist history.", History: "Chapel Square takes its name from the Wesley Methodist chapel beside it. Wesleyan missionaries arrived in 1835 under the Rev. Joseph Rhodes Dunwell; the cathedral was built in 1838 and a larger chapel dedicated in 1855, with pioneer missionaries buried beneath the pulpit. The square has long served as a gathering place in the old quarter by the Castle.", Jurisdiction: "Old Cape Coast, Central Region", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorMaroon, colorGold}, Sections: []domain.ProfileSection{
		{ID: "sec-chapel-facts", Type: "stats", Title: titleAtAGlance, Tone: "maroon", Items: []domain.SectionItem{
			{ID: "itm-chapel-anchor", Label: "Anchor", Value: "Wesley Methodist Cathedral"},
			{ID: "itm-chapel-built", Label: "Cathedral built", Value: "1838"},
			{ID: "itm-chapel-miss", Label: "Missionaries", Value: "Arrived 1835"},
		}},
	}},

	// ── more institutions (faith · health · civic · cultural) ──────────────────
	{ID: "inst-christ-church", Slug: "christ-church-anglican-cathedral", Kind: "faith", Name: "Christ Church", OfficialTitle: "Christ Church Anglican Cathedral, Diocese of Cape Coast", Classification: "Anglican cathedral", Founded: 1865, Summary: "The cathedral of the Anglican Diocese of Cape Coast and the oldest standing, first purpose-built Anglican church in Ghana. The present building dates to 1865.", History: "Cape Coast was the cradle of Anglican mission work through the Society for the Propagation of the Gospel, whose locally born priest Philip Quaque ministered here in the 18th century. Organised Anglican worship began in 1751 in the Castle chapel under the Rev. Thomas Thompson; the freestanding Christ Church was completed in 1865, and became a cathedral when the Cape Coast diocese was created from Accra in 1981.", Jurisdiction: "Cape Coast, Central Region · Church of the Province of West Africa", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorMaroon, colorPaper},
		Gallery: []domain.MediaAsset{
			{ID: "med-christ-1", Kind: "photo", URL: seedImg("christ-church.jpg"), Alt: "Christ Church Anglican Cathedral", Caption: "The cathedral", Moderation: "approved"},
			{ID: "med-christ-2", Kind: "photo", URL: seedImg("church-anglican.jpg"), Alt: "Inside the Anglican cathedral", Caption: "Within the walls", Moderation: "approved"},
		},
	},
	{ID: "inst-st-francis", Slug: "st-francis-de-sales-cathedral", Kind: "faith", Name: "St. Francis de Sales Cathedral", OfficialTitle: "Metropolitan Cathedral, Catholic Archdiocese of Cape Coast", Classification: "Roman Catholic cathedral", Founded: 1928, Summary: "The first Catholic cathedral built in Ghana and the metropolitan church of the Archdiocese of Cape Coast, completed in 1928. Cape Coast has been the centre of Catholic life in the country since 1879.", History: "The Catholic presence at Cape Coast was organised as the Apostolic Prefecture of the Gold Coast in 1879, became a Vicariate in 1901, and was raised to the Metropolitan Archdiocese of Cape Coast in 1950. The cathedral was completed in 1928; John Kodwo Amissah served as the first African archbishop of Cape Coast (1959–1991).", Jurisdiction: "Cape Coast, Central Region · Ecclesiastical Province of Cape Coast", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorBrown, colorGold}},
	{ID: "inst-ccth", Slug: "cape-coast-teaching-hospital", Kind: "health", Name: "Cape Coast Teaching Hospital", OfficialTitle: "Cape Coast Teaching Hospital (CCTH)", Classification: "Public teaching & referral hospital", Founded: 1998, Summary: "The leading referral and teaching hospital for the Central Region — a roughly 400-bed facility in the north of Cape Coast, affiliated with the University of Cape Coast's medical school.", History: "It opened as the Central Regional Hospital and began full operations on 12 August 1998, the first of a series of modern regional hospitals, and was named the best regional hospital in 2003. After the School of Medical Sciences was established at the University of Cape Coast, it was upgraded to a teaching hospital on 21 March 2014.", Jurisdiction: "Cape Coast, Central Region · Ministry of Health", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorCobalt, colorLeafGreen}, Sections: []domain.ProfileSection{
		{ID: "sec-ccth-facts", Type: "stats", Title: titleAtAGlance, Tone: "teal", Items: []domain.SectionItem{
			{ID: "itm-ccth-open", Label: "Opened", Value: "1998"},
			{ID: "itm-ccth-teach", Label: "Teaching status", Value: "2014"},
			{ID: "itm-ccth-beds", Label: "Beds", Value: "~400"},
		}},
	}},
	{ID: "inst-crcc", Slug: "central-regional-coordinating-council", Kind: "civic", Name: "Central Regional Coordinating Council", OfficialTitle: "Central Regional Coordinating Council (CRCC)", Classification: "Regional government body", Summary: "The administrative arm of central government for the Central Region, seated in Cape Coast, which coordinates the ministries and the region's metropolitan, municipal and district assemblies. It is chaired by the Central Regional Minister.", History: "A Regional Coordinating Council is constituted for each region under Article 255 of the 1992 Constitution. The CRCC brings together the Regional Minister, the presiding members and chief executives of the districts, chiefs nominated by the Regional House of Chiefs, and the regional heads of the decentralised ministries, coordinating development across the region whose capital was the Gold Coast's first.", Jurisdiction: "Central Region, seated at Cape Coast", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorCobalt, colorBrass}},
	{ID: "inst-cc-library", Slug: "cape-coast-regional-library", Kind: "civic", Name: "Cape Coast Regional Library", OfficialTitle: "Central Regional Library, Ghana Library Authority", Classification: "Public regional library", Founded: 1951, Summary: "The regional public library for the Central Region, run by the Ghana Library Authority. It opened as a branch in December 1951 and gained regional status in 1970.", History: "The library opened as a branch in December 1951 and was granted regional status on 1 July 1970. It operates under the Ghana Library Authority, established in 1950 as the Ghana Library Board — the first public library service in sub-Saharan Africa.", Jurisdiction: "Cape Coast, Central Region · Ghana Library Authority", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorDeepGreen, colorBronze}},
	{ID: "inst-cnc", Slug: "centre-for-national-culture-central-region", Kind: "cultural", Name: "Centre for National Culture", OfficialTitle: "Centre for National Culture, Central Region", Classification: "Regional cultural agency", Summary: "The Cape Coast-based regional arm of the National Commission on Culture, promoting Ghanaian arts, heritage and crafts with performances, exhibitions and a crafts market — across the highway from the University of Cape Coast.", History: "The national network began as the Institute of Arts and Culture set up in 1961 under President Nkrumah, renamed the Arts Council of Ghana in 1973, and reorganised under the National Commission on Culture (PNDC Law 238 of 1990, which created the regional centres). The Central Region centre is the region's implementing body for the arts.", Jurisdiction: "Cape Coast, Central Region · National Commission on Culture", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorClay, colorGold}},
	{ID: "inst-cc-mosque", Slug: "cape-coast-central-mosque", Kind: "faith", Name: "Cape Coast Central Mosque", OfficialTitle: "Cape Coast (Oguaa) Central Mosque", Classification: "Central congregational mosque", Summary: "The principal congregational mosque of Cape Coast's Muslim and Zongo community, near Kotokuraba Market — the focal point for Friday prayers and the Ramadan and Eid gatherings.", History: "Cape Coast's Muslim community grew with Sahelian traders and migrants who settled in the town's Zongo wards, with the central mosque near Kotokuraba Market as the focus of worship. Accounts describe a mosque at the site from before 1900, improved on over the decades.", Jurisdiction: "Near Kotokuraba Market, Cape Coast, Central Region", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorLeafGreen, colorBrass}},
	{ID: "inst-ccnmtc", Slug: "cape-coast-nursing-midwifery-training-college", Kind: "education", Name: ccnmtcPage.name, OfficialTitle: "Cape Coast Nursing and Midwifery Training College (CCNMTC)", Classification: ccnmtcPage.classification, Summary: "One of Ghana's older nursing-training institutions, supervised by the Ministry of Health and regulated by the Nursing and Midwifery Council. It runs a three-year diploma in nursing and midwifery, awarded in affiliation with KNUST.", History: "The college is described as one of the oldest nursing-training institutions in Ghana. It operates under the Ministry of Health, with curriculum and examinations regulated by the Nursing and Midwifery Council; graduates complete a three-year programme leading to a diploma awarded through the Kwame Nkrumah University of Science and Technology.", Jurisdiction: "Cape Coast, Central Region · Ministry of Health", Verified: true, VerifiedOn: verifiedSitesBatch, HouseColors: []string{colorLeafGreen, colorPaper}, CrestURL: seedImg("crests/ccnmtc.png"), Offices: ccnmtcOffices, Gallery: schoolGallery(ccnmtcPage), Sections: schoolOfficialSections(ccnmtcPage, ccnmtcOffices)},
}
