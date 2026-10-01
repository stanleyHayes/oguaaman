package service

import (
	"context"
	"sync"
	"time"
)

// Failed sign-in and reset-code attempts are also remembered per request
// source (the client network the HTTP layer puts on the context), so a lock
// or a spent guess budget only binds the sources that produced the failures.
// Someone else hammering an account can then never keep its owner out: the
// owner's correct password or code, from their own network, still works
// (R01). The account-wide counters stay as the backstop against a slow,
// widely distributed guessing campaign.

// loginSourceStrikes is how many failed sign-in attempts from one source make
// that source subject to the account's sign-in lock. The owner's own typo or
// two never bind them to a lock someone else triggered.
const loginSourceStrikes = 3

// resetCodeMaxGuesses is how many wrong guesses in total, from every source,
// a password-reset code survives. Each source is held to maxCodeAttempts.
const resetCodeMaxGuesses = 20

// maxSourcesPerAccount bounds the per-account memory a flood of sources can use.
const maxSourcesPerAccount = 4096

// maxTrackedAccounts triggers a sweep of expired entries.
const maxTrackedAccounts = 10000

type requestSourceKey struct{}

// WithRequestSource tags ctx with the caller's network (client IP, IPv6 /64)
// for the per-source sign-in lock and reset-code budget.
func WithRequestSource(ctx context.Context, source string) context.Context {
	return context.WithValue(ctx, requestSourceKey{}, source)
}

// requestSource is the source WithRequestSource put on ctx ("" when none —
// callers without one share a single source).
func requestSource(ctx context.Context) string {
	s, _ := ctx.Value(requestSourceKey{}).(string)
	return s
}

// sourceStrikes counts failures per (account, source), in process. Entries
// expire `ttl` after their latest failure.
type sourceStrikes struct {
	mu  sync.Mutex
	ttl time.Duration
	by  map[string]map[string]*strike
}

type strike struct {
	n     int
	until time.Time
}

func newSourceStrikes(ttl time.Duration) *sourceStrikes {
	return &sourceStrikes{ttl: ttl, by: map[string]map[string]*strike{}}
}

// add records a failure from source against key and returns that source's
// live failure count.
func (s *sourceStrikes) add(key, source string, now time.Time) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.by) > maxTrackedAccounts {
		s.sweepLocked(now)
	}
	sources := s.by[key]
	if sources == nil {
		sources = map[string]*strike{}
		s.by[key] = sources
	}
	st := sources[source]
	if st == nil || now.After(st.until) {
		if len(sources) >= maxSourcesPerAccount {
			pruneStrikes(sources, now)
		}
		st = &strike{}
		sources[source] = st
	}
	st.n++
	st.until = now.Add(s.ttl)
	return st.n
}

// count is source's live failure count against key.
func (s *sourceStrikes) count(key, source string, now time.Time) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	st := s.by[key][source]
	if st == nil || now.After(st.until) {
		return 0
	}
	return st.n
}

// clear forgets every source's failures against key.
func (s *sourceStrikes) clear(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.by, key)
}

func (s *sourceStrikes) sweepLocked(now time.Time) {
	for key, sources := range s.by {
		pruneStrikes(sources, now)
		if len(sources) == 0 {
			delete(s.by, key)
		}
	}
}

func pruneStrikes(sources map[string]*strike, now time.Time) {
	for src, st := range sources {
		if now.After(st.until) {
			delete(sources, src)
		}
	}
}

// loginLockedFor reports whether the account's sign-in lock binds the
// request's source: the account is locked and this source produced at least
// loginSourceStrikes of the failures.
func (a *AuthService) loginLockedFor(ctx context.Context, memberID string, locked bool) bool {
	return locked && a.loginStrikes.count(memberID, requestSource(ctx), time.Now()) >= loginSourceStrikes
}
