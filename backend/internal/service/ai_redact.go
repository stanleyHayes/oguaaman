package service

import (
	"fmt"
	"regexp"
	"strings"
)

// ── prompt redaction (G118) ───────────────────────────────────────────────────
//
// The writing assistant needs the wording, not the contact details or ID
// numbers inside it. Before text leaves for the AI provider, e-mail
// addresses, phone numbers and Ghana Card numbers are swapped for numbered
// placeholders ([EMAIL_1], [PHONE_1], [ID_1]). When the model carries a
// placeholder through, the original is put back into the suggestion — so the
// provider never sees the detail and the member doesn't lose it.

var (
	aiEmailRE     = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
	aiGhanaCardRE = regexp.MustCompile(`(?i)\bGHA-?\d{9}-?\d\b`)
	// A phone number starts with "+", "00" or a leading 0 (Ghana's local
	// format) and runs through digits and separators; the digit count is
	// checked separately so dates, years and amounts are left alone.
	aiPhoneRE = regexp.MustCompile(`(?:\+|\b0)\d[\d\s\-().]{6,}\d`)
)

// aiRedaction maps each placeholder back to the text it replaced.
type aiRedaction struct{ originals map[string]string }

func (r aiRedaction) redacted() bool { return len(r.originals) > 0 }

// restore puts the original details back into a model reply.
func (r aiRedaction) restore(s string) string {
	for placeholder, original := range r.originals {
		s = strings.ReplaceAll(s, placeholder, original)
	}
	return s
}

// redactForAI replaces private details in text with placeholders. The same
// detail always gets the same placeholder.
func redactForAI(text string) (string, aiRedaction) {
	r := aiRedaction{originals: map[string]string{}}
	byOriginal := map[string]string{}
	counts := map[string]int{}
	swap := func(kind, match string) string {
		if ph, ok := byOriginal[match]; ok {
			return ph
		}
		counts[kind]++
		ph := fmt.Sprintf("[%s_%d]", kind, counts[kind])
		byOriginal[match] = ph
		r.originals[ph] = match
		return ph
	}
	text = aiGhanaCardRE.ReplaceAllStringFunc(text, func(m string) string { return swap("ID", m) })
	text = aiEmailRE.ReplaceAllStringFunc(text, func(m string) string { return swap("EMAIL", m) })
	text = aiPhoneRE.ReplaceAllStringFunc(text, func(m string) string {
		if n := countDigits(m); n < 9 || n > 15 {
			return m
		}
		return swap("PHONE", m)
	})
	return text, r
}

func countDigits(s string) int {
	n := 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			n++
		}
	}
	return n
}
