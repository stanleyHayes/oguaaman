package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── platform settings with a short cache and an audit trail (spec §1.1) ──────
//
// Feature settings (the news desk, ads) are versioned documents stewards edit
// from the back-office. Reads go through a 30-second cache that never blocks a
// request on a slow or failing database: a stale value is served while one
// background refresh runs, and a failed read falls back to the last good value
// or the code defaults. Every save is a conditional write on the version the
// editor read, plus an audit row with the before and after documents.

const (
	settingsCacheTTL = 30 * time.Second
	// settingsRetryAfterError is how soon a read that failed cold is retried.
	settingsRetryAfterError = 5 * time.Second
	// settingsReadTimeout bounds one database read of a settings document.
	settingsReadTimeout = 3 * time.Second

	settingsReasonMinRunes = 5
	settingsReasonMaxRunes = 500

	// auditNullJSON is the audit "before" of a document that did not exist.
	auditNullJSON = "null"

	// Codes of the shared validation errors (InvalidFieldError.Code).
	CodeInvalidSetting = "invalid_setting"
	CodeInvalidKey     = "invalid_key"

	fieldReason = "reason"
)

// InvalidFieldError is a validation failure tied to one input field. The HTTP layer
// answers 400 {"error": Code, "message": Message, "field": Field}.
type InvalidFieldError struct {
	Code    string
	Field   string
	Message string
}

func (e *InvalidFieldError) Error() string { return e.Code + ": " + e.Field + ": " + e.Message }

// fieldErr builds a *InvalidFieldError.
func invalidField(code, field, message string) *InvalidFieldError {
	return &InvalidFieldError{Code: code, Field: field, Message: message}
}

// SettingsService reads and writes platform settings documents.
type SettingsService struct {
	repo  domain.SettingsRepository
	audit domain.SettingsAuditLog // nil when the repository cannot append rows on its own
	log   *slog.Logger
	now   func() time.Time

	mu    sync.Mutex
	cache map[settingsCacheKey]*settingsEntry
	// refreshes tracks background refreshes (tests wait on it).
	refreshes sync.WaitGroup
}

// settingsCacheKey caches each document per Go type it is decoded into, so
// two features reading one key through different structs never clash.
type settingsCacheKey struct {
	key string
	typ reflect.Type
}

type settingsEntry struct {
	val        any // a T
	found      bool
	at         time.Time // when val was read (or when a cold read failed, backdated)
	refreshing bool
}

// NewSettingsService wraps repo. When repo also implements
// domain.SettingsAuditLog, Record can write audit rows for areas that are not
// settings documents (the election calendar).
func NewSettingsService(repo domain.SettingsRepository, log *slog.Logger) *SettingsService {
	if log == nil {
		log = slog.Default()
	}
	s := &SettingsService{repo: repo, log: log, now: time.Now, cache: map[settingsCacheKey]*settingsEntry{}}
	if a, ok := repo.(domain.SettingsAuditLog); ok {
		s.audit = a
	}
	return s
}

// LoadSettings returns the document stored under key decoded as T, laid over
// defaults() so fields added since it was saved keep their default. found
// reports whether a stored document backs the value. It never fails and never
// waits on a refresh: a nil service, a missing document or a failed read with
// nothing cached all give the defaults. Treat the result as read-only (slices
// are shared with the cache).
func LoadSettings[T any](ctx context.Context, s *SettingsService, key string, defaults func() T) (T, bool) {
	if s == nil || s.repo == nil {
		return defaults(), false
	}
	ck := settingsCacheKey{key: key, typ: reflect.TypeFor[T]()}
	if v, found, ok := cachedSettings[T](s, ck, key, defaults); ok {
		return v, found
	}
	v, found, err := readSettings(ctx, s.repo, key, defaults)
	if err != nil {
		s.log.Warn("settings: read failed, using defaults", "key", key, "err", err)
		s.store(ck, defaults(), false, s.now().Add(settingsRetryAfterError-settingsCacheTTL))
		return defaults(), false
	}
	s.store(ck, v, found, s.now())
	return v, found
}

// cachedSettings serves (key, T) from the cache when it can (ok=true). A
// stale entry is served as is while one background refresh runs.
func cachedSettings[T any](s *SettingsService, ck settingsCacheKey, key string, defaults func() T) (T, bool, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.cache[ck]
	if e == nil {
		var zero T
		return zero, false, false
	}
	v, ok := e.val.(T)
	if !ok {
		var zero T
		return zero, false, false
	}
	if s.now().Sub(e.at) >= settingsCacheTTL && !e.refreshing {
		e.refreshing = true
		s.refreshes.Add(1)
		go refreshSettings(s, ck, key, defaults)
	}
	return v, e.found, true
}

// refreshSettings re-reads one cached document in the background. On failure
// the last good value stays and the next read after a short pause retries.
func refreshSettings[T any](s *SettingsService, ck settingsCacheKey, key string, defaults func() T) {
	defer s.refreshes.Done()
	ctx, cancel := context.WithTimeout(context.Background(), settingsReadTimeout)
	defer cancel()
	v, found, err := readSettings(ctx, s.repo, key, defaults)
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.cache[ck]
	if e == nil {
		return // a save replaced the cache meanwhile
	}
	e.refreshing = false
	if err != nil {
		s.log.Warn("settings: refresh failed, keeping the last good value", "key", key, "err", err)
		e.at = s.now().Add(settingsRetryAfterError - settingsCacheTTL)
		return
	}
	e.val, e.found, e.at = v, found, s.now()
}

// readSettings reads key from the repository over the defaults.
func readSettings[T any](ctx context.Context, repo domain.SettingsRepository, key string, defaults func() T) (T, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, settingsReadTimeout)
	defer cancel()
	v := defaults()
	found, err := repo.Get(ctx, key, &v)
	if err != nil {
		return defaults(), false, err
	}
	if !found {
		return defaults(), false, nil
	}
	return v, true, nil
}

func (s *SettingsService) store(ck settingsCacheKey, v any, found bool, at time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache[ck] = &settingsEntry{val: v, found: found, at: at}
}

// SettingsChange is one save of a settings document.
type SettingsChange struct {
	Key string
	// Doc points at the new document (a struct). Save stamps its Version
	// (ExpectedVersion+1), UpdatedAt and UpdatedByName fields, when it has them.
	Doc any
	// ExpectedVersion is the version the editor read (0 = nothing stored yet).
	ExpectedVersion int
	ActorID         string
	ActorName       string
	// Reason is why the change was made (5..500 characters).
	Reason string
}

// Save writes a settings document if nobody else saved since the editor read
// it, records the audit row, and refreshes the cache. A lost race is
// domain.ErrSettingsConflict; a missing reason is a *InvalidFieldError.
func (s *SettingsService) Save(ctx context.Context, c SettingsChange) error {
	if s == nil || s.repo == nil {
		return errors.New("settings are not available")
	}
	reason, err := checkSettingsReason(c.Reason)
	if err != nil {
		return err
	}
	doc := reflect.ValueOf(c.Doc)
	if doc.Kind() != reflect.Pointer || doc.Elem().Kind() != reflect.Struct {
		return fmt.Errorf("settings: Doc must point at a struct, got %T", c.Doc)
	}
	before, err := s.beforeJSON(ctx, c.Key, doc.Elem().Type())
	if err != nil {
		return err
	}
	now := s.now().UTC().Format(time.RFC3339)
	stampSettingsMeta(doc.Elem(), c.ExpectedVersion+1, now, c.ActorName)
	after, err := auditJSON(c.Doc)
	if err != nil {
		return err
	}
	audit := domain.SettingsAudit{
		ID: newID(domain.PrefixSettingsAudit), Key: c.Key, ActorID: c.ActorID, ActorName: c.ActorName,
		At: now, Reason: reason, Before: before, After: after,
	}
	if err := s.repo.Put(ctx, c.Key, c.Doc, c.ExpectedVersion, audit); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for ck := range s.cache {
		if ck.key == c.Key {
			delete(s.cache, ck)
		}
	}
	s.cache[settingsCacheKey{key: c.Key, typ: doc.Elem().Type()}] = &settingsEntry{val: doc.Elem().Interface(), found: true, at: s.now()}
	return nil
}

// beforeJSON is the canonical JSON of what is stored under key now, decoded
// as typ, or "null" when nothing is stored.
func (s *SettingsService) beforeJSON(ctx context.Context, key string, typ reflect.Type) (string, error) {
	prev := reflect.New(typ)
	found, err := s.repo.Get(ctx, key, prev.Interface())
	if err != nil {
		return "", err
	}
	if !found {
		return auditNullJSON, nil
	}
	return auditJSON(prev.Interface())
}

// stampSettingsMeta sets the bookkeeping fields every settings struct carries.
func stampSettingsMeta(v reflect.Value, version int, at, byName string) {
	if f := v.FieldByName("Version"); f.IsValid() && f.CanSet() && f.Kind() == reflect.Int {
		f.SetInt(int64(version))
	}
	for name, val := range map[string]string{"UpdatedAt": at, "UpdatedByName": byName} {
		if f := v.FieldByName(name); f.IsValid() && f.CanSet() && f.Kind() == reflect.String {
			f.SetString(val)
		}
	}
}

// settingsReason trims and checks a change reason.
func checkSettingsReason(reason string) (string, error) {
	reason = strings.TrimSpace(reason)
	if n := runeLen(reason); n < settingsReasonMinRunes || n > settingsReasonMaxRunes {
		return "", invalidField(CodeInvalidSetting, fieldReason,
			fmt.Sprintf("Say why you are making this change (%d to %d characters).", settingsReasonMinRunes, settingsReasonMaxRunes))
	}
	return reason, nil
}

// Record writes an audit row for a change to an audited area that is not a
// settings document (the election calendar). before or after may be nil
// (created / deleted).
func (s *SettingsService) Record(ctx context.Context, key string, before, after any, actorID, actorName, reason string) error {
	if s == nil || s.audit == nil {
		return nil
	}
	b, err := auditJSON(before)
	if err != nil {
		return err
	}
	a, err := auditJSON(after)
	if err != nil {
		return err
	}
	return s.audit.AppendAudit(ctx, domain.SettingsAudit{
		ID: newID(domain.PrefixSettingsAudit), Key: key, ActorID: actorID, ActorName: actorName,
		At: s.now().UTC().Format(time.RFC3339), Reason: strings.TrimSpace(reason), Before: b, After: a,
	})
}

// Audit returns the newest changes to one audited area (news_desk, ads or
// elections), newest first.
func (s *SettingsService) Audit(ctx context.Context, key string, limit int) ([]domain.SettingsAudit, error) {
	if !domain.ValidSettingsAuditKey(key) {
		return nil, invalidField(CodeInvalidKey, "key", "Choose news_desk, ads or elections.")
	}
	if s == nil || s.repo == nil {
		return []domain.SettingsAudit{}, nil
	}
	rows, err := s.repo.Audit(ctx, key, limit)
	if rows == nil {
		rows = []domain.SettingsAudit{}
	}
	return rows, err
}

// auditJSON is v as JSON with object keys sorted (so equal documents
// always compare equal in the audit trail); nil is "null".
func auditJSON(v any) (string, error) {
	if v == nil {
		return auditNullJSON, nil
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var generic any
	if err := dec.Decode(&generic); err != nil {
		return "", err
	}
	out, err := json.Marshal(generic)
	return string(out), err
}
