package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// ── topic screens after queueing (spec §2.1; editorial standards) ────────────
//
// Sensitive stories never get an AI write-up or image, and political ones get
// no AI write-up while election mode is on, whenever the rule starts to apply:
// the worker, Rerun and Approve all screen again.

// setLead rewrites the queued job's lead (as if a different lead had been
// queued before the rules changed).
func (f *deskFixture) setLead(title, teaser string) {
	f.jobs.mu.Lock()
	defer f.jobs.mu.Unlock()
	for id, j := range f.jobs.rows {
		j.LeadTitle, j.LeadTeaser = title, teaser
		f.jobs.rows[id] = j
	}
}

// A lead that a newly added keyword, or election mode switched on since it
// was queued, now blocks is blocked before any Claude call, without counting
// the attempt; the brief mirrors the status.
func TestNewsDeskScreensAgainBeforeAnyCall(t *testing.T) {
	cases := []struct {
		name   string
		change func(t *testing.T, f *deskFixture)
		reason string
	}{
		{"keyword added after queueing", func(t *testing.T, f *deskFixture) {
			f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.ExtraBlockedKeywords = []string{"kotokuraba"} })
		}, blockedSensitive},
		{"built-in topic", func(_ *testing.T, f *deskFixture) {
			f.setLead("Suspect remanded over Kotokuraba market theft", "Traders counted their losses.")
		}, blockedSensitive},
		{"political lead, election mode switched on", func(t *testing.T, f *deskFixture) {
			f.setLead("NDC candidate tours Kotokuraba market", "The parliamentary candidate met traders.")
			f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.ElectionModeManual = true })
		}, blockedElectionMode},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_ok"))
			c.change(t, f)
			job := f.run(t)
			if job.Status != domain.NewsJobBlocked || job.BlockedReason != c.reason || job.Draft != nil || job.Attempts != 0 {
				t.Fatalf("job = %+v", job)
			}
			if f.claude.callCount() != 0 || f.images.calls() != 0 || f.usage.today(keyReports) != 0 || f.usage.today(keyResearchUSD) != 0 {
				t.Fatalf("calls %d, images %d, reports %d, spend %d", f.claude.callCount(), f.images.calls(),
					f.usage.today(keyReports), f.usage.today(keyResearchUSD))
			}
			if a := f.articleNow(t); a.ResearchStatus != domain.NewsJobBlocked || a.Title != f.article.Title {
				t.Fatalf("brief = %+v", a)
			}
		})
	}
}

// The built-in screen covers children and students, courts, crime and
// police, accidents, fires and deaths, singular or plural, as whole words,
// so these leads are blocked before any Claude call.
func TestTierCKeywordsCoverSensitiveLeads(t *testing.T) {
	blocked := []string{
		"Pupils injured as bus crashes near Elmina", "Two children drowned at Brenu beach", "Schoolchildren get new desks",
		"Students protest at Adisadel College", "Minors held after a fight", "Teenagers sentenced for robbery",
		"Juvenile offenders moved", "Judge adjourns trial of trader", "Courts close for the holidays", "Man remanded over assault",
		"Convicted trader appeals", "Suspects arrested at Kotokuraba", "Police patrol Kotokuraba market", "Murder at Abura",
		"Fire guts stalls at Kotokuraba market", "Fires break out in Pedu", "Accidents on the Takoradi road",
		"Two dead after crash at Kakum", "Man killed in Moree clash", "Suicide case at Ola", "Robberies rise in Pedu",
		"Child jailed", "Three injured in blaze",
	}
	for _, title := range blocked {
		if !tierCHit(title, "", nil) {
			t.Errorf("%q was not blocked", title)
		}
	}
	if !tierCHit("Market news", "Two pupils were hurt when a wall fell.", nil) {
		t.Error("the teaser must be screened too")
	}
	for _, title := range []string{
		"Kotokuraba market reopens after repairs", "Courtyard concert at Cape Coast Castle", "Fireflies light up Fetu Afahye",
		"A minority of traders want new stalls", "Crashing waves draw tourists to Elmina", "Studentship scheme opens",
	} {
		if tierCHit(title, "", nil) {
			t.Errorf("%q was blocked (whole words only)", title)
		}
	}
	if !politicalText("MPs tour the market") || !politicalText("Votes counted in the by-elections") {
		t.Error("political keywords must match their plurals")
	}
	if ok, _ := newDeskFixture(t, nil).desk.EnqueueBrief(context.Background(), domain.NewsArticle{ID: "n9"},
		newsLead{URL: "https://x.test/9", Title: "Pupils injured as bus crashes near Elmina"}); ok {
		t.Error("a lead about injured pupils was queued for AI drafting")
	}
}

// A story Call 2 marks political while election mode is on is blocked after
// the calls, keeps no draft and gets no image, whether election mode was on
// when the (non-political-looking) lead was queued or came on afterwards.
func TestNewsDeskBlocksPoliticalReportsInElectionMode(t *testing.T) {
	t.Run("on when queued", func(t *testing.T) { checkPoliticalBlocked(t, true) })
	t.Run("switched on after queueing", func(t *testing.T) { checkPoliticalBlocked(t, false) })
}

func checkPoliticalBlocked(t *testing.T, onAtQueue bool) {
	t.Helper()
	mutate := func(s *domain.NewsDeskSettings) { s.ElectionModeManual = onAtQueue }
	f := newDeskFixture(t, mutate, researchReply(goodParas()), fixture(t, "structure_political"))
	if !onAtQueue {
		f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.ElectionModeManual = true })
	}
	job := f.run(t)
	if job.Status != domain.NewsJobBlocked || job.BlockedReason != blockedElectionMode || job.Draft != nil {
		t.Fatalf("job = %+v", job)
	}
	if f.claude.callCount() != 2 || f.images.calls() != 0 || len(f.store.uploads) != 0 {
		t.Fatalf("calls %d, images %d", f.claude.callCount(), f.images.calls())
	}
	if a := f.articleNow(t); a.ResearchStatus != domain.NewsJobBlocked || a.Tier != domain.NewsTierBrief {
		t.Fatalf("brief = %+v", a)
	}
}

// Approve refuses a political draft while election mode is on (the draft's
// flag, or political words the editor added), and a draft whose lead a new
// keyword now blocks; the draft stays ready and the brief untouched.
func TestNewsDeskApproveScreens(t *testing.T) {
	ctx := context.Background()
	editor := AuditActor{ID: "m-ed", Name: "Kofi Mensah"}

	f := newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_political"))
	job := f.run(t)
	if job.Status != domain.NewsJobReady || !job.Draft.Political {
		t.Fatalf("job = %+v", job)
	}
	f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.ElectionModeManual = true })
	if _, err := f.desk.Approve(ctx, f.article.ID, approveBody(job.Draft), editor); !errors.Is(err, ErrElectionMode) {
		t.Fatalf("political approve in election mode = %v", err)
	}
	if j, a := f.jobs.only(t), f.articleNow(t); j.Status != domain.NewsJobReady || a.Tier != domain.NewsTierBrief || a.Title != f.article.Title {
		t.Fatalf("a refused approve changed state: job %s, article %+v", j.Status, a)
	}
	f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.ElectionModeManual = false })
	if _, err := f.desk.Approve(ctx, f.article.ID, approveBody(job.Draft), editor); err != nil {
		t.Fatalf("approve after election mode = %v", err)
	}

	f = newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_ok"))
	job = f.run(t)
	f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.ElectionModeManual = true })
	edited := approveBody(job.Draft)
	edited.Body += "\n\nThe NDC candidate for the area also visited the market."
	if _, err := f.desk.Approve(ctx, f.article.ID, edited, editor); !errors.Is(err, ErrElectionMode) {
		t.Fatalf("editor-added politics in election mode = %v", err)
	}
	f.saveSettings(t, func(s *domain.NewsDeskSettings) {
		s.ElectionModeManual = false
		s.ExtraBlockedKeywords = []string{"kotokuraba"}
	})
	if _, err := f.desk.Approve(ctx, f.article.ID, approveBody(job.Draft), editor); !errors.Is(err, ErrTopicBlocked) {
		t.Fatalf("approve of a newly blocked topic = %v", err)
	}
	if j := f.jobs.only(t); j.Status != domain.NewsJobReady {
		t.Fatalf("job = %+v", j)
	}
}

// Rerun screens the lead too: a blocked lead is refused with no status change
// (so a political story can be rerun once election mode ends).
func TestNewsDeskRerunScreens(t *testing.T) {
	ctx := context.Background()
	f := newDeskFixture(t, nil, researchReply(goodParas()), fixture(t, "structure_political"))
	f.run(t)
	if _, err := f.desk.Reject(ctx, f.article.ID, "Needs a second source on the fees.", AuditActor{Name: "Ed"}); err != nil {
		t.Fatal(err)
	}
	f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.ElectionModeManual = true })
	if _, err := f.desk.Rerun(ctx, f.article.ID); !errors.Is(err, ErrElectionMode) {
		t.Fatalf("rerun of a political draft in election mode = %v", err)
	}
	f.saveSettings(t, func(s *domain.NewsDeskSettings) {
		s.ElectionModeManual = false
		s.ExtraBlockedKeywords = []string{"kotokuraba"}
	})
	if _, err := f.desk.Rerun(ctx, f.article.ID); !errors.Is(err, ErrTopicBlocked) {
		t.Fatalf("rerun of a newly blocked topic = %v", err)
	}
	if j := f.jobs.only(t); j.Status != domain.NewsJobRejected {
		t.Fatalf("a refused rerun changed the job: %+v", j)
	}
	f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.ExtraBlockedKeywords = []string{} })
	if j, err := f.desk.Rerun(ctx, f.article.ID); err != nil || j.Status != domain.NewsJobQueued {
		t.Fatalf("rerun once clear = %+v, %v", j, err)
	}
	if f.claude.callCount() != 2 {
		t.Fatalf("a refused rerun reached Claude: %d calls", f.claude.callCount())
	}
}
