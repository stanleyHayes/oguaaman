package emailtmpl

import (
	"fmt"
	"html"
	"html/template"
	"strings"
	"unicode/utf8"
)

// Brand: Oguaa's "Castle, Canopy, Canoe" palette.
const (
	cream    = "#F6F1E7" // page
	paper    = "#FFFFFF" // card
	sand     = "#ECE4D3" // hairlines, the code box
	forest   = "#123F2D" // header band, primary button
	deep     = "#0C2C1F"
	ink      = "#1A2E22" // headings
	bodyText = "#4A5A50"
	small    = "#5F6B62" // small print (#6E7A70 darkened to pass 4.5:1 on cream)
	teal     = "#0B6557" // links in the card

	gold     template.CSS = "#B07D32" // accent rule only, never text on light
	goldText template.CSS = "#8A5E1F" // gold for text on light backgrounds
	clay     template.CSS = "#B0503C" // warnings
)

// Fixed copy and addresses that every email carries.
const (
	brandName = "Oguaa"
	// LayoutMarker is the meta tag every rendered email carries in its <head>;
	// IsBranded looks for it.
	LayoutMarker = `<meta name="x-oguaa-layout" content="v1">`

	// IconURL (the header icon) is served by the API (internal/infra/http/brandimg): both web
	// origins sit behind a Vercel bot challenge that mail clients' image
	// proxies (Gmail, Outlook) cannot pass, and the API host has none.
	IconURL    = "https://api.oguaaman.com/uploads/brand/email-icon-96.png"
	privacyURL = "https://citizen.oguaaman.com/privacy"
	termsURL   = "https://citizen.oguaaman.com/terms"
	// OperatorLine names the business behind Oguaa; every footer carries it.
	OperatorLine = "Oguaa is operated by Dev Track (BN843072020), GE-161-2814, Ghana · +233 55 518 0048 · hello@oguaaman.com"

	defaultTransactionalReason = "You're getting this email because of activity on your Oguaa account."
	defaultNotificationReason  = "You're getting this email because you have an Oguaa account."

	fontStack = `'Outfit','Helvetica Neue',Helvetica,Arial,sans-serif`

	// wrapCSS lets an unbroken run (a pasted URL, a long token in a title)
	// break inside the column instead of stretching it past a phone's width.
	wrapCSS = "overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;"
)

// operatorHTML is OperatorLine for the HTML footer: the registration reference
// and phone number never break mid-way, and the phone and address are explicit
// brand-styled links so Gmail's linkifier and Apple's data detectors do not
// paint them their own blue. The text part keeps the plain OperatorLine.
const operatorHTML = `Oguaa is operated by Dev Track (BN843072020), <span style="white-space:nowrap;">GE-161-2814</span>, Ghana` +
	` &middot; <a class="f-link" href="tel:+233555180048" style="color:` + forest + `;text-decoration:underline;white-space:nowrap;">+233&nbsp;55&nbsp;518&nbsp;0048</a>` +
	` &middot; <a class="f-link" href="mailto:hello@oguaaman.com" style="color:` + forest + `;text-decoration:underline;">hello@oguaaman.com</a>`

// Outlook (mso) markup. html/template drops comments written in a template,
// so conditional comments are injected as trusted values instead.
const (
	msoHead = `<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>table,td,a,p,h1,span{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->`
	// msoContainerStart/End give Outlook a fixed 600px column (it ignores max-width).
	msoContainerStart = `<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->`
	msoContainerEnd   = `<!--[if mso]></td></tr></table><![endif]-->`
	msoButtonEnd      = template.HTML(`<!--<![endif]-->`)

	buttonHeight = 48 // px; at least 44 for a comfortable tap target
)

// msoButton is the VML roundrect Outlook draws instead of the padded link,
// followed by the opener that hides the HTML button from Outlook.
func msoButton(label, href string) template.HTML {
	width := max(200, utf8.RuneCountInString(label)*10+64)
	return template.HTML(fmt.Sprintf( //nolint:gosec // label and href are HTML-escaped; href is a vetted http(s) URL
		`<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="%s" style="height:%dpx;v-text-anchor:middle;width:%dpx;" arcsize="21%%" strokecolor="%s" fillcolor="%s"><w:anchorlock/><center style="color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;">%s</center></v:roundrect><![endif]--><!--[if !mso]><!-->`,
		html.EscapeString(href), buttonHeight, width, forest, forest, html.EscapeString(label)))
}

var layout = template.Must(template.New("email").Funcs(template.FuncMap{
	"mso": func(name string) template.HTML {
		switch name {
		case "head":
			return msoHead
		case "start":
			return msoContainerStart
		case "end":
			return msoContainerEnd
		}
		return ""
	},
}).Parse(brandTokens.Replace(layoutHTML)))

// brandTokens fills the palette into the template source once, at start-up,
// so the template text stays readable and the colours live in one place.
var brandTokens = strings.NewReplacer(
	"%OPERATOR%", operatorHTML,
	"%CREAM%", cream, "%PAPER%", paper, "%SAND%", sand, "%FOREST%", forest,
	"%DEEP%", deep, "%INK%", ink, "%BODY%", bodyText, "%SMALL%", small, "%TEAL%", teal,
	"%GOLD%", string(gold), "%GOLDTEXT%", string(goldText), "%CLAY%", string(clay),
	"%FONT%", fontStack, "%ICON%", IconURL, "%PRIVACY%", privacyURL, "%TERMS%", termsURL,
	"%MARKER%", LayoutMarker, "%WRAP%", wrapCSS,
)

const layoutHTML = `<!doctype html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
%MARKER%
<title>{{.Title}}</title>
{{mso "head"}}
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&amp;display=swap" rel="stylesheet">
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
a{color:%TEAL%}
.fragment p{margin:0 0 16px}
.fragment a{color:%TEAL%;text-decoration:underline}
.h1,.t-body,.t-small,.t-kicker,.t-warn,.fragment,.fragment *{overflow-wrap:anywhere;word-break:break-word}
a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important}
@media only screen and (max-width:620px){
.outer{padding:12px 8px !important}
.px{padding-left:20px !important;padding-right:20px !important}
.h1{font-size:22px !important;line-height:30px !important}
.code{font-size:26px !important;letter-spacing:6px !important;padding-left:18px !important}
.btn-table{width:100% !important}
.btn{display:block !important;text-align:center !important}
}
@media (prefers-color-scheme:dark){
.bg-page{background:#0A2219 !important}
.bg-header{background:%FOREST% !important}
.bg-card{background:#0F3325 !important;border-color:#24503E !important}
.t-head{color:%CREAM% !important}
.t-body,.fragment{color:#D6DDD7 !important}
.t-small{color:#A9B5AD !important}
.t-kicker{color:#D9AE62 !important}
.t-warn{color:#E79A86 !important}
.t-link,.fragment a{color:#8FD9C6 !important}
.fragment p,.fragment li,.fragment td,.fragment span,.fragment strong,.fragment b,.fragment em,.fragment blockquote{color:#D6DDD7 !important}
.fragment h1,.fragment h2,.fragment h3,.fragment h4{color:%CREAM% !important}
.note{border-top-color:#24503E !important}
.code{background:#1C4A38 !important;color:%CREAM% !important}
.btn-td{background:#D9AE62 !important}
.btn{background:#D9AE62 !important;color:%DEEP% !important}
.f-link{color:#D6DDD7 !important}
}
</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background:%CREAM%;">
{{- if .Preheader}}
<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:%CREAM%;opacity:0;">{{.Preheader}}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
{{- end}}
<table role="presentation" class="bg-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="%CREAM%" style="width:100%;background:%CREAM%;">
<tr><td class="outer" align="center" style="padding:32px 12px;">
{{mso "start"}}
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td class="bg-header px" bgcolor="%FOREST%" style="background:%FOREST%;padding:22px 32px;border-radius:14px 14px 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:12px;"><img src="%ICON%" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border-radius:8px;color:#FFFFFF;font-family:%FONT%;font-size:11px;line-height:32px;"></td>
<td valign="middle" style="font-family:%FONT%;font-size:22px;line-height:28px;font-weight:700;color:#FFFFFF;letter-spacing:0.2px;">Oguaa</td>
</tr></table>
</td></tr>
<tr><td height="4" bgcolor="{{.Accent}}" style="background:{{.Accent}};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="bg-card px" bgcolor="%PAPER%" style="background:%PAPER%;padding:32px 32px 16px;border:1px solid %SAND%;border-top:0;border-radius:0 0 14px 14px;font-family:%FONT%;">
{{- if .Kicker}}
<p class="{{if .Warning}}t-warn{{else}}t-kicker{{end}}" style="margin:0 0 8px;font-family:%FONT%;font-size:12px;line-height:16px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;%WRAP%color:{{.KickerColor}};">{{.Kicker}}</p>
{{- end}}
{{- if .Heading}}
<h1 class="h1 t-head" style="margin:0 0 16px;font-family:%FONT%;font-size:24px;line-height:32px;font-weight:700;%WRAP%color:%INK%;">{{.Heading}}</h1>
{{- end}}
{{- range .Paragraphs}}
<p class="t-body" style="margin:0 0 16px;font-family:%FONT%;font-size:16px;line-height:26px;%WRAP%color:%BODY%;">{{.}}</p>
{{- end}}
{{- if .Body}}
<div class="fragment t-body" style="font-family:%FONT%;font-size:16px;line-height:26px;%WRAP%color:%BODY%;">{{.Body}}</div>
{{- end}}
{{- if .Code}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr>
<td class="code" align="center" bgcolor="%SAND%" style="background:%SAND%;border-radius:12px;padding:16px 18px 16px 26px;font-family:%FONT%;font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;color:%FOREST%;-webkit-user-select:all;user-select:all;">{{.Code}}</td>
</tr></table>
{{- end}}
{{- with .Button}}
<table role="presentation" class="btn-table" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;"><tr>
<td class="btn-td" align="center" bgcolor="%FOREST%" style="background:%FOREST%;border-radius:10px;">
{{.MsoStart}}<a class="btn" href="{{.URL}}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;font-family:%FONT%;font-size:16px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;background:%FOREST%;">{{.Label}}</a>{{.MsoEnd}}
</td></tr></table>
<p class="t-small" style="margin:0 0 20px;font-family:%FONT%;font-size:13px;line-height:20px;color:%SMALL%;word-break:break-all;">Or open this link: <a class="t-link" href="{{.URL}}" target="_blank" rel="noopener" style="color:%TEAL%;text-decoration:underline;">{{.URL}}</a></p>
{{- end}}
{{- range .Links}}
<p style="margin:0 0 12px;font-family:%FONT%;font-size:15px;line-height:22px;%WRAP%"><a class="t-link" href="{{.URL}}" target="_blank" rel="noopener" style="color:%TEAL%;text-decoration:underline;font-weight:600;">{{.Label}}</a></p>
{{- end}}
{{- if .Note}}
<p class="t-small note" style="margin:20px 0 16px;padding-top:16px;border-top:1px solid %SAND%;font-family:%FONT%;font-size:13px;line-height:20px;%WRAP%color:%SMALL%;">{{.Note}}</p>
{{- end}}
</td></tr>
<tr><td class="px" style="padding:24px 32px 8px;font-family:%FONT%;font-size:12px;line-height:18px;color:%SMALL%;">
{{- with .Footer}}
<p class="t-small" style="margin:0 0 10px;font-family:%FONT%;font-size:12px;line-height:18px;%WRAP%color:%SMALL%;">{{.Reason}}{{if .Hint}} {{.Hint}}{{end}}</p>
{{- if and .Notification (or .ManageURL .UnsubscribeURL)}}
<p class="t-small" style="margin:0 0 10px;font-family:%FONT%;font-size:12px;line-height:18px;color:%SMALL%;">
{{- if .ManageURL}}<a class="f-link" href="{{.ManageURL}}" target="_blank" rel="noopener" style="color:%FOREST%;text-decoration:underline;font-weight:600;">Manage notifications</a>{{end}}
{{- if and .ManageURL .UnsubscribeURL}} &nbsp;·&nbsp; {{end}}
{{- if .UnsubscribeURL}}<a class="f-link" href="{{.UnsubscribeURL}}" target="_blank" rel="noopener" style="color:%FOREST%;text-decoration:underline;font-weight:600;">{{.UnsubscribeLabel}}</a>{{end -}}
</p>
{{- end}}
{{- end}}
<p class="t-small" style="margin:0 0 10px;font-family:%FONT%;font-size:12px;line-height:18px;color:%SMALL%;"><a class="f-link" href="%PRIVACY%" target="_blank" rel="noopener" style="color:%FOREST%;text-decoration:underline;">Privacy</a> &nbsp;·&nbsp; <a class="f-link" href="%TERMS%" target="_blank" rel="noopener" style="color:%FOREST%;text-decoration:underline;">Terms</a></p>
<p class="t-small" style="margin:0;font-family:%FONT%;font-size:12px;line-height:18px;color:%SMALL%;">%OPERATOR%</p>
</td></tr>
</table>
{{mso "end"}}
</td></tr>
</table>
</body>
</html>
`
