package service

import (
	"strings"

	"github.com/anthropics/anthropic-sdk-go"

	"github.com/oguaa/backend/internal/domain"
)

// ── news desk cost estimates (spec §2.7, [A6]) ───────────────────────────────
//
// List prices in micro-USD per million tokens, from the Claude API model
// notes. Cache writes are priced at the 5-minute rate (1.25× input): the desk
// only asks for the default TTL, and that is also what server tools add. They
// are estimates until 20 real runs have been measured.

type tokenPrices struct{ input, output, cacheWrite, cacheRead int64 }

var (
	opus55Prices = tokenPrices{input: 4_000_000, output: 20_000_000, cacheWrite: 5_000_000, cacheRead: 200_000}
	// Claude Opus 5 and Opus 4.8, the fallback targets documented for Opus 5.5.
	opus5Prices  = tokenPrices{input: 5_000_000, output: 25_000_000, cacheWrite: 6_250_000, cacheRead: 500_000}
	sonnetPrices = tokenPrices{input: 2_000_000, output: 10_000_000, cacheWrite: 2_500_000, cacheRead: 200_000}
	// Fable and Mythos 5.x (5.1's cache reads are cheaper; 5's dearer rate is used).
	fablePrices = tokenPrices{input: 10_000_000, output: 50_000_000, cacheWrite: 12_500_000, cacheRead: 1_000_000}

	// modelPrices maps a model-id prefix to its prices. The longest matching
	// prefix wins, so "claude-opus-5-5…" is never priced as "claude-opus-5".
	modelPrices = map[string]tokenPrices{
		"claude-opus-5-5":   opus55Prices,
		"claude-opus-5":     opus5Prices,
		"claude-opus-4-8":   opus5Prices,
		"claude-sonnet-5-5": sonnetPrices,
		"claude-sonnet-5":   sonnetPrices,
		"claude-fable-5":    fablePrices,
		"claude-mythos-5":   fablePrices,
	}

	// unknownModelPrices prices any model the table doesn't know. With
	// fallbacks "default" the server picks the fallback model by refusal
	// category and the routing isn't published (the docs expect Opus 5 or
	// Opus 4.8 for Opus 5.5, to be read from allowed_fallback_models), and
	// both desk models are configurable. So, as a conservative ceiling, an
	// unknown model is priced at the dearest rate in the table for every
	// token kind: never below any fallback target, so the cap can't
	// under-count a response served on a dearer model.
	unknownModelPrices = dearestPrices()
)

const (
	perMillion = 1_000_000
	// webSearchMicroUSD is $10 per 1,000 searches.
	webSearchMicroUSD = 10_000
	// Image tokens: $5 per 1M input, $30 per 1M output (micro-USD per token).
	imageInputMicroPerToken  = 5
	imageOutputMicroPerToken = 30

	// researchCeilingMicroUSD is reserved before every Call 1 request (each
	// pause_turn continuation included; spec §2.7's per-article ceiling, which
	// also bounds one request: 32k output tokens plus a long context, even at
	// fallback rates), structureCeilingMicroUSD before Call 2 and
	// imageCeilingMicroUSD before an image call.
	researchCeilingMicroUSD  = 2_000_000
	structureCeilingMicroUSD = 300_000
	imageCeilingMicroUSD     = 200_000

	// iterationFallback marks the usage of the fallback model's attempt.
	iterationFallback = "fallback_message"
)

// pricesFor returns the prices of model's longest known prefix, or the
// conservative ceiling.
func pricesFor(model string) tokenPrices {
	best, found := "", false
	for prefix := range modelPrices {
		if strings.HasPrefix(model, prefix) && len(prefix) > len(best) {
			best, found = prefix, true
		}
	}
	if !found {
		return unknownModelPrices
	}
	return modelPrices[best]
}

// dearestPrices is the highest price in the table for each kind of token.
func dearestPrices() tokenPrices {
	var top tokenPrices
	for _, p := range modelPrices {
		top.input = max(top.input, p.input)
		top.output = max(top.output, p.output)
		top.cacheWrite = max(top.cacheWrite, p.cacheWrite)
		top.cacheRead = max(top.cacheRead, p.cacheRead)
	}
	return top
}

// tokensCost prices a token count, rounded up to the micro-dollar.
func tokensCost(p tokenPrices, input, output, cacheWrite, cacheRead int64) int64 {
	micro := input*p.input + output*p.output + cacheWrite*p.cacheWrite + cacheRead*p.cacheRead
	return (micro + perMillion - 1) / perMillion
}

// claudeCostMicroUSD estimates what one response cost. With server-side
// fallback the top-level usage covers only the attempt that produced the
// message, while usage.iterations lists every billed attempt (a declined one
// as well as the fallback model's, each at its own model's rates, and any
// compaction, which the top level leaves out). The larger of the two sums is
// charged, so a partial breakdown can never lower the cost. Web searches are
// billed per request on top.
func claudeCostMicroUSD(model string, u anthropic.BetaUsage) int64 {
	top := tokensCost(pricesFor(model), u.InputTokens, u.OutputTokens, u.CacheCreationInputTokens, u.CacheReadInputTokens)
	var attempts int64
	for _, it := range u.Iterations {
		m := it.Model
		if m == "" {
			m = model // a compaction entry names no model
		}
		attempts += tokensCost(pricesFor(m), it.InputTokens, it.OutputTokens, it.CacheCreationInputTokens, it.CacheReadInputTokens)
	}
	return max(top, attempts) + u.ServerToolUse.WebSearchRequests*webSearchMicroUSD
}

// servedByFallback reports whether usage shows a fallback model's attempt.
func servedByFallback(u anthropic.BetaUsage) bool {
	for _, it := range u.Iterations {
		if it.Type == iterationFallback {
			return true
		}
	}
	return false
}

// imageCostMicroUSD estimates one image's cost from its token usage.
func imageCostMicroUSD(r domain.ImageResult) int64 {
	return r.InputTokens*imageInputMicroPerToken + r.OutputTokens*imageOutputMicroPerToken
}
