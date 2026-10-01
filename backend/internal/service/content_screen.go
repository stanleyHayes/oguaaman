package service

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

// ── automated content screen (Apple 1.2 / Google Play UGC) ────────────────────
//
// Every path that publishes member-written text without a curator looking at
// it first (safety incidents, lost & found notices, tributes, reviews) runs the
// text through this screen, and ordinary submissions are flagged for the
// curator who reviews them. The screen is deliberately small and predictable:
// a maintained denylist (content_screen_terms.go) matched on whole words, plus
// patterns for contact details. It is a first line of defence ahead of the
// human queue and member reports, not a replacement for them.
//
// A verdict can Block (never acceptable: threats and slurs) or Hold (may be
// fine, but a person must look first: sexual or explicit language, children
// mentioned alongside sexual terms, phone numbers or email addresses in text
// about other people). Each caller decides what a Hold means on its path:
// instant-publish listings wait for a curator; tributes and reviews, which
// have no review queue, ask the author to rephrase.

// Screen reasons (ScreenVerdict.Reasons).
const (
	ScreenThreat      = "threat"
	ScreenHate        = "hate"
	ScreenChildSafety = "child_safety"
	ScreenSexual      = "sexual"
	ScreenProfanity   = "profanity"
	ScreenPrivateInfo = "private_info"
)

// screenSeverity orders reasons, most serious first.
var screenSeverity = map[string]int{
	ScreenThreat: 0, ScreenHate: 1, ScreenChildSafety: 2, ScreenSexual: 3, ScreenProfanity: 4, ScreenPrivateInfo: 5,
}

// ScreenVerdict is the screen's opinion of a piece of member-written text.
type ScreenVerdict struct {
	Block   bool     // never acceptable: refuse the post
	Hold    bool     // needs a person to look before it is public
	Reasons []string // machine-readable reasons, most serious first
}

// Flagged reports whether the text needs anything other than publishing.
func (v ScreenVerdict) Flagged() bool { return v.Block || v.Hold }

func (v *ScreenVerdict) add(reason string, block bool) {
	if block {
		v.Block = true
	} else {
		v.Hold = true
	}
	for _, r := range v.Reasons {
		if r == reason {
			return
		}
	}
	v.Reasons = append(v.Reasons, reason)
}

// ScreenText screens text written about other people — safety reports, lost &
// found notices, tributes: the denylists plus contact details (phone numbers,
// email addresses), which must not be published in free text.
func ScreenText(texts ...string) ScreenVerdict { return screenContent(texts, true) }

// ScreenTerms screens text against the denylists only. Use it where contact
// details are expected: a listing describing the poster's own business, a
// review quoting a shop's number, a message to a lost & found poster.
func ScreenTerms(texts ...string) ScreenVerdict { return screenContent(texts, false) }

// screenList is a denylist split into single words (set lookup) and
// multi-word phrases (padded substring match on the joined words).
type screenList struct {
	words   map[string]bool
	phrases []string
}

func newScreenList(entries []string) screenList {
	l := screenList{words: map[string]bool{}}
	for _, e := range entries {
		e = strings.Join(screenWords(e), " ")
		switch {
		case e == "":
		case strings.Contains(e, " "):
			l.phrases = append(l.phrases, " "+e+" ")
		default:
			l.words[e] = true
		}
	}
	return l
}

// matchAt reports whether an entry starts at word i.
func (l screenList) matchAt(words []string, i int) bool {
	return l.words[words[i]] || l.phraseAt(words, i) > 0
}

// phraseAt returns the length in words of a multi-word entry starting at
// word i, or 0 when none does.
func (l screenList) phraseAt(words []string, i int) int {
	for _, p := range l.phrases {
		n := strings.Count(p, " ") - 1
		if i+n <= len(words) && " "+strings.Join(words[i:i+n], " ")+" " == p {
			return n
		}
	}
	return 0
}

func (l screenList) matches(words []string, padded string) bool {
	for _, w := range words {
		if l.words[w] {
			return true
		}
	}
	for _, p := range l.phrases {
		if strings.Contains(padded, p) {
			return true
		}
	}
	return false
}

var (
	screenThreats      = newScreenList(screenThreatPhrases)
	screenHate         = newScreenList(screenHateTerms)
	screenSexual       = newScreenList(screenSexualPhrases)
	screenProfanity    = newScreenList(screenProfanityTerms)
	screenChildren     = newScreenList(screenChildCues)
	screenChildSexual  = newScreenList(screenChildSexualTerms)
	screenBenign       = newScreenList(screenBenignPhrases)
	screenAgeUnitWords = map[string]bool{"yr": true, "yrs": true, "year": true, "years": true, "yo": true}
	screenAgeTokenRe   = regexp.MustCompile(`^(\d{1,2})(?:yrs?|years?|yo)$`)
	// A phone number: a leading +, 00, 233 or 0 and 8–14 more digits, allowing
	// single spaces, dots or dashes between digit groups. GhanaPost GPS codes
	// (CC-0123-4567) and dates are too short to match.
	screenPhoneRe = regexp.MustCompile(`(?:\+|\b00|\b233|\b0)\d(?:[ .\-]?\d){7,13}\b`)
	screenEmailRe = regexp.MustCompile(`[a-z0-9._%+\-]+@[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.[a-z]{2,}`)
)

// screenWords lower-cases text and splits it into words of letters and digits.
func screenWords(s string) []string {
	return strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
}

func screenContent(texts []string, contactRule bool) ScreenVerdict {
	var v ScreenVerdict
	for _, raw := range texts {
		if strings.TrimSpace(raw) == "" {
			continue
		}
		words := withoutBenignPhrases(screenWords(raw))
		padded := " " + strings.Join(words, " ") + " "
		if screenThreats.matches(words, padded) {
			v.add(ScreenThreat, true)
		}
		if screenHate.matches(words, padded) {
			v.add(ScreenHate, true)
		}
		if childSexualCue(words) {
			v.add(ScreenChildSafety, false)
		}
		if screenSexual.matches(words, padded) {
			v.add(ScreenSexual, false)
		}
		if screenProfanity.matches(words, padded) {
			v.add(ScreenProfanity, false)
		}
		if contactRule && containsContactDetails(raw) {
			v.add(ScreenPrivateInfo, false)
		}
	}
	sort.SliceStable(v.Reasons, func(i, j int) bool { return screenSeverity[v.Reasons[i]] < screenSeverity[v.Reasons[j]] })
	return v
}

// withoutBenignPhrases drops the words of any screenBenignPhrases entry.
func withoutBenignPhrases(words []string) []string {
	out := words[:0:0]
	for i := 0; i < len(words); i++ {
		if n := screenBenign.phraseAt(words, i); n > 0 {
			i += n - 1
			continue
		}
		out = append(out, words[i])
	}
	return out
}

// childSexualCue reports whether a word pointing at a child (or an age under
// 18) appears within screenChildCueWindow words of a sexual term.
func childSexualCue(words []string) bool {
	var cues, sexual []int
	for i := range words {
		if screenChildren.matchAt(words, i) || isMinorAge(words, i) {
			cues = append(cues, i)
		}
		if screenChildSexual.matchAt(words, i) {
			sexual = append(sexual, i)
		}
	}
	for _, c := range cues {
		for _, s := range sexual {
			if d := c - s; d <= screenChildCueWindow && d >= -screenChildCueWindow {
				return true
			}
		}
	}
	return false
}

// isMinorAge reports whether word i states an age under 18: "12 year old",
// "15 yrs", "9yo", "16years".
func isMinorAge(words []string, i int) bool {
	num := words[i]
	if m := screenAgeTokenRe.FindStringSubmatch(num); m != nil {
		num = m[1]
	} else if i+1 >= len(words) || !screenAgeUnitWords[words[i+1]] {
		return false
	}
	age, err := strconv.Atoi(num)
	return err == nil && age >= 1 && age <= 17
}

func containsContactDetails(raw string) bool {
	lower := strings.ToLower(raw)
	return screenPhoneRe.MatchString(lower) || screenEmailRe.MatchString(lower)
}

// ScreenError is returned when screened text cannot be published as written.
// Its message tells the author what to change.
type ScreenError struct {
	Verdict ScreenVerdict
	Message string
}

func (e *ScreenError) Error() string { return e.Message }

// screenRefusal is the error for a flagged post that cannot be held for review
// (a tribute, a review, a message): the author is asked to rephrase. noun names
// the post ("tribute", "review", …). It returns nil for a clean verdict.
func screenRefusal(v ScreenVerdict, noun string) error {
	if !v.Flagged() || len(v.Reasons) == 0 {
		return nil
	}
	var msg string
	switch v.Reasons[0] {
	case ScreenThreat, ScreenHate:
		msg = fmt.Sprintf("This %s breaks our community rules and can't be posted. Please remove threats and hateful language.", noun)
	case ScreenChildSafety:
		msg = fmt.Sprintf("This %s can't be posted as written. Content that sexualises children is never allowed.", noun)
	case ScreenPrivateInfo:
		msg = fmt.Sprintf("Please leave phone numbers and email addresses out of your %s — they can't be shown publicly.", noun)
	default:
		msg = fmt.Sprintf("Please remove the explicit language from your %s and try again.", noun)
	}
	return &ScreenError{Verdict: v, Message: msg}
}
