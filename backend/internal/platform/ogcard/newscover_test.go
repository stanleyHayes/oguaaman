package ogcard

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
)

var updateGolden = flag.Bool("update", false, "rewrite the news cover golden hashes for this GOARCH")

// coverCombos finds one seed for each of the 6×3 palette/motif combinations.
func coverCombos(t *testing.T) map[string]NewsCover {
	t.Helper()
	out := map[string]NewsCover{}
	titles := []string{
		"Cape Coast Metro assembly approves new Kotokuraba market stalls",
		"UCC wins debate",
		"Fishermen at Elmina report a record catch after the closed season ends early this year in the Central Region",
	}
	for i := 0; len(out) < len(coverPalettes)*motifCount && i < 10_000; i++ {
		seed := fmt.Sprintf("story-%d", i)
		h := seedHash(seed)
		key := fmt.Sprintf("p%d-m%d", h%uint32(len(coverPalettes)), (h/uint32(len(coverPalettes)))%motifCount)
		if _, ok := out[key]; !ok {
			out[key] = NewsCover{Seed: seed, Kicker: "Oguaa newsroom", Title: titles[len(out)%len(titles)], Source: "GhanaWeb", Date: "2 Oct 2026"}
		}
	}
	if len(out) != len(coverPalettes)*motifCount {
		t.Fatalf("found %d of %d combinations", len(out), len(coverPalettes)*motifCount)
	}
	return out
}

// pixelHash hashes the decoded pixels, so the golden does not depend on the
// PNG encoder of a particular Go release.
func pixelHash(t *testing.T, c NewsCover) string {
	t.Helper()
	img, err := drawNewsCover(c)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(img.Pix)
	return hex.EncodeToString(sum[:])
}

func TestRenderNewsCoverEveryPaletteAndMotif(t *testing.T) {
	for key, c := range coverCombos(t) {
		var buf bytes.Buffer
		if err := RenderNewsCover(&buf, c); err != nil {
			t.Fatalf("%s: %v", key, err)
		}
		img, err := png.Decode(&buf)
		if err != nil {
			t.Fatalf("%s: %v", key, err)
		}
		if b := img.Bounds(); b.Dx() != CoverW || b.Dy() != CoverH {
			t.Fatalf("%s: size %v", key, b)
		}
	}
}

func TestRenderNewsCoverIsByteIdentical(t *testing.T) {
	c := NewsCover{Seed: "cape-coast-metro-market-stalls", Kicker: "OGUAA NEWSROOM", Title: "Cape Coast Metro assembly approves new Kotokuraba market stalls", Source: "GhanaWeb", Date: "2 Oct 2026"}
	var a, b bytes.Buffer
	if err := RenderNewsCover(&a, c); err != nil {
		t.Fatal(err)
	}
	if err := RenderNewsCover(&b, c); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a.Bytes(), b.Bytes()) {
		t.Fatal("the same input must render byte-identical PNGs")
	}
	other := c
	other.Seed = "another-story"
	if pixelHash(t, c) == pixelHash(t, other) {
		t.Error("a different seed should give a different cover")
	}
}

func TestRenderNewsCoverEdgeCases(t *testing.T) {
	for _, c := range []NewsCover{
		{},
		{Seed: "x", Title: strings.Repeat("Supercalifragilisticexpialidocious ", 12)},
		{Seed: "y", Title: "Ɔman Oguaa: Asafo companies meet — “we are one”", Source: strings.Repeat("Very long source name ", 10)},
	} {
		var buf bytes.Buffer
		if err := RenderNewsCover(&buf, c); err != nil {
			t.Fatalf("%+v: %v", c, err)
		}
	}
}

// Golden SHA-256 of the pixels per seed. Glyph and shape rasterisation uses
// float32 maths the compiler may fuse differently per architecture, so each
// GOARCH keeps its own file; regenerate with `go test ./internal/platform/ogcard -update`
// (and GOARCH=amd64 for CI's architecture).
func TestRenderNewsCoverGolden(t *testing.T) {
	path := filepath.Join("testdata", "news_cover_"+runtime.GOARCH+".sha256")
	combos := coverCombos(t)
	keys := make([]string, 0, len(combos))
	for k := range combos {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var got strings.Builder
	for _, k := range keys {
		fmt.Fprintf(&got, "%s %s %s\n", k, combos[k].Seed, pixelHash(t, combos[k]))
	}
	if *updateGolden {
		if err := os.WriteFile(path, []byte(got.String()), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		t.Skipf("no golden for %s; run with -update to record one", runtime.GOARCH)
	}
	if err != nil {
		t.Fatal(err)
	}
	if string(want) != got.String() {
		t.Fatalf("news cover output changed (%s).\nwant:\n%s\ngot:\n%s", path, want, got.String())
	}
}
