package mongo

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/oguaa/backend/internal/domain"
)

// ── school official pages ────────────────────────────────────────────────────
// Every school in the roster deserves the full official-page treatment that
// Mfantsipim has (see seed.go, sec-mfan-*). Rather than hand-authoring sixteen
// near-identical section sets, each school is described once in a compact
// schoolPage and schoolOfficialSections renders the standard set from it:
// hero · our story · stats · facilities · milestones · groups (houses /
// faculties / class levels) · leadership · admissions FAQ · fees · voices ·
// contact · map. The org literals in seed.go reference each page's
// name/motto/founded/classification so prose and profile can never drift.
//
// All content is demo data: figures are indicative (never presented as official
// records), media URLs are Cloudinary-demo placeholders in the pattern already
// used across the seed, and office holders without a named person use the
// "(office)" placeholder convention. Claimed schools replace it all from the
// admin dashboard.

type schoolLevel int

const (
	levelSHS schoolLevel = iota
	levelBasic
	levelTertiary
	levelSpecial
)

type schoolMilestone struct{ label, value, detail string }
type schoolGroup struct {
	id, name, summary string
	color, colourName string // empty → no colour chip (faculties, programmes)
}
type schoolFAQ struct{ q, a string }
type schoolFee struct{ label, value, detail string }
type schoolVoice struct{ quote, who, detail string }

type schoolPage struct {
	key            string // short id key: sec-<key>-*, itm-<key>-*, med-<key>-*
	slug           string // org slug (drives the placeholder email)
	level          schoolLevel
	name           string // == Organization.Name (single-sourced into the literal)
	motto          string // == Organization.Motto; "" when the school has none seeded
	founded        int    // == Organization.Founded; 0 when unknown
	classification string // == Organization.Classification
	population     string // indicative student body, clearly general
	groupsTitle    string // "Houses" · "Faculties" · "Programmes" · "Class levels" · "Units"
	groupsNoun     string // group card subtitle ("Boarding house", "College", …)
	story          string // 2–3 paragraph official-history blurb (Markdown)
	milestones     []schoolMilestone
	groups         []schoolGroup
	faqs           []schoolFAQ
	feesTitle      string
	fees           []schoolFee // empty → "see the admissions office" note
	voices         []schoolVoice
	address        string // full address line incl. the school name
	phone          string // placeholder office line, "+233 33 000 0NNN" pattern
	facilities     [4]string
}

// schoolPhotoPool holds the Cloudinary-demo sample URLs already used across the
// seed (see seed_listings.go). School galleries draw from it deterministically,
// so every photo renders until a claimed school uploads its own photography.
var schoolPhotoPool = []string{
	"https://res.cloudinary.com/demo/image/upload/samples/imagecon-group.jpg",
	"https://res.cloudinary.com/demo/image/upload/samples/landscapes/nature-mountains.jpg",
	"https://res.cloudinary.com/demo/image/upload/samples/landscapes/beach-boat.jpg",
	"https://res.cloudinary.com/demo/image/upload/samples/food/spices.jpg",
	"https://res.cloudinary.com/demo/image/upload/samples/food/pot-mussels.jpg",
}

func schoolPhoto(key string) string {
	h := 0
	for _, r := range key {
		h = h*31 + int(r)
	}
	if h < 0 {
		h = -h
	}
	return schoolPhotoPool[h%len(schoolPhotoPool)]
}

// schoolGallery builds the institution's top-level photo library — generic
// campus-life captions, distinct from the named facilities album in the
// sections (mirroring Mfantsipim's Gallery vs sec-mfan-facilities).
func schoolGallery(p schoolPage) []domain.MediaAsset {
	captions := map[schoolLevel][4]string{
		levelSHS:      {"Campus life", "Morning assembly", "Classroom block", "Sports and games"},
		levelBasic:    {"Campus life", "Morning assembly", "In the classroom", "Play and sports"},
		levelSpecial:  {"Campus life", "Morning assembly", "In the classroom", "Play and sports"},
		levelTertiary: {"Campus life", "Lecture theatre", "The library", "Student life"},
	}
	out := make([]domain.MediaAsset, 0, 4)
	for i, caption := range captions[p.level] {
		out = append(out, domain.MediaAsset{
			ID:         fmt.Sprintf("med-%s-%d", p.key, i+1),
			URL:        schoolPhoto(p.key + caption),
			Kind:       "photo",
			Alt:        caption + " at " + p.name,
			Caption:    caption,
			Moderation: "approved",
		})
	}
	return out
}

// schoolOfficialSections renders the standard official-page section set for a
// school, in the Mfantsipim house style (ids, tones, item shapes). Sections
// render in array order: hero first, contact and map last.
func schoolOfficialSections(p schoolPage, offices []domain.Office) []domain.ProfileSection {
	email := "office@" + p.slug + ".oguaa.test"
	mailto := "mailto:" + email
	tel := "tel:" + strings.ReplaceAll(p.phone, " ", "")

	heroBody := "The official page of " + p.name + " — "
	if p.motto != "" {
		heroBody += p.motto + "."
	} else {
		heroBody += p.classification + "."
	}

	secs := []domain.ProfileSection{
		{ID: "sec-" + p.key + "-hero", Type: domain.SectionHero, Title: p.name, Tone: "green", Body: heroBody, Items: []domain.SectionItem{
			{ID: "itm-" + p.key + "-h1", Label: "Admissions", URL: mailto},
			{ID: "itm-" + p.key + "-h2", Label: "Call the office", URL: tel},
		}},
		{ID: "sec-" + p.key + "-story", Type: domain.SectionRichText, Title: "Our story", Tone: "green", Body: p.story},
	}

	// ── stats ──
	stats := make([]domain.SectionItem, 0, 4)
	if p.founded > 0 {
		stats = append(stats, domain.SectionItem{ID: "itm-" + p.key + "-s1", Label: "Established", Value: strconv.Itoa(p.founded)})
	}
	stats = append(stats,
		domain.SectionItem{ID: "itm-" + p.key + "-s2", Label: "Type", Value: p.classification},
		domain.SectionItem{ID: "itm-" + p.key + "-s3", Label: "Students", Value: p.population},
		domain.SectionItem{ID: "itm-" + p.key + "-s4", Label: p.groupsTitle, Value: strconv.Itoa(len(p.groups))},
	)
	secs = append(secs, domain.ProfileSection{ID: "sec-" + p.key + "-stats", Type: domain.SectionStats, Title: "By the numbers", Tone: "gold", Items: stats})

	// ── facilities gallery ──
	media := make([]domain.MediaAsset, 0, len(p.facilities))
	for i, facility := range p.facilities {
		media = append(media, domain.MediaAsset{
			ID:         fmt.Sprintf("med-%s-fac-%d", p.key, i+1),
			URL:        schoolPhoto(p.key + facility),
			Kind:       "photo",
			Alt:        facility + ", " + p.name,
			Caption:    facility,
			Moderation: "approved",
		})
	}
	secs = append(secs, domain.ProfileSection{ID: "sec-" + p.key + "-facilities", Type: domain.SectionGallery, Title: "Facilities", Tone: "teal", Media: media})

	// ── milestones ──
	timeline := make([]domain.SectionItem, 0, len(p.milestones))
	for i, m := range p.milestones {
		timeline = append(timeline, domain.SectionItem{ID: fmt.Sprintf("itm-%s-t%d", p.key, i+1), Label: m.label, Value: m.value, Detail: m.detail})
	}
	secs = append(secs, domain.ProfileSection{ID: "sec-" + p.key + "-timeline", Type: domain.SectionTimeline, Title: "Milestones", Tone: "green", Items: timeline})

	// ── groups (houses / faculties / programmes / class levels) ──
	groups := make([]domain.SubEntity, 0, len(p.groups))
	for _, g := range p.groups {
		card := domain.SubEntity{ID: "grp-" + p.key + "-" + g.id, Name: g.name, Subtitle: p.groupsNoun, Summary: g.summary}
		if g.color != "" {
			card.Colors = []string{g.color}
			card.Attrs = []domain.SectionItem{{Label: "Colour", Value: g.colourName}}
		}
		groups = append(groups, card)
	}
	secs = append(secs, domain.ProfileSection{ID: "sec-" + p.key + "-groups", Type: domain.SectionGroups, Title: p.groupsTitle, Tone: "clay", Groups: groups})

	// ── leadership (from the org's Offices) ──
	team := make([]domain.SectionItem, 0, len(offices))
	for i, o := range offices {
		team = append(team, domain.SectionItem{ID: fmt.Sprintf("itm-%s-l%d", p.key, i+1), Value: o.HolderName, Label: o.Role})
	}
	secs = append(secs, domain.ProfileSection{ID: "sec-" + p.key + "-team", Type: domain.SectionTeam, Title: "Leadership", Tone: "maroon", Items: team})

	// ── admissions FAQ ──
	faq := make([]domain.SectionItem, 0, len(p.faqs))
	for i, f := range p.faqs {
		faq = append(faq, domain.SectionItem{ID: fmt.Sprintf("itm-%s-f%d", p.key, i+1), Label: f.q, Value: f.a})
	}
	secs = append(secs, domain.ProfileSection{ID: "sec-" + p.key + "-faq", Type: domain.SectionFAQ, Title: "Admissions", Tone: "teal", Items: faq})

	// ── fees ──
	fees := make([]domain.SectionItem, 0, len(p.fees))
	if len(p.fees) == 0 {
		fees = append(fees, domain.SectionItem{ID: "itm-" + p.key + "-fee1", Label: "Programme fees", Value: "See the admissions office", Detail: "Fees vary by programme and year of study; the admissions office publishes the current schedule each year."})
	} else {
		for i, f := range p.fees {
			fees = append(fees, domain.SectionItem{ID: fmt.Sprintf("itm-%s-fee%d", p.key, i+1), Label: f.label, Value: f.value, Detail: f.detail})
		}
	}
	secs = append(secs, domain.ProfileSection{ID: "sec-" + p.key + "-fees", Type: domain.SectionMenu, Title: p.feesTitle, Tone: "gold", Items: fees})

	// ── voices ──
	voices := make([]domain.SectionItem, 0, len(p.voices))
	for i, v := range p.voices {
		voices = append(voices, domain.SectionItem{ID: fmt.Sprintf("itm-%s-v%d", p.key, i+1), Value: v.quote, Label: v.who, Detail: v.detail})
	}
	secs = append(secs, domain.ProfileSection{ID: "sec-" + p.key + "-testim", Type: domain.SectionTestim, Title: "In their words", Tone: "clay", Items: voices})

	secs = append(secs,
		domain.ProfileSection{ID: "sec-" + p.key + "-divider", Type: domain.SectionDivider, Tone: "gold"},
		domain.ProfileSection{ID: "sec-" + p.key + "-contact", Type: domain.SectionContact, Title: "Visit & contact", Tone: "teal", Body: p.address, Items: []domain.SectionItem{
			{ID: "itm-" + p.key + "-c1", Label: "Office hours", Value: "Mon–Fri, 8:00–17:00"},
			{ID: "itm-" + p.key + "-c2", Label: "Phone", Value: p.phone, URL: tel},
			{ID: "itm-" + p.key + "-c3", Label: "Email", Value: email, URL: mailto},
		}},
		domain.ProfileSection{ID: "sec-" + p.key + "-find", Type: domain.SectionMap, Title: "Find us", Tone: "teal", Body: p.address},
	)
	return secs
}

// ── leadership rosters ───────────────────────────────────────────────────────
// Offices were inline in the org literals; they live here now so both the
// Organization.Offices field and the generated "Leadership" section draw from
// one source. Named holders are unchanged from the original literals; schools
// without a named holder use the "(office)" placeholder convention.

var (
	adisadelOffices     = []domain.Office{{ID: "o-adi-head", Role: "Headmaster", HolderName: "Rev. S. Quaye", Verified: true}}
	wesleyGirlsOffices  = []domain.Office{{ID: "o-wghs-head", Role: "Headmistress", HolderName: "Mrs. A. Ofosu", Verified: true}}
	stAugustinesOffices = []domain.Office{{ID: "o-aug-head", Role: "Headmaster", HolderName: "Mr. P. Mensah", Verified: true}}
	holyChildOffices    = []domain.Office{{ID: "o-hc-head", Role: "Headmistress", HolderName: "Mrs. G. Esson", Verified: true}}
	uccOffices          = []domain.Office{{ID: "o-ucc-vc", Role: "Vice-Chancellor", HolderName: "Prof. (office)", Verified: true}}
	bakaanoOffices      = []domain.Office{{ID: "o-bak-head", Role: "Headteacher", HolderID: memberAidoo, HolderName: "Mr. Samuel Aidoo", Verified: true}, {ID: "o-bak-asst", Role: "Assistant Head", HolderName: "Mrs. Grace Otoo", Verified: true}, {ID: "o-bak-pta", Role: "PTA Chairperson", HolderID: memberNana, HolderName: "Nana Kweku Essien", Verified: true}}

	ghanaNationalOffices = []domain.Office{{ID: "o-gnc-head", Role: "Headmaster", HolderName: officePlaceholder, Verified: true}}
	aggreyOffices        = []domain.Office{{ID: "o-agm-head", Role: "Headmaster", HolderName: officePlaceholder, Verified: true}}
	ostechOffices        = []domain.Office{{ID: "o-ost-head", Role: "Headmaster", HolderName: officePlaceholder, Verified: true}}
	christKingOffices    = []domain.Office{{ID: "o-ack-head", Role: "Headmaster", HolderName: officePlaceholder, Verified: true}}
	cctuOffices          = []domain.Office{{ID: "o-cctu-vc", Role: "Vice-Chancellor", HolderName: officePlaceholder, Verified: true}}
	olaOffices           = []domain.Office{{ID: "o-ola-prin", Role: "Principal", HolderName: officePlaceholder, Verified: true}}
	deafBlindOffices     = []domain.Office{{ID: "o-ccdb-head", Role: "Headteacher", HolderName: officePlaceholder, Verified: true}}
	philipQuaqueOffices  = []domain.Office{{ID: "o-pqb-head", Role: "Headteacher", HolderName: officePlaceholder, Verified: true}}
	stMonicasOffices     = []domain.Office{{ID: "o-stm-head", Role: "Headteacher", HolderName: officePlaceholder, Verified: true}}
	ccnmtcOffices        = []domain.Office{{ID: "o-ccnm-prin", Role: "Principal", HolderName: officePlaceholder, Verified: true}}
)

// ── the school pages ─────────────────────────────────────────────────────────

var adisadelPage = schoolPage{
	key: "adi", slug: "adisadel", level: levelSHS,
	name: "Adisadel College", motto: "Vel primus vel cum primis — Either the first or with the first",
	founded: 1910, classification: "Senior High (Anglican, boys)", population: "2,000+",
	groupsTitle: "Houses", groupsNoun: subtitleBoardingHouse,
	story: "**Adisadel College** was founded on **4 January 1910** as the SPG Grammar School. It became St. Nicholas' College in 1924 — hence the old boys' name, the **Santaclausians** — and took the name Adisadel when it moved to its hilltop site around 1936.\n\n*Vel primus vel cum primis* — Either the first or with the first. From the hill above the town, the black and white have contested the oldest school rivalry in Ghana, the annual meeting with Mfantsipim that the whole coast stops to watch.",
	milestones: []schoolMilestone{
		{label: "1910", value: "Founded", detail: "Opened as the SPG Grammar School of the Anglican mission."},
		{label: "1924", value: "St. Nicholas' College", detail: "Renamed for St. Nicholas — the root of the Santaclausian name."},
		{label: "c. 1936", value: "The hilltop", detail: "Moved to the Adisadel hill and took the name the coast knows today."},
	},
	groups: []schoolGroup{
		{id: "aglionby", name: "Aglionby", color: colorCrimson, colourName: "Red", summary: "Named for a pioneering Anglican bishop of Accra."},
		{id: "canterbury", name: "Canterbury", color: colorRoyalBlue, colourName: "Blue", summary: "Named for the mother see of the Anglican Communion."},
		{id: "hamlyn", name: "Hamlyn", color: colorLeafGreen, colourName: "Green", summary: "Honours Bishop Hamlyn, a founding figure of the school."},
		{id: "knight", name: "Knight", color: colorBrass, colourName: "Gold", summary: "One of the school's senior houses."},
	},
	faqs: []schoolFAQ{
		{q: "How are students admitted?", a: "Through the CSSPS placement after the BECE — choose Adisadel among your school choices."},
		{q: "Is the school boarding or day?", a: "Both. Boarders live in the school's houses on the hill; day students commute from the town."},
		{q: "What programmes are offered?", a: "General Science, General Arts, Business and Visual Arts."},
		{q: "How do I get a prospectus?", a: "From the school office during working hours, or write to the admissions desk."},
	},
	feesTitle: "Indicative school fees (per term)",
	fees: []schoolFee{
		{label: "Boarding", value: "₵1,900", detail: "Tuition, lodging and three meals daily. Indicative — confirm with the school office."},
		{label: "Day", value: "₵1,150", detail: "Tuition and lunch. Indicative figure."},
		{label: "Admission (one-off)", value: "₵450"},
	},
	voices: []schoolVoice{
		{quote: "On the hill you learn to be either the first or with the first — and you never forget it.", who: "An old boy", detail: "Santaclausians"},
		{quote: "The Zebra spirit is a brotherhood for life.", who: "An old boy", detail: "Class of 2012"},
	},
	address:    "Adisadel College, Adisadel Estate, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0114",
	facilities: [4]string{"The school chapel", "Science laboratories", "The library", "The sports field"},
}

var wesleyGirlsPage = schoolPage{
	key: "wg", slug: schoolWesleyGirls, level: levelSHS,
	name: "Wesley Girls' High School", motto: "Live Pure, Speak True, Right Wrong, Follow the King",
	founded: 1836, classification: "Senior High (Methodist, girls)", population: "2,000+",
	groupsTitle: "Houses", groupsNoun: subtitleBoardingHouse,
	story: "**Wesley Girls' High School** — affectionately **Wey Gey Hey** — traces its roots to **1836**, when Harriet Wrigley opened a school for girls at Cape Coast, among the earliest girls' schools on the Gold Coast. Reorganised into the modern secondary school around 1954, it has been a by-word for poise and excellence ever since.\n\n*Live Pure, Speak True, Right Wrong, Follow the King.* Generations of old girls, organised in the Wey Gey Hey OGA, carry the green and gold into every profession in Ghana and beyond.",
	milestones: []schoolMilestone{
		{label: "1836", value: "Founded", detail: "Harriet Wrigley opens a school for girls at Cape Coast."},
		{label: "c. 1954", value: "The modern school", detail: "Reorganised into today's senior high school."},
		{label: "Today", value: "A by-word for excellence", detail: "One of Ghana's most decorated girls' schools."},
	},
	groups: []schoolGroup{
		{id: "wrigley", name: "Wrigley", color: colorGreen, colourName: "Green", summary: "Named for Harriet Wrigley, the school's founder."},
		{id: "freeman", name: "Freeman", color: colorBrass, colourName: "Gold", summary: "Honours the Methodist missionary Thomas Birch Freeman."},
		{id: "compton", name: "Compton", color: colorCrimson, colourName: "Red", summary: "One of the school's senior houses."},
		{id: "platt", name: "Platt", color: colorRoyalBlue, colourName: "Blue", summary: "One of the school's senior houses."},
	},
	faqs: []schoolFAQ{
		{q: "How are students admitted?", a: "Through the CSSPS placement after the BECE — choose Wesley Girls' among your school choices."},
		{q: "Is the school boarding or day?", a: "Both, with most students boarding in the school's houses."},
		{q: "What programmes are offered?", a: "General Science, General Arts, Business, Home Economics and Visual Arts."},
		{q: "How do I get a prospectus?", a: "From the school office during working hours, or write to the admissions desk."},
	},
	feesTitle: "Indicative school fees (per term)",
	fees: []schoolFee{
		{label: "Boarding", value: "₵1,850", detail: "Tuition, lodging and three meals daily. Indicative — confirm with the school office."},
		{label: "Day", value: "₵1,100", detail: "Tuition and lunch. Indicative figure."},
		{label: "Admission (one-off)", value: "₵450"},
	},
	voices: []schoolVoice{
		{quote: "Wey Gey Hey taught me that discipline and grace go together.", who: "An old girl", detail: "Wey Gey Hey OGA"},
		{quote: "On that hill I found my voice.", who: "An old girl", detail: "Class of 2014"},
	},
	address:    "Wesley Girls' High School, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0111",
	facilities: [4]string{"The school chapel", "The library", "The ICT laboratory", "The dormitories"},
}

var stAugustinesPage = schoolPage{
	key: "aug", slug: "st-augustines", level: levelSHS,
	name: "St. Augustine's College", motto: "Omnia Vincit Labor — Perseverance conquers all",
	founded: 1930, classification: "Senior High (Catholic, boys)", population: "1,800+",
	groupsTitle: "Houses", groupsNoun: subtitleBoardingHouse,
	story: "**St. Augustine's College** — **Augusco** — was founded in **1930** by Irish Augustinian missionaries, and the school's green and white still honour the Irish flag of its founding fathers. A Catholic boys' school in the Archdiocese of Cape Coast, it has grown into one of the leading second-cycle institutions of the Central Region.\n\n*Omnia Vincit Labor* — Perseverance conquers all. The old boys of **APSU** speak of the Augusco brotherhood as a bond for life.",
	milestones: []schoolMilestone{
		{label: "1930", value: "Founded", detail: "Opened by the Irish Augustinian mission."},
		{label: "1930s", value: "Green and white", detail: "The colours of the Irish flag become the school's own."},
		{label: "Today", value: "APSU", detail: "A leading Catholic boys' school with a nationwide old-students' union."},
	},
	groups: []schoolGroup{
		{id: "patrick", name: "St. Patrick", color: colorLeafGreen, colourName: "Green", summary: "Named for the patron of the Irish mission."},
		{id: "joseph", name: "St. Joseph", color: colorRoyalBlue, colourName: "Blue", summary: "One of the school's senior houses."},
		{id: "francis", name: "St. Francis", color: colorBrass, colourName: "Gold", summary: "One of the school's senior houses."},
		{id: "michael", name: "St. Michael", color: colorCrimson, colourName: "Red", summary: "One of the school's senior houses."},
	},
	faqs: []schoolFAQ{
		{q: "How are students admitted?", a: "Through the CSSPS placement after the BECE — choose St. Augustine's among your school choices."},
		{q: "Is the school boarding or day?", a: "Both. Boarders live in the school's houses; day students come in from the town."},
		{q: "What programmes are offered?", a: "General Science, General Arts, Business, Agricultural Science and Visual Arts."},
		{q: "How do I get a prospectus?", a: "From the school office during working hours, or write to the admissions desk."},
	},
	feesTitle: "Indicative school fees (per term)",
	fees: []schoolFee{
		{label: "Boarding", value: "₵1,800", detail: "Tuition, lodging and three meals daily. Indicative — confirm with the school office."},
		{label: "Day", value: "₵1,100", detail: "Tuition and lunch. Indicative figure."},
		{label: "Admission (one-off)", value: "₵450"},
	},
	voices: []schoolVoice{
		{quote: "Augusco taught me that perseverance really does conquer all.", who: "An old boy", detail: "APSU"},
		{quote: "The green and white is family.", who: "An old boy", detail: "Class of 2009"},
	},
	address:    "St. Augustine's College, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0115",
	facilities: [4]string{"The school chapel", "The library", "The assembly hall", "The dormitories"},
}

var holyChildPage = schoolPage{
	key: "hc", slug: schoolHolyChild, level: levelSHS,
	name: "Holy Child School", motto: "Facta Non Verba — Actions Not Words",
	founded: 1946, classification: "Senior High (Catholic, girls)", population: "1,500+",
	groupsTitle: "Houses", groupsNoun: subtitleBoardingHouse,
	story: "**Holy Child School** was founded in **1946** by the Society of the Holy Child Jesus, and has been known with affection as **Angel's Hill** ever since. From its ridge above Cape Coast it has schooled generations of Ghanaian women in the Catholic tradition of its founding sisters.\n\n*Facta Non Verba* — Actions Not Words — is the standard the school sets. Old girls of **HOPSA** remember the hill for its discipline, its choir, and the lifelong sisterhood it forms.",
	milestones: []schoolMilestone{
		{label: "1946", value: "Founded", detail: "Opened by the Society of the Holy Child Jesus."},
		{label: "2021", value: "Seventy-five years", detail: "Angel's Hill marked its diamond jubilee."},
		{label: "Today", value: "HOPSA", detail: "A leading Catholic girls' school with a devoted old-students' network."},
	},
	groups: []schoolGroup{
		{id: "therese", name: "St. Therese", color: colorBrass, colourName: "Gold", summary: "Named for the Little Flower of the Carmel."},
		{id: "joan", name: "St. Joan", color: colorCrimson, colourName: "Red", summary: "One of the school's senior houses."},
		{id: "agnes", name: "St. Agnes", color: colorRoyalBlue, colourName: "Blue", summary: "One of the school's senior houses."},
		{id: "cecilia", name: "St. Cecilia", color: colorLeafGreen, colourName: "Green", summary: "Named for the patron saint of music."},
	},
	faqs: []schoolFAQ{
		{q: "How are students admitted?", a: "Through the CSSPS placement after the BECE — choose Holy Child among your school choices."},
		{q: "Is the school boarding or day?", a: "Both, with most students boarding on Angel's Hill."},
		{q: "What programmes are offered?", a: "General Science, General Arts, Business, Home Economics and Visual Arts."},
		{q: "How do I get a prospectus?", a: "From the school office during working hours, or write to the admissions desk."},
	},
	feesTitle: "Indicative school fees (per term)",
	fees: []schoolFee{
		{label: "Boarding", value: "₵1,800", detail: "Tuition, lodging and three meals daily. Indicative — confirm with the school office."},
		{label: "Day", value: "₵1,100", detail: "Tuition and lunch. Indicative figure."},
		{label: "Admission (one-off)", value: "₵450"},
	},
	voices: []schoolVoice{
		{quote: "Angel's Hill raised me. Facta non verba is how I try to live.", who: "An old girl", detail: "HOPSA"},
	},
	address:    "Holy Child School, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0112",
	facilities: [4]string{"The school chapel", "The library", "The ICT laboratory", "The dining hall"},
}

var ghanaNationalPage = schoolPage{
	key: "gnc", slug: "ghana-national-college", level: levelSHS,
	name: "Ghana National College", motto: "Pro Patria",
	founded: 1948, classification: "Senior High (co-ed, public)", population: "2,500+",
	groupsTitle: "Houses", groupsNoun: subtitleBoardingHouse,
	story: "**Ghana National College** was founded in **1948** by Dr. Kwame Nkrumah to school the students expelled from the mission colleges for backing the independence struggle. It is fondly remembered as **Osagyefo's own school**.\n\n*Pro Patria* — For the Fatherland. From those beginnings the college grew into one of the coast's great co-educational schools, and its past students, the **Nananom**, remain among the proudest alumni bodies in Ghana.",
	milestones: []schoolMilestone{
		{label: "1948", value: "Founded", detail: "Opened by Dr. Kwame Nkrumah for the students expelled over the independence struggle."},
		{label: "1957", value: "Independence", detail: "The school comes of age with the nation it was named for."},
		{label: "Today", value: "Nananom", detail: "A leading co-educational school with a proud past-students' body."},
	},
	groups: []schoolGroup{
		{id: "nkrumah", name: "Nkrumah", color: colorCrimson, colourName: "Red", summary: "Named for the school's founder, Dr. Kwame Nkrumah."},
		{id: "gbedemah", name: "Gbedemah", color: colorCobalt, colourName: "Blue", summary: "Named for a hero of the independence era."},
		{id: "sarbah", name: "Mensah Sarbah", color: colorLeafGreen, colourName: "Green", summary: "Named for a hero of the independence era."},
		{id: "casely", name: "Casely-Hayford", color: colorBrass, colourName: "Gold", summary: "Named for a hero of the independence era."},
	},
	faqs: []schoolFAQ{
		{q: "How are students admitted?", a: "Through the CSSPS placement after the BECE — choose Ghana National among your school choices."},
		{q: "Is the school boarding or day?", a: "Both. The school is co-educational with boarding houses on campus."},
		{q: "What programmes are offered?", a: "General Science, General Arts, Business, Home Economics and Visual Arts."},
		{q: "How do I get a prospectus?", a: "From the school office during working hours, or write to the admissions desk."},
	},
	feesTitle: "Indicative school fees (per term)",
	fees: []schoolFee{
		{label: "Boarding", value: "₵1,700", detail: "Tuition, lodging and three meals daily. Indicative — confirm with the school office."},
		{label: "Day", value: "₵1,050", detail: "Tuition and lunch. Indicative figure."},
		{label: "Admission (one-off)", value: "₵400"},
	},
	voices: []schoolVoice{
		{quote: "Pro Patria is not just a motto — Osagyefo's school teaches you to serve.", who: "A past student", detail: "Nananom"},
	},
	address:    "Ghana National College, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0117",
	facilities: [4]string{"The library", "Science laboratories", "The assembly hall", "The dormitories"},
}

var aggreyPage = schoolPage{
	key: "agm", slug: "aggrey-memorial-ame-zion-shs", level: levelSHS,
	name: "Aggrey Memorial A.M.E. Zion Senior High School", motto: "Semper Optimo Nitere",
	founded: 1940, classification: "Senior High (co-ed, public, A.M.E. Zion)", population: "1,500+",
	groupsTitle: "Houses", groupsNoun: subtitleBoardingHouse,
	story: "**Aggrey Memorial A.M.E. Zion Senior High School** opened in **1940** to honour the scholar-educator **Dr. James Kwegyir Aggrey**, and was later administered by the A.M.E. Zion Church. It is among Cape Coast's earliest co-educational schools.\n\n*Semper Optimo Nitere* — Always strive for the best. The school carries Aggrey's own conviction that only the best is good enough for Africa's children.",
	milestones: []schoolMilestone{
		{label: "1940", value: "Opened", detail: "Founded in honour of Dr. James Kwegyir Aggrey."},
		{label: "Later", value: "The A.M.E. Zion era", detail: "The school comes under the care of the A.M.E. Zion Church."},
		{label: "Today", value: "Co-ed from the start", detail: "One of the coast's oldest co-educational senior high schools."},
	},
	groups: []schoolGroup{
		{id: "aggrey", name: "Aggrey", color: colorMaroon, colourName: "Maroon", summary: "Named for Dr. James Kwegyir Aggrey himself."},
		{id: "zion", name: "Zion", color: colorBrass, colourName: "Gold", summary: "Honours the A.M.E. Zion Church, the school's steward."},
		{id: "ebenezer", name: "Ebenezer", color: colorRoyalBlue, colourName: "Blue", summary: "One of the school's senior houses."},
		{id: "pinanko", name: "Pinanko", color: colorLeafGreen, colourName: "Green", summary: "Named for the school's own neighbourhood of Cape Coast."},
	},
	faqs: []schoolFAQ{
		{q: "How are students admitted?", a: "Through the CSSPS placement after the BECE — choose Aggrey Memorial among your school choices."},
		{q: "Is the school boarding or day?", a: "Both. The school is co-educational with boarding facilities."},
		{q: "What programmes are offered?", a: "General Science, General Arts, Business, Home Economics and Visual Arts."},
		{q: "How do I get a prospectus?", a: "From the school office during working hours, or write to the admissions desk."},
	},
	feesTitle: "Indicative school fees (per term)",
	fees: []schoolFee{
		{label: "Boarding", value: "₵1,650", detail: "Tuition, lodging and three meals daily. Indicative — confirm with the school office."},
		{label: "Day", value: "₵1,000", detail: "Tuition and lunch. Indicative figure."},
		{label: "Admission (one-off)", value: "₵400"},
	},
	voices: []schoolVoice{
		{quote: "Aggrey taught us that only the best is good enough for Africa.", who: "A past student", detail: "Aggrey Memorial OSA"},
	},
	address:    "Aggrey Memorial A.M.E. Zion Senior High School, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0118",
	facilities: [4]string{"The assembly hall", "The library", "The ICT laboratory", "The sports field"},
}

var ostechPage = schoolPage{
	key: "ost", slug: "oguaa-senior-high-technical", level: levelSHS,
	name: "Oguaa Senior High Technical School", motto: "",
	founded: 1991, classification: "Technical/Vocational Senior High (co-ed, public)", population: "1,200+",
	groupsTitle: "Houses", groupsNoun: subtitleBoardingHouse,
	story: "**Oguaa Senior High Technical School** — **OSTECH** — was begun in **1991** and relocated to its home at **Ekon** in 1997. It blends technical and academic streams for the town's young people: the building, electrical and automotive trades alongside general science, business and home economics.\n\nA public technical school of the metropolis, OSTECH exists so that the young people of Oguaa can leave school with both a certificate and a craft.",
	milestones: []schoolMilestone{
		{label: "1991", value: "Begun", detail: "Opened as the town's public technical second-cycle school."},
		{label: "1997", value: "Home at Ekon", detail: "Relocated to its permanent site at Ekon."},
		{label: "Today", value: "Certificate and craft", detail: "Technical and academic streams under one roof."},
	},
	groups: []schoolGroup{
		{id: "ekon", name: "Ekon", color: colorTeal, colourName: "Teal", summary: "Named for the school's home at Ekon."},
		{id: "tantri", name: "Tantri", color: colorBrass, colourName: "Gold", summary: "Named for one of Oguaa's old quarters."},
		{id: "abura", name: "Abura", color: colorRoyalBlue, colourName: "Blue", summary: "Named for one of Oguaa's old quarters."},
		{id: "amanful", name: "Amanful", color: colorMaroon, colourName: "Maroon", summary: "Named for one of Oguaa's old quarters."},
	},
	faqs: []schoolFAQ{
		{q: "How are students admitted?", a: "Through the CSSPS placement after the BECE — choose OSTECH among your school choices."},
		{q: "What programmes are offered?", a: "Technical trades — building, electrical, automotive — alongside General Science, Business and Home Economics."},
		{q: "Is the school boarding or day?", a: "Both, with boarding facilities on the Ekon campus."},
		{q: "How do I get a prospectus?", a: "From the school office during working hours, or write to the admissions desk."},
	},
	feesTitle: "Indicative school fees (per term)",
	fees: []schoolFee{
		{label: "Boarding", value: "₵1,600", detail: "Tuition, lodging and three meals daily. Indicative — confirm with the school office."},
		{label: "Day", value: "₵950", detail: "Tuition and lunch. Indicative figure."},
		{label: "Admission (one-off)", value: "₵400"},
	},
	voices: []schoolVoice{
		{quote: "OSTECH gave me a trade and a certificate — I left ready to work.", who: "A past student", detail: "OSTECH OSA"},
	},
	address:    "Oguaa Senior High Technical School, Ekon, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0119",
	facilities: [4]string{"The technical workshops", "The ICT laboratory", "The library", "The sports field"},
}

var christKingPage = schoolPage{
	key: "ack", slug: "academy-of-christ-the-king", level: levelSHS,
	name: "Academy of Christ the King Senior High School", motto: "",
	founded: 1976, classification: "Senior High (co-ed, public, Anglican)", population: "1,000+",
	groupsTitle: "Houses", groupsNoun: subtitleBoardingHouse,
	story: "The **Academy of Christ the King Senior High School** was established in **1976** by the Mothers' Union of the Anglican Church, and has grown into one of the metropolis's well-regarded co-educational senior high schools.\n\nFounded in faith and open to all, the Academy pairs Anglican devotion with a broad second-cycle curriculum, and its old students, **ACKOSA**, keep the blue and white flying.",
	milestones: []schoolMilestone{
		{label: "1976", value: "Established", detail: "Founded by the Mothers' Union of the Anglican Church."},
		{label: "Today", value: "ACKOSA", detail: "A well-regarded co-educational school with an active old-students' association."},
	},
	groups: []schoolGroup{
		{id: "mary", name: "St. Mary", color: colorRoyalBlue, colourName: "Blue", summary: "Honours the Mothers' Union, the school's founders."},
		{id: "john", name: "St. John", color: colorLeafGreen, colourName: "Green", summary: "One of the school's senior houses."},
		{id: "paul", name: "St. Paul", color: colorCrimson, colourName: "Red", summary: "One of the school's senior houses."},
		{id: "peter", name: "St. Peter", color: colorBrass, colourName: "Gold", summary: "One of the school's senior houses."},
	},
	faqs: []schoolFAQ{
		{q: "How are students admitted?", a: "Through the CSSPS placement after the BECE — choose the Academy among your school choices."},
		{q: "Is the school boarding or day?", a: "Both. The school is co-educational with boarding facilities."},
		{q: "What programmes are offered?", a: "General Science, General Arts, Business, Home Economics and Visual Arts."},
		{q: "How do I get a prospectus?", a: "From the school office during working hours, or write to the admissions desk."},
	},
	feesTitle: "Indicative school fees (per term)",
	fees: []schoolFee{
		{label: "Boarding", value: "₵1,600", detail: "Tuition, lodging and three meals daily. Indicative — confirm with the school office."},
		{label: "Day", value: "₵1,000", detail: "Tuition and lunch. Indicative figure."},
		{label: "Admission (one-off)", value: "₵400"},
	},
	voices: []schoolVoice{
		{quote: "The Academy gave us faith, books and a family.", who: "A past student", detail: "ACKOSA"},
	},
	address:    "Academy of Christ the King Senior High School, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0120",
	facilities: [4]string{"The school chapel", "The library", "Science laboratories", "The dormitories"},
}

var uccPage = schoolPage{
	key: "ucc", slug: "ucc", level: levelTertiary,
	name: "University of Cape Coast", motto: "Veritas Nobis Lumen — Truth, Our Guide",
	founded: 1962, classification: "Public university", population: "80,000+",
	groupsTitle: "Colleges", groupsNoun: "College",
	story: "The **University of Cape Coast** opened in **October 1962** as a university college, charged with training the graduate teachers a young nation needed, and attained full, independent university status on **1 October 1971**.\n\n*Veritas Nobis Lumen* — Truth, Our Guide. Today UCC is one of Ghana's leading universities, its campus spread between the old town and Amamoma, and its Department of Music and Dance — established in 1975 — keeps the Oguaa cultural pipeline flowing. Generations of the coast's teachers, nurses, lawyers and artists have passed through its lecture halls.",
	milestones: []schoolMilestone{
		{label: "1962", value: "Opened", detail: "Admitted its first students as a university college."},
		{label: "1971", value: "Full university status", detail: "Became an independent university on 1 October 1971."},
		{label: "1975", value: "Music and Dance", detail: "The Department of Music and Dance is established."},
	},
	groups: []schoolGroup{
		{id: "humanities", name: "College of Humanities and Legal Studies", summary: "Arts, social sciences, education and the law school."},
		{id: "education", name: "College of Education Studies", summary: "The teacher-training heart the university was founded on."},
		{id: "health", name: "College of Health and Allied Sciences", summary: "Medicine, nursing and the allied health professions."},
		{id: "agric", name: "College of Agriculture and Natural Sciences", summary: "Agriculture, the biological and physical sciences."},
	},
	faqs: []schoolFAQ{
		{q: "How do I apply?", a: "Buy an application voucher and apply online through the university's admissions portal; entry is on WASSCE/SSSCE results."},
		{q: "What are the entry requirements?", a: "WASSCE passes including English Language, Mathematics and the relevant electives for your programme; cut-off aggregates vary by programme."},
		{q: "Are mature applicants considered?", a: "Yes — the university runs a mature entrance examination each admissions cycle."},
		{q: "Is accommodation available?", a: "Hall places are limited; many students live in private hostels around Amamoma and the old site."},
	},
	feesTitle: "Programme fees",
	fees:      nil,
	voices: []schoolVoice{
		{quote: "UCC made me a teacher, and the coast made me a person.", who: "An alumna", detail: "UCC Alumni"},
		{quote: "Truth is our guide — it says so on the crest, and the place means it.", who: "An alumnus", detail: "Class of 2015"},
	},
	address:    "University of Cape Coast, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0116",
	facilities: [4]string{"Sam Jonah Library", "The lecture theatres", "The science complex", "The sports stadium"},
}

var cctuPage = schoolPage{
	key: "cctu", slug: "cape-coast-technical-university", level: levelTertiary,
	name: "Cape Coast Technical University", motto: "",
	founded: 1984, classification: "Technical University (public)", population: "15,000+",
	groupsTitle: "Faculties", groupsNoun: "Faculty",
	story: "**Cape Coast Technical University** was founded in **1984** as Cape Coast Polytechnic and elevated to a technical university in **2016**. It trains the engineers, technicians and applied-science professionals of the Central Region and beyond.\n\nFrom its workshops and laboratories, CCTU keeps the polytechnic promise: learning by doing, in the service of industry and community.",
	milestones: []schoolMilestone{
		{label: "1984", value: "Founded", detail: "Opened as Cape Coast Polytechnic."},
		{label: "2016", value: "Technical university", detail: "Elevated to full technical-university status."},
		{label: "Today", value: "Applied learning", detail: "Engineering, applied science and business programmes for the region."},
	},
	groups: []schoolGroup{
		{id: "engineering", name: "Faculty of Engineering and Technology", summary: "Civil, electrical and mechanical engineering technology."},
		{id: "applied-science", name: "Faculty of Applied Sciences", summary: "Laboratory technology, statistics and the applied sciences."},
		{id: "business", name: "Faculty of Business and Management Studies", summary: "Accounting, marketing, procurement and management."},
		{id: "built-environment", name: "Faculty of Built and Natural Environment", summary: "Building technology and the natural environment."},
	},
	faqs: []schoolFAQ{
		{q: "How do I apply?", a: "Apply online through the university's admissions portal; entry is on WASSCE/SSSCE results, with HND top-up routes for diploma holders."},
		{q: "What are the entry requirements?", a: "WASSCE passes including English Language, Mathematics and relevant science or business electives, depending on the programme."},
		{q: "Are there evening or weekend options?", a: "Selected programmes run on flexible schedules for working students — ask the admissions office."},
		{q: "Is accommodation available?", a: "Hostel places are limited; most students rent in the surrounding communities."},
	},
	feesTitle: "Programme fees",
	fees:      nil,
	voices: []schoolVoice{
		{quote: "At CCTU you build things with your hands before you graduate with your head.", who: "An alumnus", detail: "CCTU Alumni"},
	},
	address:    "Cape Coast Technical University, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0121",
	facilities: [4]string{"The engineering workshops", "The ICT laboratories", "The university library", "The lecture theatres"},
}

var olaPage = schoolPage{
	key: "ola", slug: "ola-college-of-education", level: levelTertiary,
	name: "OLA College of Education", motto: "",
	founded: 1924, classification: "College of Education (women, Catholic; UCC-affiliated)", population: "2,000+",
	groupsTitle: "Programmes", groupsNoun: "Programme",
	story: "**OLA College of Education** was established in **1924** by the Missionary Sisters of Our Lady of Apostles — the **first women's teacher-training college in Ghana and sub-Saharan Africa**. It marked its centenary in 2024.\n\nFor a hundred years OLA has formed the women who teach the nation's children, today awarding degrees in affiliation with the University of Cape Coast. To be an OLA woman is to belong to the oldest sisterhood of teachers in the country.",
	milestones: []schoolMilestone{
		{label: "1924", value: "Established", detail: "Opened by the Missionary Sisters of Our Lady of Apostles — the first women's teacher college in Ghana and sub-Saharan Africa."},
		{label: "2024", value: "Centenary", detail: "One hundred years of forming the nation's teachers."},
		{label: "Today", value: "UCC-affiliated", detail: "Awarding Bachelor of Education degrees with the University of Cape Coast."},
	},
	groups: []schoolGroup{
		{id: "early-grade", name: "B.Ed. Early Grade Education", summary: "A four-year degree awarded in affiliation with the University of Cape Coast."},
		{id: "primary", name: "B.Ed. Primary Education", summary: "A four-year degree awarded in affiliation with the University of Cape Coast."},
		{id: "jhs", name: "B.Ed. Junior High School Education", summary: "A four-year degree awarded in affiliation with the University of Cape Coast."},
	},
	faqs: []schoolFAQ{
		{q: "How do I apply?", a: "Apply through the national colleges-of-education admissions portal; entry is on WASSCE/SSSCE results."},
		{q: "What are the entry requirements?", a: "WASSCE passes including English Language and Mathematics, within the published cut-off aggregate."},
		{q: "Is the college residential?", a: "Yes — students live in the college hostels on campus."},
		{q: "Is it only for women?", a: "OLA is a women's college in the Catholic tradition of its founding sisters."},
	},
	feesTitle: "Programme fees",
	fees:      nil,
	voices: []schoolVoice{
		{quote: "A hundred years of OLA women teaching Ghana — I am proud to be one of them.", who: "An alumna", detail: "Old OLA Girls"},
	},
	address:    "OLA College of Education, OLA Estate, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0122",
	facilities: [4]string{"The college library", "The science resource centre", "The assembly hall", "The hostels"},
}

var ccnmtcPage = schoolPage{
	key: "ccnm", slug: "cape-coast-nursing-midwifery-training-college", level: levelTertiary,
	name: "Cape Coast Nursing & Midwifery Training College", motto: "",
	founded: 0, classification: "Public health-training college", population: "800+",
	groupsTitle: "Programmes", groupsNoun: "Programme",
	story: "The **Cape Coast Nursing and Midwifery Training College** is one of Ghana's older nursing-training institutions, supervised by the Ministry of Health and regulated by the Nursing and Midwifery Council.\n\nThe college runs a three-year diploma in nursing and midwifery, awarded in affiliation with the Kwame Nkrumah University of Science and Technology, and sends its graduates to staff the clinics and hospitals of the Central Region and the nation.",
	milestones: []schoolMilestone{
		{label: "Early years", value: "Among Ghana's oldest", detail: "Described as one of the country's oldest nursing-training institutions."},
		{label: "Affiliation", value: "KNUST-awarded diploma", detail: "Graduates earn a diploma awarded through the Kwame Nkrumah University of Science and Technology."},
		{label: "Today", value: "Regulated by the NMC", detail: "Curriculum and examinations under the Nursing and Midwifery Council."},
	},
	groups: []schoolGroup{
		{id: "nursing", name: "Registered General Nursing", summary: "A three-year diploma awarded in affiliation with KNUST; regulated by the Nursing and Midwifery Council."},
		{id: "midwifery", name: "Registered Midwifery", summary: "A three-year diploma awarded in affiliation with KNUST; regulated by the Nursing and Midwifery Council."},
	},
	faqs: []schoolFAQ{
		{q: "How do I apply?", a: "Apply through the Ministry of Health's training-institutions admissions portal; entry is on WASSCE/SSSCE results."},
		{q: "What are the entry requirements?", a: "WASSCE passes including English Language, Mathematics and Integrated Science, within the published cut-off aggregate."},
		{q: "How long is the programme?", a: "Three years, leading to a diploma awarded in affiliation with KNUST."},
		{q: "Is the college residential?", a: "Yes — students are accommodated in the college hostels."},
	},
	feesTitle: "Programme fees",
	fees:      nil,
	voices: []schoolVoice{
		{quote: "Three hard years here, and I walked out ready for any ward in the country.", who: "An alumna", detail: "CCNMTC graduate"},
	},
	address:    "Cape Coast Nursing & Midwifery Training College, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0126",
	facilities: [4]string{"The skills laboratory", "The college library", "The lecture halls", "The hostels"},
}

var bakaanoPage = schoolPage{
	key: "bak", slug: schoolBakaanoBasic, level: levelBasic,
	name: "Bakaano M/A Basic School", motto: "Knowledge and Service",
	founded: 1957, classification: "KG · Primary · JHS", population: "600+",
	groupsTitle: "Class levels", groupsNoun: "Class level",
	story: "**Bakaano M/A Basic School** has served the lagoon-side community of Bakaano since **1957**. A public school under the Ghana Education Service, it takes children from kindergarten through junior high, teaching in English and Fante.\n\nThe school is woven into the quarter it serves: fishermen's children, traders' children, all under one roof. An active PTA works hand in hand with the staff to keep the classrooms full and the children fed.",
	milestones: []schoolMilestone{
		{label: "1957", value: "Founded", detail: "Opened to serve the lagoon-side community of Bakaano."},
		{label: "1987", value: "Junior High", detail: "Reorganised under the education reforms that brought the JHS system."},
		{label: "Today", value: "Knowledge and Service", detail: "A GES public school in the Cape Coast Metropolitan Education Directorate."},
	},
	groups: []schoolGroup{
		{id: "kg", name: "Kindergarten", summary: "KG 1–2 — the first steps, in English and Fante."},
		{id: "primary", name: "Primary", summary: "Classes 1–6 — reading, writing, arithmetic and the culture of Oguaa."},
		{id: "jhs", name: "Junior High", summary: "JHS 1–3 — preparing pupils for the BECE and senior high school."},
	},
	faqs: []schoolFAQ{
		{q: "How do I enrol my child?", a: "Apply directly at the head teacher's office. The school is a GES public school serving Bakaano and the surrounding quarters."},
		{q: "What ages does the school take?", a: "Kindergarten from age four, through Primary to Junior High."},
		{q: "What languages are taught?", a: "English and Fante."},
		{q: "Is there a feeding programme?", a: "Yes — the school participates in the Ghana School Feeding Programme."},
	},
	feesTitle: "Indicative term levies",
	fees: []schoolFee{
		{label: "Feeding", value: "₵180", detail: "Per term, under the school feeding programme. Indicative — confirm with the office."},
		{label: "PTA levy", value: "₵120", detail: "Per term, agreed with the PTA."},
		{label: "Admission (one-off)", value: "₵100"},
	},
	voices: []schoolVoice{
		{quote: "My mother sat in these classrooms, and now my daughter does.", who: "A Bakaano parent", detail: "PTA member"},
	},
	address:    "Bakaano M/A Basic School, Bakaano, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0113",
	facilities: [4]string{"The classroom block", "The school library", "The ICT corner", "The playground"},
}

var philipQuaquePage = schoolPage{
	key: "pqb", slug: "philip-quaque-boys-school", level: levelBasic,
	name: "Philip Quaque Boys' School", motto: "Nyansa ahyese nye nyamesuro",
	founded: 1766, classification: "Basic (KG/Primary/JHS; Anglican-founded)", population: "800+",
	groupsTitle: "Class levels", groupsNoun: "Class level",
	story: "**Philip Quaque Boys' School** was founded beside Cape Coast Castle in **1766** by the Rev. **Philip Quaque**, the first African ordained a priest in the Church of England. It is widely honoured as the **oldest formal European-style school in Ghana**.\n\nIts motto, *Nyansa ahyese nye nyamesuro* — the fear of God is the beginning of wisdom — has greeted pupils for over two and a half centuries. Today a public basic school, it still teaches the children of the old town within sight of the Castle where it began.",
	milestones: []schoolMilestone{
		{label: "1766", value: "Founded", detail: "Opened beside Cape Coast Castle by the Rev. Philip Quaque — the oldest formal school in Ghana."},
		{label: "2016", value: "250 years", detail: "Two and a half centuries of teaching the old town's children."},
		{label: "Today", value: "A public basic school", detail: "KG through JHS, under the Ghana Education Service."},
	},
	groups: []schoolGroup{
		{id: "kg", name: "Kindergarten", summary: "KG 1–2 — the first steps."},
		{id: "primary", name: "Primary", summary: "Classes 1–6 — the foundations of learning."},
		{id: "jhs", name: "Junior High", summary: "JHS 1–3 — preparing pupils for the BECE."},
	},
	faqs: []schoolFAQ{
		{q: "How do I enrol my child?", a: "Apply directly at the head teacher's office. The school is a GES public school serving the old town around the Castle."},
		{q: "What ages does the school take?", a: "Kindergarten from age four, through Primary to Junior High."},
		{q: "What languages are taught?", a: "English and Fante."},
		{q: "Is there a feeding programme?", a: "Yes — the school participates in the Ghana School Feeding Programme."},
	},
	feesTitle: "Indicative term levies",
	fees: []schoolFee{
		{label: "Feeding", value: "₵180", detail: "Per term, under the school feeding programme. Indicative — confirm with the office."},
		{label: "PTA levy", value: "₵120", detail: "Per term, agreed with the PTA."},
		{label: "Admission (one-off)", value: "₵100"},
	},
	voices: []schoolVoice{
		{quote: "To learn in Ghana's oldest classroom is to feel history looking over your shoulder.", who: "An old boy", detail: "Philip Quaque old students"},
	},
	address:    "Philip Quaque Boys' School, beside Cape Coast Castle, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0124",
	facilities: [4]string{"The classroom block", "The school library", "The assembly ground", "The playground"},
}

var stMonicasPage = schoolPage{
	key: "stm", slug: "st-monicas-basic-school-cape-coast", level: levelBasic,
	name: "St. Monica's Basic School, Cape Coast", motto: "Each for all and all for God",
	founded: 1926, classification: "Basic (KG/Primary/JHS; Anglican)", population: "600+",
	groupsTitle: "Class levels", groupsNoun: "Class level",
	story: "**St. Monica's Basic School** was established on **Aboom Road** in **1926** by the Anglican Sisters of the Order of the Holy Paraclete, as their first school on the Gold Coast.\n\n*Each for all and all for God.* For nearly a century St. Monica's has given the children of Cape Coast a disciplined, caring start, and the Union of Old St Monicans keeps its memory green.",
	milestones: []schoolMilestone{
		{label: "1926", value: "Established", detail: "Opened on Aboom Road by the Anglican Sisters of the Order of the Holy Paraclete — their first Gold Coast school."},
		{label: "Today", value: "Each for all", detail: "A public basic school in the Anglican tradition, serving Aboom and beyond."},
	},
	groups: []schoolGroup{
		{id: "kg", name: "Kindergarten", summary: "KG 1–2 — the first steps."},
		{id: "primary", name: "Primary", summary: "Classes 1–6 — the foundations of learning."},
		{id: "jhs", name: "Junior High", summary: "JHS 1–3 — preparing pupils for the BECE."},
	},
	faqs: []schoolFAQ{
		{q: "How do I enrol my child?", a: "Apply directly at the head teacher's office. The school is a GES public school on Aboom Road."},
		{q: "What ages does the school take?", a: "Kindergarten from age four, through Primary to Junior High."},
		{q: "What languages are taught?", a: "English and Fante."},
		{q: "Is there a feeding programme?", a: "Yes — the school participates in the Ghana School Feeding Programme."},
	},
	feesTitle: "Indicative term levies",
	fees: []schoolFee{
		{label: "Feeding", value: "₵180", detail: "Per term, under the school feeding programme. Indicative — confirm with the office."},
		{label: "PTA levy", value: "₵120", detail: "Per term, agreed with the PTA."},
		{label: "Admission (one-off)", value: "₵100"},
	},
	voices: []schoolVoice{
		{quote: "Each for all and all for God — St. Monica's taught us to look after one another.", who: "An old student", detail: "Union of Old St Monicans"},
	},
	address:    "St. Monica's Basic School, Aboom Road, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0125",
	facilities: [4]string{"The classroom block", "The school library", "The school chapel", "The playground"},
}

var deafBlindPage = schoolPage{
	key: "ccdb", slug: "cape-coast-school-for-the-deaf-and-blind", level: levelSpecial,
	name: "Cape Coast School for the Deaf and Blind", motto: "Disability is not Inability",
	founded: 1970, classification: "Special school (deaf & visually-impaired)", population: "300+",
	groupsTitle: "Units", groupsNoun: "Unit",
	story: "The **Cape Coast School for the Deaf and Blind** opened in **1970** with fifteen pupils on the Cape Coast–Takoradi highway, and grew into the region's government special school for deaf and, later, visually-impaired children.\n\n*Disability is not Inability.* With sign-language instruction, braille, mobility training and vocational skills, the school gives its children the tools to live full, independent lives — and the coast is proud of them.",
	milestones: []schoolMilestone{
		{label: "1970", value: "Opened", detail: "Started on the Cape Coast–Takoradi highway with fifteen pupils."},
		{label: "Later", value: "The blind unit", detail: "Visually-impaired children join the school's care."},
		{label: "Today", value: "Disability is not Inability", detail: "A government special school for the region's deaf and blind children."},
	},
	groups: []schoolGroup{
		{id: "deaf", name: "Deaf unit", summary: "Sign-language instruction across the basic-school curriculum."},
		{id: "blind", name: "Visually-impaired unit", summary: "Braille literacy and mobility training."},
		{id: "vocational", name: "Vocational training unit", summary: "Practical skills for independent living after school."},
	},
	faqs: []schoolFAQ{
		{q: "How are children admitted?", a: "By referral and assessment through the Special Education Division of the Ghana Education Service."},
		{q: "Is the school boarding?", a: "Yes — the children board with trained caregivers on campus."},
		{q: "What support is offered?", a: "Sign-language instruction, braille, mobility training and vocational skills."},
		{q: "What does it cost?", a: "The school is a government special school; modest boarding and feeding levies apply — ask the office."},
	},
	feesTitle: "Indicative term levies",
	fees: []schoolFee{
		{label: "Boarding and feeding", value: "₵600", detail: "Per term. Indicative — confirm with the school office."},
		{label: "PTA levy", value: "₵120", detail: "Per term, agreed with the PTA."},
	},
	voices: []schoolVoice{
		{quote: "Here my daughter was never a disability case — she was a child with a future.", who: "A parent", detail: "PTA member"},
	},
	address:    "Cape Coast School for the Deaf and Blind, Cape Coast–Takoradi highway, Cape Coast, Central Region, Ghana.",
	phone:      "+233 33 000 0123",
	facilities: [4]string{"The resource classrooms", "The vocational workshops", "The assembly hall", "The dormitories"},
}
