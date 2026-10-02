package domain

import "context"

// AIUsageRepository persists the AI writing-assistant's daily usage counters so
// the global and per-member budgets survive restarts and hold across multiple API
// instances (spec §8.12). Counters are keyed by a UTC day + a bucket key
// ("global" or a member id).
type AIUsageRepository interface {
	// Count returns the current count for (day, key), 0 if none.
	Count(ctx context.Context, day, key string) (int, error)
	// Incr atomically increments (day, key) and returns the new count.
	Incr(ctx context.Context, day, key string) (int, error)
	// IncrBy atomically adds n to (day, key) — an $inc — and returns the new
	// total. The news desk counts articles, images and micro-USD spend with it
	// (spec §2.7). n may be 0 (a read that creates the counter).
	IncrBy(ctx context.Context, day, key string, n int64) (int64, error)
}
