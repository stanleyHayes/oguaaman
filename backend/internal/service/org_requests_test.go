package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// Request-a-new-institution (Creator plan §4.1.1): kind catalog validation,
// duplicate guards, and the one-click steward approve that creates the
// verified org and seats the requester as its first manager.

func TestRequestNewInstitution_happyPath(t *testing.T) {
	orgs := &recOrgs{}
	s := svcWith(orgs, stubMembers{}, &recClaims{})

	c, err := s.RequestNewInstitution(context.Background(), "m1", "Aboom Methodist JHS", "school", "Aboom, Cape Coast", "", "I started the school.")
	if err != nil {
		t.Fatalf("RequestNewInstitution returned error: %v", err)
	}
	if c.Status != domain.ClaimPending || c.NewOrg == nil {
		t.Fatalf("expected a pending create-request, got %+v", c)
	}
	if c.NewOrg.Kind != "school" || c.NewOrg.Seat != "Aboom, Cape Coast" {
		t.Errorf("newOrg payload malformed: %+v", c.NewOrg)
	}
	if c.RequestedRole != "Founder" {
		t.Errorf("role = %q, want Founder (default)", c.RequestedRole)
	}
}

func TestRequestNewInstitution_validatesKindAndSeat(t *testing.T) {
	s := svcWith(&recOrgs{}, stubMembers{}, &recClaims{})

	if _, err := s.RequestNewInstitution(context.Background(), "m1", "Some Place", "wizardry", "Aboom", "", ""); err == nil {
		t.Error("a kind outside the catalog must be refused")
	}
	if _, err := s.RequestNewInstitution(context.Background(), "m1", "Some Place", "school", "  ", "", ""); err == nil {
		t.Error("an empty seat must be refused")
	}
}

func TestRequestNewInstitution_blocksDuplicateOfExisting(t *testing.T) {
	orgs := &recOrgs{orgs: []domain.Organization{{ID: "org-bak", Name: "Bakaano M/A Basic School"}}}
	s := svcWith(orgs, stubMembers{}, &recClaims{})

	if _, err := s.RequestNewInstitution(context.Background(), "m1", "bakaano m/a basic school", "school", "Bakaano", "", ""); err == nil {
		t.Error("requesting an institution that already exists must point at the claim flow")
	}
}

func TestRequestNewInstitution_oneOpenRequestPerMember(t *testing.T) {
	s := svcWith(&recOrgs{}, stubMembers{}, &recClaims{})
	if _, err := s.RequestNewInstitution(context.Background(), "m1", "Aboom Methodist JHS", "school", "Aboom", "", ""); err != nil {
		t.Fatalf("first request: %v", err)
	}
	if _, err := s.RequestNewInstitution(context.Background(), "m1", "Another School", "school", "Aboom", "", ""); err == nil {
		t.Error("a second open request must be refused while the first awaits review")
	}
}

// The steward's single approve click creates the verified org (with the seat),
// attaches + approves the claim, and seats the requester's office.
func TestReviewOrgClaim_newInstitutionApproveCreatesOrg(t *testing.T) {
	orgs := &recOrgs{}
	claims := &recClaims{}
	s := svcWith(orgs, stubMembers{}, claims)

	c, err := s.RequestNewInstitution(context.Background(), "m1", "Aboom Methodist JHS", "school", "Aboom, Cape Coast", "Headteacher", "")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	if err := s.ReviewOrgClaim(context.Background(), c.ID, true, "steward-1"); err != nil {
		t.Fatalf("review: %v", err)
	}

	if len(orgs.orgs) != 1 {
		t.Fatalf("approve should create the org, got %d orgs", len(orgs.orgs))
	}
	org := orgs.orgs[0]
	if org.Slug != "aboom-methodist-jhs" || !org.Verified || org.Kind != "school" || org.Jurisdiction != "Aboom, Cape Coast" {
		t.Errorf("created org malformed: %+v", org)
	}
	got, _ := claims.Get(context.Background(), c.ID)
	if got.Status != domain.ClaimApproved || got.OrgID != org.ID {
		t.Errorf("claim should be approved and attached to the new org, got %+v", got)
	}
	managed, err := s.ManagedOrgs(context.Background(), "m1")
	if err != nil || len(managed) != 1 || managed[0].ID != org.ID {
		t.Errorf("requester should manage the new org immediately, got %v %v", managed, err)
	}
	found := false
	for _, o := range org.Offices {
		if o.HolderID == "m1" && o.Role == "Headteacher" {
			found = true
		}
	}
	if !found {
		t.Error("the requester's office should be seated on the new org")
	}
}

// Rejecting a create-request creates nothing.
func TestReviewOrgClaim_newInstitutionRejectCreatesNothing(t *testing.T) {
	orgs := &recOrgs{}
	claims := &recClaims{}
	s := svcWith(orgs, stubMembers{}, claims)

	c, _ := s.RequestNewInstitution(context.Background(), "m1", "Aboom Methodist JHS", "school", "Aboom", "", "")
	if err := s.ReviewOrgClaim(context.Background(), c.ID, false, "steward-1"); err != nil {
		t.Fatalf("reject: %v", err)
	}
	if len(orgs.orgs) != 0 {
		t.Error("a rejected request must not create the org")
	}
	got, _ := claims.Get(context.Background(), c.ID)
	if got.Status != domain.ClaimRejected {
		t.Errorf("status = %q, want rejected", got.Status)
	}
}

// MyInstitutionRequests returns only create-requests, newest first.
func TestMyInstitutionRequests_filtersAndSorts(t *testing.T) {
	claims := &recClaims{claims: []domain.OrgClaim{
		{ID: "clm-plain", MemberID: "m1", Status: domain.ClaimApproved, OrgID: "org-x", CreatedAt: "2026-07-01"},
		{ID: "clm-old", MemberID: "m1", Status: domain.ClaimRejected, NewOrg: &domain.NewOrgRequest{Name: "Old"}, CreatedAt: "2026-07-02"},
		{ID: "clm-new", MemberID: "m1", Status: domain.ClaimPending, NewOrg: &domain.NewOrgRequest{Name: "New"}, CreatedAt: "2026-07-03"},
	}}
	s := svcWith(&recOrgs{}, stubMembers{}, claims)

	reqs, err := s.MyInstitutionRequests(context.Background(), "m1")
	if err != nil {
		t.Fatalf("MyInstitutionRequests: %v", err)
	}
	if len(reqs) != 2 || reqs[0].ID != "clm-new" || reqs[1].ID != "clm-old" {
		t.Errorf("expected create-requests newest-first, got %+v", reqs)
	}
}

// The steward queue surfaces create-requests with the requested name.
func TestPendingClaims_enrichesNewOrgRequests(t *testing.T) {
	claims := &recClaims{claims: []domain.OrgClaim{
		{ID: "clm-new", MemberID: "m1", Status: domain.ClaimPending, CreatedAt: "2026-07-03",
			NewOrg: &domain.NewOrgRequest{Name: "Aboom Methodist JHS", Kind: "school", Seat: "Aboom"}},
	}}
	s := svcWith(&recOrgs{}, teamMembers{members: []domain.Member{{ID: "m1", DisplayName: "Kofi"}}}, claims)

	pending, err := s.PendingClaims(context.Background())
	if err != nil || len(pending) != 1 {
		t.Fatalf("PendingClaims: %v %v", pending, err)
	}
	if pending[0].OrgName != "Aboom Methodist JHS" {
		t.Errorf("OrgName = %q, want the requested institution's name", pending[0].OrgName)
	}
}
