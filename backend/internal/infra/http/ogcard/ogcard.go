// Package ogcard renders 1200×630 Open Graph share cards (spec §11 — every
// public page gets a rich link preview; sharing is the growth engine). Cards
// are pure Go: embedded Fraunces/Outfit static instances (OFL, see fonts/OFL.txt)
// on the brand's deep-green field with an optional cover image on the right.
package ogcard

import (
	"embed"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"strings"
	"sync"

	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

//go:embed fonts/*.ttf
var fontFS embed.FS

// Card is the content of one share card.
type Card struct {
	Kicker   string      // small uppercase label ("Business", "In Memoriam"…)
	Title    string      // the page's headline
	Subtitle string      // one line of context (venue, dates, address…)
	Cover    image.Image // optional right-hand image (nil = type-only card)
}

const (
	W, H     = 1200, 630
	coverW   = 500 // right-hand cover column width
	padX     = 64
	goldBarH = 10
)

var (
	green900 = color.RGBA{0x0c, 0x2c, 0x1f, 0xff}
	cream    = color.RGBA{0xf7, 0xf3, 0xea, 0xff}
	gold     = color.RGBA{0xc7, 0xa2, 0x4a, 0xff}
	sand     = color.RGBA{0xd8, 0xcd, 0xb4, 0xff}
	muted    = color.RGBA{0x8f, 0xa4, 0x97, 0xff}
)

// fonts are parsed once; faces are created per size on demand.
var (
	mu          sync.Mutex
	parsed      = map[string]*opentype.Font{}
	faces       = map[string]font.Face{}
	fraunces600 = "fonts/Fraunces-SemiBold.ttf"
	outfit600   = "fonts/Outfit-SemiBold.ttf"
	outfit400   = "fonts/Outfit-Regular.ttf"
)

func face(file string, size float64) (font.Face, error) {
	key := file + "@" + strings.TrimRight(strings.TrimRight((fixed.Int26_6(size*64)).String(), "0"), ".")
	mu.Lock()
	defer mu.Unlock()
	if f, ok := faces[key]; ok {
		return f, nil
	}
	fnt, ok := parsed[file]
	if !ok {
		b, err := fontFS.ReadFile(file)
		if err != nil {
			return nil, err
		}
		fnt, err = opentype.Parse(b)
		if err != nil {
			return nil, err
		}
		parsed[file] = fnt
	}
	f, err := opentype.NewFace(fnt, &opentype.FaceOptions{Size: size, DPI: 72, Hinting: font.HintingFull})
	if err != nil {
		return nil, err
	}
	faces[key] = f
	return f, nil
}

func measure(f font.Face, s string) int {
	return font.MeasureString(f, s).Ceil()
}

// wrap greedily breaks s into lines of at most maxWidth pixels.
func wrap(f font.Face, s string, maxWidth int) []string {
	words := strings.Fields(s)
	lines := []string{}
	cur := ""
	for _, w := range words {
		try := w
		if cur != "" {
			try = cur + " " + w
		}
		if measure(f, try) <= maxWidth {
			cur = try
			continue
		}
		if cur != "" {
			lines = append(lines, cur)
		}
		cur = w
	}
	if cur != "" {
		lines = append(lines, cur)
	}
	return lines
}

// ellipsize truncates s to maxWidth, appending … when anything is cut.
func ellipsize(f font.Face, s string, maxWidth int) string {
	if measure(f, s) <= maxWidth {
		return s
	}
	runes := []rune(s)
	for len(runes) > 0 {
		runes = runes[:len(runes)-1]
		if measure(f, string(runes)+"…") <= maxWidth {
			return string(runes) + "…"
		}
	}
	return "…"
}

// drawTracked renders s with letter tracking (extra px between glyphs).
func drawTracked(dst draw.Image, f font.Face, c color.Color, x, baseline int, s string, tracking int) {
	d := &font.Drawer{Dst: dst, Src: image.NewUniform(c), Face: f}
	for _, r := range s {
		str := string(r)
		d.Dot = fixed.P(x, baseline)
		d.DrawString(str)
		x += measure(f, str) + tracking
	}
}

// coverCrop scales img to cover w×h and center-crops.
func coverCrop(src image.Image, w, h int) *image.RGBA {
	b := src.Bounds()
	sw, sh := b.Dx(), b.Dy()
	scale := float64(w) / float64(sw)
	if float64(h)/float64(sh) > scale {
		scale = float64(h) / float64(sh)
	}
	tw, th := int(float64(sw)*scale+0.5), int(float64(sh)*scale+0.5)
	scaled := image.NewRGBA(image.Rect(0, 0, tw, th))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), src, b, xdraw.Over, nil)
	x0, y0 := (tw-w)/2, (th-h)/2
	if x0 < 0 {
		x0 = 0
	}
	if y0 < 0 {
		y0 = 0
	}
	out := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(out, out.Bounds(), scaled, image.Pt(x0, y0), draw.Src)
	return out
}

// Render draws the card and writes it as PNG.
func Render(w io.Writer, c Card) error {
	img := image.NewRGBA(image.Rect(0, 0, W, H))
	draw.Draw(img, img.Bounds(), image.NewUniform(green900), image.Point{}, draw.Src)

	textW := W - 2*padX
	if c.Cover != nil {
		cov := coverCrop(c.Cover, coverW, H)
		draw.Draw(img, image.Rect(W-coverW, 0, W, H), cov, image.Point{}, draw.Src)
		// Seam gradient: fade the cover into the green field over 140px.
		for x := 0; x < 140; x++ {
			alpha := uint8(255 - (x * 255 / 140))
			col := color.RGBA{green900.R, green900.G, green900.B, alpha}
			draw.Draw(img, image.Rect(W-coverW+x, 0, W-coverW+x+1, H), image.NewUniform(col), image.Point{}, draw.Over)
		}
		textW = W - coverW - padX - 48
	}

	// Gold top bar.
	draw.Draw(img, image.Rect(0, 0, W, goldBarH), image.NewUniform(gold), image.Point{}, draw.Src)

	d := &font.Drawer{Dst: img}

	// Kicker — uppercase, tracked, gold.
	kickF, err := face(outfit600, 27)
	if err != nil {
		return err
	}
	kicker := strings.ToUpper(strings.TrimSpace(c.Kicker))
	if kicker == "" {
		kicker = "OGUAA"
	}
	drawTracked(img, kickF, gold, padX, 112, kicker, 5)

	// Title — Fraunces, cream, shrink-to-fit over up to 3 lines.
	title := strings.TrimSpace(c.Title)
	if title == "" {
		title = "Oguaa"
	}
	size := 66.0
	var lines []string
	var titleF font.Face
	for {
		titleF, err = face(fraunces600, size)
		if err != nil {
			return err
		}
		lines = wrap(titleF, title, textW)
		if len(lines) <= 3 || size <= 44 {
			break
		}
		size -= 8
	}
	if len(lines) > 3 {
		lines = lines[:3]
		lines[2] = ellipsize(titleF, lines[2]+" …", textW)
	}
	metrics := titleF.Metrics()
	lineH := metrics.Height.Ceil() + 10
	y := 112 + metrics.Ascent.Ceil() + 34
	d.Src = image.NewUniform(cream)
	for _, ln := range lines {
		d.Face = titleF
		d.Dot = fixed.P(padX, y)
		d.DrawString(ln)
		y += lineH
	}

	// Subtitle — one line, sand.
	if sub := strings.TrimSpace(c.Subtitle); sub != "" {
		subF, err := face(outfit400, 30)
		if err != nil {
			return err
		}
		d.Face = subF
		d.Src = image.NewUniform(sand)
		d.Dot = fixed.P(padX, y+18)
		d.DrawString(ellipsize(subF, sub, textW))
	}

	// Footer — brand strip above the bottom edge.
	footF, err := face(outfit600, 26)
	if err != nil {
		return err
	}
	footY := H - 48
	d.Face = footF
	d.Src = image.NewUniform(gold)
	d.Dot = fixed.P(padX, footY)
	d.DrawString("Oguaa")
	wmW := measure(footF, "Oguaa")
	tagF, err := face(outfit400, 26)
	if err != nil {
		return err
	}
	d.Face = tagF
	d.Src = image.NewUniform(muted)
	d.Dot = fixed.P(padX+wmW+10, footY)
	d.DrawString("— Cape Coast's own platform")
	// Bottom gold rule, thinner than the top bar.
	draw.Draw(img, image.Rect(0, H-4, W, H), image.NewUniform(gold), image.Point{}, draw.Src)

	return png.Encode(w, img)
}
