package main

import (
	"testing"
	"time"
)

func TestPlanFor(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	stamp := now.Format(time.RFC3339)
	cases := []struct {
		name      string
		in        memberDates
		wantSet   map[string]string
		wantUnset []string
	}{
		{
			name:      "adult DOB seeded into a private birthday",
			in:        memberDates{DateOfBirth: "1990-04-12", HasDateOfBirth: true, Birthday: "1990-04-12", HasBirthday: true},
			wantSet:   map[string]string{fieldAdultVerifiedAt: stamp},
			wantUnset: []string{fieldDateOfBirth, fieldBirthday},
		},
		{
			name:      "broadcast birthday keeps month-day only",
			in:        memberDates{DateOfBirth: "1990-04-12", HasDateOfBirth: true, Birthday: "1990-04-12", HasBirthday: true, BroadcastBirthday: true},
			wantSet:   map[string]string{fieldAdultVerifiedAt: stamp, fieldBirthday: "04-12"},
			wantUnset: []string{fieldDateOfBirth},
		},
		{
			name: "month-day broadcast birthday is left alone",
			in:   memberDates{Birthday: "04-12", HasBirthday: true, BroadcastBirthday: true},
		},
		{
			name:      "under-18 date is removed without marking adult",
			in:        memberDates{DateOfBirth: "2010-01-01", HasDateOfBirth: true},
			wantUnset: []string{fieldDateOfBirth},
		},
		{
			name:      "already verified keeps its timestamp",
			in:        memberDates{DateOfBirth: "1980-01-01", HasDateOfBirth: true, AdultVerifiedAt: "2026-01-01T00:00:00Z"},
			wantUnset: []string{fieldDateOfBirth},
		},
		{
			name:      "erased account's empty values are removed",
			in:        memberDates{HasDateOfBirth: true, HasBirthday: true},
			wantUnset: []string{fieldDateOfBirth, fieldBirthday},
		},
		{
			name:      "unreadable broadcast birthday is removed",
			in:        memberDates{Birthday: "sometime in April", HasBirthday: true, BroadcastBirthday: true},
			wantUnset: []string{fieldBirthday},
		},
	}
	for _, c := range cases {
		p := planFor(c.in, now)
		if len(p.set) != len(c.wantSet) {
			t.Errorf("%s: set = %v, want %v", c.name, p.set, c.wantSet)
		}
		for k, v := range c.wantSet {
			if p.set[k] != v {
				t.Errorf("%s: set[%s] = %v, want %v", c.name, k, p.set[k], v)
			}
		}
		if len(p.unset) != len(c.wantUnset) {
			t.Errorf("%s: unset = %v, want %v", c.name, p.unset, c.wantUnset)
		}
		for _, k := range c.wantUnset {
			if _, ok := p.unset[k]; !ok {
				t.Errorf("%s: %s not unset", c.name, k)
			}
		}
	}
}

func TestTallyCountsOnlyChanges(t *testing.T) {
	now := time.Now()
	var tl tally
	tl.add(planFor(memberDates{Birthday: "04-12", HasBirthday: true, BroadcastBirthday: true}, now))
	tl.add(planFor(memberDates{DateOfBirth: "1990-04-12", HasDateOfBirth: true}, now))
	if tl.scanned != 2 || tl.changed != 1 || tl.dobRemoved != 1 || tl.adultVerified != 1 {
		t.Fatalf("tally = %+v", tl)
	}
}
