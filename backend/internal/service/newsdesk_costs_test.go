package service

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/anthropics/anthropic-sdk-go"

	"github.com/oguaa/backend/internal/domain"
)

// ── the daily research cap (spec §2.7) ───────────────────────────────────────

func usageOf(t *testing.T, raw string) anthropic.BetaUsage {
	t.Helper()
	var u anthropic.BetaUsage
	if err := json.Unmarshal([]byte(raw), &u); err != nil {
		t.Fatal(err)
	}
	return u
}

// A fallback-served response is charged for every attempt in
// usage.iterations, each at its own model's rates (not just the top-level
// usage of the serving attempt at Opus 5.5 rates); an unknown model is
// priced at the conservative ceiling; prefixes never shadow a longer id.
func TestClaudeCostPricesEveryAttempt(t *testing.T) {
	served := usageOf(t, `{"input_tokens":100000,"output_tokens":20000,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,
		"server_tool_use":{"web_search_requests":2,"web_fetch_requests":1},
		"iterations":[
		 {"type":"message","model":"claude-opus-5-5","input_tokens":90000,"output_tokens":15000,"cache_creation_input_tokens":0,"cache_read_input_tokens":0},
		 {"type":"fallback_message","model":"claude-opus-4-8","input_tokens":100000,"output_tokens":20000,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}]}`)
	// Declined Opus 5.5 attempt $0.36 + $0.30, served Opus 4.8 attempt $0.50 + $0.50, two searches $0.02.
	if got, want := claudeCostMicroUSD("claude-opus-4-8", served), int64(90000*4+15000*20+100000*5+20000*25+2*10_000); got != want {
		t.Errorf("fallback-served cost = %d, want %d", got, want)
	}
	if !servedByFallback(served) {
		t.Error("a fallback_message iteration must mark the fallback")
	}

	topOnly := usageOf(t, `{"input_tokens":100000,"output_tokens":20000,"cache_creation_input_tokens":1000,"cache_read_input_tokens":10000,
		"server_tool_use":{"web_search_requests":2}}`)
	if got, want := claudeCostMicroUSD("claude-opus-4-8", topOnly), int64(100000*5+20000*25)+(1000*6_250_000+10000*500_000)/1_000_000+20_000; got != want {
		t.Errorf("Opus 4.8 cost = %d, want %d", got, want)
	}
	if got, want := claudeCostMicroUSD("claude-opus-9", topOnly), int64(100000*10+20000*50)+(1000*12_500_000+10000*1_000_000)/1_000_000+20_000; got != want {
		t.Errorf("unknown model cost = %d, want %d (the dearest known rates)", got, want)
	}
	for model, want := range map[string]tokenPrices{
		"claude-opus-5-5": opus55Prices, "claude-opus-5-5-20261001": opus55Prices, "claude-opus-5": opus5Prices,
		"claude-sonnet-5-5": sonnetPrices, "claude-fable-5-1": fablePrices, "gpt-image": unknownModelPrices,
	} {
		if got := pricesFor(model); got != want {
			t.Errorf("pricesFor(%q) = %+v, want %+v", model, got, want)
		}
	}
	for _, target := range []tokenPrices{opus55Prices, opus5Prices} {
		if u := unknownModelPrices; u.input < target.input || u.output < target.output || u.cacheWrite < target.cacheWrite || u.cacheRead < target.cacheRead {
			t.Fatalf("the unknown-model ceiling %+v is below a fallback target %+v", u, target)
		}
	}
}

// The cap is checked before every request: a pause_turn continuation that
// would pass it is not sent. The run stops for tomorrow keeping the attempt
// (it spent), and only the real cost of what was sent stays on the counter.
func TestNewsDeskCapCheckedBeforeEveryContinuation(t *testing.T) {
	// Room for one request's ceiling ($2) but not for a second after the
	// first request's real cost.
	f := newDeskFixture(t, func(s *domain.NewsDeskSettings) { s.MaxResearchMicroUsdPerDay = 2_010_000 },
		fixture(t, "pause_turn"), researchReply(goodParas()), fixture(t, "structure_ok"))
	job := f.run(t)
	pauseCost := 1200*4 + 300*20 + 10_000
	tomorrow := time.Now().UTC().AddDate(0, 0, 1).Format(time.DateOnly) + "T00:05:00Z"
	if f.claude.callCount() != 1 || job.Status != domain.NewsJobQueued || job.NextAttemptAt != tomorrow || job.LastError != errBudget || job.Attempts != 1 {
		t.Fatalf("calls %d, job = %+v", f.claude.callCount(), job)
	}
	if f.usage.today(keyResearchUSD) != pauseCost || job.CostMicroUSD != int64(pauseCost) || f.usage.today(keyReports) != 1 {
		t.Fatalf("spend %d, job cost %d, reports %d (want %d)", f.usage.today(keyResearchUSD), job.CostMicroUSD, f.usage.today(keyReports), pauseCost)
	}
}

// withIterations adds usage.iterations to a canned reply and names the
// model that answered.
func withIterations(t *testing.T, r stubReply, model string, iterations ...map[string]any) stubReply {
	t.Helper()
	var msg map[string]any
	if err := json.Unmarshal([]byte(r.body), &msg); err != nil {
		t.Fatal(err)
	}
	msg["model"] = model
	msg["usage"].(map[string]any)["iterations"] = iterations
	raw, _ := json.Marshal(msg)
	r.body = string(raw)
	return r
}

// A report the fallback model served is flagged for the editor (the
// iteration, not a fallback block, says so) and charged for both attempts.
func TestNewsDeskChargesFallbackAttempts(t *testing.T) {
	served := withIterations(t, researchReply(goodParas()), "claude-opus-4-8",
		map[string]any{"type": "message", "model": "claude-opus-5-5", "input_tokens": 900, "output_tokens": 0, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0},
		map[string]any{"type": "fallback_message", "model": "claude-opus-4-8", "input_tokens": 1000, "output_tokens": 2000, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0})
	f := newDeskFixture(t, nil, served, fixture(t, "structure_ok"))
	job := f.run(t)
	if job.Status != domain.NewsJobReady || !job.FallbackUsed || !hasString(job.Draft.Flags, FlagFallbackModel) {
		t.Fatalf("job = %+v", job)
	}
	want := int64(900*4+1000*5+2000*25+2*10_000) + int64(2500*4+400*20)
	if job.CostMicroUSD != want || f.usage.today(keyResearchUSD) != int(want) {
		t.Fatalf("cost %d, counter %d, want %d", job.CostMicroUSD, f.usage.today(keyResearchUSD), want)
	}
}

// A request that may have been billed without returning usage (a timeout,
// retried by the SDK) keeps a ceiling per such attempt on the counter and
// the job; an error status is not billed.
func TestNewsDeskChargesUncertainAttempts(t *testing.T) {
	call1 := int64(1000*4 + 2000*20 + 2*10_000)
	call2 := int64(2500*4 + 400*20)

	slow := researchReply(goodParas())
	slow.delay = 2 * time.Second
	f := newDeskFixture(t, nil, slow)
	f.desk.cfg.Call1Timeout = 50 * time.Millisecond
	job := f.run(t)
	if job.Status != domain.NewsJobQueued || f.claude.callCount() != 2 { // one SDK retry
		t.Fatalf("all timed out: job = %+v, calls %d", job, f.claude.callCount())
	}
	if want := 2 * researchCeilingMicroUSD; f.usage.today(keyResearchUSD) != want || job.CostMicroUSD != int64(want) {
		t.Fatalf("all timed out: counter %d, job cost %d, want %d", f.usage.today(keyResearchUSD), job.CostMicroUSD, want)
	}

	f = newDeskFixture(t, nil, slow, researchReply(goodParas()), fixture(t, "structure_ok"))
	f.desk.cfg.Call1Timeout = 50 * time.Millisecond
	job = f.run(t)
	if want := call1 + researchCeilingMicroUSD + call2; job.Status != domain.NewsJobReady || job.CostMicroUSD != want || f.usage.today(keyResearchUSD) != int(want) {
		t.Fatalf("timeout then success: job %s, cost %d, counter %d, want %d", job.Status, job.CostMicroUSD, f.usage.today(keyResearchUSD), want)
	}

	f = newDeskFixture(t, nil, errorReply(529), researchReply(goodParas()), fixture(t, "structure_ok"))
	job = f.run(t)
	if want := call1 + call2; job.Status != domain.NewsJobReady || job.CostMicroUSD != want || f.usage.today(keyResearchUSD) != int(want) {
		t.Fatalf("529 then 200: job %s, cost %d, counter %d, want %d", job.Status, job.CostMicroUSD, f.usage.today(keyResearchUSD), want)
	}
}
