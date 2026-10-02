package mongo

import (
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

func TestAdTransitionUpdateSetsStatusAndAppendsHistory(t *testing.T) {
	change := domain.AdStatusChange{From: "active", To: "removed", At: "2026-10-02T09:00:00Z", ActorName: "Curator", Reason: "Misleading"}
	u := adTransitionUpdate(domain.AdStatusRemoved, change, map[string]any{"removalReason": "Misleading", fAdRefundOwed: domain.AdRefundRemoved, fieldStatus: "ignored"})
	set := u[opSet].(bson.M)
	if set[fieldStatus] != domain.AdStatusRemoved || set[fAdUpdatedAt] != change.At || set["removalReason"] != "Misleading" || set[fAdRefundOwed] != domain.AdRefundRemoved {
		t.Fatalf("set = %v", set)
	}
	if u[adOpPush].(bson.M)[fAdStatusHistory] != change {
		t.Fatalf("push = %v", u[adOpPush])
	}
}

func TestMarkPaidPipelineClampsAnActiveStartToToday(t *testing.T) {
	p := markPaidPipeline("oguaa-adv-ad-1-2", "2026-10-03T08:00:00Z", false, domain.AdStatusActive)
	raw, err := bson.Marshal(bson.M{"p": p})
	if err != nil {
		t.Fatal(err)
	}
	s := bson.Raw(raw).String()
	for _, want := range []string{`"$max"`, `"2026-10-03"`, `"$literal"`, `"oguaa-adv-ad-1-2"`, `"$concatArrays"`, `"status": "active"`, `"$unset"`} {
		if !strings.Contains(s, want) {
			t.Errorf("pipeline lacks %s: %s", want, s)
		}
	}
	scheduled, _ := bson.Marshal(bson.M{"p": markPaidPipeline("r", "2026-10-03T08:00:00Z", false, domain.AdStatusScheduled)})
	if strings.Contains(bson.Raw(scheduled).String(), `"$max"`) {
		t.Error("a scheduled campaign keeps its start date")
	}
}

func TestOverlappingFilterCountsOnlyInventoryHolders(t *testing.T) {
	f := overlappingFilter("portal-feed-card", "2026-10-05", "2026-10-18", "2026-10-02T09:00:00Z")
	if f[fAdStartDate].(bson.M)[adOpLte] != "2026-10-18" || f[fAdEndDate].(bson.M)[adOpGte] != "2026-10-05" {
		t.Fatalf("window = %v", f)
	}
	or := f[opOr].(bson.A)
	if len(or) != 4 || or[3].(bson.M)[fAdCheckoutAt].(bson.M)[adOpGte] != "2026-10-02T08:00:00Z" {
		t.Fatalf("a checkout in its grace hour holds inventory: %v", or)
	}
	if or[1].(bson.M)[fAdApprovalExpires].(bson.M)[adOpGte] != "2026-10-02T09:00:00Z" {
		t.Fatalf("statuses = %v", or)
	}
}

func TestLibraryFilter(t *testing.T) {
	pol := libraryFilter(domain.AdLibraryFilter{Tab: domain.AdLibraryPolitical, Query: "Ama (NPP)", Now: "2026-10-02T00:00:00Z"})
	if pol[fAdPolitical] != true || pol[fAdStatusHistory+".to"] == nil || pol["sponsorLine"].(bson.M)["$regex"] != `Ama \(NPP\)` {
		t.Fatalf("political filter = %v", pol)
	}
	run := libraryFilter(domain.AdLibraryFilter{Tab: domain.AdLibraryRunning})
	if run[fieldStatus] != domain.AdStatusActive || run[fAdPolitical] != nil {
		t.Fatalf("running filter = %v", run)
	}
}

func TestRefundUpdateNeverTouchesAProcessedRefund(t *testing.T) {
	filter, update := refundUpdate("ad-1", "ad-1-removed", domain.AdRefundProcessed, "rf-9", "2026-10-02T09:00:00Z", 7500)
	elem := filter[fAdRefunds].(bson.M)["$elemMatch"].(bson.M)
	if elem["id"] != "ad-1-removed" || elem[fieldStatus].(bson.M)[adOpNe] != domain.AdRefundProcessed {
		t.Fatalf("filter = %v", filter)
	}
	if update[adOpInc].(bson.M)["refundedPesewas"] != int64(7500) || update[opSet].(bson.M)["refunds.$.paystackRefundId"] != "rf-9" {
		t.Fatalf("update = %v", update)
	}
	_, pending := refundUpdate("ad-1", "x", domain.AdRefundPending, "", "t", 7500)
	if pending[adOpInc] != nil {
		t.Fatal("only a processed refund adds to refundedPesewas")
	}
}

func TestAdListFilterAndDueFilter(t *testing.T) {
	yes := true
	f := adListFilter(domain.AdFilter{Status: "active", Political: &yes, Placement: "app-card", SponsorID: "asp-1", PaymentStatus: "success"})
	if len(f) != 5 || f[fAdPolitical] != true {
		t.Fatalf("list filter = %v", f)
	}
	if len(adListFilter(domain.AdFilter{})) != 0 {
		t.Fatal("an empty filter matches everything")
	}
	due := dueFilter("2026-10-31T09:00:00Z")
	or := due[opOr].(bson.A)
	if len(or) != 4 {
		t.Fatalf("due filter = %v", due)
	}
	poll := or[3].(bson.M)[fAdRefunds].(bson.M)["$elemMatch"].(bson.M)
	if poll[fieldStatus] != domain.AdRefundManualCheck || poll[fieldCreatedAt].(bson.M)[adOpGte] != "2026-10-01T09:00:00Z" {
		t.Fatalf("manual_check refunds are polled for 30 days: %v", poll)
	}
}

// A paying reference becomes the reference; every other checkout reference
// (the current one included) stays findable in pastReferences.
func TestPaidReferencesKeepsEveryOtherCheckout(t *testing.T) {
	for name, p := range map[string]mongo.Pipeline{
		"paid":   markPaidPipeline("oguaa-adv-a", "2026-10-03T08:00:00Z", false, domain.AdStatusScheduled),
		"closed": markPaidClosedPipeline("oguaa-adv-a", "2026-10-03T08:00:00Z", false),
	} {
		raw, err := bson.Marshal(bson.M{"p": p})
		if err != nil {
			t.Fatal(err)
		}
		s := bson.Raw(raw).String()
		for _, want := range []string{`"$setDifference"`, `"$setUnion"`, `"$pastReferences"`, `"$reference"`, `"oguaa-adv-a"`, `"$unset"`} {
			if !strings.Contains(s, want) {
				t.Errorf("%s pipeline lacks %s: %s", name, want, s)
			}
		}
		if name == "closed" && !strings.Contains(s, `"refundOwed": "paid_after_close"`) {
			t.Errorf("a payment on a closed campaign owes a full refund: %s", s)
		}
	}
}

// Refunds of the campaign's own payment are capped at the price total in the
// write; refunds of a duplicate charge are not.
func TestRefundFilterCapsOwnPaymentOnly(t *testing.T) {
	own := refundFilter("ad-1", domain.AdRefund{ID: "ad-1-manual-1", AmountPesewas: 400, Reason: domain.AdRefundManual})
	raw, err := bson.Marshal(own)
	if err != nil {
		t.Fatal(err)
	}
	s := bson.Raw(raw).String()
	for _, want := range []string{`"$expr"`, `"$price.totalPesewas"`, `"$$this.amountPesewas"`, `"duplicate_charge"`, `"failed"`, `{"$numberLong":"400"}`} {
		if !strings.Contains(s, want) {
			t.Errorf("own-payment refund filter lacks %s: %s", want, s)
		}
	}
	dup := refundFilter("ad-1", domain.AdRefund{ID: "ad-1-duplicate-x", AmountPesewas: 15000, Reason: domain.AdRefundDuplicateCharge})
	if _, capped := dup[adOpExpr]; capped {
		t.Errorf("a duplicate charge has its own budget: %v", dup)
	}
}

func TestResolveRefundOnlyTouchesManualCheck(t *testing.T) {
	filter, update := resolveRefundUpdate("ad-1", "ad-1-removed", domain.AdRefundProcessed, "Refunded on the dashboard", "t", 7500)
	if filter[fAdRefunds].(bson.M)["$elemMatch"].(bson.M)[fieldStatus] != domain.AdRefundManualCheck {
		t.Fatalf("filter = %v", filter)
	}
	if update[adOpInc].(bson.M)["refundedPesewas"] != int64(7500) || update[opSet].(bson.M)["refunds.$.note"] != "Refunded on the dashboard" {
		t.Fatalf("update = %v", update)
	}
	if _, failed := resolveRefundUpdate("ad-1", "x", domain.AdRefundFailed, "n", "t", 0); failed[adOpInc] != nil {
		t.Fatal("a failed refund moves no money")
	}
}

func TestSponsorStatusUpdateStampsVerification(t *testing.T) {
	v := sponsorStatusUpdate(domain.AdSponsorVerified, "", "Curator", "t")[opSet].(bson.M)
	if v["verifiedByName"] != "Curator" || v["verifiedAt"] != "t" {
		t.Fatalf("verify = %v", v)
	}
	r := sponsorStatusUpdate(domain.AdSponsorRejected, "No registration", "Curator", "t")[opSet].(bson.M)
	if r["verifiedByName"] != nil || r["reviewNote"] != "No registration" {
		t.Fatalf("reject = %v", r)
	}
}

// Political sponsors' documents stay while a campaign runs or is retained.
func TestPoliticalRetentionFilter(t *testing.T) {
	f := politicalRetentionFilter("asp-1", "2026-10-02T00:00:00Z")
	if f[fAdSponsorID] != "asp-1" || f[fAdPolitical] != true || len(f[opOr].(bson.A)) != 2 {
		t.Fatalf("filter = %v", f)
	}
}

// The ad record's bson field names match what the repository filters on.
func TestAdCampaignBSONFieldNames(t *testing.T) {
	raw, err := bson.Marshal(domain.AdCampaign{
		ID: "ad-1", MemberID: "m", Reference: "r", PastReferences: []string{"p"}, CheckoutAt: "c", RefundOwed: "removed",
		RetainUntil: "x", ElectionID: "e", ApprovalExpiresAt: "a", Political: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	doc := bson.Raw(raw)
	for _, key := range []string{fMemberID, fieldReference, fAdPastReferences, fAdCheckoutAt, fAdRefundOwed, fAdRetainUntil, fAdElectionID,
		fAdApprovalExpires, fAdPolitical, fAdPaymentStatus, fAdPlacement, fAdSponsorID, fAdStartDate, fAdEndDate, fAdDelivered, fAdStatusHistory} {
		if _, err := doc.LookupErr(key); err != nil {
			t.Errorf("AdCampaign has no bson field %q", key)
		}
	}
}
