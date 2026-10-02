package mongo

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/oguaa/backend/internal/domain"
)

func TestCampaignDayModelUpsertsAnIncrement(t *testing.T) {
	m := campaignDayModel(domain.AdCampaignDayDelta{CampaignID: "ad-1", Day: "2026-10-02", Views: 3, Unbilled: 2, Clicks: 1})
	if m.Upsert == nil || !*m.Upsert {
		t.Fatal("not an upsert")
	}
	if f := m.Filter.(bson.M); f[fAdID] != "ad-1|2026-10-02" {
		t.Fatalf("filter = %v", f)
	}
	u := m.Update.(bson.M)
	if ins := u[adOpSetOnInsert].(bson.M); ins[fAdCampaignID] != "ad-1" || ins[fAdDay] != "2026-10-02" {
		t.Fatalf("setOnInsert = %v", ins)
	}
	if inc := u[adOpInc].(bson.M); inc[fAdViews] != int64(3) || inc[fAdUnbilled] != int64(2) || inc[fAdClicks] != int64(1) {
		t.Fatalf("inc = %v", inc)
	}
}

func TestPlacementDayModelUpsertsOpportunities(t *testing.T) {
	m := placementDayModel(domain.AdPlacementDayDelta{Placement: "portal-feed-card", Day: "2026-10-02", Opportunities: 40})
	if f := m.Filter.(bson.M); f[fAdID] != "portal-feed-card|2026-10-02" {
		t.Fatalf("filter = %v", f)
	}
	u := m.Update.(bson.M)
	if u[adOpInc].(bson.M)[fAdOpportunities] != int64(40) || u[adOpSetOnInsert].(bson.M)[fAdPlacement] != "portal-feed-card" {
		t.Fatalf("update = %v", u)
	}
}

func TestDayRangeIsInclusive(t *testing.T) {
	r := dayRange("2026-10-01", "2026-10-31")[fAdDay].(bson.M)
	if r[adOpGte] != "2026-10-01" || r[adOpLte] != "2026-10-31" {
		t.Fatalf("range = %v", r)
	}
}
