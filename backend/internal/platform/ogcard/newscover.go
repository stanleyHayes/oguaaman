package ogcard

import (
	"hash/fnv"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"math"
	"strings"

	"golang.org/x/image/font"
	"golang.org/x/image/math/fixed"
	"golang.org/x/image/vector"
)

// ── branded news covers (spec §1.4) ──────────────────────────────────────────
//
// Automated articles that carry no photograph get a branded cover instead: a
// deterministic 1600×900 card on the brand palette with an abstract geometric
// motif on the right and the headline on the left. The seed (the article
// slug) picks the palette pairing and the motif, so a story always gets the
// same cover. Type follows the design system: Outfit only, tight tracking on
// the headline, slight positive tracking on the small uppercase kicker. No
// Adinkra or other cultural symbols, no photos.
//
// Portal cards crop covers to 3:2, so everything that must be read sits
// inside the central 1350×900 (x 125..1475); the motif may run off the edge.

// NewsCover is the content of one branded cover. Seed is the article slug.
type NewsCover struct{ Seed, Kicker, Title, Source, Date string }

const (
	CoverW, CoverH = 1600, 900

	coverPadX      = 176  // left edge of the text column (51px inside the 3:2 crop)
	coverTextRight = 1000 // the text column ends here; the motif owns the rest
	coverPanelX    = 1056 // where the motif panel starts
	coverKickerY   = 184  // kicker baseline
	coverMetaY     = 806  // source · date baseline
	coverRuleY     = 742  // hairline above the meta line

	coverTitleMax  = 84.0
	coverTitleMin  = 56.0
	coverTitleStep = 4.0
	coverMaxLines  = 3

	// rasterTile keeps every vector rasterizer at or below x/image/vector's
	// floating-point threshold (512), so shapes use its fixed-point path.
	rasterTile = 512
)

// Brand colours (spec §1.4).
var (
	brandGreen900 = color.NRGBA{0x0c, 0x2c, 0x1f, 0xff}
	brandGold     = color.NRGBA{0xc7, 0xa2, 0x4a, 0xff}
	brandSand     = color.NRGBA{0xd8, 0xcd, 0xb4, 0xff}
	brandCream    = color.NRGBA{0xf7, 0xf3, 0xea, 0xff}
)

// coverPalette is one pairing: the ground, the headline, the two motif tones,
// the meta line and the faint dot-grid texture.
type coverPalette struct {
	ground, title, motifA, motifB, meta, dots color.NRGBA
}

// coverPalettes are the six pairings. Every headline/ground pair clears
// WCAG AAA; the meta line clears AA for large text.
var coverPalettes = [6]coverPalette{
	{ground: brandGreen900, title: brandCream, motifA: brandGold, motifB: mix(brandGreen900, brandCream, 0.14), meta: brandSand, dots: mix(brandGreen900, brandCream, 0.10)},
	{ground: brandCream, title: brandGreen900, motifA: brandGold, motifB: brandSand, meta: mix(brandGreen900, brandCream, 0.30), dots: mix(brandCream, brandGreen900, 0.07)},
	{ground: brandSand, title: brandGreen900, motifA: brandGreen900, motifB: mix(brandSand, brandCream, 0.55), meta: mix(brandGreen900, brandSand, 0.22), dots: mix(brandSand, brandGreen900, 0.09)},
	{ground: brandGreen900, title: brandCream, motifA: brandSand, motifB: mix(brandGreen900, brandGold, 0.38), meta: brandGold, dots: mix(brandGreen900, brandGold, 0.12)},
	{ground: brandCream, title: brandGreen900, motifA: brandGreen900, motifB: brandGold, meta: mix(brandGreen900, brandCream, 0.30), dots: mix(brandCream, brandGold, 0.16)},
	{ground: brandGold, title: brandGreen900, motifA: brandGreen900, motifB: mix(brandGold, brandCream, 0.40), meta: mix(brandGreen900, brandGold, 0.18), dots: mix(brandGold, brandGreen900, 0.10)},
}

// Motifs.
const (
	motifStripes = iota // stripe blocks
	motifArcs           // concentric arcs
	motifGrid           // offset grid
	motifCount
)

// RenderNewsCover draws a deterministic 1600x900 PNG: FNV-32(Seed) picks one of
// 6 brand palette pairings and one of 3 abstract geometric motifs (stripe
// blocks, concentric arcs, offset grid), then the kicker, the wrapped title
// (≤3 lines, shrunk to fit) and the line "{Source} · {Date}".
func RenderNewsCover(w io.Writer, c NewsCover) error {
	img, err := drawNewsCover(c)
	if err != nil {
		return err
	}
	return png.Encode(w, img)
}

// drawNewsCover renders the cover into an image.
func drawNewsCover(c NewsCover) (*image.RGBA, error) {
	seed := seedHash(c.Seed)
	pal := coverPalettes[seed%uint32(len(coverPalettes))]
	rng := &xorshift{s: seed | 1}

	img := image.NewRGBA(image.Rect(0, 0, CoverW, CoverH))
	draw.Draw(img, img.Bounds(), image.NewUniform(pal.ground), image.Point{}, draw.Src)
	drawDotGrid(img, pal.dots)
	switch (seed / uint32(len(coverPalettes))) % motifCount {
	case motifStripes:
		drawStripeBlocks(img, pal, rng)
	case motifArcs:
		drawConcentricArcs(img, pal, rng)
	default:
		drawOffsetGrid(img, pal, rng)
	}
	if err := drawCoverText(img, pal, c); err != nil {
		return nil, err
	}
	return img, nil
}

// seedHash is FNV-32a of the seed.
func seedHash(seed string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(seed))
	return h.Sum32()
}

// xorshift is a tiny deterministic generator for motif variation.
type xorshift struct{ s uint32 }

func (x *xorshift) next() uint32 {
	x.s ^= x.s << 13
	x.s ^= x.s >> 17
	x.s ^= x.s << 5
	return x.s
}

// between returns an integer in [lo, hi].
func (x *xorshift) between(lo, hi int) int { return lo + int(x.next()%uint32(hi-lo+1)) }

// mix blends a toward b by t (0..1), opaque.
func mix(a, b color.NRGBA, t float64) color.NRGBA {
	l := func(p, q uint8) uint8 { return uint8(math.Round(float64(p) + (float64(q)-float64(p))*t)) }
	return color.NRGBA{l(a.R, b.R), l(a.G, b.G), l(a.B, b.B), 0xff}
}

// ── shapes ───────────────────────────────────────────────────────────────────

// pathFn traces a path onto z, offset by (-ox, -oy).
type pathFn func(z *vector.Rasterizer, ox, oy float32)

// fillPath fills a path in col, tile by tile so each rasterizer stays small.
func fillPath(dst *image.RGBA, col color.Color, bounds image.Rectangle, path pathFn) {
	bounds = bounds.Intersect(dst.Bounds())
	src := image.NewUniform(col)
	z := vector.NewRasterizer(rasterTile, rasterTile)
	for ty := bounds.Min.Y; ty < bounds.Max.Y; ty += rasterTile {
		for tx := bounds.Min.X; tx < bounds.Max.X; tx += rasterTile {
			tile := image.Rect(tx, ty, min(tx+rasterTile, bounds.Max.X), min(ty+rasterTile, bounds.Max.Y))
			z.Reset(tile.Dx(), tile.Dy())
			path(z, float32(tx), float32(ty))
			z.Draw(dst, tile, src, image.Point{})
		}
	}
}

// rect traces an axis-aligned rectangle.
func rect(x0, y0, x1, y1 float32) pathFn {
	return func(z *vector.Rasterizer, ox, oy float32) {
		z.MoveTo(x0-ox, y0-oy)
		z.LineTo(x1-ox, y0-oy)
		z.LineTo(x1-ox, y1-oy)
		z.LineTo(x0-ox, y1-oy)
		z.ClosePath()
	}
}

// circleKappa places cubic control points so four curves approximate a circle.
const circleKappa = 0.5522847498

// traceCircle adds a circle; clockwise=false winds it the other way (a hole
// inside a clockwise circle).
func traceCircle(z *vector.Rasterizer, cx, cy, r float32, clockwise bool) {
	k := r * circleKappa
	z.MoveTo(cx+r, cy)
	if clockwise {
		z.CubeTo(cx+r, cy+k, cx+k, cy+r, cx, cy+r)
		z.CubeTo(cx-k, cy+r, cx-r, cy+k, cx-r, cy)
		z.CubeTo(cx-r, cy-k, cx-k, cy-r, cx, cy-r)
		z.CubeTo(cx+k, cy-r, cx+r, cy-k, cx+r, cy)
	} else {
		z.CubeTo(cx+r, cy-k, cx+k, cy-r, cx, cy-r)
		z.CubeTo(cx-k, cy-r, cx-r, cy-k, cx-r, cy)
		z.CubeTo(cx-r, cy+k, cx-k, cy+r, cx, cy+r)
		z.CubeTo(cx+k, cy+r, cx+r, cy+k, cx+r, cy)
	}
	z.ClosePath()
}

// ring traces an annulus (outer radius r, inner radius r-thick).
func ring(cx, cy, r, thick float32) pathFn {
	return func(z *vector.Rasterizer, ox, oy float32) {
		traceCircle(z, cx-ox, cy-oy, r, true)
		if r-thick > 0 {
			traceCircle(z, cx-ox, cy-oy, r-thick, false)
		}
	}
}

// drawDotGrid lays the faint dot texture (the web's bg-dotgrid) over the
// whole ground.
func drawDotGrid(img *image.RGBA, col color.NRGBA) {
	const step, radius = 28, 1.6
	fillPath(img, col, img.Bounds(), func(z *vector.Rasterizer, ox, oy float32) {
		for y := step / 2; y < CoverH; y += step {
			for x := step / 2; x < CoverW; x += step {
				fx, fy := float32(x)-ox, float32(y)-oy
				if fx < -4 || fy < -4 || fx > rasterTile+4 || fy > rasterTile+4 {
					continue
				}
				traceCircle(z, fx, fy, radius, true)
			}
		}
	})
}

// drawStripeBlocks: slanted bands of varied width sweeping across the panel
// (never upright bars, which would read as a chart on a news cover), the
// tones alternating with an accent band every third stripe.
func drawStripeBlocks(img *image.RGBA, pal coverPalette, rng *xorshift) {
	const slant = 0.42 // horizontal run per pixel of height
	run := float32(CoverH * slant)
	x := float32(coverPanelX + rng.between(0, 60))
	panel := image.Rect(coverPanelX-20, 0, CoverW, CoverH)
	for i := 0; x < CoverW+run; i++ {
		w := float32(rng.between(40, 112))
		col := pal.motifB
		if i%3 == 1 {
			col = pal.motifA
		}
		fillPath(img, col, panel, slantBand(x, w, run))
		x += w + float32(rng.between(14, 34))
	}
}

// slantBand traces a full-height parallelogram whose top edge starts at x and
// whose bottom edge is shifted left by run.
func slantBand(x, w, run float32) pathFn {
	return func(z *vector.Rasterizer, ox, oy float32) {
		z.MoveTo(x-ox, -oy)
		z.LineTo(x+w-ox, -oy)
		z.LineTo(x+w-run-ox, CoverH-oy)
		z.LineTo(x-run-ox, CoverH-oy)
		z.ClosePath()
	}
}

// drawConcentricArcs: rings centred on a corner of the panel, alternating
// tones, read as arcs because the image edge clips them.
func drawConcentricArcs(img *image.RGBA, pal coverPalette, rng *xorshift) {
	cx := float32(CoverW + rng.between(-40, 60))
	cy := float32(CoverH + rng.between(-20, 40))
	if rng.next()%2 == 0 {
		cy = float32(rng.between(-40, 20)) // anchor to the top-right corner instead
	}
	thick := float32(rng.between(30, 42))
	gap := float32(rng.between(18, 30))
	panel := image.Rect(coverPanelX-40, 0, CoverW, CoverH)
	r := float32(rng.between(90, 140))
	for i := 0; r < 720; i++ {
		col := pal.motifB
		if i%2 == 1 {
			col = pal.motifA
		}
		fillPath(img, col, panel, ring(cx, cy, r, thick))
		r += thick + gap
	}
}

// drawOffsetGrid: square tiles on a grid whose alternate rows shift by half
// a cell; some tiles take the accent, some stay empty, thinning toward the
// headline.
func drawOffsetGrid(img *image.RGBA, pal coverPalette, rng *xorshift) {
	const cell, size = 72, 52
	y0 := rng.between(30, 70)
	for row := 0; y0+row*cell < CoverH; row++ {
		shift := (row % 2) * cell / 2
		for x := coverPanelX + shift; x < CoverW+cell; x += cell {
			roll := rng.next() % 100
			// Fewer tiles near the text column.
			if x < coverPanelX+cell && roll < 55 || roll < 18 {
				continue
			}
			col := pal.motifB
			if roll > 80 {
				col = pal.motifA
			}
			fx, fy := float32(x), float32(y0+row*cell)
			fillPath(img, col, image.Rect(x, int(fy), x+size+1, int(fy)+size+1), rect(fx, fy, fx+size, fy+size))
		}
	}
}

// ── type ─────────────────────────────────────────────────────────────────────

// drawCoverText sets the kicker, headline, hairline and meta line.
func drawCoverText(img *image.RGBA, pal coverPalette, c NewsCover) error {
	kickF, err := face(outfit600, 24)
	if err != nil {
		return err
	}
	kicker := strings.ToUpper(strings.TrimSpace(c.Kicker))
	if kicker == "" {
		kicker = "OGUAA NEWSROOM"
	}
	// A small square flag leads the kicker, in the accent.
	flag := pal.motifA
	if flag == pal.ground {
		flag = pal.title
	}
	draw.Draw(img, image.Rect(coverPadX, coverKickerY-17, coverPadX+14, coverKickerY-3), image.NewUniform(flag), image.Point{}, draw.Over)
	drawTrackedKern(img, kickF, pal.meta, coverPadX+30, coverKickerY, kicker, 4)

	if err := drawCoverTitle(img, pal.title, c.Title); err != nil {
		return err
	}

	// Hairline, then "{Source} · {Date}".
	rule := pal.meta
	rule.A = 0x66
	draw.Draw(img, image.Rect(coverPadX, coverRuleY, coverTextRight, coverRuleY+2), image.NewUniform(rule), image.Point{}, draw.Over)
	metaF, err := face(outfit400, 30)
	if err != nil {
		return err
	}
	meta := joinNonEmpty(" · ", strings.TrimSpace(c.Source), strings.TrimSpace(c.Date))
	if meta == "" {
		meta = "Oguaa"
	}
	d := &font.Drawer{Dst: img, Src: image.NewUniform(pal.meta), Face: metaF, Dot: fixed.P(coverPadX, coverMetaY)}
	d.DrawString(ellipsize(metaF, meta, coverTextRight-coverPadX))
	return nil
}

// drawCoverTitle sets the headline: the largest size between coverTitleMax
// and coverTitleMin that fits in three balanced lines, ellipsised at the
// smallest size when even that overflows.
func drawCoverTitle(img *image.RGBA, col color.NRGBA, title string) error {
	title = strings.Join(strings.Fields(title), " ")
	if title == "" {
		title = "Oguaa news"
	}
	width := coverTextRight - coverPadX
	var (
		f        font.Face
		lines    []string
		tracking int
		size     float64
		err      error
	)
	for size = coverTitleMax; size >= coverTitleMin; size -= coverTitleStep {
		if f, err = face(outfit600, size); err != nil {
			return err
		}
		tracking = -int(math.Round(size * 0.025)) // about -0.025em
		lines = balancedWrap(f, title, width, tracking)
		if len(lines) <= coverMaxLines {
			break
		}
	}
	size = max(size, coverTitleMin)
	if len(lines) > coverMaxLines {
		lines = lines[:coverMaxLines]
		lines[coverMaxLines-1] = ellipsizeTracked(f, lines[coverMaxLines-1]+"…", width, tracking)
	}
	// The headline sits on the hairline, like a poster: the last baseline is
	// a fixed distance above the rule, so short and long titles share a base.
	lineH := int(math.Round(size * 1.08)) // tight leading for display type
	y := coverRuleY - 64 - (len(lines)-1)*lineH
	for _, ln := range lines {
		drawTrackedKern(img, f, col, coverPadX-2, y, ln, tracking)
		y += lineH
	}
	return nil
}

// trackedWidth measures s with kerning plus tracking between glyphs.
func trackedWidth(f font.Face, s string, tracking int) int {
	var w fixed.Int26_6
	prev := rune(-1)
	n := 0
	for _, r := range s {
		if prev >= 0 {
			w += f.Kern(prev, r)
		}
		adv, _ := f.GlyphAdvance(r)
		w += adv
		prev = r
		n++
	}
	if n > 1 {
		w += fixed.I(tracking * (n - 1))
	}
	return w.Ceil()
}

// drawTrackedKern draws s glyph by glyph with kerning and tracking.
func drawTrackedKern(dst draw.Image, f font.Face, c color.Color, x, baseline int, s string, tracking int) {
	d := &font.Drawer{Dst: dst, Src: image.NewUniform(c), Face: f}
	dot := fixed.I(x)
	prev := rune(-1)
	for _, r := range s {
		if prev >= 0 {
			dot += f.Kern(prev, r) + fixed.I(tracking)
		}
		d.Dot = fixed.Point26_6{X: dot, Y: fixed.I(baseline)}
		d.DrawString(string(r))
		adv, _ := f.GlyphAdvance(r)
		dot += adv
		prev = r
	}
}

// greedyWrap breaks s into lines no wider than width.
func greedyWrap(f font.Face, s string, width, tracking int) []string {
	var lines []string
	cur := ""
	for _, w := range strings.Fields(s) {
		try := w
		if cur != "" {
			try = cur + " " + w
		}
		if trackedWidth(f, try, tracking) <= width || cur == "" {
			cur = try
			continue
		}
		lines = append(lines, cur)
		cur = w
	}
	if cur != "" {
		lines = append(lines, cur)
	}
	return lines
}

// balancedWrap wraps like CSS text-wrap: balance — the same number of lines
// as a greedy wrap, with the narrowest width that keeps that count, so the
// last line is never a lone word.
func balancedWrap(f font.Face, s string, width, tracking int) []string {
	lines := greedyWrap(f, s, width, tracking)
	if len(lines) < 2 {
		return lines
	}
	lo, hi := width/2, width
	for lo < hi {
		mid := (lo + hi) / 2
		if len(greedyWrap(f, s, mid, tracking)) <= len(lines) && fitsWidth(f, s, mid, tracking) {
			hi = mid
		} else {
			lo = mid + 1
		}
	}
	return greedyWrap(f, s, hi, tracking)
}

// fitsWidth reports whether every word of s fits in width on its own.
func fitsWidth(f font.Face, s string, width, tracking int) bool {
	for _, w := range strings.Fields(s) {
		if trackedWidth(f, w, tracking) > width {
			return false
		}
	}
	return true
}

// ellipsizeTracked cuts s to width (tracked), ending in "…".
func ellipsizeTracked(f font.Face, s string, width, tracking int) string {
	if trackedWidth(f, s, tracking) <= width {
		return s
	}
	runes := []rune(strings.TrimSuffix(s, "…"))
	for len(runes) > 0 {
		runes = runes[:len(runes)-1]
		cut := strings.TrimRight(string(runes), " ,;:-–—") + "…"
		if trackedWidth(f, cut, tracking) <= width {
			return cut
		}
	}
	return "…"
}

func joinNonEmpty(sep string, parts ...string) string {
	out := parts[:0:0]
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, sep)
}
