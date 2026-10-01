package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// R19: a client's review of an agent can be reported (agent_review); an urgent
// report hides it from the agent's page and rating, and dismissing the report
// puts it back.
func TestSubmitReport_agentReview(t *testing.T) {
	ctx := context.Background()
	agents := &stubAgents{m: map[string]domain.Agent{"agent-1": {ID: "agent-1", Slug: "kwame", DisplayName: "Kwame", RatingCount: 2, RatingAvg: 3}}}
	reviews := newStubReviews()
	reviews.m["job-1"] = domain.AgentReview{ID: "rev-job-1", JobID: "job-1", AgentID: "agent-1", ClientMemberID: "m-client", ClientName: "Esi", Rating: 1, Body: "abusive"}
	reviews.m["job-2"] = domain.AgentReview{ID: "rev-job-2", JobID: "job-2", AgentID: "agent-1", ClientMemberID: "m-other", Rating: 5}
	f, reps := &fakeRepo{}, &fakeReports{}
	members := &suspendMembers{lfMembers: lfMembers{members: []domain.Member{{ID: "m-rep", PhoneVerified: true}}}}
	svc := New(Deps{Listings: f, Members: members, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: stubNotifs{},
		Follows: stubFollows{}, Claims: stubClaims{}, News: stubNews{}, Reports: reps, Timeline: stubTimeline{},
		Agents: agents, AgentReviews: reviews})
	jobs := NewAgentJobsService(&stubJobs{m: map[string]domain.AgentJob{}}, agents, reviews, stubNotifs{}, nil, "", 5)

	rep, err := svc.SubmitReport(ctx, ReportInput{TargetType: domain.ReportTargetAgentReview, TargetID: "rev-job-1", Reason: domain.ReasonNCII, ReporterID: "m-rep"})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if !rep.AutoHidden || rep.TargetOwnerID != "m-client" || rep.TargetTitle != "Review of Kwame by Esi" || rep.Evidence == "" {
		t.Fatalf("report = %+v", rep)
	}
	public, _ := jobs.AgentReviews(ctx, "kwame")
	if len(public) != 1 || public[0].ID != "rev-job-2" {
		t.Fatalf("public agent reviews = %+v, want the hidden one left out", public)
	}
	if a := agents.m["agent-1"]; a.RatingCount != 1 || a.RatingAvg != 5 {
		t.Fatalf("rating = %d / %v, want the hidden review out of the average", a.RatingCount, a.RatingAvg)
	}
	if err := svc.ResolveReport(ctx, rep.ID, ResolveReportInput{Status: domain.ReportDismissed}, "m-c"); err != nil {
		t.Fatalf("dismiss: %v", err)
	}
	if public, _ := jobs.AgentReviews(ctx, "kwame"); len(public) != 2 || agents.m["agent-1"].RatingCount != 2 {
		t.Fatalf("a dismissed report restores the review: %+v", public)
	}
	if _, err := svc.SubmitReport(ctx, ReportInput{TargetType: domain.ReportTargetAgentReview, TargetID: "nope", Reason: domain.ReasonOther}); err == nil {
		t.Fatal("an unknown agent review is not found")
	}
}
