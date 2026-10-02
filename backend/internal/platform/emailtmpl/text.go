package emailtmpl

import (
	"strings"

	xhtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// renderText is the plain-text part: the same content as the HTML, in the
// same order, with every link spelled out.
func renderText(v *view) string {
	var b textBuilder
	b.block(strings.ToUpper(brandName))
	b.block(v.Kicker)
	b.block(v.Heading)
	for _, p := range v.Paragraphs {
		b.block(p)
	}
	b.block(v.BodyText)
	b.block(v.Code)
	if v.Button != nil {
		b.block(v.Button.Label + ": " + v.Button.URL)
	}
	for _, l := range v.Links {
		b.block(l.Label + ": " + l.URL)
	}
	b.block(v.Note)
	b.block("--")
	f := v.Footer
	b.block(strings.TrimSpace(f.Reason + " " + f.Hint))
	if f.ManageURL != "" {
		b.line("Manage notifications: " + f.ManageURL)
	}
	if f.UnsubscribeURL != "" {
		b.line(f.UnsubscribeLabel + ": " + f.UnsubscribeURL)
	}
	b.line("Privacy: " + privacyURL)
	b.line("Terms: " + termsURL)
	b.line(OperatorLine)
	return b.String()
}

// textBuilder joins blocks with a blank line and lines with a newline.
type textBuilder struct{ strings.Builder }

func (b *textBuilder) block(s string) {
	s = strings.TrimSpace(s)
	if s == "" {
		return
	}
	if b.Len() > 0 {
		b.WriteString("\n\n")
	}
	b.WriteString(s)
}

func (b *textBuilder) line(s string) {
	if b.Len() > 0 {
		b.WriteString("\n")
	}
	b.WriteString(s)
}

// PlainText derives a readable plain-text version of an HTML email or
// fragment: block elements become paragraphs, links are spelled out as
// "label (url)", and anything hidden (head, scripts, styles, the preheader)
// is left out.
func PlainText(htmlSrc string) string {
	doc, err := xhtml.Parse(strings.NewReader(htmlSrc))
	if err != nil {
		return strings.TrimSpace(htmlSrc)
	}
	var w textWalker
	w.walk(doc)
	return w.String()
}

type textWalker struct {
	paras []string
	cur   strings.Builder
	// lastItem is set when the last paragraph is a list item, so the next
	// item of the same list joins it on its own line instead of a new
	// paragraph.
	lastItem bool
	// curItem is set while the current paragraph is a list item.
	curItem bool
}

const bullet = "- "

func (w *textWalker) String() string {
	w.flush()
	return strings.Join(w.paras, "\n\n")
}

// flush ends the current paragraph.
func (w *textWalker) flush() {
	s, item := clean(w.cur.String()), w.curItem
	w.cur.Reset()
	w.curItem = false
	if s == "" || s == strings.TrimSpace(bullet) { // an empty list item says nothing
		return
	}
	if item && w.lastItem && len(w.paras) > 0 {
		w.paras[len(w.paras)-1] += "\n" + s
	} else {
		w.paras = append(w.paras, s)
	}
	w.lastItem = item
}

func (w *textWalker) walk(n *xhtml.Node) {
	switch n.Type {
	case xhtml.TextNode:
		w.cur.WriteString(n.Data)
		return
	case xhtml.ElementNode:
		if skipForText(n) {
			return
		}
	case xhtml.CommentNode:
		return
	}
	block := n.Type == xhtml.ElementNode && (isBlock(n.DataAtom) || n.DataAtom == atom.Br)
	// A block right inside a list item (<li><p>…) keeps the item's bullet.
	if block && w.cur.String() != bullet {
		w.flush()
	}
	switch n.DataAtom {
	case atom.Ul, atom.Ol:
		w.lastItem = false // a new list starts a new paragraph
	case atom.Li:
		w.cur.WriteString(bullet)
		w.curItem = true
	}
	start := w.cur.Len()
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		w.walk(c)
	}
	if n.DataAtom == atom.A {
		w.spellOutLink(n, start)
	}
	if block {
		w.flush()
	}
}

// spellOutLink appends " (url)" after a link's label unless the label is the
// URL already. Only web and mailto links are spelled out.
func (w *textWalker) spellOutLink(n *xhtml.Node, start int) {
	href := strings.TrimSpace(attr(n, "href"))
	if _, ok := webURL(href); !ok && !strings.HasPrefix(strings.ToLower(href), "mailto:") {
		return // only links a reader could follow from plain text
	}
	cur := w.cur.String()
	label := "" // a block inside the link flushed its label already
	if start <= len(cur) {
		label = clean(cur[start:])
	}
	if label == href || label == strings.TrimPrefix(href, "mailto:") {
		return
	}
	w.cur.WriteString(" (" + href + ")")
}

func skipForText(n *xhtml.Node) bool {
	switch n.DataAtom {
	case atom.Head, atom.Script, atom.Style, atom.Title, atom.Noscript, atom.Template:
		return true
	}
	style := strings.ReplaceAll(strings.ToLower(attr(n, "style")), " ", "")
	return strings.Contains(style, "display:none")
}

func isBlock(a atom.Atom) bool {
	switch a {
	case atom.P, atom.Div, atom.H1, atom.H2, atom.H3, atom.H4, atom.H5, atom.H6,
		atom.Li, atom.Ul, atom.Ol, atom.Tr, atom.Table, atom.Blockquote, atom.Pre,
		atom.Hr, atom.Section, atom.Article, atom.Header, atom.Footer, atom.Body:
		return true
	}
	return false
}

func attr(n *xhtml.Node, key string) string {
	for _, a := range n.Attr {
		if a.Namespace == "" && strings.EqualFold(a.Key, key) {
			return a.Val
		}
	}
	return ""
}
