package domain

import (
	"context"
	"errors"
)

// Platform settings are small, versioned documents stewards edit from the
// back-office (spec §1.1). Each lives in `platform_settings` under its key;
// every change also writes a SettingsAudit row (who, when, why, before, after).
const (
	SettingsKeyNewsDesk = "news_desk"
	SettingsKeyAds      = "ads"
	// SettingsKeyElections keys the audit rows the election calendar writes.
	// The calendar itself lives in its own collection, not platform_settings.
	SettingsKeyElections = "elections"
)

// ValidSettingsAuditKey reports whether key names an audited settings area.
func ValidSettingsAuditKey(key string) bool {
	switch key {
	case SettingsKeyNewsDesk, SettingsKeyAds, SettingsKeyElections:
		return true
	}
	return false
}

// PrefixSettingsAudit starts every settings-audit id.
const PrefixSettingsAudit = "sau-"

// SettingsAudit is one change to a settings document (who/when/before/after).
type SettingsAudit struct {
	ID        string `json:"id" bson:"_id"`
	Key       string `json:"key" bson:"key"` // news_desk | ads | elections
	ActorID   string `json:"-" bson:"actorId"`
	ActorName string `json:"actorName" bson:"actorName"`
	At        string `json:"at" bson:"at"`
	Reason    string `json:"reason,omitempty" bson:"reason,omitempty"`
	Before    string `json:"before" bson:"before"` // canonical JSON of the previous document
	After     string `json:"after" bson:"after"`   // canonical JSON of the new document
}

// SettingsRepository stores the settings documents and their audit trail.
type SettingsRepository interface {
	// Get decodes the document stored under key into out; found=false when absent.
	Get(ctx context.Context, key string, out any) (found bool, err error)
	// Put replaces the document under key only if its stored version equals
	// expectedVersion (0 = must not exist), and inserts the audit row, in one
	// logical step (write settings with a version condition, then audit).
	// The stored document's version becomes expectedVersion+1.
	Put(ctx context.Context, key string, doc any, expectedVersion int, audit SettingsAudit) error
	// Audit returns the newest audit rows for key, newest first.
	Audit(ctx context.Context, key string, limit int) ([]SettingsAudit, error)
}

// SettingsAuditLog appends an audit row on its own, for audited areas that are
// not a single settings document (the election calendar). The Mongo settings
// repository implements it alongside SettingsRepository.
type SettingsAuditLog interface {
	AppendAudit(ctx context.Context, a SettingsAudit) error
}

// ErrSettingsConflict is returned by Put when the stored version is not the
// one the caller read: someone else saved first. HTTP 409 settings_conflict.
var ErrSettingsConflict = errors.New("settings_conflict")
