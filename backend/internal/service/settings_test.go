package service

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/oguaa/backend/internal/domain"
)

// memSettings is a domain.SettingsRepository + SettingsAuditLog with the Mongo
// semantics: documents round-trip through bson (so decoding lays the stored
// fields over the caller's defaults), Put is conditional on the version.
type memSettings struct {
	mu    sync.Mutex
	docs  map[string]bson.M
	audit []domain.SettingsAudit
	gets  int
	fail  error // returned by Get when set
}

func newMemSettings() *memSettings { return &memSettings{docs: map[string]bson.M{}} }

func (m *memSettings) Get(_ context.Context, key string, out any) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.gets++
	if m.fail != nil {
		return false, m.fail
	}
	doc, ok := m.docs[key]
	if !ok {
		return false, nil
	}
	raw, _ := bson.Marshal(doc)
	return true, bson.Unmarshal(raw, out)
}

func (m *memSettings) Put(_ context.Context, key string, doc any, expected int, a domain.SettingsAudit) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cur, exists := m.docs[key]
	switch {
	case expected == 0 && exists, expected > 0 && (!exists || toIntAny(cur["version"]) != expected):
		return domain.ErrSettingsConflict
	}
	raw, err := bson.Marshal(doc)
	if err != nil {
		return err
	}
	var stored bson.M
	_ = bson.Unmarshal(raw, &stored)
	stored["version"] = expected + 1
	m.docs[key] = stored
	a.Key = key
	m.audit = append(m.audit, a)
	return nil
}

func (m *memSettings) AppendAudit(_ context.Context, a domain.SettingsAudit) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.audit = append(m.audit, a)
	return nil
}

func (m *memSettings) Audit(_ context.Context, key string, limit int) ([]domain.SettingsAudit, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []domain.SettingsAudit
	for i := len(m.audit) - 1; i >= 0 && len(out) < limit; i-- {
		if m.audit[i].Key == key {
			out = append(out, m.audit[i])
		}
	}
	return out, nil
}

func (m *memSettings) getCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.gets
}

func (m *memSettings) setFail(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.fail = err
}

func toIntAny(v any) int {
	switch n := v.(type) {
	case int32:
		return int(n)
	case int64:
		return int(n)
	case int:
		return n
	}
	return -1
}

// deskSettings mirrors the shape of a feature's settings struct.
type deskSettings struct {
	Enabled       bool     `json:"enabled" bson:"enabled"`
	MaxPerDay     int      `json:"maxPerDay" bson:"maxPerDay"`
	Blocked       []string `json:"blocked" bson:"blocked"`
	Version       int      `json:"version" bson:"version"`
	UpdatedAt     string   `json:"updatedAt" bson:"updatedAt"`
	UpdatedByName string   `json:"updatedByName" bson:"updatedByName"`
}

func deskDefaults() deskSettings { return deskSettings{MaxPerDay: 4, Blocked: []string{"alcohol"}} }

// settingsClock is a settable time source.
type settingsClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *settingsClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *settingsClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

func newSettingsFixture() (*SettingsService, *memSettings, *settingsClock) {
	repo := newMemSettings()
	s := NewSettingsService(repo, quietLog())
	clk := &settingsClock{t: time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)}
	s.now = clk.now
	return s, repo, clk
}

func TestLoadSettingsDefaultsWhenNothingIsStored(t *testing.T) {
	s, _, _ := newSettingsFixture()
	v, found := LoadSettings(context.Background(), s, "news_desk", deskDefaults)
	if found || v.MaxPerDay != 4 || v.Enabled {
		t.Fatalf("got %+v found=%v, want the defaults", v, found)
	}
	var nilSvc *SettingsService
	if v, found := LoadSettings(context.Background(), nilSvc, "ads", deskDefaults); found || v.MaxPerDay != 4 {
		t.Fatal("a nil service must give the defaults")
	}
}

func TestSaveStampsVersionAuditsAndServesTheNewValue(t *testing.T) {
	s, repo, _ := newSettingsFixture()
	ctx := context.Background()
	doc := deskDefaults()
	doc.Enabled = true
	err := s.Save(ctx, SettingsChange{Key: "news_desk", Doc: &doc, ExpectedVersion: 0, ActorID: "m1", ActorName: "Ama Mensah", Reason: "Switch the desk on"})
	if err != nil {
		t.Fatal(err)
	}
	if doc.Version != 1 || doc.UpdatedByName != "Ama Mensah" || doc.UpdatedAt != "2026-10-02T09:00:00Z" {
		t.Fatalf("stamped doc = %+v", doc)
	}
	gets := repo.getCount()
	v, found := LoadSettings(ctx, s, "news_desk", deskDefaults)
	if !found || !v.Enabled || v.Version != 1 {
		t.Fatalf("after save got %+v found=%v", v, found)
	}
	if repo.getCount() != gets {
		t.Error("the saved value should be served from the cache")
	}
	rows, _ := s.Audit(ctx, "news_desk", 10)
	if len(rows) != 1 || rows[0].Before != "null" || rows[0].ActorName != "Ama Mensah" || rows[0].Reason != "Switch the desk on" {
		t.Fatalf("audit = %+v", rows)
	}
	var after map[string]any
	if err := json.Unmarshal([]byte(rows[0].After), &after); err != nil || after["enabled"] != true || after["version"] != float64(1) {
		t.Fatalf("audit after = %s", rows[0].After)
	}

	// A second save records the previous document as "before".
	doc.MaxPerDay = 6
	if err := s.Save(ctx, SettingsChange{Key: "news_desk", Doc: &doc, ExpectedVersion: 1, ActorName: "Kofi", Reason: "More reports"}); err != nil {
		t.Fatal(err)
	}
	rows, _ = s.Audit(ctx, "news_desk", 10)
	if len(rows) != 2 || rows[0].Before != rows[1].After {
		t.Fatalf("second audit before = %s, want first after %s", rows[0].Before, rows[1].After)
	}
}

func TestSaveRefusesAStaleVersionAndAShortReason(t *testing.T) {
	s, repo, _ := newSettingsFixture()
	ctx := context.Background()
	doc := deskDefaults()
	_ = s.Save(ctx, SettingsChange{Key: "ads", Doc: &doc, Reason: "first save"})
	stale := deskDefaults()
	if err := s.Save(ctx, SettingsChange{Key: "ads", Doc: &stale, ExpectedVersion: 0, Reason: "racing save"}); !errors.Is(err, domain.ErrSettingsConflict) {
		t.Fatalf("stale save err = %v, want ErrSettingsConflict", err)
	}
	var fe *InvalidFieldError
	if err := s.Save(ctx, SettingsChange{Key: "ads", Doc: &stale, ExpectedVersion: 1, Reason: " ok "}); !errors.As(err, &fe) || fe.Field != "reason" {
		t.Fatalf("short reason err = %v", err)
	}
	if len(repo.audit) != 1 {
		t.Errorf("refused saves must not audit; have %d rows", len(repo.audit))
	}
	if err := s.Save(ctx, SettingsChange{Key: "ads", Doc: doc, Reason: "not a pointer"}); err == nil {
		t.Error("a non-pointer document must be refused")
	}
}

func TestLoadSettingsKeepsDefaultsForFieldsAddedLater(t *testing.T) {
	s, repo, _ := newSettingsFixture()
	repo.docs["news_desk"] = bson.M{"enabled": true, "version": 3}
	v, found := LoadSettings(context.Background(), s, "news_desk", deskDefaults)
	if !found || !v.Enabled || v.MaxPerDay != 4 || !slices.Equal(v.Blocked, []string{"alcohol"}) || v.Version != 3 {
		t.Fatalf("got %+v", v)
	}
}

func TestLoadSettingsServesStaleWhileOneRefreshRuns(t *testing.T) {
	s, repo, clk := newSettingsFixture()
	ctx := context.Background()
	repo.docs["ads"] = bson.M{"enabled": true, "version": 1}
	if v, _ := LoadSettings(ctx, s, "ads", deskDefaults); !v.Enabled {
		t.Fatal("first read")
	}
	clk.advance(10 * time.Second)
	repo.docs["ads"] = bson.M{"enabled": false, "version": 2}
	if v, _ := LoadSettings(ctx, s, "ads", deskDefaults); !v.Enabled {
		t.Fatal("within 30 seconds the cached value is served")
	}
	clk.advance(25 * time.Second)
	if v, _ := LoadSettings(ctx, s, "ads", deskDefaults); !v.Enabled {
		t.Fatal("a stale read returns the cached value at once")
	}
	s.refreshes.Wait()
	if v, _ := LoadSettings(ctx, s, "ads", deskDefaults); v.Enabled || v.Version != 2 {
		t.Fatalf("after the refresh got %+v", v)
	}
}

func TestLoadSettingsFallsBackOnErrors(t *testing.T) {
	s, repo, clk := newSettingsFixture()
	ctx := context.Background()
	repo.setFail(errors.New("mongo down"))
	if v, found := LoadSettings(ctx, s, "ads", deskDefaults); found || v.MaxPerDay != 4 {
		t.Fatal("a cold failure gives the defaults")
	}
	gets := repo.getCount()
	_, _ = LoadSettings(ctx, s, "ads", deskDefaults)
	if repo.getCount() != gets {
		t.Error("a failed read should not be retried on every request")
	}
	clk.advance(6 * time.Second)
	repo.setFail(nil)
	repo.docs["ads"] = bson.M{"enabled": true, "version": 1}
	_, _ = LoadSettings(ctx, s, "ads", deskDefaults) // stale → background refresh
	s.refreshes.Wait()
	if v, found := LoadSettings(ctx, s, "ads", deskDefaults); !found || !v.Enabled {
		t.Fatal("the read is retried after a short pause")
	}

	// Last good value survives a later outage.
	repo.setFail(errors.New("mongo down again"))
	clk.advance(time.Minute)
	_, _ = LoadSettings(ctx, s, "ads", deskDefaults)
	s.refreshes.Wait()
	if v, found := LoadSettings(ctx, s, "ads", deskDefaults); !found || !v.Enabled {
		t.Fatal("the last good value must be kept when a refresh fails")
	}
}

func TestSettingsAuditKeyIsChecked(t *testing.T) {
	s, _, _ := newSettingsFixture()
	var fe *InvalidFieldError
	if _, err := s.Audit(context.Background(), "secrets", 5); !errors.As(err, &fe) || fe.Code != CodeInvalidKey {
		t.Fatalf("err = %v", err)
	}
	rows, err := s.Audit(context.Background(), "elections", 5)
	if err != nil || rows == nil || len(rows) != 0 {
		t.Fatalf("empty audit = %v, %v (want a non-nil empty slice)", rows, err)
	}
}

func TestAuditJSONSortsKeys(t *testing.T) {
	got, err := auditJSON(map[string]any{"b": 1, "a": map[string]any{"z": 1, "y": 2}})
	if err != nil || got != `{"a":{"y":2,"z":1},"b":1}` {
		t.Fatalf("auditJSON = %s, %v", got, err)
	}
	if n, _ := auditJSON(nil); n != "null" {
		t.Errorf("nil = %s", n)
	}
	if big, _ := auditJSON(map[string]int64{"n": 9_007_199_254_740_993}); big != `{"n":9007199254740993}` {
		t.Errorf("large integers must survive: %s", big)
	}
}
