package service

// ── content screen term lists ────────────────────────────────────────────────
//
// The denylists behind ScreenText / ScreenTerms (content_screen.go). They are
// kept apart from the matching logic so moderators can extend them without
// touching code paths.
//
// Rules for adding an entry:
//   - Entries match whole words (or whole word sequences), lower-case, after
//     the text is split on anything that is not a letter or digit — so
//     "I'll" is "i ll" and "f.u.c.k" is not caught. Write entries in that form.
//   - Only add terms that are objectionable in (almost) every context. An
//     ordinary word with an offensive second meaning ("cock" is a rooster,
//     "chink" a gap in a wall, "beat" a drum) must not be listed: it would
//     block legitimate posts about poultry, building repairs or music.
//   - Twi, Fante, Ga and Ewe slurs, threats and sexual terms should be added
//     by the local moderators who know how each word is really used.

// screenThreatPhrases are explicit threats of violence aimed at the reader. A
// hit blocks the post (on safety reports it holds the report for a curator,
// since a victim may be quoting the threat). Third-person phrases ("deserve to
// die", "should be killed") are not listed: condolences and reports use them.
var screenThreatPhrases = []string{
	"i will kill you", "i ll kill you", "i am going to kill you", "i m going to kill you",
	"going to kill you", "gonna kill you", "we will kill you", "i will murder you",
	"kill yourself", "go kill yourself", "kys",
	"i will rape you", "i will shoot you", "i will stab you", "i will burn your house",
	"we will burn your house", "burn your house down", "i will burn you",
	"i know where you live", "we know where you live",
}

// screenBenignPhrases are ordinary phrases that contain a listed word ("pussy
// cat"). They are taken out of the text before the denylists run.
var screenBenignPhrases = []string{"pussy cat", "pussy cats"}

// screenHateTerms are slurs that attack people for who they are. A hit blocks
// the post.
var screenHateTerms = []string{
	"nigger", "niggers", "faggot", "faggots", "kike", "kikes",
	"wetback", "wetbacks", "raghead", "ragheads", "tranny", "trannies",
}

// screenSexualPhrases are explicit sexual terms. A hit holds the post for a
// curator (or asks the author to rephrase, where nothing can be held). "xxx"
// (a masked phone number) and "hookup" (a DSTV or water connection) are only
// listed with the child cues below.
var screenSexualPhrases = []string{
	"porn", "porno", "pornography", "nudes", "nude pics", "nude photos", "nude video",
	"sex tape", "sex video", "blowjob", "blow job", "handjob", "hand job",
	"dick pic", "dick pics", "pussy", "onlyfans", "escort service", "call girl", "call girls",
	"sex for money",
}

// screenProfanityTerms are strong profanities and sexual insults. A hit holds
// the post (or asks the author to rephrase).
var screenProfanityTerms = []string{
	"fuck", "fucks", "fucking", "fucked", "fucker", "motherfucker", "motherfuckers",
	"cunt", "cunts", "whore", "whores", "slut", "sluts",
}

// screenChildCues are words that point at a child. Combined with a nearby
// screenChildSexualTerms word they hold the post for child-safety review. Ages
// written as numbers ("12 year old", "15yrs") are matched separately.
var screenChildCues = []string{
	"child", "children", "kid", "kids", "minor", "minors", "underage", "schoolgirl",
	"schoolgirls", "schoolboy", "schoolboys", "teen", "teens", "teenage", "teenager",
	"preteen", "little girl", "little boy", "young girl", "young boy", "jhs girl", "jhs boy",
}

// screenChildSexualTerms are the sexual words that, near a child cue, raise a
// child-safety hold. Broader than screenSexualPhrases on purpose: "sexy" on its
// own is fine, next to "12 year old" it is not.
var screenChildSexualTerms = []string{
	"sex", "sexy", "sexual", "sexually", "nude", "nudes", "naked", "porn", "porno",
	"xxx", "horny", "erotic", "seduce", "seduced", "seducing", "rape", "raped",
	"molest", "molested", "molesting", "defile", "defiled", "defilement", "hookup", "onlyfans",
}

// screenChildCueWindow is how many words apart a child cue and a sexual term
// may be to count as "next to" each other.
const screenChildCueWindow = 8
