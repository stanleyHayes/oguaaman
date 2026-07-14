// Package seedimg embeds the curated, freely licensed Cape Coast photography
// (see ATTRIBUTION.md) used by the seed data. The API serves it at
// /uploads/seed/* so seeded covers, galleries and crests resolve like ordinary
// uploads — no external image hosts required.
package seedimg

import "embed"

// FS holds the seed imagery: JPEGs at the root and school crests under crests/.
//
//go:embed *.jpg crests/*.png
var FS embed.FS
