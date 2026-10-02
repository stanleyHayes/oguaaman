package emailtmpl

import (
	"encoding/base64"
	"html/template"
	"slices"
	"strings"

	xhtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// textMarker opens the comment Pack appends to carry the text part.
const textMarker = "<!--oguaa-text:"

// Pack returns the HTML with the plain-text part attached in a trailing
// comment, for senders whose interface takes one HTML string. Prepare (called
// by the Resend client) takes the comment off again before sending.
func (e Email) Pack() string {
	if e.Text == "" {
		return e.HTML
	}
	return e.HTML + textMarker + base64.StdEncoding.EncodeToString([]byte(e.Text)) + "-->"
}

// IsBranded reports whether s was produced by Render (it carries the layout
// marker).
func IsBranded(s string) bool {
	return strings.Contains(s, LayoutMarker)
}

// unpack splits a packed email into its HTML and text parts. A rendered email
// without a text comment gets a text part derived from its HTML.
func unpack(s string) Email {
	if i := strings.LastIndex(s, textMarker); i >= 0 {
		rest := s[i+len(textMarker):]
		if j := strings.Index(rest, "-->"); j >= 0 && strings.TrimSpace(rest[j+3:]) == "" {
			if text, err := base64.StdEncoding.DecodeString(rest[:j]); err == nil {
				return Email{HTML: s[:i], Text: string(text)}
			}
		}
	}
	return Email{HTML: s, Text: PlainText(s)}
}

// Prepare turns whatever a caller handed to a sender into a branded email
// with both parts: a rendered (and possibly packed) email is unpacked; any
// other HTML — or plain text — is wrapped in the branded layout with a
// transactional footer, so an email nobody routed through Render still goes
// out looking like Oguaa.
func Prepare(htmlBody, subject string) Email {
	if IsBranded(htmlBody) {
		return unpack(htmlBody)
	}
	if e, err := Wrap(htmlBody, subject); err == nil {
		return e
	}
	return Email{HTML: htmlBody, Text: PlainText(htmlBody)}
}

// Wrap places an HTML fragment (or a whole HTML document, or plain text)
// inside the branded layout with a transactional footer. The fragment is
// trusted markup from our own code: it is parsed and re-serialised, scripts,
// styles and document-level elements are dropped, and links and paragraphs
// get the brand's inline styles where they have none.
func Wrap(fragment, subject string) (Email, error) {
	// The subject doubles as the card's heading unless the fragment brings
	// its own, so a wrapped email has the same hierarchy as a rendered one.
	v := newView(Message{Title: subject, Heading: subject})
	if !strings.Contains(fragment, "<") {
		v.Paragraphs = cleanAll(strings.Split(fragment, "\n\n"))
		v.Preheader = firstWords(strings.Join(v.Paragraphs, " "))
		return render(v)
	}
	body, hasHeading, err := restyleFragment(fragment)
	if err != nil {
		return Email{}, err
	}
	if hasHeading {
		v.Heading = ""
	}
	v.Body = template.HTML(body) //nolint:gosec // our own callers' markup, re-serialised by the HTML parser with scripts removed
	v.BodyText = PlainText(body)
	v.Preheader = firstWords(v.BodyText)
	return render(v)
}

// firstWords is a preheader cut from the start of the text.
func firstWords(s string) string {
	const limit = 110
	s = clean(s)
	if len([]rune(s)) <= limit {
		return s
	}
	r := []rune(s)[:limit]
	if i := strings.LastIndexByte(string(r), ' '); i > 0 {
		return string(r)[:i] + "…"
	}
	return string(r) + "…"
}

// restyleFragment parses, cleans and re-serialises a fragment, and reports
// whether it carries a top-level heading (h1 or h2) of its own.
func restyleFragment(fragment string) (string, bool, error) {
	ctx := &xhtml.Node{Type: xhtml.ElementNode, Data: "div", DataAtom: atom.Div}
	nodes, err := xhtml.ParseFragment(strings.NewReader(fragment), ctx)
	if err != nil {
		return "", false, err
	}
	var b strings.Builder
	hasHeading := false
	for _, n := range nodes {
		if dropFromFragment(n) {
			continue
		}
		restyle(n)
		hasHeading = hasHeading || containsHeading(n)
		if err := xhtml.Render(&b, n); err != nil {
			return "", false, err
		}
	}
	return b.String(), hasHeading, nil
}

func containsHeading(n *xhtml.Node) bool {
	if n.Type == xhtml.ElementNode && (n.DataAtom == atom.H1 || n.DataAtom == atom.H2) {
		return true
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if containsHeading(c) {
			return true
		}
	}
	return false
}

// fragmentStyles are the brand's inline styles for elements in a wrapped
// fragment that carry no style of their own.
var fragmentStyles = map[atom.Atom]string{
	atom.A:  "color:" + teal + ";text-decoration:underline;",
	atom.P:  "margin:0 0 16px;font-family:" + fontStack + ";font-size:16px;line-height:26px;" + wrapCSS + "color:" + bodyText + ";",
	atom.H1: "margin:0 0 16px;font-family:" + fontStack + ";font-size:24px;line-height:32px;font-weight:700;" + wrapCSS + "color:" + ink + ";",
	atom.H2: "margin:0 0 12px;font-family:" + fontStack + ";font-size:20px;line-height:28px;font-weight:700;" + wrapCSS + "color:" + ink + ";",
	atom.H3: "margin:0 0 8px;font-family:" + fontStack + ";font-size:17px;line-height:24px;font-weight:700;" + wrapCSS + "color:" + ink + ";",
}

// fragmentClasses are the layout classes the dark-mode query recolours. They
// are added even to elements with their own inline style: an inline light
// colour would otherwise sit unreadable on the dark card.
var fragmentClasses = map[atom.Atom]string{
	atom.A: "t-link", atom.P: "t-body", atom.Li: "t-body", atom.Td: "t-body",
	atom.H1: "t-head", atom.H2: "t-head", atom.H3: "t-head",
}

func restyle(n *xhtml.Node) {
	for c := n.FirstChild; c != nil; {
		next := c.NextSibling
		if dropFromFragment(c) {
			n.RemoveChild(c)
		} else {
			restyle(c)
		}
		c = next
	}
	if n.Type != xhtml.ElementNode {
		return
	}
	n.Attr = safeAttrs(n.Attr)
	if c, ok := fragmentClasses[n.DataAtom]; ok {
		addClass(n, c)
	}
	if attr(n, "style") != "" {
		return
	}
	if s, ok := fragmentStyles[n.DataAtom]; ok {
		n.Attr = append(n.Attr, xhtml.Attribute{Key: "style", Val: s})
	}
}

func addClass(n *xhtml.Node, class string) {
	for i, a := range n.Attr {
		if a.Namespace == "" && strings.EqualFold(a.Key, "class") {
			if !slices.Contains(strings.Fields(a.Val), class) {
				n.Attr[i].Val = strings.TrimSpace(a.Val + " " + class)
			}
			return
		}
	}
	n.Attr = append(n.Attr, xhtml.Attribute{Key: "class", Val: class})
}

// safeAttrs drops event-handler attributes and script URLs; mail clients
// strip them anyway, and they have no business in an email.
func safeAttrs(attrs []xhtml.Attribute) []xhtml.Attribute {
	out := attrs[:0]
	for _, a := range attrs {
		key := strings.ToLower(a.Key)
		if strings.HasPrefix(key, "on") {
			continue
		}
		if (key == "href" || key == "src") && strings.HasPrefix(strings.ToLower(strings.TrimSpace(a.Val)), "javascript:") {
			continue
		}
		out = append(out, a)
	}
	return out
}

func dropFromFragment(n *xhtml.Node) bool {
	if n.Type == xhtml.CommentNode || n.Type == xhtml.DoctypeNode {
		return true
	}
	if n.Type != xhtml.ElementNode {
		return false
	}
	switch n.DataAtom {
	case atom.Script, atom.Style, atom.Title, atom.Meta, atom.Link, atom.Head, atom.Base, atom.Iframe, atom.Object, atom.Embed:
		return true
	}
	return false
}
