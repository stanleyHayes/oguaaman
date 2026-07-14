package mongo

import (
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── seed listing constants ───────────────────────────────────────────────────
// Each listing stamps CreatedAt/SubmittedAt/PublishedAt (and its status history)
// from one date; constants keep those triplets single-sourced.

const (
	d20250402 = "2025-04-02"
	d20260120 = "2026-01-20"
	d20260130 = "2026-01-30"
	d20260205 = "2026-02-05"
	d20260210 = "2026-02-10"
	d20260212 = "2026-02-12"
	d20260215 = "2026-02-15"
	d20260218 = "2026-02-18"
	d20260222 = "2026-02-22"
	d20260301 = "2026-03-01"
	d20260302 = "2026-03-02"
	d20260310 = "2026-03-10"
	d20260312 = "2026-03-12"
	d20260318 = "2026-03-18"
	d20260320 = "2026-03-20"
	d20260322 = "2026-03-22"
	d20260325 = "2026-03-25"
	d20260328 = "2026-03-28"
	d20260401 = "2026-04-01"
	d20260410 = "2026-04-10"
	d20260420 = "2026-04-20"
	d20260501 = "2026-05-01"
	d20260505 = "2026-05-05"
	d20260510 = "2026-05-10"
	d20260515 = "2026-05-15"
	d20260601 = "2026-06-01"

	// Incident & lost-and-found report times (shared with the status history).
	tsFosuFlood      = "2026-07-12T06:45:00Z"
	tsKotokurabaFire = "2026-07-01T21:30:00Z"
	tsAburaAccident  = "2026-07-05T14:20:00Z"
	tsAboomPole      = "2026-07-11T07:05:00Z"
	tsMissingKofi    = "2026-07-03T16:30:00Z"
	tsLostPhone      = "2026-07-11T22:10:00Z"
	tsFoundKeys      = "2026-07-12T07:20:00Z"
	tsLostGoat       = "2026-07-12T10:45:00Z"

	// Shared seed listing values.
	noteIncidentReported    = "Incident reported"
	tagLostFound            = "lost-found"
	tagYoungTalent          = "young-talent"
	imgGroupPhoto           = "https://res.cloudinary.com/demo/image/upload/samples/imagecon-group.jpg"
	imgBeachBoat            = "https://res.cloudinary.com/demo/image/upload/samples/landscapes/beach-boat.jpg"
	exampleApplyURL         = "https://example.org/apply"
	oguaaTraditionalCouncil = "Oguaa Traditional Council"
	venueVictoriaPark       = "Victoria Park & across Cape Coast"
	festivalFetuAfahye      = "fetu-afahye"
	festivalEdinaBakatue    = "edina-bakatue"
	edinaTraditionalCouncil = "Edina Traditional Council"
	festivalEmancipationDay = "emancipation-day"
)

// seedListings returns all listing documents (the one engine, many types).
// Most are approved; a handful are pending to populate the moderation queue.
func seedListings() []domain.Listing {
	return []domain.Listing{
		// ── Artists ──────────────────────────────────────────────────────────
		{ID: "a-esi-sunshine", Slug: "esi-sunshine", Type: domain.TypeArtist, OwnerID: memberAkua, Title: "Esi Sunshine", Status: domain.StatusApproved, Featured: true, Tags: []string{"gospel-highlife", "oguaa"}, TownID: "oguaa", SchoolIDs: []string{schoolHolyChild}, CreatedAt: d20260310, SubmittedAt: d20260310, PublishedAt: d20260310, Details: map[string]any{
			"actName": "Esi Sunshine", "genres": []string{"Gospel Highlife", "Gospel"}, "spotlight": true,
			"bio":            "Raised in the chapel choirs of the coast, Esi turns Methodist hymn-craft and the osode pulse into radiant gospel highlife. A regular at Cape Coast crusades and Fetu Afahye thanksgiving services.",
			"streamingLinks": streams(), "socials": []domain.SocialLink{sl("Instagram", "https://instagram.com")},
			"latestRelease": map[string]any{"title": "Nyame Ayɛ (God Has Done It)", "year": 2026}, "booking": "Via management",
		}},
		{ID: "a-kojo-castle", Slug: "kojo-castle", Type: domain.TypeArtist, OwnerID: memberAkua, Title: "Kojo Castle", Status: domain.StatusApproved, Tags: []string{"hiplife", "drill", "oguaa"}, TownID: "oguaa", SchoolIDs: []string{"adisadel"}, CreatedAt: d20260222, SubmittedAt: d20260222, PublishedAt: d20260222, Details: map[string]any{
			"actName": "Kojo Castle", "genres": []string{"Hiplife", "Drill"},
			"bio":            "Adisco-bred rapper trading bars in Fante and English, named for the fortress he grew up under. Coastal drill with brass-band horns sampled from the Fun Games.",
			"streamingLinks": streams(), "latestRelease": map[string]any{"title": "Cabo Corso", "year": 2026},
		}},
		{ID: "a-nana-tone", Slug: "nana-tone", Type: domain.TypeArtist, OwnerID: memberAkua, Title: "Nana Tone", Status: domain.StatusApproved, Tags: []string{"highlife", "oguaa"}, TownID: "oguaa", SchoolIDs: []string{"mfantsipim"}, CreatedAt: d20260130, SubmittedAt: d20260130, PublishedAt: d20260130, Details: map[string]any{
			"actName": "Nana Tone", "genres": []string{"Highlife", "Palm-wine"},
			"bio":            "A guitarist keeping the palm-wine and osode tradition of C.K. Mann alive for a new generation, performing at the Castle gardens and UCC.",
			"streamingLinks": streams(), "latestRelease": map[string]any{"title": "Osode Revival", "year": 2025},
		}},
		{ID: "a-abena-wave", Slug: "abena-wave", Type: domain.TypeArtist, OwnerID: memberAkua, Title: "Abena Wave", Status: domain.StatusApproved, Tags: []string{"afrobeats", "oguaa"}, TownID: "amanful", SchoolIDs: []string{schoolWesleyGirls}, CreatedAt: d20260318, SubmittedAt: d20260318, PublishedAt: d20260318, Details: map[string]any{
			"actName": "Abena Wave", "genres": []string{"Afrobeats", "R&B"},
			"bio":            "Wey-Gey-Hey alumna making sun-warm Afrobeats with Fante hooks. Tipped as the breakout voice of the new Oguaa Sound.",
			"streamingLinks": streams(), "latestRelease": map[string]any{"title": "Bakatue", "year": 2026},
		}},
		{ID: "a-frankaa-band", Slug: "frankaa-band", CoverImageURL: imgGroupPhoto, Type: domain.TypeArtist, OwnerID: memberNana, Title: "The Frankaa Band", Status: domain.StatusApproved, Tags: []string{"asafo-fusion", "live", "oguaa"}, TownID: "oguaa", CreatedAt: d20260205, SubmittedAt: d20260205, PublishedAt: d20260205, Details: map[string]any{
			"actName": "The Frankaa Band", "genres": []string{"Asafo Fusion", "Highlife"},
			"bio":            "A live ensemble fusing Asafo war drums with brass and guitar — the closest thing to standing in the durbar when the seven companies parade.",
			"streamingLinks": streams(),
		}},
		{ID: "a-kweku-brass", Slug: "kweku-brass", Type: domain.TypeArtist, OwnerID: memberAkua, Title: "Kweku Brass", Status: domain.StatusApproved, Tags: []string{"jazz", "brass", "oguaa"}, TownID: "oguaa", SchoolIDs: []string{"adisadel"}, CreatedAt: d20260325, SubmittedAt: d20260325, PublishedAt: d20260325, Details: map[string]any{
			"actName": "Kweku Brass", "genres": []string{"Jazz", "Brass"},
			"bio":            "Trumpeter out of the Adisco Jazz Band tradition, scoring the coast in smoke and gold.",
			"streamingLinks": streams(),
		}},
		{ID: "a-pending-djkofi", Slug: "dj-kofi-oguaa", Type: domain.TypeArtist, OwnerID: "m-yaw", Title: "DJ Kofi Oguaa", Status: domain.StatusPending, Tags: []string{"afrobeats", "dj"}, TownID: "oguaa", CreatedAt: d20260601, SubmittedAt: d20260601, Details: map[string]any{
			"actName": "DJ Kofi Oguaa", "genres": []string{"Afrobeats", "Amapiano"},
			"bio":            "Resident DJ across Cape Coast beach bars; submitted for review.",
			"streamingLinks": streams(),
		}},

		// ── People ───────────────────────────────────────────────────────────
		{ID: "p-kofi-annan", Slug: "kofi-annan", CoverImageURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Kofi_Annan_2012_%28cropped%29.jpg/330px-Kofi_Annan_2012_%28cropped%29.jpg", Type: domain.TypePerson, OwnerID: memberKojo, Title: "Kofi Annan", Status: domain.StatusApproved, Tags: []string{"mfantsipim", "diplomacy"}, SchoolIDs: []string{"mfantsipim"}, CreatedAt: d20260210, SubmittedAt: d20260210, PublishedAt: d20260210, Details: map[string]any{
			"whyNotable": "Seventh Secretary-General of the United Nations and Nobel Peace laureate; the most internationally celebrated old boy of any Cape Coast school.", "era": "1938–2018", "living": false,
		}},
		{ID: "p-ck-mann", Slug: "ck-mann", Type: domain.TypePerson, OwnerID: memberAkua, Title: "C.K. Mann", Status: domain.StatusApproved, Tags: []string{"music", "highlife", "oguaa"}, TownID: "oguaa", CreatedAt: d20260212, SubmittedAt: d20260212, PublishedAt: d20260212, Details: map[string]any{
			"whyNotable": "Born in Cape Coast in 1936, 'Osodehene' C.K. Mann electrified the coastal osode fishermen's rhythm into funk-inflected highlife — a grandfather of the Oguaa Sound.", "era": "1936–2018", "living": false,
		}},
		{ID: "p-ebo-taylor", Slug: "ebo-taylor", CoverImageURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Ebo_Taylor.jpg/330px-Ebo_Taylor.jpg", Type: domain.TypePerson, OwnerID: memberAkua, Title: "Ebo Taylor", Status: domain.StatusApproved, Tags: []string{"music", "afro-funk", "central-region"}, CreatedAt: d20260212, SubmittedAt: d20260212, PublishedAt: d20260212, Details: map[string]any{
			"whyNotable": "Highlife and Afro-funk pioneer from Saltpond on the Central Region coast; arranged for C.K. Mann, Pat Thomas, Jewel Ackah and Papa Yankson, and carried the coastal sound to the world. Died 7 February 2026, aged 90.", "era": "1936–2026", "living": false,
		}},
		{ID: "p-omanhene", Slug: "osabarimba-kwesi-atta-ii", Type: domain.TypePerson, OwnerID: memberNana, Title: "Osabarimba Kwesi Atta II", Status: domain.StatusApproved, Tags: []string{"chieftaincy", "oguaa"}, TownID: "oguaa", PostedByOrgID: orgOguaaTraditional, CreatedAt: d20260215, SubmittedAt: d20260215, PublishedAt: d20260215, Details: map[string]any{
			"whyNotable": "Omanhene of Oguaa and head of the Oguaa Traditional Council, installed in 1998 — custodian of Fetu Afahye and the 77 gods of Oguaa.", "era": "living", "living": true, "officeIds": []string{"o-ota-omanhene"},
		}},
		{ID: "p-sarbah", Slug: "john-mensah-sarbah", Type: domain.TypePerson, OwnerID: memberKojo, Title: "John Mensah Sarbah", Status: domain.StatusApproved, Tags: []string{"law", "heritage", "arps"}, TownID: "oguaa", CreatedAt: d20260218, SubmittedAt: d20260218, PublishedAt: d20260218, Details: map[string]any{
			"whyNotable": "Pioneering lawyer and a founder of the Aborigines' Rights Protection Society in Cape Coast (1897); an early architect of Gold Coast self-determination.", "era": "1864–1910", "living": false,
		}},

		// Young-talent spotlight (spec §8.8) — public celebration only; no
		// contact details are attached to these profiles, by safeguarding design.
		{ID: "p-ama-sampson", Slug: "ama-sampson", Type: domain.TypePerson, OwnerID: memberAidoo, Title: "Ama Sampson", Status: domain.StatusApproved, Tags: []string{tagYoungTalent, "athletics", "mfantsipim"}, TownID: "oguaa", SchoolIDs: []string{"mfantsipim"}, CreatedAt: d20260505, SubmittedAt: d20260505, PublishedAt: d20260505, Details: map[string]any{
			"whyNotable": "National schools 400 metres champion — her junior time this season is the fastest in the Central Region, trained on the Mfantsipim hill track.", "era": "b. 2009 · 17", "living": true,
		}},
		{ID: "p-efia-grant", Slug: "efia-grant", Type: domain.TypePerson, OwnerID: memberAkua, Title: "Efia Grant", Status: domain.StatusApproved, Tags: []string{tagYoungTalent, "robotics", schoolWesleyGirls}, TownID: "oguaa", SchoolIDs: []string{schoolWesleyGirls}, CreatedAt: d20260510, SubmittedAt: d20260510, PublishedAt: d20260510, Details: map[string]any{
			"whyNotable": "Captains the Wey-Gey-Hey robotics team — back-to-back national finals, and a line-following rover built from parts salvaged at Kotokuraba.", "era": "b. 2010 · 16", "living": true,
		}},
		{ID: "p-kwame-aborampa", Slug: "kwame-aborampa", Type: domain.TypePerson, OwnerID: memberAkua, Title: "Kwame Aborampa", Status: domain.StatusApproved, Tags: []string{tagYoungTalent, "music", "highlife"}, TownID: "oguaa", SchoolIDs: []string{"ucc"}, CreatedAt: d20260515, SubmittedAt: d20260515, PublishedAt: d20260515, Details: map[string]any{
			"whyNotable": "A UCC sophomore singing highlife with the old osode swing — his acoustic sessions in the Science market hostels have built a quiet following across campus.", "era": "b. 2007 · 19", "living": true,
		}},

		// ── Memorials ──────────────────────────────────────────────────────────
		{ID: "mem-adwoa", Slug: "madam-adwoa-mensah", Type: domain.TypeMemorial, OwnerID: "m-ama", Title: "Adwoa Mensah", Status: domain.StatusApproved, Featured: true, Tags: []string{"bakaano", schoolWesleyGirls, "teacher"}, TownID: "bakaano", SchoolIDs: []string{schoolWesleyGirls}, CreatedAt: d20250402, SubmittedAt: d20250402, PublishedAt: d20250402,
			Details: map[string]any{
				"honorific": "Madam", "bornYear": 1951, "diedDate": "2025-03-14", "birthday": "1951-06-03", "observeBirthday": true, "remindersEnabled": true,
				"epitaph":      "She taught half of Bakaano to read, and all of us to be kind.",
				"lifeStory":    "Madam Adwoa Mensah was born in Bakaano in 1951, the eldest of six, and never really left the sea air she loved. After Wesley Girls', she came home to teach — first at the primary school by the lagoon, then for thirty-one years in classrooms across Cape Coast.\n\nGenerations of Oguaa children passed through her care. She is remembered for her patience, her quick humour, and the way she could quiet a noisy room with a single raised eyebrow. On Saturdays she sold kenkey at the junction, and no child who was hungry ever paid.\n\nShe passed peacefully at home, surrounded by family, on 14 March 2025. She leaves her husband, four children, eleven grandchildren, and a town that is kinder for having known her.",
				"gallery":      []map[string]any{{"caption": "Her classroom, 1985"}, {"caption": "By the lagoon"}, {"caption": "Speech & prize day"}, {"caption": "The junction stall"}, {"caption": "Family, 2019"}, {"caption": "Fetu Afahye, 2022"}},
				"associations": []string{"Wesley Girls' High School", "Bakaano"}, "candles": 142, "rememberedByCount": 38, "keeperId": "m-ama",
			},
			Tributes: []domain.Tribute{
				{ID: "t-1", AuthorName: "Kojo Arthur", Relation: "Mfantsipim '88", Message: "Aunty Adwoa was my class three teacher. I am a teacher today because of her. Rest well, Madam.", CreatedAt: "2025-03-29"},
				{ID: "t-2", AuthorName: "Efua Sam", Relation: "Bakaano", Message: "She fed half the junction. Heaven has a good cook now. We will miss your kenkey and your laugh.", CreatedAt: "2025-03-24"},
				{ID: "t-3", AuthorName: "Ama Mensah", Relation: "Family", Message: "My mother. There are no words big enough. We will remember you every single day, da yie.", CreatedAt: "2025-03-18"},
			}},
		{ID: "mem-kobina", Slug: "opanyin-kobina-eshun", Type: domain.TypeMemorial, OwnerID: "m-esi", Title: "Kobina Eshun", Status: domain.StatusApproved, Tags: []string{"bakaano", "fishing", "elder"}, TownID: "bakaano", CreatedAt: d20260120, SubmittedAt: d20260120, PublishedAt: d20260120,
			Details: map[string]any{
				"honorific": "Opanyin", "bornYear": 1939, "diedDate": "2026-01-09", "observeBirthday": false, "remindersEnabled": true,
				"epitaph":      "The sea gave him everything, and he gave the quarter everything back.",
				"lifeStory":    "Opanyin Kobina Eshun was a master fisherman of Bakaano for more than fifty years, and for the last fifteen the chief fisherman who read the lagoon better than any almanac.\n\nHe knew where the catch would run before the tide turned, mended nets for widows without charge, and never let a young man go to sea unprepared. At Bakatue he carried the Omanhene's net.\n\nHe joined his ancestors on 9 January 2026. Da yie, Opanyin.",
				"gallery":      []map[string]any{{"caption": "At the harbour"}, {"caption": "Mending nets"}, {"caption": "Bakatue"}},
				"associations": []string{"Bakaano Canoe Fishermen"}, "candles": 64, "rememberedByCount": 21, "keeperId": "m-esi",
			},
			Tributes: []domain.Tribute{
				{ID: "t-4", AuthorName: "Esi Quayson", Relation: "Family", Message: "Grandpa, the harbour is quiet without your whistle. We remember.", CreatedAt: "2026-01-15"},
			}},

		// ── Businesses ─────────────────────────────────────────────────────────
		{ID: "b-castleview", Slug: "castle-view-guesthouse", CoverImageURL: imgBeachBoat, Type: domain.TypeBusiness, OwnerID: "m-yaw", Title: "Castle View Guesthouse", Status: domain.StatusApproved, Featured: true, Tags: []string{"hospitality", "oguaa"}, TownID: "oguaa", CreatedAt: d20260302, SubmittedAt: d20260302, PublishedAt: d20260302, Details: map[string]any{
			"category": "Hospitality & Lodging", "description": "A small, family-run guesthouse a short walk from Cape Coast Castle, with a rooftop that catches the Atlantic breeze.",
			"services": []map[string]any{{"name": "Standard room", "price": "GHS 250/night"}, {"name": "Sea-view room", "price": "GHS 380/night"}, {"name": "Airport pickup", "note": "On request"}},
			"address":  "Victoria Road, near Cape Coast Castle", "openingHours": "Reception 24/7",
			"contact": []domain.SocialLink{sl("Phone", "tel:+233000000000"), sl("WhatsApp", "https://wa.me/233000000000")},
			// An active Supporter subscription (Phase 7) — badge + priority placement.
			"subscribedUntil": time.Now().UTC().Add(21 * 24 * time.Hour).Format(time.RFC3339),
		}},
		{ID: "b-fish", Slug: "kotokuraba-fresh-fish", CoverImageURL: "https://res.cloudinary.com/demo/image/upload/samples/food/pot-mussels.jpg", Type: domain.TypeBusiness, OwnerID: "m-esi", Title: "Esi's Fresh Fish — Kotokuraba", Status: domain.StatusApproved, Tags: []string{"fishing", "market", "kotokuraba"}, TownID: "kotokuraba", CreatedAt: d20260312, SubmittedAt: d20260312, PublishedAt: d20260312, Details: map[string]any{
			"category": "Market & Fishing", "description": "Same-day catch from the Bakaano canoes, sold at Kotokuraba market. Tilapia, redfish, and the morning's best.",
			"services": []map[string]any{{"name": "Fresh tilapia", "price": "by weight"}, {"name": "Smoked fish", "price": "by weight"}, {"name": "Bulk / event orders", "note": "Order a day ahead"}},
			"address":  "Kotokuraba Market, Cape Coast", "openingHours": "Mon–Sat, 6:00 a.m.–4:00 p.m.",
			"contact": []domain.SocialLink{sl("WhatsApp", "https://wa.me/233000000000")},
		}},
		{ID: "b-kenkey", Slug: "bakaano-kenkey-junction", CoverImageURL: "https://res.cloudinary.com/demo/image/upload/samples/food/spices.jpg", Type: domain.TypeBusiness, OwnerID: memberEfua, Title: "Bakaano Kenkey Junction", Status: domain.StatusApproved, Featured: true, Tags: []string{"food", "bakaano"}, TownID: "bakaano", CreatedAt: d20260401, SubmittedAt: d20260401, PublishedAt: d20260401, Details: map[string]any{
			"category": "Food & Drink", "description": "Fante kenkey (dokonu) steamed in plantain leaves, with fresh fried fish, shito and ground pepper. The junction's been here longer than the bridge.",
			"services": []map[string]any{{"name": "Kenkey & fish", "price": "GHS 20"}, {"name": "Kenkey & one-man-thousand", "price": "GHS 15"}},
			"address":  "The junction, Bakaano", "openingHours": "Daily, 11:00 a.m.–9:00 p.m.",
		}},
		{ID: "b-pending-prints", Slug: "oguaa-prints", Type: domain.TypeBusiness, OwnerID: "m-yaw", Title: "Oguaa Prints & Textiles", Status: domain.StatusPending, Tags: []string{"textile", "craft"}, TownID: "oguaa", CreatedAt: "2026-05-30", SubmittedAt: "2026-05-30", Details: map[string]any{
			"category": "Craft & Textiles", "description": "Hand-finished prints and cloth inspired by the bold appliqué grammar of the coast. Submitted for review.",
			"services": []map[string]any{{"name": "Custom cloth", "note": "By commission"}},
		}},

		// ── Events ───────────────────────────────────────────────────────────
		{ID: "e-fetu", Slug: "fetu-afahye-2026", CoverImageURL: imgGroupPhoto, Type: domain.TypeEvent, OwnerID: memberNana, Title: "Oguaa Fetu Afahye 2026", Status: domain.StatusApproved, Featured: true, Tags: []string{"festival", "oguaa", "homecoming"}, TownID: "oguaa", PostedByOrgID: orgOguaaTraditional, CreatedAt: d20260301, SubmittedAt: d20260301, PublishedAt: d20260301, Details: map[string]any{
			"description": "The annual harvest and cleansing festival of Oguaa, giving thanks to the 77 gods and to the sea. A week of rites culminating in the grand durbar of chiefs — palanquins, state umbrellas, and the seven Asafo companies. The homecoming beat of the year.",
			"startsAt":    "2026-09-05", "venue": venueVictoriaPark, "organiser": oguaaTraditionalCouncil, "anchorFestival": true,
			"festival": festivalFetuAfahye, "edition": "2026",
			"programme": []map[string]any{
				{"day": "Monday 31 August", "title": "Health Day — community cleanup across Cape Coast", "time": "from 6:00 a.m."},
				{"day": "Tuesday 1 September", "title": "Ban on drumming and noise-making begins; fishing in the Fosu Lagoon paused"},
				{"day": "Friday 4 September", "title": "Orange Friday carnival through the streets", "time": "from 4:00 p.m."},
				{"day": "Saturday 5 September", "title": "Grand Durbar of chiefs — Victoria Park", "time": "10:00 a.m."},
			},
			"tiers": []map[string]any{
				{"name": "Grand Durbar stand", "pricePesewas": int64(5_000), "capacity": 500},
				{"name": "Orange Friday carnival", "pricePesewas": int64(3_000), "capacity": 0},
			},
		}},
		{ID: "e-bakaano-prize", Slug: "bakaano-prize-giving", Type: domain.TypeEvent, OwnerID: memberAidoo, Title: "68th Speech & Prize-Giving Day", Status: domain.StatusApproved, Tags: []string{"education", "bakaano"}, TownID: "bakaano", SchoolIDs: []string{schoolBakaanoBasic}, PostedByOrgID: schoolBakaanoBasic, CreatedAt: d20260515, SubmittedAt: d20260515, PublishedAt: d20260515, Details: map[string]any{
			"description": "Bakaano M/A Basic School warmly invites parents, old students, and well-wishers to its 68th Speech & Prize-Giving Day. Doors open 8:00 a.m.; pupils report 7:30 a.m. in full uniform.",
			"startsAt":    "2026-11-22", "venue": "School park, Bakaano", "organiser": "Bakaano M/A Basic School",
		}},
		{ID: "e-funmatch", Slug: "mfantsipim-adisadel-fun-games", Type: domain.TypeEvent, OwnerID: memberKojo, Title: "Mfantsipim–Adisadel Fun Games", Status: domain.StatusApproved, Tags: []string{"education", "sports", "rivalry"}, TownID: "oguaa", SchoolIDs: []string{"mfantsipim", "adisadel"}, CreatedAt: d20260410, SubmittedAt: d20260410, PublishedAt: d20260410, Details: map[string]any{
			"description": "The friendly continuation of Ghana's oldest school rivalry, run since 1992 to turn competition into cooperation. Football, athletics, and brass bands.",
			"startsAt":    "2026-07-18", "venue": "Cape Coast Sports Stadium", "organiser": "MOBA & Santaclausians",
		}},
		{ID: "e-soundlive", Slug: "the-oguaa-sound-live", CoverImageURL: imgBeachBoat, Type: domain.TypeEvent, OwnerID: memberAkua, Title: "The Oguaa Sound — Live at the Castle Gardens", Status: domain.StatusApproved, Featured: true, Tags: []string{"music", "oguaa"}, TownID: "oguaa", CreatedAt: d20260501, SubmittedAt: d20260501, PublishedAt: d20260501, Details: map[string]any{
			"description": "An evening of highlife, gospel and coastal fusion from the artists of the Oguaa Sound, in the gardens beside the Castle.",
			"startsAt":    "2026-08-15", "venue": "Cape Coast Castle Gardens", "organiser": "Oguaa Music Curators",
			"tiers": []map[string]any{
				{"name": "Standard", "pricePesewas": int64(2_000), "capacity": 300},
			},
		}},

		// ── Opportunities ──────────────────────────────────────────────────────
		{ID: "op-moba", Slug: "moba-scholarship-2026", Type: domain.TypeOpportunity, OwnerID: memberKojo, Title: "MOBA Needs-Based Scholarship", Status: domain.StatusApproved, Tags: []string{"scholarship", "education"}, TownID: "oguaa", PostedByOrgID: "moba", CreatedAt: d20260420, SubmittedAt: d20260420, PublishedAt: d20260420, Details: map[string]any{
			"kind": "scholarship", "description": "Full fee support for promising students from Cape Coast entering senior high school, funded by the Mfantsipim Old Boys Association.", "eligibility": "JHS leavers from the Cape Coast Metro with demonstrated need and strong BECE results.", "deadline": "2026-07-31", "provider": "MOBA", "applyUrl": exampleApplyURL,
		}},
		{ID: "op-fisheries", Slug: "coastal-fisheries-apprenticeship", Type: domain.TypeOpportunity, OwnerID: "m-esi", Title: "Coastal Fisheries Apprenticeship", Status: domain.StatusApproved, Tags: []string{"apprenticeship", "fishing"}, TownID: "bakaano", CreatedAt: d20260505, SubmittedAt: d20260505, PublishedAt: d20260505, Details: map[string]any{
			"kind": "apprenticeship", "description": "A six-month, hands-on apprenticeship in sustainable fishing, net-making and cold-chain handling with the Bakaano canoe community.", "eligibility": "Cape Coast residents aged 18+.", "deadline": "2026-06-30", "provider": "Bakaano Canoe Fishermen", "applyUrl": exampleApplyURL,
		}},
		{ID: "op-coding", Slug: "ucc-summer-coding", Type: domain.TypeOpportunity, OwnerID: memberAkua, Title: "UCC Summer Coding Programme", Status: domain.StatusApproved, Tags: []string{"training", "youth"}, TownID: "oguaa", PostedByOrgID: "ucc", CreatedAt: d20260510, SubmittedAt: d20260510, PublishedAt: d20260510, Details: map[string]any{
			"kind": "training", "description": "A free four-week introduction to web development for senior high students, held at the University of Cape Coast.", "eligibility": "SHS students from the Central Region, aged 16–19, with guardian consent.", "deadline": "2026-07-15", "provider": "University of Cape Coast", "applyUrl": exampleApplyURL,
		}},
		{ID: "op-telecel-intern", Slug: "telecel-data-analyst-internship", Type: domain.TypeOpportunity, OwnerID: memberKojo, Title: "Telecel Data Analyst Internship — Cape Coast", Status: domain.StatusApproved, Tags: []string{"internship", "technology"}, TownID: "oguaa", CreatedAt: d20260515, SubmittedAt: d20260515, PublishedAt: d20260515, Details: map[string]any{
			"kind": "internship", "description": "A three-month paid internship with the Telecel network-analytics team in Cape Coast — real dashboards, mentorship, and a recommendation letter at the end.", "eligibility": "UCC or CCTU students in their final year, or recent graduates under 24, with basic spreadsheet skills.", "deadline": "2026-07-20", "provider": "Telecel Ghana — Cape Coast branch", "applyUrl": exampleApplyURL,
		}},
		{ID: "op-metro-ict", Slug: "metro-assembly-junior-ict-officer", Type: domain.TypeOpportunity, OwnerID: memberAidoo, Title: "Junior ICT Officer — Metropolitan Assembly", Status: domain.StatusApproved, Tags: []string{"job", "public-service"}, TownID: "oguaa", PostedByOrgID: "ccma", CreatedAt: d20260601, SubmittedAt: d20260601, PublishedAt: d20260601, Details: map[string]any{
			"kind": "job", "description": "A permanent junior officer post keeping the Assembly's systems and the public Wi-Fi at Victoria Park running, with structured civil-service training.", "eligibility": "Cape Coast Metro residents aged 18–30 with an HND or degree in a computing field.", "deadline": "2026-08-14", "provider": "Cape Coast Metropolitan Assembly", "applyUrl": exampleApplyURL,
		}},

		// ── Memories ───────────────────────────────────────────────────────────
		{ID: "my-dawn", Slug: "mfantsipim-dawn", CoverImageURL: "https://res.cloudinary.com/demo/image/upload/samples/landscapes/nature-mountains.jpg", Type: domain.TypeMemory, OwnerID: memberKojo, Title: "Dawn on the Mfantsipim hill", Status: domain.StatusApproved, Tags: []string{"school:mfantsipim", "era:1980s", "education"}, SchoolIDs: []string{"mfantsipim"}, TownID: "oguaa", CreatedAt: d20260320, SubmittedAt: d20260320, PublishedAt: d20260320, Details: map[string]any{
			"text": "We rose before the sun for morning devotion, the whole hill singing, the sea a grey line below. You did not know then that those cold mornings were making you. Dwen Hwe Kan.", "era": "1980s",
		}},
		{ID: "my-fetu", Slug: "fetu-afahye-2019", CoverImageURL: imgGroupPhoto, Type: domain.TypeMemory, OwnerID: memberEfua, Title: "Fetu Afahye, the year everyone came home", Status: domain.StatusApproved, Tags: []string{"festival", "oguaa", "era:2019"}, TownID: "oguaa", CreatedAt: d20260322, SubmittedAt: d20260322, PublishedAt: d20260322, Details: map[string]any{
			"text": "2019, the Year of Return. Cousins we had never met flew in from Atlanta and London. We stood in the durbar dust together, strangers and family at once, and watched the palanquins go by.", "era": "2019",
		}},
		{ID: "my-lagoon", Slug: "the-lagoon-before-the-bridge", CoverImageURL: imgBeachBoat, Type: domain.TypeMemory, OwnerID: "m-ama", Title: "The lagoon before the bridge", Status: domain.StatusApproved, Tags: []string{"bakaano", "town:bakaano", "era:1990s"}, TownID: "bakaano", CreatedAt: d20260328, SubmittedAt: d20260328, PublishedAt: d20260328, Details: map[string]any{
			"text": "We swam in the Fosu before they built the new road. The fishermen would shout at us, but they always saved the small fish for the children on the bank.", "era": "1990s",
		}},
		{ID: "my-pending", Slug: "kakum-school-trip", Type: domain.TypeMemory, OwnerID: memberEfua, Title: "Our Kakum canopy-walk school trip", Status: domain.StatusPending, Tags: []string{"education", "visit"}, TownID: "oguaa", CreatedAt: "2026-06-02", SubmittedAt: "2026-06-02", Details: map[string]any{
			"text": "Half the class would not cross the bridges. Submitted for review.", "era": "2000s",
		}},

		// ── Adopt-a-project (spec §4/§6/§15 Phase 2; money in pesewas) ─────────
		{ID: "pr-bakaano-lib", Slug: "bakaano-basic-library-corner", Type: domain.TypeProject, OwnerID: memberAidoo, Title: "A library corner for Bakaano M/A Basic", Status: domain.StatusApproved, Tags: []string{"education", "bakaano", "adopt-a-project"}, TownID: "bakaano", SchoolIDs: []string{schoolBakaanoBasic}, PostedByOrgID: schoolBakaanoBasic, CreatedAt: d20260601, SubmittedAt: d20260601, PublishedAt: d20260601, Details: map[string]any{
			"description":   "Shelves, two hundred storybooks and a reading rug for the junior block — a quiet corner where the lagoon-side children can fall in love with reading. Costed with the headteacher; receipts published to backers.",
			"goalPesewas":   int64(1_500_000), // GH₵ 15,000
			"raisedPesewas": int64(0),
			"backers":       0,
			"organiser":     "Bakaano M/A Basic School (verified)",
			"deadline":      "2026-09-30",
		}},
	}
}

// seedIncidents is the community-safety batch: rescue & early recovery reports
// from across Cape Coast. They auto-publish on submit, so all are approved; the
// operational lifecycle lives in details.incidentStatus / details.statusHistory.
func seedIncidents() []domain.Listing {
	hist := func(entries ...map[string]any) []map[string]any { return entries }
	return []domain.Listing{
		{ID: "inc-fosu-lagoon-flood", Slug: "flooding-around-fosu-lagoon-after-heavy-rains", Type: domain.TypeIncident, OwnerID: "m-ama", Title: "Flooding around Fosu Lagoon after heavy rains", Status: domain.StatusApproved, Tags: []string{"safety", "flood", "bakaano"}, TownID: "bakaano", CreatedAt: tsFosuFlood, SubmittedAt: tsFosuFlood, PublishedAt: tsFosuFlood, Details: map[string]any{
			"category": "flood", "severity": "high", "incidentStatus": "verified",
			"location":    "Fosu Lagoon, Bakaano side — behind the Methodist school",
			"contact":     "Ama Mensah — +233240000001",
			"description": "Overnight rains have pushed the lagoon over its bank. Water is at ankle depth across the footpath to the school and rising near two compounds. No injuries, but the nursery children should stay home today.",
			"statusHistory": hist(
				map[string]any{"status": "reported", "by": "m-ama", "note": noteIncidentReported, "at": tsFosuFlood},
				map[string]any{"status": "verified", "by": memberAidoo, "note": "Confirmed with the headteacher; school closing early.", "at": "2026-07-12T08:10:00Z"},
			),
		}},
		{ID: "inc-kotokuraba-fire", Slug: "fire-outbreak-at-kotokuraba-market-stalls", Type: domain.TypeIncident, OwnerID: "m-esi", Title: "Fire outbreak at Kotokuraba Market stalls", Status: domain.StatusApproved, Tags: []string{"safety", "fire", "kotokuraba"}, TownID: "kotokuraba", CreatedAt: tsKotokurabaFire, SubmittedAt: tsKotokurabaFire, PublishedAt: tsKotokurabaFire, Details: map[string]any{
			"category": "fire", "severity": "critical", "incidentStatus": "recovered",
			"location":    "Kotokuraba Market, the dried-fish row, near the main gate",
			"contact":     "Esi Quayson — +233240000008",
			"description": "Fire started late evening in the dried-fish row and spread along six stalls before the fire service contained it. No lives lost; stock and structures destroyed.",
			"statusHistory": hist(
				map[string]any{"status": "reported", "by": "m-esi", "note": noteIncidentReported, "at": tsKotokurabaFire},
				map[string]any{"status": "verified", "by": memberAkua, "note": "Confirmed with market executives and the fire service.", "at": "2026-07-01T22:05:00Z"},
				map[string]any{"status": "responding", "by": memberAkua, "note": "Fire service on site; the row cordoned off.", "at": "2026-07-01T22:40:00Z"},
				map[string]any{"status": "resolved", "by": memberNana, "note": "Flames out, hot spots damped down, traders accounted for.", "at": "2026-07-02T01:15:00Z"},
				map[string]any{"status": "recovered", "by": memberNana, "note": "Stalls rebuilt with communal labour; donations via Adopt-a-Project", "at": "2026-07-09T17:00:00Z"},
			),
		}},
		{ID: "inc-abura-accident", Slug: "road-accident-near-abura-junction", Type: domain.TypeIncident, OwnerID: memberKojo, Title: "Road accident near Abura junction", Status: domain.StatusApproved, Tags: []string{"safety", "accident", "abura"}, TownID: "abura", CreatedAt: tsAburaAccident, SubmittedAt: tsAburaAccident, PublishedAt: tsAburaAccident, Details: map[string]any{
			"category": "accident", "severity": "medium", "incidentStatus": "resolved",
			"location":    "Abura junction, on the Accra road by the fuel station",
			"contact":     "Kojo Arthur — +233240000002",
			"description": "A trotro and a private saloon collided at the junction. Two passengers taken to the Regional Hospital for checks; traffic slowed in both directions.",
			"statusHistory": hist(
				map[string]any{"status": "reported", "by": memberKojo, "note": noteIncidentReported, "at": tsAburaAccident},
				map[string]any{"status": "verified", "by": memberAkua, "note": "Confirmed with MTTD officers on the scene.", "at": "2026-07-05T14:55:00Z"},
				map[string]any{"status": "resolved", "by": memberAidoo, "note": "Vehicles towed, road cleared, all injuries minor.", "at": "2026-07-05T18:30:00Z"},
			),
		}},
		{ID: "inc-aboom-pole", Slug: "fallen-electricity-pole-at-aboom", Type: domain.TypeIncident, OwnerID: "m-yaw", Title: "Fallen electricity pole at Aboom", Status: domain.StatusApproved, Tags: []string{"safety", "utility", "aboom"}, TownID: "aboom", CreatedAt: tsAboomPole, SubmittedAt: tsAboomPole, PublishedAt: tsAboomPole, Details: map[string]any{
			"category": "utility", "severity": "high", "incidentStatus": "responding",
			"location":    "Aboom, the stretch just past the old well",
			"contact":     "Yaw Ofori — +233240000007",
			"description": "A pole came down in the night wind and a live line is lying across the road. The area is dark; please keep children and animals away from the wires.",
			"statusHistory": hist(
				map[string]any{"status": "reported", "by": "m-yaw", "note": noteIncidentReported, "at": tsAboomPole},
				map[string]any{"status": "verified", "by": memberAidoo, "note": "Confirmed; road section coned off by residents.", "at": "2026-07-11T07:50:00Z"},
				map[string]any{"status": "responding", "by": memberNana, "note": "ECG crew dispatched; line de-energised pending re-erection.", "at": "2026-07-11T10:20:00Z"},
			),
		}},
	}
}

// seedLostFound is the lost & found batch: lost items, found items and missing
// people. Notices auto-publish on submit (time-critical), so all are approved;
// the resolution lifecycle lives in details.lfStatus (open → reunited | closed).
func seedLostFound() []domain.Listing {
	return []domain.Listing{
		{ID: "lf-kofi-bakaano", Slug: "missing-9-year-old-kofi-last-seen-near-wesley-methodist-bakaano", Type: domain.TypeLostFound, OwnerID: "m-ama", Title: "Missing: 9-year-old Kofi, last seen near Wesley Methodist, Bakaano", Status: domain.StatusApproved, Tags: []string{tagLostFound, "missing_person", "bakaano"}, TownID: "bakaano", CreatedAt: tsMissingKofi, SubmittedAt: tsMissingKofi, PublishedAt: tsMissingKofi, Details: map[string]any{
			"kind": "missing_person", "lfStatus": "reunited",
			"lastSeenLocation": "Wesley Methodist school junction, Bakaano",
			"lastSeenDate":     "2026-07-03",
			"contact":          "Ama Mensah (Kofi's mother) — +233240000001",
			"description":      "Kofi did not come home from school on Friday. He is nine, small for his age, and was wearing his blue Wesley Methodist uniform. — UPDATE: Found safe the same evening at his auntie's house in Aboom; he had walked over after school and fallen asleep. Thank you to everyone who shared and searched. God bless you all.",
		}},
		{ID: "lf-samsung-victoria-park", Slug: "lost-black-samsung-phone-at-victoria-park-during-orange-friday", Type: domain.TypeLostFound, OwnerID: "m-yaw", Title: "Lost: black Samsung phone at Victoria Park during Orange Friday", Status: domain.StatusApproved, Tags: []string{tagLostFound, "lost_item", "oguaa"}, TownID: "oguaa", CreatedAt: tsLostPhone, SubmittedAt: tsLostPhone, PublishedAt: tsLostPhone, Details: map[string]any{
			"kind": "lost_item", "lfStatus": "open",
			"lastSeenLocation": "Victoria Park, near the stage, during Orange Friday",
			"lastSeenDate":     "2026-07-11",
			"contact":          "Yaw Ofori — +233240000007",
			"description":      "A black Samsung with a cracked green case. It slipped out of my pocket somewhere between the stage and the food stalls. Family photos on it mean more than the phone — a small reward for whoever returns it, no questions asked.",
		}},
		{ID: "lf-keys-kotokuraba", Slug: "found-bunch-of-keys-near-kotokuraba-market-gate", Type: domain.TypeLostFound, OwnerID: "m-esi", Title: "Found: bunch of keys near Kotokuraba Market gate", Status: domain.StatusApproved, Tags: []string{tagLostFound, "found_item", "kotokuraba"}, TownID: "kotokuraba", CreatedAt: tsFoundKeys, SubmittedAt: tsFoundKeys, PublishedAt: tsFoundKeys, Details: map[string]any{
			"kind": "found_item", "lfStatus": "open",
			"lastSeenLocation": "Kotokuraba Market, the main gate by the trotro stop",
			"lastSeenDate":     "2026-07-12",
			"contact":          "Esi Quayson — +233240000008",
			"description":      "Four keys on a red fish-shaped keyring, picked up this morning at the main gate. They are safe with me at the fresh-fish stall — come and describe the keyring and they are yours.",
		}},
		{ID: "lf-aponkye-goat", Slug: "lost-brown-goat-answers-to-aponkye-aboom", Type: domain.TypeLostFound, OwnerID: memberKojo, Title: "Lost: brown goat answers to 'Aponkye', Aboom", Status: domain.StatusApproved, Tags: []string{tagLostFound, "lost_item", "aboom"}, TownID: "aboom", CreatedAt: tsLostGoat, SubmittedAt: tsLostGoat, PublishedAt: tsLostGoat, Details: map[string]any{
			"kind": "lost_item", "lfStatus": "open",
			"lastSeenLocation": "Aboom, around the old well",
			"lastSeenDate":     "2026-07-12",
			"contact":          "Kojo Arthur — +233240000002",
			"description":      "A brown goat with a red collar who actually answers when you call 'Aponkye'. He untied himself again — if you see him grazing your cassava, please don't cook him, call me. Small reward, and my mother will add kenkey.",
		}},
	}
}

// seedExtraListings is batch 2: more REAL, fact-checked Cape Coast data — the
// town's notable sons & daughters (honest about born-here vs schooled-here) and
// the wider festival calendar of the coast. Appended to seedListings() in Seed().
func seedExtraListings() []domain.Listing {
	pdate := verifiedSitesBatch
	person := func(slug, title, era string, living bool, tags []string, why string) domain.Listing {
		return domain.Listing{ID: "p-" + slug, Slug: slug, Type: domain.TypePerson, OwnerID: memberNana, Title: title, Status: domain.StatusApproved, Tags: tags, TownID: "oguaa", CreatedAt: pdate, SubmittedAt: pdate, PublishedAt: pdate, Details: map[string]any{"whyNotable": why, "era": era, "living": living}}
	}
	event := func(slug, title, startsAt, venue, organiser, desc string, featured bool) domain.Listing {
		d := map[string]any{"description": desc, "venue": venue, "organiser": organiser}
		if startsAt != "" {
			d["startsAt"] = startsAt
		}
		return domain.Listing{ID: "e-" + slug, Slug: slug, Type: domain.TypeEvent, OwnerID: memberNana, Title: title, Status: domain.StatusApproved, Featured: featured, Tags: []string{"festival", "central-region"}, TownID: "oguaa", CreatedAt: pdate, SubmittedAt: pdate, PublishedAt: pdate, Details: d}
	}
	// fedition is one yearly edition of a festival in the archive: an event listing
	// tagged with its festival slug and year, plus a recap (past editions) or a
	// programme (upcoming ones).
	fedition := func(festival, year, slug, title, startsAt, venue, organiser, desc, recap string, programme []map[string]any, featured bool) domain.Listing {
		l := event(slug, title, startsAt, venue, organiser, desc, featured)
		l.Details["festival"] = festival
		l.Details["edition"] = year
		if recap != "" {
			l.Details["recap"] = recap
		}
		if len(programme) > 0 {
			l.Details["programme"] = programme
		}
		return l
	}

	return []domain.Listing{
		// ── Notable sons & daughters of Oguaa (born here) ──────────────────────
		person("efua-sutherland", "Efua Sutherland", "1924–1996", false, []string{"theatre", "literature", "oguaa"},
			"Playwright and director who shaped modern Ghanaian theatre — author of The Marriage of Anansewa, founder of the Ghana Drama Studio and the Kodzidan story-house. Her 1980 proposal for a historical drama festival in Cape Coast grew into PANAFEST. Born in Cape Coast."),
		person("joseph-ephraim-casely-hayford", "J. E. Casely Hayford", "1866–1930", false, []string{"law", "pan-africanism", "oguaa"},
			"Fante journalist, barrister and pan-African nationalist who founded the National Congress of British West Africa (1919) and wrote Ethiopia Unbound (1911), among the earliest English-language novels by an African. Born in Cape Coast and schooled at the Wesleyan school that became Mfantsipim."),
		person("philip-quaque", "Philip Quaque", "c.1741–1816", false, []string{"faith", "heritage", "oguaa"},
			"The first African ordained a minister of the Church of England, in 1765; for half a century the chaplain, catechist and schoolmaster at Cape Coast Castle, and lies buried in its courtyard. Born in Cape Coast around 1741."),
		person("kobina-sekyi", "Kobina Sekyi", "1892–1956", false, []string{"law", "theatre", "arps", "oguaa"},
			"Nationalist lawyer, philosopher and playwright; his 1916 satire The Blinkards is a landmark of Ghanaian drama. The last president of the Aborigines' Rights Protection Society. Born in Cape Coast and schooled at Mfantsipim."),
		person("joe-de-graft", "Joe de Graft", "1924–1978", false, []string{"theatre", "literature", "oguaa"},
			"Playwright, poet and actor, and the first director of the Ghana Drama Studio (1962); best known for the play Sons and Daughters (1964). Born in Cape Coast."),
		person("kwame-asare-jacob-sam", "Kwame Asare (Jacob Sam)", "1903–c.1950s", false, []string{"music", "highlife", "oguaa"},
			"Pioneering highlife guitarist whose 1928 London recording of Yaa Amponsah, with the Kumasi Trio, was the first Ghanaian highlife record and a foundational guitar-band classic. Born in Cape Coast."),
		person("francis-lodowic-bartels", "F. L. Bartels", "1910–2010", false, []string{"education", "history", "oguaa"},
			"The first black African headmaster of Mfantsipim (1949–1961), later Ghana's ambassador to West Germany and author of The Roots of Ghana Methodism (1965). Born in Cape Coast and schooled at Mfantsipim; he died a centenarian."),
		person("jacob-wilson-sey", "Jacob Wilson Sey (Kwaa Bonyi)", "1832–1902", false, []string{"heritage", "arps", "oguaa"},
			"Self-made farmer turned philanthropist and nationalist, and founding president of the Aborigines' Rights Protection Society, which funded the 1898 delegation that petitioned the Crown against the Lands Bill. A major benefactor of Cape Coast Methodism; he lived, worked and died in Cape Coast, where he is buried near the Town Hall."),
		person("jane-naana-opoku-agyemang", "Jane Naana Opoku-Agyemang", "b. 1951", true, []string{"education", "politics", "oguaa"},
			"The first female Vice-Chancellor of a Ghanaian public university (the University of Cape Coast), later Minister of Education, and since January 2025 the Vice-President of Ghana — the first woman to hold the office. Born in Cape Coast and schooled at Wesley Girls'."),

		// ── Schooled or shaped in Oguaa (born elsewhere — kept honest) ─────────
		person("james-kwegyir-aggrey", "Kwegyir Aggrey", "1875–1927", false, []string{"education", "pan-africanism"},
			"Educator and pan-African thinker, famed for his image that true harmony needs the black and the white keys of the piano alike; first Vice-Principal of Achimota College. Born in Anomabu; he studied at, and rose to be headmaster of, the Wesleyan school in Cape Coast (now Mfantsipim)."),
		person("nii-quaynor", "Nii Quaynor", "b. 1949", true, []string{"technology", "internet"},
			"A father of the internet in Africa: he set up Ghana's first internet service provider, has managed the .gh domain since 1996, and in 2000 became the first African elected to the ICANN board. Born in Accra; schooled at Adisadel College and a founder of computer science at the University of Cape Coast."),
		person("sophia-akuffo", "Sophia Akuffo", "b. 1949", true, []string{"law", "justice"},
			"Jurist who served as the 13th Chief Justice of Ghana (2017–2019) and earlier as president of the African Court on Human and Peoples' Rights. Schooled at Wesley Girls' High School, Cape Coast; born elsewhere."),
		person("ama-ata-aidoo", "Ama Ata Aidoo", "1942–2023", false, []string{"literature", "theatre"},
			"Writer and dramatist of international standing; her play The Dilemma of a Ghost (1965) made her the first published female African dramatist, and she won the 1992 Commonwealth Writers' Prize for Changes. Born near Saltpond; she found her vocation at Wesley Girls', Cape Coast."),
		person("arthur-wharton", "Arthur Wharton", "1865–1930", false, []string{"sport", "football"},
			"Widely regarded as the world's first black professional footballer, and a champion sprinter who kept goal for English clubs including Preston North End and Rotherham. Born in Jamestown, Accra, of Fante descent; he was schooled around 1879 at Cape Coast's Wesleyan High School (renamed Mfantsipim in 1905)."),
		person("joseph-peter-brown", "J. P. Brown", "1843–1932", false, []string{"education", "arps"},
			"Teacher, merchant and politician who defended African land rights; a founder and president of the Aborigines' Rights Protection Society and a member of the Gold Coast Legislative Council (1904–1909). Born in Dixcove; he was schooled in Cape Coast and built his life there."),
		person("samuel-richard-brew-attoh-ahuma", "S. R. B. Attoh Ahuma", "1863–1921", false, []string{"faith", "journalism", "arps"},
			"Methodist minister and nationalist journalist; as editor of the Gold Coast Methodist Times he led the 1897 press campaign against the Lands Bill and helped found the ARPS, and wrote The Gold Coast Nation and National Consciousness (1911). Of Fante–Cape Coast maternal heritage, he was schooled and trained in Cape Coast."),

		// ── The wider festival calendar of the coast ───────────────────────────
		// Each festival below is a yearly-edition event carrying festival/edition
		// keys, so the archive (/api/festivals) can group them by year.
		fedition(festivalFetuAfahye, "2024", "fetu-afahye-2024", "Oguaa Fetu Afahye 2024 — Fetu @60", "2024-09-07", venueVictoriaPark, oguaaTraditionalCouncil,
			"The sixtieth anniversary edition of Oguaa's paramount festival — a week of rites, the Asafo companies in full colour, and the grand durbar at Victoria Park.",
			"Fetu @60, and one for the ages: the Asantehene, Otumfuo Osei Tutu II, attended the grand durbar at Victoria Park for the first time, and the diaspora came home in their thousands. The Asafo companies paraded as their grandfathers did, and the whole coast drummed for a week.", nil, false),
		fedition(festivalFetuAfahye, "2025", "fetu-afahye-2025", "Oguaa Fetu Afahye 2025", "2025-09-06", venueVictoriaPark, oguaaTraditionalCouncil,
			"The annual harvest and cleansing festival of Oguaa — a week of rites culminating in the grand durbar of chiefs at Victoria Park.",
			"A homecoming edition under clear skies: Orange Friday filled the streets till midnight, the seven Asafo companies answered the drums, and the durbar at Victoria Park drew families home from across the world.", nil, false),
		fedition(festivalEdinaBakatue, "2025", "edina-bakatue-2025", "Edina Bakatue 2025", "2025-07-01", "Benya Lagoon & Elmina town", edinaTraditionalCouncil,
			"The festival of the chiefs and people of Elmina, marking the opening of the Benya Lagoon for the fishing season — the sacred net, the durbar and the regatta.",
			"A generous first casting — the chief priest's net came up full, and the fishermen read a good season in it. The regatta ran the length of the lagoon before the durbar, and Elmina feasted.", nil, false),
		fedition(festivalEdinaBakatue, "2026", festivalEdinaBakatue, "Edina Bakatue 2026", "2026-07-07", "Benya Lagoon & Elmina town", edinaTraditionalCouncil,
			"The festival of the chiefs and people of Elmina — its name means the draining of the lagoon — marking the opening of the fishing season. The chief priest casts a sacred net three times into the Benya Lagoon, the state offers mashed yam to the river god Nana Benya, and a grand durbar and regatta follow. Documented since at least 1847; held on the first Tuesday of July.", "",
			[]map[string]any{
				{"day": "Tuesday 7 July", "title": "Casting of the sacred net into the Benya Lagoon — three casts, the catch read for the season", "time": "morning"},
				{"day": "Tuesday 7 July", "title": "Offering of mashed yam to Nana Benya; grand durbar & lagoon regatta", "time": "afternoon"},
			}, false),
		fedition("panafest", "2025", "panafest", "PANAFEST 2025 — Pan-African Historical Theatre Festival", "2025-07-26", "Cape Coast & Elmina (opening at Cape Coast Castle)", "National Commission on Culture · Ghana Tourism Authority",
			"The biennial Pan-African festival of arts and remembrance, grown from Efua Sutherland's 1980 proposal and first staged in 1992. It gathers the continent and the diaspora for historical drama, music, dance, colloquia and a candlelit emancipation vigil, alongside the Emancipation Day commemorations.",
			"PANAFEST 2025 brought the diaspora home for days of historical theatre, music and colloquia between the two castles, closing with the candlelit emancipation vigil at the Door of Return. The next edition is PANAFEST 2027.", nil, true),
		fedition(festivalEmancipationDay, "2026", festivalEmancipationDay, "Emancipation Day 2026", "2026-08-01", "Assin Manso Slave River · Cape Coast & Elmina Castles", "Government of Ghana · Ghana Tourism Authority",
			"Ghana's annual commemoration of the abolition of slavery in the British Empire — Ghana was the first African nation to observe it, from 1998. The Central Region is its heart: a grand durbar at Assin Manso, where captives took their last bath in the Slave River, with wreath-laying, libation and remembrance at the Cape Coast and Elmina castles. Climaxes on 1 August.", "",
			[]map[string]any{
				{"day": "Friday 31 July", "title": "Reverential Night vigil — Cape Coast Castle", "time": "from dusk"},
				{"day": "Saturday 1 August", "title": "Durbar at Assin Manso, the 'Last Bath' river site", "time": "morning"},
				{"day": "Saturday 1 August", "title": "Wreath-laying & libation at Cape Coast and Elmina Castles", "time": "afternoon"},
			}, true),
		fedition(festivalEmancipationDay, "2026", "reverential-night", "Reverential Night at the Castle", "2026-07-31", "Cape Coast Castle", "Government of Ghana · Ghana Tourism Authority",
			"A solemn vigil on the eve of Emancipation Day. Government, traditional rulers and the diaspora process through the dungeons to the Door of No Return — now also the Door of Return — where libation is poured, the ancestors' names are called, three wreaths laid and seven candles lit. Held each 31 July.", "", nil, false),
		fedition("akwambo", "2026", "akwambo-festival", "Akwambo (Path-Clearing) Festival 2026", "2026-08-29", "Agona & Gomoa traditional areas, Central Region", "Agona & Gomoa traditional authorities",
			"A path-clearing festival of the Fante communities of the Agona and Gomoa areas, distinct from Oguaa's Fetu Afahye. Townspeople weed and clear the footpaths to the sacred streams and shrines, honouring their founders' journeys, with Asafo drumming and a durbar of chiefs in palanquins. Kept town by town across August and September.", "",
			[]map[string]any{
				{"day": "August–September", "title": "Clearing of the footpaths to the sacred streams and shrines"},
				{"day": "August–September", "title": "Asafo drumming and durbar of chiefs in palanquins"},
			}, false),
		fedition("edina-bronya", "2027", "edina-bronya", "Edina Bronya 2027", "2027-01-07", "Elmina town & St. George's Castle", edinaTraditionalCouncil,
			"Elmina's own 'Christmas' — a harvest and thanksgiving festival inherited from the Dutch era and made wholly Fante. At midnight the Paramount Chief fires musketry to usher in the new year; the next day he rides in palanquin, sheep are slaughtered before Elmina Castle, and families feast. Held on the first Thursday of January.", "",
			[]map[string]any{
				{"day": "Thursday 7 January", "title": "Midnight musketry to usher in the new year", "time": "12:00 a.m."},
				{"day": "Thursday 7 January", "title": "Palanquin procession, slaughter before Elmina Castle, family feasting", "time": "daytime"},
			}, false),
		event("mfantsipim-at-150-durbar", "Mfantsipim @150 Grand Durbar & Speech Day", "2026-11-14", "Kwabotwe Hill, Mfantsipim School, Cape Coast", "Mfantsipim School & MOBA",
			"Mfantsipim — founded in 1876, Ghana's pioneer secondary school — marks its sesquicentenary with a Grand Anniversary Durbar and Speech Day on Kwabotwe Hill, the high point of a year of celebration. Speech and Prize-Giving has been a Cape Coast tradition here since 1908; in 2026 it carries 150 years of looking ahead.", false),
	}
}
