package domain

import "testing"

func TestValidSectionType(t *testing.T) {
	for _, ok := range []string{SectionRichText, SectionGallery, SectionStats, SectionTeam, SectionTimeline, SectionFAQ, SectionDocs, SectionQuote, SectionCTA, SectionLogos, SectionDivider, SectionGroups, SectionHero, SectionTestim, SectionContact, SectionMenu, SectionSchedule, SectionMap} {
		if !ValidSectionType(ok) {
			t.Errorf("ValidSectionType(%q) = false, want true", ok)
		}
	}
	for _, bad := range []string{"", "banner", "Gallery", "columns", "unknown"} {
		if ValidSectionType(bad) {
			t.Errorf("ValidSectionType(%q) = true, want false", bad)
		}
	}
}

func TestValidTone(t *testing.T) {
	for _, ok := range []string{"", "green", "clay", "gold", "maroon", "teal"} {
		if !ValidTone(ok) {
			t.Errorf("ValidTone(%q) = false, want true", ok)
		}
	}
	for _, bad := range []string{"ai", "purple", "blue", "Green", "x"} {
		if ValidTone(bad) {
			t.Errorf("ValidTone(%q) = true, want false", bad)
		}
	}
}
