package service

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go"

	"github.com/oguaa/backend/internal/domain"
)

// ── body assembly from citation blocks (spec §2.5) ───────────────────────────
//
// The article is the text Claude wrote after its last server-tool block. Its
// sources come only from the citation objects the API attached to that text
// (never from anything the model typed), each distinct URL numbered in the
// order it is first cited, with a plain-text [n] after the cited span.

const (
	noStoryReply      = "NO_STORY"
	originalSourceTag = "Original report"
	maxReportHeadings = 2
	mediaTypePDF      = "application/pdf"
)

// newsLead is the feed lead a job researches.
type newsLead struct {
	URL, Source, Title, Teaser, PublishedAt string
}

// fetchedDoc is one web_fetch result, held in memory only (never stored). A
// failed fetch is kept as an empty placeholder.
type fetchedDoc struct {
	URL, Title, Text, RetrievedAt string
	// PDF marks a PDF result, whose text (base64) can't be searched.
	PDF bool
	// flat is Text with its whitespace collapsed, for finding cited text.
	flat string
}

// docCitation is a citation into a fetched page.
type docCitation struct {
	index       int
	title, text string
	pdf         bool // a page_location citation, into a PDF
}

// assembledReport is Call 1's article with its numbered sources.
type assembledReport struct {
	Body      string
	Sources   []domain.NewsSource
	Coverage  float64
	WordCount int
	NoStory   bool
	// citedURLs marks the sources that a citation actually pointed at (the
	// lead added as "Original report" is not one).
	citedURLs map[string]bool
	// Fetched page text and cited snippets, for the copy-overlap gate.
	FetchedTexts []string
	CitedTexts   []string
}

// sourceBook numbers distinct URLs in first-seen order.
type sourceBook struct {
	index   map[string]int
	sources []domain.NewsSource
	cited   map[string]bool
	now     string
}

func (b *sourceBook) number(rawURL, title string, fetched *fetchedDoc) int {
	key := normaliseURL(rawURL)
	if n, ok := b.index[key]; ok {
		return n
	}
	src := domain.NewsSource{URL: rawURL, Title: strings.TrimSpace(title), AccessedAt: b.now}
	if fetched != nil {
		if src.Title == "" {
			src.Title = fetched.Title
		}
		if fetched.RetrievedAt != "" {
			src.AccessedAt = fetched.RetrievedAt
		}
	}
	src.Name = publisherName(rawURL, src.Title)
	b.sources = append(b.sources, src)
	n := len(b.sources)
	b.index[key] = n
	b.cited[key] = true
	return n
}

// assembleReport builds the article from every content block of one
// generation (all responses of a pause_turn loop, in order).
func assembleReport(blocks []anthropic.BetaContentBlockUnion, lead newsLead, now time.Time) assembledReport {
	docs, lastTool := fetchedDocs(blocks)
	book := &sourceBook{index: map[string]int{}, cited: map[string]bool{}, now: now.UTC().Format(time.RFC3339)}
	var out assembledReport
	var body strings.Builder
	var total, cited int
	for i := lastTool + 1; i < len(blocks); i++ {
		tb, ok := blocks[i].AsAny().(anthropic.BetaTextBlock)
		if !ok {
			continue
		}
		markers, snippets := citationMarkers(tb.Citations, docs, book)
		out.CitedTexts = append(out.CitedTexts, snippets...)
		n := len(strings.TrimSpace(tb.Text))
		total += n
		if len(markers) > 0 {
			cited += n
		}
		body.WriteString(withMarkers(tb.Text, markers))
	}
	raw := body.String()
	if strings.TrimSpace(raw) == noStoryReply {
		return assembledReport{NoStory: true}
	}
	for _, d := range docs {
		out.FetchedTexts = append(out.FetchedTexts, d.Text)
	}
	out.Sources = withLead(book, lead)
	out.Body = sanitiseReportBody(tidyReportBody(raw), out.Sources)
	out.citedURLs = book.cited
	if total > 0 {
		out.Coverage = float64(cited) / float64(total)
	}
	out.WordCount = len(strings.Fields(markerRe.ReplaceAllString(out.Body, "")))
	return out
}

// fetchedDocs lists the web_fetch results in order and finds the index of
// the last server-tool block.
func fetchedDocs(blocks []anthropic.BetaContentBlockUnion) ([]fetchedDoc, int) {
	var docs []fetchedDoc
	last := -1
	for i, b := range blocks {
		switch v := b.AsAny().(type) {
		case anthropic.BetaServerToolUseBlock, anthropic.BetaWebSearchToolResultBlock:
			last = i
		case anthropic.BetaWebFetchToolResultBlock:
			last = i
			docs = append(docs, fetchedDocOf(v))
		}
	}
	return docs, last
}

// fetchedDocOf reads one web_fetch result: a text page, a PDF, or (a failed
// fetch) an empty placeholder.
func fetchedDocOf(v anthropic.BetaWebFetchToolResultBlock) fetchedDoc {
	res := v.Content.AsResponseWebFetchResultBlock()
	if res.URL == "" {
		return fetchedDoc{}
	}
	doc := fetchedDoc{URL: res.URL, Title: res.Content.Title, RetrievedAt: res.RetrievedAt}
	switch src := res.Content.Source; {
	case src.Type == "text":
		doc.Text, doc.flat = src.Data, squashSpace(src.Data)
	case src.MediaType == mediaTypePDF:
		doc.PDF = true
	}
	return doc
}

// citationMarkers resolves a text block's citations to source numbers (in
// order, deduplicated) and returns the cited snippets: every snippet, even
// of a citation no source can be credited with, since copying it is still
// copying.
func citationMarkers(cites []anthropic.BetaTextCitationUnion, docs []fetchedDoc, book *sourceBook) ([]int, []string) {
	var markers []int
	var snippets []string
	seen := map[int]bool{}
	for _, c := range cites {
		u, title, snippet, doc := citedSource(c, docs)
		if snippet != "" {
			snippets = append(snippets, snippet)
		}
		if !httpsURL(u) {
			continue
		}
		if n := book.number(u, title, doc); !seen[n] {
			seen[n] = true
			markers = append(markers, n)
		}
	}
	return markers, snippets
}

// citedSource resolves one citation: the source's URL and title, the
// fetched page it came from (nil for a search result) and the cited text.
// The URL is empty when no source can be credited.
func citedSource(c anthropic.BetaTextCitationUnion, docs []fetchedDoc) (u, title, snippet string, doc *fetchedDoc) {
	switch v := c.AsAny().(type) {
	case anthropic.BetaCitationsWebSearchResultLocation:
		return v.URL, v.Title, v.CitedText, nil
	case anthropic.BetaCitationCharLocation:
		doc = docForCitation(docs, docCitation{index: int(v.DocumentIndex), title: v.DocumentTitle, text: v.CitedText})
		snippet = v.CitedText
	case anthropic.BetaCitationPageLocation:
		doc = docForCitation(docs, docCitation{index: int(v.DocumentIndex), title: v.DocumentTitle, text: v.CitedText, pdf: true})
		snippet = v.CitedText
	default:
		return "", "", "", nil
	}
	if doc != nil {
		u, title = doc.URL, doc.Title
	}
	return u, title, snippet, doc
}

// docForCitation finds the fetched page a document citation points at. How
// document_index counts is unconfirmed [A7] (a failed fetch may or may not
// take an index), so a page is accepted only when it supports the citation:
// the cited text is on it, or (a PDF, whose text can't be searched) it
// carries the cited title. The page at document_index is tried counting
// failed fetches, then not; then the one page that carries the cited title
// or URL and supports it; then the one page that supports it at all. A
// citation no single page supports is dropped rather than credited to the
// wrong source.
func docForCitation(docs []fetchedDoc, c docCitation) *fetchedDoc {
	all := make([]*fetchedDoc, len(docs))
	var fetched []*fetchedDoc
	for i := range docs {
		all[i] = &docs[i]
		if docs[i].URL != "" {
			fetched = append(fetched, &docs[i])
		}
	}
	for _, d := range []*fetchedDoc{docAt(all, c.index), docAt(fetched, c.index)} {
		if d != nil && d.supports(c) {
			return d
		}
	}
	if d := onlyDoc(fetched, func(d *fetchedDoc) bool { return d.named(c.title) && d.supports(c) }); d != nil {
		return d
	}
	return onlyDoc(fetched, func(d *fetchedDoc) bool { return d.supports(c) })
}

func docAt(docs []*fetchedDoc, i int) *fetchedDoc {
	if i < 0 || i >= len(docs) {
		return nil
	}
	return docs[i]
}

// onlyDoc is the single page that matches; nil when none or several do.
func onlyDoc(docs []*fetchedDoc, match func(*fetchedDoc) bool) *fetchedDoc {
	var found *fetchedDoc
	for _, d := range docs {
		if !match(d) {
			continue
		}
		if found != nil {
			return nil
		}
		found = d
	}
	return found
}

// supports reports whether the page can be the source of a citation: a text
// page must contain the cited text; a PDF must carry the cited title.
func (f *fetchedDoc) supports(c docCitation) bool {
	switch {
	case f.URL == "" || f.PDF != c.pdf:
		return false
	case f.PDF:
		return f.named(c.title)
	}
	cited := squashSpace(c.text)
	return cited != "" && strings.Contains(f.flat, cited)
}

// named reports whether a citation's document title names this page: its
// title, or its URL.
func (f *fetchedDoc) named(title string) bool {
	t := strings.TrimSpace(title)
	return t != "" && (strings.EqualFold(t, strings.TrimSpace(f.Title)) || normaliseURL(t) == normaliseURL(f.URL))
}

// squashSpace collapses every run of whitespace to one space.
func squashSpace(s string) string { return strings.Join(strings.Fields(s), " ") }

// withMarkers appends " [n]" markers after a span, before its trailing whitespace.
func withMarkers(text string, markers []int) string {
	if len(markers) == 0 {
		return text
	}
	trimmed := strings.TrimRight(text, " \t\r\n")
	var b strings.Builder
	b.WriteString(trimmed)
	b.WriteString(" ")
	for _, n := range markers {
		b.WriteString("[" + strconv.Itoa(n) + "]")
	}
	b.WriteString(text[len(trimmed):])
	return b.String()
}

// withLead returns the numbered sources with the feed lead marked original,
// adding it last as "Original report" when nothing cited it.
func withLead(book *sourceBook, lead newsLead) []domain.NewsSource {
	sources := append([]domain.NewsSource{}, book.sources...)
	if lead.URL == "" {
		return sources
	}
	if n, ok := book.index[normaliseURL(lead.URL)]; ok {
		sources[n-1].Original = true
		return sources
	}
	return append(sources, domain.NewsSource{
		Name: originalSourceTag, Title: lead.Title, URL: lead.URL, PublishedAt: lead.PublishedAt,
		AccessedAt: book.now, Original: true,
	})
}

var (
	h1Re            = regexp.MustCompile(`^#\s`)
	h2Re            = regexp.MustCompile(`^##\s+(.*)$`)
	sourcesHeadRe   = regexp.MustCompile(`(?i)^(#{1,6}\s*)?(\*\*)?\s*(sources|references|further reading)\s*:?\s*(\*\*)?\s*:?\s*$`)
	markerRe        = regexp.MustCompile(`\[(\d+)\]`)
	multiNewlinesRe = regexp.MustCompile(`\n{3,}`)
)

// tidyReportBody strips any title line and trailing source list the model
// wrote, and keeps at most two '##' headings (extras become bold).
func tidyReportBody(body string) string {
	lines := strings.Split(strings.ReplaceAll(body, "\r\n", "\n"), "\n")
	out := make([]string, 0, len(lines))
	headings := 0
	for _, line := range lines {
		t := strings.TrimSpace(line)
		if sourcesHeadRe.MatchString(t) {
			break
		}
		if h1Re.MatchString(t) {
			continue
		}
		if m := h2Re.FindStringSubmatch(t); m != nil {
			headings++
			if headings > maxReportHeadings {
				line = "**" + strings.TrimSpace(m[1]) + "**"
			}
		}
		out = append(out, line)
	}
	return strings.TrimSpace(multiNewlinesRe.ReplaceAllString(strings.Join(out, "\n"), "\n\n"))
}

// ── links and images in the AI body ──────────────────────────────────────────

var (
	mdImageRe      = regexp.MustCompile(`!\[[^\]\n]*\](?:\([^)\n]*\)|\[[^\]\n]*\])`)
	mdInlineLinkRe = regexp.MustCompile(`\[([^\]\n]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"\n]*")?\s*\)`)
	mdRefLinkRe    = regexp.MustCompile(`\[([^\]\n]+)\]\[[^\]\n]*\]`)
	mdRefDefRe     = regexp.MustCompile(`(?m)^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*\S[^\n]*\n?`)
	mdAutolinkRe   = regexp.MustCompile(`(?i)<(https?://[^>\s]+)>`)
	bareURLRe      = regexp.MustCompile(`(?i)(?:https?://|www\.)[^\s<>()\[\]"]+`)
)

// sanitiseReportBody keeps an AI-written body to text that links only to its
// numbered sources, before the draft is stored: images go entirely; a link
// to anything else becomes its text, and a bare or angle-bracketed address
// becomes its host name (plain text no renderer links); reference
// definitions go, so none can turn an [n] marker into a link. The [n]
// markers themselves (adjacent ones look like a reference link) stay plain.
func sanitiseReportBody(body string, sources []domain.NewsSource) string {
	allowed := linkPolicy{}
	for _, s := range sources {
		allowed[normaliseURL(s.URL)] = true
	}
	body = mdRefDefRe.ReplaceAllString(body, "")
	body = mdImageRe.ReplaceAllString(body, "")
	body = mdInlineLinkRe.ReplaceAllStringFunc(body, allowed.inlineLink)
	body = mdRefLinkRe.ReplaceAllStringFunc(body, refLinkText)
	body = mdAutolinkRe.ReplaceAllStringFunc(body, allowed.autolink)
	body = bareURLRe.ReplaceAllStringFunc(body, allowed.address)
	return strings.TrimSpace(multiNewlinesRe.ReplaceAllString(body, "\n\n"))
}

// linkPolicy is the set of addresses a report may link to (normalised).
type linkPolicy map[string]bool

// inlineLink keeps [text](url) to a source and reduces any other to its
// text; a marker never becomes a link.
func (p linkPolicy) inlineLink(link string) string {
	m := mdInlineLinkRe.FindStringSubmatch(link)
	switch {
	case isMarkerNumber(m[1]):
		return "[" + m[1] + "]"
	case p[normaliseURL(m[2])]:
		return link
	}
	return m[1]
}

// refLinkText reduces [text][label] to its text, leaving a run of markers
// ([1][2]) as it is.
func refLinkText(link string) string {
	m := mdRefLinkRe.FindStringSubmatch(link)
	if isMarkerNumber(m[1]) {
		return link
	}
	return m[1]
}

func isMarkerNumber(s string) bool {
	_, err := strconv.Atoi(s)
	return err == nil
}

// autolink treats <https://…> like a bare address.
func (p linkPolicy) autolink(link string) string { return p.address(link[1 : len(link)-1]) }

// address keeps a source's address and turns any other into its host name,
// leaving trailing punctuation where it was.
func (p linkPolicy) address(raw string) string {
	addr := strings.TrimRight(raw, ".,;:!?*_~'")
	if p[normaliseURL(addr)] {
		return raw
	}
	full := addr
	if !strings.Contains(full, "://") {
		full = "https://" + full
	}
	return strings.TrimPrefix(hostOf(full), "www.") + raw[len(addr):]
}

// ── publishers ───────────────────────────────────────────────────────────────

// knownPublishers maps registrable domains to their publication names.
var knownPublishers = map[string]string{
	"gna.org.gh":         "Ghana News Agency",
	"graphic.com.gh":     "Daily Graphic",
	"myjoyonline.com":    "MyJoyOnline",
	"citinewsroom.com":   "Citi Newsroom",
	"3news.com":          "3News",
	"gbcghanaonline.com": "GBC",
}

// secondLevelLabels are the labels under a country TLD that are not
// registrable on their own (graphic.com.gh, gna.org.gh, ucc.edu.gh).
var secondLevelLabels = map[string]bool{"com": true, "org": true, "gov": true, "edu": true, "co": true, "net": true, "ac": true, "mil": true}

// registrableDomain is host's registrable domain (a small public-suffix
// heuristic that covers Ghanaian and generic domains).
func registrableDomain(host string) string {
	host = strings.TrimPrefix(strings.ToLower(strings.TrimSuffix(host, ".")), "www.")
	parts := strings.Split(host, ".")
	if len(parts) <= 2 {
		return host
	}
	n := len(parts)
	if len(parts[n-1]) == 2 && secondLevelLabels[parts[n-2]] {
		return strings.Join(parts[n-3:], ".")
	}
	return strings.Join(parts[n-2:], ".")
}

// hostOf is the lower-cased host of an URL ("" when unparsable).
func hostOf(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return strings.ToLower(u.Hostname())
}

// publisherName names a source: the built-in table, else the site name in
// the page title ("Story - Site"), else the host.
func publisherName(rawURL, title string) string {
	host := hostOf(rawURL)
	if name, ok := knownPublishers[registrableDomain(host)]; ok {
		return name
	}
	for _, sep := range []string{" | ", " - ", " – ", " — "} {
		if i := strings.LastIndex(title, sep); i > 0 {
			if site := strings.TrimSpace(title[i+len(sep):]); site != "" && runeLen(site) <= 40 {
				return site
			}
		}
	}
	return strings.TrimPrefix(host, "www.")
}

// httpsURL reports whether raw is an absolute https URL with a host.
func httpsURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	return err == nil && u.Scheme == "https" && u.Host != ""
}

// normaliseURL is the comparison key of an URL: no fragment, no trailing
// slash, lower-case scheme and host.
func normaliseURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return strings.TrimSpace(raw)
	}
	u.Fragment = ""
	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	return strings.TrimSuffix(u.String(), "/")
}
