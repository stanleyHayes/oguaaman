package mongo

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/oguaa/backend/internal/domain"
)

// A stored job keeps the domain fields at the top level (the queries and
// indexes address them by name) plus a real date for the one-year TTL.
func TestNewsJobDocInlinesTheJobWithATTLDate(t *testing.T) {
	at := time.Date(2027, 10, 2, 0, 0, 0, 0, time.UTC)
	raw, err := bson.Marshal(newsJobDoc{NewsResearchJob: domain.NewsResearchJob{
		ID: "nrj-1", ArticleID: "news-1", LeadURL: "https://gna.org.gh/x", Status: domain.NewsJobQueued, LockedUntil: "t",
	}, ExpireAt: at})
	if err != nil {
		t.Fatal(err)
	}
	var m bson.M
	if err := bson.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	if m["_id"] != "nrj-1" || m[fJobArticleID] != "news-1" || m[fJobLeadURL] != "https://gna.org.gh/x" || m[fJobStatus] != domain.NewsJobQueued || m[fJobLockedUntil] != "t" {
		t.Fatalf("stored = %v", m)
	}
	if dt, ok := m[fJobExpireAt].(bson.DateTime); !ok || dt.Time().UTC() != at {
		t.Fatalf("expireAt = %#v", m[fJobExpireAt])
	}
	var back domain.NewsResearchJob
	if err := bson.Unmarshal(raw, &back); err != nil || back.ID != "nrj-1" || back.LockedUntil != "t" {
		t.Fatalf("decode = %+v, %v", back, err)
	}
}
