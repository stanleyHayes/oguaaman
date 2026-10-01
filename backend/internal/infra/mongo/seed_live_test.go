package mongo

import (
	"errors"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// A claimable stub for an institution that already has a verified page would
// list the same school twice and could be claimed as a second official page.
func TestClaimableOrgsDoNotDuplicateSeededInstitutions(t *testing.T) {
	norm := func(s string) string {
		s = strings.ToLower(s)
		for _, r := range []string{"&", " and ", ",", ".", "'", "’", "(", ")", "-", "  "} {
			s = strings.ReplaceAll(s, r, " ")
		}
		return strings.Join(strings.Fields(s), " ")
	}
	ids, slugs, names := map[string]bool{}, map[string]bool{}, map[string]bool{}
	for _, o := range append(append([]domain.Organization{}, seedOrgs...), seedExtraOrgs...) {
		ids[o.ID], slugs[o.Slug], names[norm(o.Name)] = true, true, true
	}
	for _, c := range seedClaimableOrgs {
		if slugs[c.Slug] {
			continue // same page — the slug top-up skips it
		}
		if ids[c.ID] {
			t.Errorf("claimable org %q reuses a seeded _id under another slug", c.ID)
		}
		if names[norm(c.Name)] {
			t.Errorf("claimable org %q (%s) duplicates a seeded institution under a different slug", c.Slug, c.Name)
		}
	}
	for _, removed := range []string{"oguaa-senior-high-tech", "efutu-senior-high-tech", "nmtc-cape-coast", "centre-for-national-culture-cc"} {
		for _, c := range seedClaimableOrgs {
			if c.Slug == removed {
				t.Errorf("claimable org %q duplicates an existing verified institution", removed)
			}
		}
	}
}

func TestResetRefusal(t *testing.T) {
	cases := []struct {
		name     string
		env      string
		real     int64
		override bool
		refused  bool
	}{
		{"local empty db", "", 0, false, false},
		{"local db with only seed members", "development", 0, false, false},
		{"local db holding a real signup", "", 1, false, true},
		{"production", "production", 0, false, true},
		{"production with real members", "production", 500, false, true},
		{"explicit override", "production", 500, true, false},
		{"override on a local db with signups", "", 3, true, false},
	}
	for _, c := range cases {
		err := resetRefusal(c.env, c.real, c.override)
		if got := err != nil; got != c.refused {
			t.Errorf("%s: refused=%v, want %v (err=%v)", c.name, got, c.refused, err)
		}
		if err != nil && !errors.Is(err, ErrResetRefused) {
			t.Errorf("%s: error does not wrap ErrResetRefused: %v", c.name, err)
		}
	}
}

func TestIsPlaceholderContact(t *testing.T) {
	for v, want := range map[string]bool{
		"mailto:office@adisadel.oguaa.test": true,
		"office@adisadel.oguaa.test":        true,
		"tel:+233330000114":                 true,
		"+233 33 000 0114":                  true,
		"tel:+233000000000":                 true,
		"https://wa.me/233000000000":        true,
		"https://mfantsipim.com/":           false,
		"tel:+233332132000":                 false,
		"Mon–Fri, 8:00–17:00":               false,
		"":                                  false,
	} {
		if got := isPlaceholderContact(v); got != want {
			t.Errorf("isPlaceholderContact(%q) = %v, want %v", v, got, want)
		}
	}
}

// The live copy of every seeded institution must carry no placeholder mailbox
// or phone line — an "official" page would otherwise offer Admissions and
// Call-the-office buttons that reach nobody.
func TestLiveCorpusOrgsCarryNoPlaceholderContacts(t *testing.T) {
	stripped := 0
	for _, o := range append(append([]domain.Organization{}, seedOrgs...), seedExtraOrgs...) {
		live := liveCorpusOrg(o)
		for _, s := range live.Sections {
			for _, it := range s.Items {
				if isPlaceholderContact(it.URL) || isPlaceholderContact(it.Value) {
					t.Errorf("%s section %s still carries placeholder contact %q / %q", o.ID, s.ID, it.Value, it.URL)
				}
			}
		}
		for i, s := range o.Sections {
			stripped += len(s.Items) - len(live.Sections[i].Items)
		}
	}
	if stripped == 0 {
		t.Fatal("no placeholder contact items were found to strip — the school pages changed shape")
	}
}

// Seeded ticket tiers on a real event are invented; the live copy must not open
// a checkout for tickets the organiser never issued.
func TestLiveCorpusEventsCarryNoTicketTiers(t *testing.T) {
	var fetu domain.Listing
	for _, l := range seedListings() {
		if l.ID == "e-fetu" {
			fetu = l
		}
	}
	if fetu.ID == "" {
		t.Fatal("e-fetu is missing from the seed corpus")
	}
	if _, ok := fetu.Details["tiers"]; !ok {
		t.Fatal("the local seed should still carry e-fetu's demo ticket tiers")
	}
	live := liveCorpusListing(fetu)
	for _, k := range []string{"tiers", "refundPolicy"} {
		if _, ok := live.Details[k]; ok {
			t.Errorf("live e-fetu still carries %q", k)
		}
	}
	if live.Details["admission"] == "paid" {
		t.Error("live e-fetu still advertises paid admission")
	}
	if _, ok := fetu.Details["tiers"]; !ok {
		t.Error("liveCorpusListing mutated the shared seed details map")
	}
	for _, l := range append(seedListings(), seedExtraListings()...) {
		if domain.IsFabricatedListing(l.ID, l.Type) {
			continue
		}
		if _, ok := liveCorpusListing(l).Details["tiers"]; ok {
			t.Errorf("live listing %s still carries ticket tiers", l.ID)
		}
	}
}
