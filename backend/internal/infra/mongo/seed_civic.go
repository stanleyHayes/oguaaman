package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

// ── civic code seed (GET /api/civic) ──────────────────────────────────────────
// The town's code of behaviours, ringed from the self outward (self → home →
// school → work → town → nation), and the lessons drawn from civilizations that
// built great, orderly societies. Adapted from the yenara code for Oguaa (Cape
// Coast): the "town" ring carries the civic pledges of a World Heritage
// coastal town — its streets, its shore, Kotokuraba market, its queues and its
// nights. Read publicly; loaded by the seed only.

var seedCivicBehaviours = []domain.CivicBehaviour{
	// ── self ─────────────────────────────────────────────────────────────────
	{
		Slug: "wake-at-same-hour", Ring: "self", Type: "do",
		Title:       "Wake at the same hour, before the town stirs",
		Description: "Rise at one fixed time each morning — before the trotro horns and the market wake. A steady wake-time is the single habit every other habit hangs on.",
		Why:         "A body that keeps its own rhythm hands you back the first quiet hours of the day.",
	},
	{
		Slug: "read-off-screen", Ring: "self", Type: "do",
		Title:       "Read thirty minutes a day, off the screen",
		Description: "Hold a book, not a phone — history, scripture, a novel, the newspaper on paper. Cape Coast schooled the nation; keep reading, the town's oldest habit.",
		Why:         "The mind you feed with pages still thinks clearly long after the screen goes dark.",
	},
	{
		Slug: "save-monthly", Ring: "self", Type: "do",
		Title:       "Save something every month, even a few cedis",
		Description: "Put a little by each month — into susu, a bank, or a tin you don't open. GHS 20 a month kept ten years is capital, discipline, and the freedom to say no.",
		Why:         "Small savings are the line between weathering a bad season and being ruined by it.",
	},
	{
		Slug: "stop-scrolling", Ring: "self", Type: "stop",
		Title:       "Stop the endless scrolling",
		Description: "Your attention is the most valuable thing you own, and the apps are built to eat it by the hour. Put the phone down after nine, at meals, and when you are with people.",
		Why:         "The hours you scroll away are the same hours a skill or a friendship could have filled.",
	},
	{
		Slug: "stop-talking-down", Ring: "self", Type: "stop",
		Title:       "Stop talking down to yourself",
		Description: "The voice that calls you foolish or finished is not the truth — it is fear wearing your own voice. Speak to yourself as you would to a child of Oguaa you love.",
		Why:         "No one builds a business, a home or a life while quietly agreeing they cannot.",
	},

	// ── home ─────────────────────────────────────────────────────────────────
	{
		Slug: "greet-elders", Ring: "home", Type: "do",
		Title:       "Greet your elders when you enter a room",
		Description: "In Oguaa the first thing a child learns is not a fact but a relationship: \"Maakye,\" a slight bow, the right hand offered. Greet every elder in the room before you sit.",
		Why:         "A greeting is the smallest coin of respect, and a town that stops spending it grows cold.",
	},
	{
		Slug: "eat-one-meal-together", Ring: "home", Type: "do",
		Title:       "Eat one meal a day at the same table",
		Description: "Gather the household round one bowl of fufu or a shared plate, phones set aside, once a day. The talk over the food is where children learn how to be citizens.",
		Why:         "The table is the first classroom of belonging; skip it and a family become strangers under one roof.",
	},

	// ── school ───────────────────────────────────────────────────────────────
	{
		Slug: "arrive-on-time", Ring: "school", Type: "do",
		Title:       "Reach school by the time it begins — every day",
		Description: "Be on the compound before the bell, uniform right, before assembly starts. Of every habit a pupil can build, arriving on time predicts the most about the rest.",
		Why:         "Punctuality is respect you can measure, and the pupil who keeps time keeps their word too.",
	},
	{
		Slug: "clean-classroom", Ring: "school", Type: "do",
		Title:       "Sweep and tidy your own classroom",
		Description: "Pupils sweep, dust the louvres, wipe the board and clear the desks at day's end. You care for the room that teaches you; no one is too clever to hold a broom.",
		Why:         "A child who cleans the room they use becomes an adult who cares for the town they live in.",
	},
	{
		Slug: "stand-for-smaller", Ring: "school", Type: "do",
		Title:       "Stand for the smaller pupil being mocked",
		Description: "When a junior or a quiet one is teased or bullied, step in and stand beside them. It is the bravest civic act a child can learn, and the whole class watches who does.",
		Why:         "A town where the strong shield the small begins with one pupil who refused to laugh along.",
	},

	// ── work ─────────────────────────────────────────────────────────────────
	{
		Slug: "quote-fair-price", Ring: "work", Type: "do",
		Title:       "Quote a fair price the first time",
		Description: "Name the honest price once, and hold it. Tripling the figure so a customer can \"bring it down\" is not our culture — it is dishonesty dressed up as bargaining.",
		Why:         "A trader trusted for one straight price outlasts ten who haggle for a living.",
	},
	{
		Slug: "finish-what-you-started", Ring: "work", Type: "do",
		Title:       "Finish what you start — wo yɛ adwuma a, wie",
		Description: "If you take the job, complete it: the wall, the repair, the report, the roof. In Fante we say wo yɛ adwuma a, wie — if you do work, finish it. Start only what you mean to end.",
		Why:         "Your name becomes a byword for \"it will be done\" or \"it was never finished\" — you choose which.",
	},

	// ── nation ───────────────────────────────────────────────────────────────
	{
		Slug: "vote-local-assembly", Ring: "nation", Type: "do",
		Title:       "Vote — especially in the local and District Assembly elections",
		Description: "The presidential race takes the noise, but your Assembly Member and Unit Committee decide the gutter on your street, the market shed, the school block. Register and vote in every one.",
		Why:         "The elections you skip are the very ones that run the streets you walk each day.",
	},
	{
		Slug: "pay-taxes-tolls", Ring: "nation", Type: "do",
		Title:       "Pay your taxes and your market tolls",
		Description: "Pay the daily Kotokuraba toll, the property rate, the income tax — even when you doubt it is well spent. A town that collects honestly can be asked, honestly, to account.",
		Why:         "Roads, clinics and refuse trucks run on tolls paid; withhold them and you fund the very neglect you curse.",
	},

	// ── town (Cape-Coast civic pledges) ──────────────────────────────────────
	{
		Slug: "do-not-litter", Ring: "town", Type: "stop",
		Title:       "Do not litter the streets, the shore or Kotokuraba",
		Description: "No sachet, no bottle, no rubber dropped on Commercial Street, at the market gates, or on the beach below the Castle. Hold it till you reach a bin — the ground of Oguaa is not a dustbin.",
		Why:         "A World Heritage town buried in litter is a shame every visitor photographs and every resident breathes.",
	},
	{
		Slug: "do-not-spit", Ring: "town", Type: "stop",
		Title:       "Do not spit in public",
		Description: "Keep the pavements, the trotro and the market lanes clear of spit. It spreads sickness and it fouls the walk of everyone who comes after you.",
		Why:         "Disease and disrespect travel the same way — on ground the last person could not be bothered to keep clean.",
	},
	{
		Slug: "bag-and-sort-rubbish", Ring: "town", Type: "do",
		Title:       "Bag and sort your rubbish",
		Description: "Tie your waste in a bag, keep sachets and bottles apart from food waste, and hand it to the collection or the skip. Sorted rubbish is rubbish that can be cleared and reused.",
		Why:         "Waste that is bagged and sorted becomes someone's job to collect; waste that is scattered becomes everyone's flood.",
	},
	{
		Slug: "keep-gutters-clear", Ring: "town", Type: "do",
		Title:       "Keep the gutters and the beach clear",
		Description: "Never sweep sand, sachets or plastic into the open drains, and lend a hand on clean-up days along the gutters and the shore. A choked gutter is why Cape Coast floods when the rains come hard.",
		Why:         "The gutter you block in the dry season is the flood that enters your room in the wet one.",
	},
	{
		Slug: "queue-with-patience", Ring: "town", Type: "do",
		Title:       "Queue with patience at the bank and the trotro",
		Description: "Join the line and keep it — at the ATM, the bank, the lorry station, the clinic. No cutting in, no sending a small boy to hold your place. First to come is first to be served.",
		Why:         "An orderly queue is small daily proof that the town can be fair without anyone shouting.",
	},
	{
		Slug: "keep-noise-down", Ring: "town", Type: "stop",
		Title:       "Keep the noise down at night",
		Description: "Turn the speakers, the church PA, the drinking-spot amp and the car horn down after dark. Your neighbour, the pupil with an exam and the night-shift nurse all need the rest.",
		Why:         "One person's all-night bass is a whole street's stolen sleep.",
	},
	{
		Slug: "greet-strangers", Ring: "town", Type: "do",
		Title:       "Greet strangers as neighbours",
		Description: "Meet the newcomer, the trader, the tourist and the lost visitor with a greeting and a hand. Oguaa has welcomed the world at its shore for five centuries; keep that door open.",
		Why:         "A stranger greeted becomes a neighbour; a stranger ignored becomes the reason a town feels unsafe.",
	},
}

var seedCivicLessons = []domain.CivicLesson{
	{
		Slug: "kemet", Name: "Kemet (Ancient Egypt)", Era: "c. 3100 BCE – 30 BCE",
		Principle: "Maʿat — balance, truth and order — was the duty of every person from the farmer to the pharaoh, not the king's alone.",
		Lesson:    "Keeping Cape Coast clean, fair and orderly is not the Assembly's job alone; it is every resident's daily duty.",
	},
	{
		Slug: "asante", Name: "Asante Kingdom", Era: "c. 1700 CE – present",
		Principle: "The Golden Stool, not the king, holds the soul of the nation; a chief rules only as its trustee and can be destooled if he breaks his oath.",
		Lesson:    "Power in Oguaa — chief, Assembly Member or officer — is held in trust for the people, and forfeit the day the oath is broken.",
	},
	{
		Slug: "mali-songhai", Name: "Mali & Songhai Empires", Era: "c. 1235 – 1591 CE",
		Principle: "Timbuktu made the book worth more than the gold, drawing scholars from across the world to its libraries and its university at Sankoré.",
		Lesson:    "Cape Coast's oldest wealth is its schools; a town that treasures learning outlasts one that only chases quick money.",
	},
	{
		Slug: "meiji-japan", Name: "Meiji Japan", Era: "1868 – 1912 CE",
		Principle: "Japan renewed itself through discipline — taking up new science and industry while holding fast to its own language, dress and values.",
		Lesson:    "Oguaa can master new trades and technology without surrendering its Fante tongue, its customs or its name.",
	},
	{
		Slug: "singapore", Name: "Singapore", Era: "1965 CE – present",
		Principle: "With no resources but its people, Singapore built prosperity on clean streets, public order and the shared discipline of every citizen.",
		Lesson:    "Clean streets and public order are not luxuries for later; they are the ground Cape Coast's tourism and trade can rise on.",
	},
	{
		Slug: "rwanda", Name: "Rwanda (post-1994)", Era: "1994 CE – present",
		Principle: "After catastrophe, Rwanda rebuilt on shared responsibility — even reserving one Saturday each month, Umuganda, for citizens to clean and build together.",
		Lesson:    "Set down the blame and take up the broom: a monthly communal clean-up can rebuild both the streets and the spirit of Oguaa.",
	},
}

// seedCivic loads the civic code and the civilization lessons (seed only).
func seedCivic(ctx context.Context, db *mongo.Database) error {
	if err := insertAll(ctx, db.Collection(collCivicBehaviours), seedCivicBehaviours); err != nil {
		return err
	}
	return insertAll(ctx, db.Collection(collCivicLessons), seedCivicLessons)
}

// SeedCivicOnly drops and reloads ONLY the two civic collections, leaving every
// other collection untouched. It exists so the civic code can be topped up into
// a live database (Atlas, or the compose mongo) WITHOUT the destructive full
// Seed(), which drops and rewrites the whole dataset. Idempotent: re-running it
// just replaces the civic documents.
func SeedCivicOnly(ctx context.Context, db *mongo.Database) error {
	for _, coll := range []string{collCivicBehaviours, collCivicLessons} {
		if err := db.Collection(coll).Drop(ctx); err != nil {
			return err
		}
	}
	return seedCivic(ctx, db)
}
