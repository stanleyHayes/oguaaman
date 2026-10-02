// Package brandimg embeds the brand images that emails link to. The API serves
// them at /uploads/brand/* because the web origins sit behind a bot challenge
// that mail clients' image proxies (Gmail, Outlook) cannot pass; the API host
// has none, so the email header icon always loads.
package brandimg

import "embed"

// FS holds the email images: the 96px app icon (frontend/public/icon-96.png)
// with its corners outside the rounded tile made transparent, so clients that
// ignore border-radius on <img> (Outlook for Windows, Windows Mail) show no
// white corners on the forest header band.
//
//go:embed *.png
var FS embed.FS
