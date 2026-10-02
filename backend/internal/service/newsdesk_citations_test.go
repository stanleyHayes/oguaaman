package service

import (
	"strings"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── citations into fetched pages (spec §2.5, [A7]) ───────────────────────────

// fetchResult is one web_fetch call and its result: a page with source, or
// (source nil) a failed fetch.
func fetchResult(id, url, title string, source map[string]any) []map[string]any {
	use := map[string]any{"type": "server_tool_use", "id": id, "name": "web_fetch", "input": map[string]any{"url": url}}
	if source == nil {
		return []map[string]any{use, {"type": "web_fetch_tool_result", "tool_use_id": id,
			"content": map[string]any{"type": "web_fetch_tool_error", "error_code": "url_not_accessible"}}}
	}
	return []map[string]any{use, {"type": "web_fetch_tool_result", "tool_use_id": id, "content": map[string]any{
		"type": "web_fetch_result", "url": url, "retrieved_at": fetchedAt,
		"content": map[string]any{"type": "document", "title": title, "citations": map[string]any{"enabled": true}, "source": source},
	}}}
}

func textSource(s string) map[string]any {
	return map[string]any{"type": "text", "media_type": "text/plain", "data": s}
}

func charCite(index int, title, cited string) map[string]any {
	return map[string]any{"type": "char_location", "document_index": index, "document_title": title,
		"start_char_index": 0, "end_char_index": len(cited), "cited_text": cited, "file_id": nil}
}

func pageCite(index int, title, cited string) map[string]any {
	return map[string]any{"type": "page_location", "document_index": index, "document_title": title,
		"start_page_number": 1, "end_page_number": 2, "cited_text": cited, "file_id": nil}
}

func citedText(text string, cites ...map[string]any) map[string]any {
	return map[string]any{"type": "text", "text": text, "citations": cites}
}

// A failed fetch shifts document_index, or not; either way a citation is
// credited only to the page that really holds the cited text, and one no
// page supports is dropped rather than credited to the page at its index.
func TestCitationsNeverMisattribute(t *testing.T) {
	urlA, urlB := "https://www.graphic.com.gh/news/a.html", "https://citinewsroom.com/2026/10/b/"
	pageA := "Engineers inspected each section of Kotokuraba market before handing it back to the assembly."
	pageB := "Traders want rent for the new stalls to stay at 2025 rates, a spokesperson said."
	var blocks []map[string]any
	blocks = append(blocks, fetchResult("f0", leadURL, "", nil)...)
	blocks = append(blocks, fetchResult("f1", urlA, "Kotokuraba inspected - Graphic Online", textSource(pageA))...)
	blocks = append(blocks, fetchResult("f2", urlB, "Kotokuraba rent | Citi Newsroom", textSource(pageB))...)
	blocks = append(blocks,
		// Index 1 counting the failed fetch is page A, but the cited text is page B's.
		citedText("Traders want the rent kept at last year's level.", charCite(1, "Kotokuraba rent | Citi Newsroom", "Traders want rent for the new stalls to stay at 2025 rates")),
		// Index 0 not counting the failed fetch is page A (no title given).
		citedText(" Engineers checked every section.", charCite(0, "", "Engineers inspected  each section\nof Kotokuraba market")),
		// No fetched page holds this text: not credited to page B at index 2.
		citedText(" A claim no page supports.", charCite(2, "", "The assembly will build a second market next year")),
	)
	rep := assembleReport(decodeBlocks(t, messageReply("end_turn", blocks)), newsLead{URL: leadURL}, time.Now())
	if len(rep.Sources) != 3 || rep.Sources[0].URL != urlB || rep.Sources[1].URL != urlA || !rep.Sources[2].Original || rep.Sources[2].URL != leadURL {
		t.Fatalf("sources = %+v", rep.Sources)
	}
	if !containsAll(rep.Body, "level. [1]", "section. [2]", "supports.") || strings.Contains(rep.Body, "supports. [") {
		t.Fatalf("body = %q", rep.Body)
	}
	if !hasString(rep.CitedTexts, "The assembly will build a second market next year") {
		t.Fatal("an uncredited snippet must still feed the copy-overlap gate")
	}
}

// A page_location citation into a fetched PDF is credited to that PDF by its
// title (its text can't be searched); one naming no fetched PDF is dropped.
func TestCitationsIntoFetchedPDFs(t *testing.T) {
	pdfURL := "https://www.ccma.gov.gh/docs/budget-2026.pdf"
	pdf := map[string]any{"type": "base64", "media_type": "application/pdf", "data": "JVBERi0xLjcK"}
	blocks := fetchResult("f1", pdfURL, "Cape Coast Metropolitan Assembly budget 2026", pdf)
	blocks = append(blocks,
		citedText("The assembly set aside GH₵2 million for drains.", pageCite(0, "Cape Coast Metropolitan Assembly budget 2026", "GH₵2,000,000 for drainage works")),
		citedText(" A page citation naming another report.", pageCite(0, "Some other report", "Some other figure")),
		citedText(" A text citation can't point into a PDF.", charCite(0, "Cape Coast Metropolitan Assembly budget 2026", "GH₵2,000,000 for drainage works")),
	)
	rep := assembleReport(decodeBlocks(t, messageReply("end_turn", blocks)), newsLead{URL: leadURL}, time.Now())
	if len(rep.Sources) != 2 || rep.Sources[0].URL != pdfURL || rep.Sources[0].Title != "Cape Coast Metropolitan Assembly budget 2026" || !rep.Sources[1].Original {
		t.Fatalf("sources = %+v", rep.Sources)
	}
	if !strings.Contains(rep.Body, "drains. [1]") || strings.Contains(rep.Body, "report. [") || strings.Contains(rep.Body, "PDF. [") {
		t.Fatalf("body = %q", rep.Body)
	}
}

// The AI body is stored with no images and no links but to its numbered
// sources (other links keep their text; bare addresses become plain host
// names), and reference definitions can't turn the [n] markers into links.
func TestReportBodyLinksOnlyToSources(t *testing.T) {
	sources := []domain.NewsSource{{URL: graphicURL}, {URL: leadURL, Original: true}}
	body := "Traders are back [1][2]. ![Market photo](https://evil.example/x.png) See [the Graphic report](" + graphicURL + ")" +
		` and [this site](https://evil.example/page "Title"), or [1](https://evil.example/one).` + "\n\n" +
		"More at https://evil.example/more. Or www.evil.example/x, or <https://evil.example/auto>.\n\n" +
		"A [reference link][r1] and ![a reference image][r1].\n\n[r1]: https://evil.example/ref\n[1]: https://evil.example/marker\n"
	got := sanitiseReportBody(body, sources)
	for _, want := range []string{"Traders are back [1][2].", "[the Graphic report](" + graphicURL + ")", " and this site, or [1].",
		"More at evil.example. Or evil.example, or evil.example.", "A reference link and ."} {
		if !strings.Contains(got, want) {
			t.Errorf("sanitised body lacks %q:\n%s", want, got)
		}
	}
	for _, banned := range []string{"![", "https://evil", "www.evil", "]: ", "](https://evil"} {
		if strings.Contains(got, banned) {
			t.Errorf("sanitised body still has %q:\n%s", banned, got)
		}
	}

	paras := goodParas()
	paras[1].text += " ![Kotokuraba](https://evil.example/k.png) Read [more](https://evil.example/story)."
	rep := assembleReport(decodeBlocks(t, researchReply(paras)), newsLead{URL: leadURL}, time.Now())
	if strings.Contains(rep.Body, "evil.example") || !strings.Contains(rep.Body, "Read more. [2]") {
		t.Fatalf("assembled body = %s", rep.Body)
	}
}
