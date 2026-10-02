package service

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/oguaa/backend/internal/domain"
)

// ── quality gates, political detection and the Tier C screen (spec §2.6) ─────

const (
	minReportWords        = 250
	maxReportWords        = 900
	minCitationCoverage   = 0.5
	lowCitationCoverage   = 0.7
	shingleWords          = 8
	maxQuotedSpans        = 2
	defaultMaxQuoteWords  = 25
	defaultMinSourceCount = 2
)

// Hard-gate failures. gateOverlap and gateQuotes allow one regenerate.
const (
	gateSources  = "gate_sources"
	gateLength   = "gate_length"
	gateCoverage = "gate_coverage"
	gateOverlap  = "gate_copy_overlap"
	gateQuotes   = "gate_quotes"
	gateMarkers  = "gate_markers"
)

// Soft flags shown to the editor.
const (
	FlagLowCitationCoverage = "low_citation_coverage"
	FlagUncitedClaims       = "uncited_claims"
	FlagParagraphUncited    = "paragraph_without_citation"
	FlagPolitical           = "political"
	FlagFallbackModel       = "fallback_model"
)

// tierCKeywords are lead words that keep a story away from AI drafting
// (spec §2.1, editorial standards). Matching is whole-word and
// case-insensitive and also takes a plural "s" or "es" (termsRegexp), so only
// irregular forms are listed.
var tierCKeywords = []string{
	// crime, police and courts
	"arrest", "arrested", "charged", "court", "remand", "remanded", "judge", "trial", "jailed", "sentenced",
	"convicted", "suspect", "police", "murder", "murdered", "killed", "stabbed", "rape", "raped", "defilement",
	"assault", "assaulted", "robbery", "robberies", "robbed", "fraud",
	// security incidents, accidents and deaths
	"clash", "shooting", "gunshot", "violence", "curfew", "fire", "blaze", "accident", "crash", "crashed",
	"injured", "drowned", "drowning", "dead", "died", "death", "suicide",
	// chieftaincy disputes and outbreaks
	"chieftaincy dispute", "destoolment", "outbreak", "cholera", "mpox", "epidemic",
	// children
	"child", "children", "schoolchildren", "pupil", "student", "minor", "teenager", "juvenile",
	// election procedure and results
	"results", "ballot", "polling station",
}

// politicalKeywords mark election coverage in a title or body.
var politicalKeywords = []string{
	"election", "electoral commission", "npp", "ndc", "candidate", "campaign", "mp", "dce", "parliament",
	"vote", "primaries", "by-election",
}

// termsRegexp matches any of terms as whole words, case-insensitively, in
// the singular or with a plural "s" or "es" ("court" also matches "courts",
// "crash" also "crashes").
func termsRegexp(terms []string) *regexp.Regexp {
	quoted := make([]string, 0, len(terms))
	for _, t := range terms {
		if t = strings.TrimSpace(t); t != "" {
			quoted = append(quoted, regexp.QuoteMeta(strings.ToLower(t)))
		}
	}
	if len(quoted) == 0 {
		return nil
	}
	return regexp.MustCompile(`(?i)(^|[^\p{L}\p{N}])(` + strings.Join(quoted, "|") + `)(?:e?s)?($|[^\p{L}\p{N}])`)
}

var (
	tierCRe     = termsRegexp(tierCKeywords)
	politicalRe = termsRegexp(politicalKeywords)
)

// tierCHit reports whether the lead's title or teaser touches a Tier C topic.
func tierCHit(title, teaser string, extra []string) bool {
	text := title + " \n " + teaser
	if tierCRe.MatchString(text) {
		return true
	}
	if re := termsRegexp(extra); re != nil && re.MatchString(text) {
		return true
	}
	return false
}

// politicalText reports whether text matches a political keyword.
func politicalText(texts ...string) bool {
	for _, t := range texts {
		if politicalRe.MatchString(t) {
			return true
		}
	}
	return false
}

// gateResult is the outcome of the hard gates.
type gateResult struct {
	Failure     string // "" when every gate passed
	Regenerable bool   // overlap or quotes: one regenerate is allowed
}

// checkHardGates runs the section 2.6 hard gates on an assembled report.
func checkHardGates(r assembledReport, s domain.NewsDeskSettings) gateResult {
	minSources := max(s.MinSources, defaultMinSourceCount)
	maxQuote := quoteLimit(s)
	switch {
	case citedDomains(r) < minSources:
		return gateResult{Failure: gateSources}
	case r.WordCount < minReportWords || r.WordCount > maxReportWords:
		return gateResult{Failure: gateLength}
	case r.Coverage < minCitationCoverage:
		return gateResult{Failure: gateCoverage}
	case !markersValid(r.Body, len(r.Sources)):
		return gateResult{Failure: gateMarkers}
	case !quotesWithin(r.Body, maxQuote):
		return gateResult{Failure: gateQuotes, Regenerable: true}
	case copiesSource(r):
		return gateResult{Failure: gateOverlap, Regenerable: true}
	}
	return gateResult{}
}

// quoteLimit is the longest quotation a draft may carry: the setting, never
// above the 25 words the editorial standards promise (a value saved before
// that bound existed is held to it).
func quoteLimit(s domain.NewsDeskSettings) int {
	if s.MaxQuoteWords <= 0 {
		return defaultMaxQuoteWords
	}
	return min(s.MaxQuoteWords, maxQuoteWordsCeil)
}

// citedDomains counts the distinct registrable domains among cited sources.
func citedDomains(r assembledReport) int {
	seen := map[string]bool{}
	for _, s := range r.Sources {
		if r.citedURLs[normaliseURL(s.URL)] {
			seen[registrableDomain(hostOf(s.URL))] = true
		}
	}
	return len(seen)
}

// markersValid reports whether every [n] satisfies 1 <= n <= sources.
func markersValid(body string, sources int) bool {
	for _, m := range markerRe.FindAllStringSubmatch(body, -1) {
		n, err := strconv.Atoi(m[1])
		if err != nil || n < 1 || n > sources {
			return false
		}
	}
	return true
}

// ── quotations ───────────────────────────────────────────────────────────────

// quoteMarks pairs each mark that can open a quotation with its closing mark.
var quoteMarks = map[rune]rune{'"': '"', '“': '”', '\'': '\'', '‘': '’'}

// quoteSpans finds the quoted passages of a body (byte offsets, marks
// included), each on one line: text in double quotes ("…" or “…”) or in
// single quotes ('…' or ‘…’, common in Ghanaian English). A single quote
// opens a passage only at the start of a word and closes one only at the end
// of a word, so an apostrophe (Ghana's, don't) is never taken for a quote.
// Inside a passage only its own closing mark counts.
func quoteSpans(body string) [][2]int {
	var spans [][2]int
	var closer rune // closes the open passage; 0 when none is open
	start, prev := 0, ' '
	for i, r := range body {
		next, _ := utf8.DecodeRuneInString(body[i+utf8.RuneLen(r):])
		switch {
		case r == '\n':
			closer = 0
		case closer == 0:
			if c := opensQuote(r, prev, next); c != 0 {
				closer, start = c, i
			}
		case closesQuote(r, closer, prev, next):
			spans = append(spans, [2]int{start, i + utf8.RuneLen(r)})
			closer = 0
		}
		prev = r
	}
	return spans
}

// opensQuote returns the closing mark when r opens a quotation here, else 0.
func opensQuote(r, prev, next rune) rune {
	c, ok := quoteMarks[r]
	if !ok || (singleQuote(r) && (wordRune(prev) || !wordRune(next))) {
		return 0
	}
	return c
}

// closesQuote reports whether r closes the open quotation here.
func closesQuote(r, closer, prev, next rune) bool {
	return r == closer && (!singleQuote(r) || (!unicode.IsSpace(prev) && !wordRune(next)))
}

func singleQuote(r rune) bool { return r == '\'' || r == '‘' || r == '’' }
func wordRune(r rune) bool    { return unicode.IsLetter(r) || unicode.IsDigit(r) }

// quotesWithin reports whether the body has at most two quoted passages,
// each at most maxWords words.
func quotesWithin(body string, maxWords int) bool {
	spans := quoteSpans(body)
	if len(spans) > maxQuotedSpans {
		return false
	}
	for _, s := range spans {
		if len(strings.Fields(body[s[0]:s[1]])) > maxWords {
			return false
		}
	}
	return true
}

// outsideQuotes cuts text at its quoted passages and returns the stretches
// between them.
func outsideQuotes(text string) []string {
	var parts []string
	last := 0
	for _, s := range quoteSpans(text) {
		parts = append(parts, text[last:s[0]])
		last = s[1]
	}
	return append(parts, text[last:])
}

// ── copy overlap ─────────────────────────────────────────────────────────────

// copiesSource reports whether the body, outside its quotations, shares an
// 8-word run (lower-cased, punctuation stripped) with a fetched page or a
// cited snippet. A run made mostly of capitalised words is a name, a title or
// a place ("the Cape Coast Metropolitan Chief Executive, Mr Ernest Arthur"),
// and attributing a statement to someone is not copying, so it doesn't count;
// copied prose still does.
func copiesSource(r assembledReport) bool {
	ours := map[string]bool{}
	for _, part := range outsideQuotes(markerRe.ReplaceAllString(r.Body, " ")) {
		for _, sh := range proseShingles(part) {
			ours[sh] = true
		}
	}
	if len(ours) == 0 {
		return false
	}
	for _, text := range append(append([]string{}, r.FetchedTexts...), r.CitedTexts...) {
		if sharesShingle(text, ours) {
			return true
		}
	}
	return false
}

// shingleToken is one word of a shingle.
type shingleToken struct {
	text    string // lower-cased, punctuation stripped
	capital bool   // written with a capital initial
}

// connectorWords are left out when judging whether a run of words is a name
// or a title ("Minister for Fisheries and Aquaculture Development").
var connectorWords = map[string]bool{
	"the": true, "of": true, "and": true, "for": true, "at": true, "in": true, "on": true, "to": true,
	"a": true, "an": true, "s": true, "de": true,
}

// proseShingles lists the 8-word windows of text, leaving out the windows
// that are mostly names.
func proseShingles(text string) []string {
	words := shingleTokens(text)
	var out []string
	for i := 0; i+shingleWords <= len(words); i++ {
		run := words[i : i+shingleWords]
		if mostlyNames(run) {
			continue
		}
		parts := make([]string, len(run))
		for j, w := range run {
			parts[j] = w.text
		}
		out = append(out, strings.Join(parts, " "))
	}
	return out
}

// mostlyNames reports whether more than half of a run's words, connectors
// aside, are capitalised.
func mostlyNames(run []shingleToken) bool {
	words, capitals := 0, 0
	for _, w := range run {
		if connectorWords[w.text] {
			continue
		}
		words++
		if w.capital {
			capitals++
		}
	}
	return words > 0 && capitals*2 > words
}

// sharesShingle reports whether text has an 8-word window in ours.
func sharesShingle(text string, ours map[string]bool) bool {
	words := normalisedWords(text)
	for i := 0; i+shingleWords <= len(words); i++ {
		if ours[strings.Join(words[i:i+shingleWords], " ")] {
			return true
		}
	}
	return false
}

// shingleTokens splits text into words: letters and digits, lower-cased,
// each remembering whether it was capitalised.
func shingleTokens(text string) []shingleToken {
	clean := strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.IsSpace(r) {
			return r
		}
		return ' '
	}, text)
	fields := strings.Fields(clean)
	out := make([]shingleToken, len(fields))
	for i, f := range fields {
		first, _ := utf8.DecodeRuneInString(f)
		out[i] = shingleToken{text: strings.ToLower(f), capital: unicode.IsUpper(first)}
	}
	return out
}

func normalisedWords(text string) []string {
	tokens := shingleTokens(text)
	out := make([]string, len(tokens))
	for i, t := range tokens {
		out[i] = t.text
	}
	return out
}

// softFlags lists the editor-facing warnings for a draft.
func softFlags(r assembledReport, uncited []string, political, fallback bool) []string {
	flags := []string{}
	if r.Coverage < lowCitationCoverage {
		flags = append(flags, FlagLowCitationCoverage)
	}
	if len(uncited) > 0 {
		flags = append(flags, FlagUncitedClaims)
	}
	if paragraphWithoutCitation(r.Body) {
		flags = append(flags, FlagParagraphUncited)
	}
	if political {
		flags = append(flags, FlagPolitical)
	}
	if fallback {
		flags = append(flags, FlagFallbackModel)
	}
	return flags
}

// paragraphWithoutCitation reports whether a body paragraph (not a heading)
// carries no [n] marker.
func paragraphWithoutCitation(body string) bool {
	for _, p := range strings.Split(body, "\n\n") {
		p = strings.TrimSpace(p)
		if p == "" || strings.HasPrefix(p, "#") || (strings.HasPrefix(p, "**") && strings.HasSuffix(p, "**")) {
			continue
		}
		if !markerRe.MatchString(p) {
			return true
		}
	}
	return false
}
