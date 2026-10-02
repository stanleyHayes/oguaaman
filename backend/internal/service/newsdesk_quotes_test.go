package service

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// ── quotations and the copy-overlap gate (spec §2.6) ─────────────────────────

func quoted(body string) []string {
	var out []string
	for _, s := range quoteSpans(body) {
		out = append(out, body[s[0]:s[1]])
	}
	return out
}

// Single quotes, curly or straight, are quotations; apostrophes are not.
func TestQuoteSpansRecogniseSingleQuotes(t *testing.T) {
	cases := map[string][]string{
		"The chief said ‘the drains will be ready before the rains’, and traders cheered.": {"‘the drains will be ready before the rains’"},
		"'We are ready,' the chief said.":                               {"'We are ready,'"},
		"'We don't want trouble,' she said, 'only fair rent.'":          {"'We don't want trouble,'", "'only fair rent.'"},
		"“He told us ‘no’ twice,” a trader said.":                       {"“He told us ‘no’ twice,”"},
		`He said "the market is open" today.`:                           {`"the market is open"`},
		"The assembly's engineers said the traders' stalls don't leak.": nil,
		"Ghana’s cedi rose and Kotokuraba’s traders’ union met.":        nil,
		"A quote that \"runs on\nto the next line\" is not one.":        nil,
	}
	for body, want := range cases {
		if got := quoted(body); !slices.Equal(got, want) {
			t.Errorf("quoteSpans(%q) = %q, want %q", body, got, want)
		}
	}
	if quotesWithin("‘One’ and ‘two’ and 'three' were said.", 25) {
		t.Error("three single-quoted passages must fail the quote limit")
	}
	if quotesWithin("She said ‘"+strings.TrimSpace(strings.Repeat("word ", 26))+"’ to us.", 25) {
		t.Error("an over-long single-quoted passage must fail the quote limit")
	}
	if !quotesWithin("The traders' union said the assembly's plan won't work, and the MCE's office didn't reply.", 25) {
		t.Error("apostrophes must not count as quotations")
	}
}

// The overlap gate ignores quoted passages (single quotes too) and runs that
// are mostly names or titles, and still catches copied prose.
func TestCopyOverlapIgnoresNamesButCatchesProse(t *testing.T) {
	cases := []struct {
		name, body, source string
		copies             bool
	}{
		{"single-quoted quotation",
			"The chief executive said ‘the assembly will complete the new drains before the rains begin in April’, and traders welcomed it.",
			"The chief executive said the assembly will complete the new drains before the rains begin in April.", false},
		{"an official's title and name",
			"Kotokuraba reopened on Monday. Speaking to traders, the Cape Coast Metropolitan Chief Executive, Mr Ernest Arthur, thanked them for their patience.",
			"Traders were told on Friday by the Cape Coast Metropolitan Chief Executive, Mr Ernest Arthur, that the market would reopen.", false},
		{"a title with connector words and a date",
			"The plan was announced by the Minister for Fisheries and Aquaculture Development, Mrs Emelia Arthur, on Monday in Elmina.",
			"Fishers met the Minister for Fisheries and Aquaculture Development, Mrs Emelia Arthur, on Monday in Elmina to discuss the season.", false},
		{"copied prose",
			"Officials said the closure had allowed contractors to replace worn drainage channels across the market.",
			"The closure had allowed contractors to replace worn drainage channels, the assembly said.", true},
		{"copied prose after a name",
			"The Cape Coast Metropolitan Assembly completed planned renovation works on drains, walkways and roofs last week.",
			leadPageText, true},
		{"copied prose in a double-quoted quotation",
			`An official said "the closure had allowed contractors to replace worn drainage channels" on Friday.`,
			"The closure had allowed contractors to replace worn drainage channels, the assembly said.", false},
	}
	for _, c := range cases {
		if got := copiesSource(assembledReport{Body: c.body, FetchedTexts: []string{c.source}}); got != c.copies {
			t.Errorf("%s: copiesSource = %v, want %v", c.name, got, c.copies)
		}
		if got := copiesSource(assembledReport{Body: c.body, CitedTexts: []string{c.source}}); got != c.copies {
			t.Errorf("%s (cited snippet): copiesSource = %v, want %v", c.name, got, c.copies)
		}
	}
}

// The editorial standards promise quotes of up to 25 words: a steward can't
// allow longer ones, and a longer value stored before this bound is held to it.
func TestQuoteLimitKeepsTheEditorialPromise(t *testing.T) {
	f := newDeskFixture(t, nil)
	ctx := context.Background()
	s := f.desk.Settings(ctx)
	s.MaxQuoteWords = 26
	var fe *InvalidFieldError
	if _, err := f.desk.SaveSettings(ctx, NewsDeskSettingsInput{NewsDeskSettings: s, Reason: "longer quotes"}, AuditActor{Name: "S"}); !errors.As(err, &fe) || fe.Field != "maxQuoteWords" {
		t.Fatalf("maxQuoteWords 26 = %v", err)
	}
	s.MaxQuoteWords = 25
	if _, err := f.desk.SaveSettings(ctx, NewsDeskSettingsInput{NewsDeskSettings: s, Reason: "the promised limit"}, AuditActor{Name: "S"}); err != nil {
		t.Fatalf("maxQuoteWords 25 = %v", err)
	}
	for stored, want := range map[int]int{0: 25, 12: 12, 25: 25, 30: 25} {
		if got := quoteLimit(domain.NewsDeskSettings{MaxQuoteWords: stored}); got != want {
			t.Errorf("quoteLimit(%d) = %d, want %d", stored, got, want)
		}
	}
	quote := `She said "` + strings.TrimSpace(strings.Repeat("word ", 28)) + `" today.`
	if quotesWithin(quote, quoteLimit(domain.NewsDeskSettings{MaxQuoteWords: 30})) {
		t.Error("a 28-word quote passed under a stored limit of 30")
	}
}
