package service

import (
	"errors"
	"strings"
	"testing"
)

func TestScreenText(t *testing.T) {
	tests := []struct {
		name   string
		text   string
		block  bool
		hold   bool
		reason string
	}{
		{name: "ordinary safety report", text: "Flooding on the Kotokuraba road after the rain; cars are stuck near the market."},
		{name: "ordinary tribute", text: "Auntie Esi taught half of Bakaano to read. Rest well, 1942 – 2018."},
		{name: "missing child notice", text: "Missing: 9-year-old Kofi, last seen near Wesley Methodist in a blue school uniform."},
		{name: "rooster is not a slur", text: "My cock and three hens were stolen from the yard."},
		{name: "gap in a wall", text: "Fire found a chink in the wall of the old storehouse."},
		{name: "no substring matching", text: "The Sussex assessment team visited Essex Street."},
		{name: "gps code and dates are not phone numbers", text: "Near CC-0123-4567, born 01 02 1950, schooled 1957 1966 1979 1992."},
		{name: "money is not a phone number", text: "Reward of GH₵ 1,200 or 100000 pesewas."},
		{name: "threat", text: "I will kill you if you come back", block: true, reason: ScreenThreat},
		{name: "threat with contraction", text: "I'll kill you", block: true, reason: ScreenThreat},
		{name: "slur", text: "Go home you raghead", block: true, reason: ScreenHate},
		{name: "child and sexual term close together", text: "sexy 15 year old girl available", hold: true, reason: ScreenChildSafety},
		{name: "child cue word", text: "schoolgirl nude pictures", hold: true, reason: ScreenChildSafety},
		{name: "explicit", text: "watch free porn here", hold: true, reason: ScreenSexual},
		{name: "profanity", text: "this fucking place", hold: true, reason: ScreenProfanity},
		{name: "phone number", text: "Call me on 0244 123 456 if found", hold: true, reason: ScreenPrivateInfo},
		{name: "international phone number", text: "WhatsApp +233 24 412 3456", hold: true, reason: ScreenPrivateInfo},
		{name: "email address", text: "Write to kofi.mensah@example.com", hold: true, reason: ScreenPrivateInfo},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			v := ScreenText(tc.text)
			if v.Block != tc.block || v.Hold != tc.hold {
				t.Fatalf("ScreenText(%q) = %+v, want block=%v hold=%v", tc.text, v, tc.block, tc.hold)
			}
			if tc.reason != "" && (len(v.Reasons) == 0 || v.Reasons[0] != tc.reason) {
				t.Fatalf("reasons = %v, want %q first", v.Reasons, tc.reason)
			}
		})
	}
}

func TestScreenTermsAllowsContactDetails(t *testing.T) {
	if v := ScreenTerms("Open 8am–6pm. Call 0244 123 456 or write to shop@example.com."); v.Flagged() {
		t.Fatalf("a business's own contact details must not be flagged: %+v", v)
	}
	if v := ScreenTerms("I will kill you"); !v.Block {
		t.Fatalf("the denylist still applies without the contact rule: %+v", v)
	}
}

func TestScreenReasonsOrderedBySeverity(t *testing.T) {
	v := ScreenText("call 0244 123 456 you fucking raghead")
	if len(v.Reasons) != 3 || v.Reasons[0] != ScreenHate || v.Reasons[2] != ScreenPrivateInfo {
		t.Fatalf("reasons = %v, want hate first and private_info last", v.Reasons)
	}
}

func TestScreenRefusalMessages(t *testing.T) {
	if err := screenRefusal(ScreenText("A lovely tribute."), "tribute"); err != nil {
		t.Fatalf("clean text must not be refused: %v", err)
	}
	err := screenRefusal(ScreenText("call 0244 123 456"), "tribute")
	var se *ScreenError
	if !errors.As(err, &se) || !strings.Contains(se.Error(), "phone numbers") {
		t.Fatalf("private-info refusal = %v, want a phone-number message", err)
	}
	if v := ScreenText("call 0244 123 456"); v.Block {
		t.Fatal("a hold is not a block")
	}
	if v := ScreenText("I will kill you"); !v.Block {
		t.Fatal("a threat must be blocked")
	}
}

// R03: ordinary safety reports, condolences and notices are not refused or
// held for words that only look objectionable.
func TestScreen_noFalseBlocksOnCommonPhrases(t *testing.T) {
	for _, text := range []string{
		"Rest well Maame. You did not deserve to die so young.",
		"The rabid dog should be killed before it bites a child",
		"The thieves must be killed, the elders said",
		"Lost pussy cat near Siwdu, answers to Kitty",
		"Our DSTV hookup and water hookup were stolen",
		"Call 024 xxx xxxx for the owner",
	} {
		if v := ScreenTerms(text); v.Flagged() {
			t.Errorf("%q: verdict %+v, want clean", text, v)
		}
	}
	// A victim quoting a threat is still flagged, and child cues still catch
	// the terms dropped from the general list.
	if v := ScreenText("My neighbour shouted 'I will kill you' and chased me"); !v.Block {
		t.Fatal("a quoted threat is still a threat to the screen")
	}
	if v := ScreenText("xxx videos of a 12 year old"); !v.Hold || v.Reasons[0] != ScreenChildSafety {
		t.Fatalf("child-safety cue = %+v", v)
	}
}
