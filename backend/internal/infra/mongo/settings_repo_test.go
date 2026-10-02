package mongo

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/oguaa/backend/internal/domain"
)

type sampleSettings struct {
	Enabled bool     `bson:"enabled"`
	Words   []string `bson:"words"`
	Version int      `bson:"version"`
}

func TestSettingsDocumentKeysByIDAndForcesTheVersion(t *testing.T) {
	doc, err := settingsDocument("ads", sampleSettings{Enabled: true, Words: []string{"a"}, Version: 41}, 4)
	if err != nil {
		t.Fatal(err)
	}
	if doc[0].Key != "_id" || doc[0].Value != "ads" {
		t.Fatalf("first field = %v, want _id ads", doc[0])
	}
	versions := 0
	for _, f := range doc {
		if f.Key == fSettingsVersion {
			versions++
			if f.Value != 4 {
				t.Errorf("version = %v, want 4 (expected+1, never the caller's value)", f.Value)
			}
		}
	}
	if versions != 1 {
		t.Errorf("stored document has %d version fields", versions)
	}
	// It decodes back into the caller's struct.
	raw, _ := bson.Marshal(doc)
	var back sampleSettings
	if err := bson.Unmarshal(raw, &back); err != nil || !back.Enabled || back.Version != 4 || len(back.Words) != 1 {
		t.Fatalf("round trip = %+v, %v", back, err)
	}
}

func TestSettingsVersionFilterMatchesTheReadVersion(t *testing.T) {
	f := settingsVersionFilter("news_desk", 3)
	if f["_id"] != "news_desk" || f[fSettingsVersion] != 3 {
		t.Fatalf("filter = %v", f)
	}
}

func TestClampAuditLimit(t *testing.T) {
	for in, want := range map[int]int{0: 50, -3: 50, 1: 1, 50: 50, 200: 200, 5000: 200} {
		if got := clampAuditLimit(in); got != want {
			t.Errorf("clampAuditLimit(%d) = %d, want %d", in, got, want)
		}
	}
}

func TestUsageIncUpdateAddsNAndStampsExpiry(t *testing.T) {
	u := usageIncUpdate("2026-10-02", 1_830_000)
	if u["$inc"].(bson.M)["count"] != int64(1_830_000) {
		t.Fatalf("update = %v", u)
	}
	exp := u["$setOnInsert"].(bson.M)["expireAt"].(time.Time)
	if want := time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC).Add(aiUsageRetention); !exp.Equal(want) {
		t.Errorf("expireAt = %v, want %v", exp, want)
	}
}

func TestSettingsAuditBSONHidesNothingItNeeds(t *testing.T) {
	raw, _ := bson.Marshal(domain.SettingsAudit{ID: "sau-1", Key: "ads", ActorID: "m1", ActorName: "Ama", At: "2026-10-02T09:00:00Z", Before: "null", After: "{}"})
	var m bson.M
	_ = bson.Unmarshal(raw, &m)
	if m["actorId"] != "m1" || m["key"] != "ads" || m["_id"] != "sau-1" {
		t.Fatalf("stored audit = %v", m)
	}
}
