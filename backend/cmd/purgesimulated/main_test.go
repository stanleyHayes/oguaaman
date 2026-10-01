package main

import (
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// Only a settled simulated pledge has a credit to take back, from the total
// its kind credited.
func TestReversalFor(t *testing.T) {
	pledge := domain.Pledge{Reference: "plg-a-1", ProjectID: "pr-1", NetPesewas: 9_500, Status: domain.PledgeSuccess, Simulated: true}
	rev, ok := reversalFor(pledge)
	if !ok || rev.listingID != "pr-1" || rev.reference != "plg-a-1" || rev.inc["details.raisedPesewas"] != int64(-9_500) || rev.inc["details.backers"] != -1 {
		t.Fatalf("pledge reversal = %+v %v", rev, ok)
	}
	donation := pledge
	donation.Kind = domain.PledgeKindDonation
	if rev, _ := reversalFor(donation); rev.inc["details.donationsNetPesewas"] != int64(-9_500) || rev.inc["details.donorCount"] != -1 {
		t.Fatalf("donation reversal = %+v", rev)
	}
	live := pledge
	live.Simulated = false
	pending := pledge
	pending.Status = domain.PledgePending
	for _, p := range []domain.Pledge{live, pending} {
		if _, ok := reversalFor(p); ok {
			t.Fatalf("reversal for %+v", p)
		}
	}
}
