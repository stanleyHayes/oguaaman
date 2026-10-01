package service

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"testing"
	"time"
)

const secretGPS = "GPS 5.1053N 1.2466W home"

// exifAPP1 builds an APP1 EXIF segment (big-endian TIFF) holding an
// Orientation tag and a free-text ImageDescription standing in for GPS data.
func exifAPP1(orientation uint16) []byte {
	var tiff bytes.Buffer
	tiff.WriteString("MM")
	_ = binary.Write(&tiff, binary.BigEndian, uint16(42))
	_ = binary.Write(&tiff, binary.BigEndian, uint32(8)) // IFD0 at offset 8
	_ = binary.Write(&tiff, binary.BigEndian, uint16(2)) // two entries
	// 0x0112 Orientation, SHORT, count 1, value in the first two bytes.
	_ = binary.Write(&tiff, binary.BigEndian, []uint16{0x0112, 3})
	_ = binary.Write(&tiff, binary.BigEndian, uint32(1))
	_ = binary.Write(&tiff, binary.BigEndian, []uint16{orientation, 0})
	// 0x010E ImageDescription, ASCII, pointing at the text after the IFD.
	text := []byte(secretGPS + "\x00")
	_ = binary.Write(&tiff, binary.BigEndian, []uint16{0x010E, 2})
	_ = binary.Write(&tiff, binary.BigEndian, uint32(len(text)))
	_ = binary.Write(&tiff, binary.BigEndian, uint32(8+2+2*12+4))
	_ = binary.Write(&tiff, binary.BigEndian, uint32(0)) // no next IFD
	tiff.Write(text)

	payload := append([]byte("Exif\x00\x00"), tiff.Bytes()...)
	seg := []byte{0xFF, 0xE1, 0, 0}
	binary.BigEndian.PutUint16(seg[2:], uint16(len(payload)+2))
	return append(seg, payload...)
}

// halfAndHalf is a w×h image, left half red and right half blue.
func halfAndHalf(w, h int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			c := color.RGBA{R: 255, A: 255}
			if x >= w/2 {
				c = color.RGBA{B: 255, A: 255}
			}
			img.Set(x, y, c)
		}
	}
	return img
}

func isRed(c color.Color) bool {
	r, g, b, _ := c.RGBA()
	return r > 0xC000 && g < 0x4000 && b < 0x4000
}

func isBlue(c color.Color) bool {
	r, g, b, _ := c.RGBA()
	return b > 0xC000 && r < 0x4000 && g < 0x4000
}

// G086: EXIF is stripped from JPEGs, and the orientation is baked into the
// pixels so portrait photos stay upright.
func TestStripJPEGMetadataKeepsOrientation(t *testing.T) {
	var enc bytes.Buffer
	if err := jpeg.Encode(&enc, halfAndHalf(32, 16), &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	raw := enc.Bytes()
	// Insert the EXIF segment right after SOI.
	withExif := append(append(append([]byte{}, raw[:2]...), exifAPP1(6)...), raw[2:]...)
	if jpegOrientation(withExif) != 6 {
		t.Fatalf("test fixture: orientation = %d, want 6", jpegOrientation(withExif))
	}

	out, err := StripImageMetadata(context.Background(), withExif, "image/jpeg")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(out, []byte("Exif")) || bytes.Contains(out, []byte(secretGPS)) {
		t.Fatal("EXIF survived the re-encode")
	}
	img, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatal(err)
	}
	// Orientation 6 = rotate 90° clockwise: 32×16 becomes 16×32, the left
	// (red) half becomes the top half.
	if b := img.Bounds(); b.Dx() != 16 || b.Dy() != 32 {
		t.Fatalf("upright size = %v, want 16×32", b.Size())
	}
	if !isRed(img.At(8, 6)) || !isBlue(img.At(8, 26)) {
		t.Errorf("rotation wrong: top=%v bottom=%v, want red over blue", img.At(8, 6), img.At(8, 26))
	}
}

func TestOrientedSourceIsAPermutation(t *testing.T) {
	const w, h = 3, 2
	for o := 1; o <= 8; o++ {
		dw, dh := w, h
		if o >= 5 {
			dw, dh = h, w
		}
		seen := map[[2]int]bool{}
		for y := 0; y < dh; y++ {
			for x := 0; x < dw; x++ {
				sx, sy := orientedSource(o, x, y, w, h)
				if sx < 0 || sx >= w || sy < 0 || sy >= h {
					t.Fatalf("orientation %d maps (%d,%d) outside the source: (%d,%d)", o, x, y, sx, sy)
				}
				seen[[2]int{sx, sy}] = true
			}
		}
		if len(seen) != w*h {
			t.Errorf("orientation %d is not a permutation (%d distinct of %d)", o, len(seen), w*h)
		}
	}
}

// pngChunk frames one PNG chunk with its CRC.
func pngChunk(typ string, data []byte) []byte {
	out := binary.BigEndian.AppendUint32(nil, uint32(len(data)))
	out = append(out, typ...)
	out = append(out, data...)
	return binary.BigEndian.AppendUint32(out, crc32.ChecksumIEEE(append([]byte(typ), data...)))
}

func TestStripPNGTextChunks(t *testing.T) {
	var enc bytes.Buffer
	if err := png.Encode(&enc, halfAndHalf(4, 4)); err != nil {
		t.Fatal(err)
	}
	raw := enc.Bytes()
	iend := len(raw) - 12
	withText := append(append(append([]byte{}, raw[:iend]...), pngChunk("tEXt", []byte("Comment\x00"+secretGPS))...), raw[iend:]...)
	if _, err := png.Decode(bytes.NewReader(withText)); err != nil {
		t.Fatalf("fixture invalid: %v", err)
	}
	out, err := StripImageMetadata(context.Background(), withText, "image/png")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(out, []byte(secretGPS)) {
		t.Fatal("PNG text chunk survived")
	}
	if _, err := png.Decode(bytes.NewReader(out)); err != nil {
		t.Fatalf("re-encoded PNG unreadable: %v", err)
	}
}

func TestImageDimensionsAreCapped(t *testing.T) {
	// A valid PNG header declaring 10000×10000 — refused before decoding.
	ihdr := binary.BigEndian.AppendUint32(nil, 10000)
	ihdr = binary.BigEndian.AppendUint32(ihdr, 10000)
	ihdr = append(ihdr, 8, 2, 0, 0, 0)
	huge := append([]byte("\x89PNG\r\n\x1a\n"), pngChunk("IHDR", ihdr)...)
	if _, err := StripImageMetadata(context.Background(), huge, "image/png"); !errors.Is(err, ErrImageTooLarge) {
		t.Fatalf("err = %v, want ErrImageTooLarge", err)
	}
	if _, err := StripImageMetadata(context.Background(), []byte("\xff\xd8\xff not really"), "image/jpeg"); !errors.Is(err, ErrImageUnreadable) {
		t.Fatalf("garbage jpeg: err = %v, want ErrImageUnreadable", err)
	}
}

// riffChunk frames one WebP (RIFF) chunk, padded to even length.
func riffChunk(fourCC string, data []byte) []byte {
	out := append([]byte(fourCC), binary.LittleEndian.AppendUint32(nil, uint32(len(data)))...)
	out = append(out, data...)
	if len(data)%2 == 1 {
		out = append(out, 0)
	}
	return out
}

func TestStripWebPMetadataChunks(t *testing.T) {
	vp8x := make([]byte, 10)
	vp8x[0] = webpFlagEXIF | webpFlagXMP | 0x10 // + alpha flag, which must survive
	body := append([]byte("WEBP"), riffChunk("VP8X", vp8x)...)
	body = append(body, riffChunk("VP8L", []byte{0x2f, 1, 2, 3, 4})...)
	body = append(body, riffChunk("EXIF", []byte(secretGPS))...)
	body = append(body, riffChunk("XMP ", []byte("<x:xmpmeta>"+secretGPS+"</x:xmpmeta>"))...)
	file := append([]byte("RIFF"), binary.LittleEndian.AppendUint32(nil, uint32(len(body)))...)
	file = append(file, body...)

	out, err := StripImageMetadata(context.Background(), file, "image/webp")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(out, []byte(secretGPS)) || bytes.Contains(out, []byte("EXIF")) || bytes.Contains(out, []byte("XMP ")) {
		t.Fatal("WebP metadata chunk survived")
	}
	if int(binary.LittleEndian.Uint32(out[4:8])) != len(out)-8 {
		t.Errorf("RIFF size %d does not match the file (%d)", binary.LittleEndian.Uint32(out[4:8]), len(out)-8)
	}
	if flags := out[20]; flags&(webpFlagEXIF|webpFlagXMP) != 0 || flags&0x10 == 0 {
		t.Errorf("VP8X flags = %#x, want metadata bits cleared and alpha kept", flags)
	}
	if !bytes.Contains(out, []byte("VP8L")) {
		t.Error("image data chunk was dropped")
	}
}

func TestStripGIFComments(t *testing.T) {
	pal := color.Palette{color.Black, color.White}
	var enc bytes.Buffer
	if err := gif.Encode(&enc, image.NewPaletted(image.Rect(0, 0, 4, 4), pal), nil); err != nil {
		t.Fatal(err)
	}
	raw := enc.Bytes()
	comment := append([]byte{0x21, 0xFE, byte(len(secretGPS))}, []byte(secretGPS)...)
	comment = append(comment, 0)
	withComment := append(append(append([]byte{}, raw[:len(raw)-1]...), comment...), 0x3B)
	if _, err := gif.Decode(bytes.NewReader(withComment)); err != nil {
		t.Fatalf("fixture invalid: %v", err)
	}
	out, err := StripImageMetadata(context.Background(), withComment, "image/gif")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(out, []byte(secretGPS)) {
		t.Fatal("GIF comment survived")
	}
	if _, err := gif.Decode(bytes.NewReader(out)); err != nil {
		t.Fatalf("stripped GIF unreadable: %v", err)
	}
}

// pngHeader is a PNG with only a valid IHDR declaring w×h at the given bit
// depth and colour type — enough for DecodeConfig.
func pngHeader(w, h uint32, depth, colourType byte) []byte {
	ihdr := binary.BigEndian.AppendUint32(nil, w)
	ihdr = binary.BigEndian.AppendUint32(ihdr, h)
	ihdr = append(ihdr, depth, colourType, 0, 0, 0)
	out := append([]byte("\x89PNG\r\n\x1a\n"), pngChunk("IHDR", ihdr)...)
	if colourType == 3 { // a palette image declares its palette (and transparency) first
		out = append(out, pngChunk("PLTE", []byte{0, 0, 0})...)
		out = append(out, pngChunk("tRNS", []byte{0})...)
	}
	return out
}

// R17: the pixel cap is low enough for a 512 MB instance, and every re-encode
// is admitted against one shared memory budget sized from the header.
func TestReencodeMemoryIsBounded(t *testing.T) {
	ctx := context.Background()
	// 20 MP is over the cap even though it used to pass (36 MP).
	if _, err := StripImageMetadata(ctx, pngHeader(5000, 4000, 8, 2), "image/png"); !errors.Is(err, ErrImageTooLarge) {
		t.Fatalf("20 MP png: err = %v, want ErrImageTooLarge", err)
	}

	// The estimate follows the decoded pixel format: a 16-bit RGBA PNG costs
	// 8 bytes a pixel, a palette one 1 byte.
	for _, c := range []struct {
		depth, colourType byte
		perPixel          int64
	}{{16, 6, 8}, {8, 6, 4}, {8, 3, 1}, {8, 0, 1}} {
		data := pngHeader(1000, 1000, c.depth, c.colourType)
		cfg, err := png.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			t.Fatalf("depth %d type %d: %v", c.depth, c.colourType, err)
		}
		if got, want := pngDecodeCost(data, cfg), 1_000_000*c.perPixel; got < want || got > want+1024 {
			t.Errorf("depth %d type %d: cost = %d, want about %d", c.depth, c.colourType, got, want)
		}
	}
	// The largest allowed 16-bit PNG still fits the budget on its own.
	if cost := int64(maxUploadPixels) * 8; cost > reencodeBudgetBytes {
		t.Errorf("a %d MP 16-bit PNG (%d bytes) can never be admitted", MaxUploadMegapixels, cost)
	}

	// JPEG layout: Go writes baseline 4:2:0 colour and greyscale.
	var colour, grey bytes.Buffer
	_ = jpeg.Encode(&colour, halfAndHalf(16, 16), nil)
	_ = jpeg.Encode(&grey, image.NewGray(image.Rect(0, 0, 16, 16)), nil)
	if p, s := jpegLayout(colour.Bytes()); p || s != 6 {
		t.Errorf("colour jpeg layout = progressive %v, samples×4 %d; want baseline, 6", p, s)
	}
	if _, s := jpegLayout(grey.Bytes()); s != 4 {
		t.Errorf("grey jpeg samples×4 = %d, want 4", s)
	}
	cfg := image.Config{Width: 4000, Height: 3000}
	upright := jpegDecodeCost(colour.Bytes(), cfg, 1)
	rotated := jpegDecodeCost(colour.Bytes(), cfg, 6)
	if rotated-upright != 4*12_000_000 {
		t.Errorf("rotation adds %d bytes, want one RGBA copy (%d)", rotated-upright, 4*12_000_000)
	}
}

// R17: while the budget is taken, another re-encode waits (and gives up when
// its request ends) instead of decoding alongside and exhausting memory.
func TestReencodeWaitsForTheBudget(t *testing.T) {
	var enc bytes.Buffer
	if err := png.Encode(&enc, halfAndHalf(8, 8)); err != nil {
		t.Fatal(err)
	}
	release, err := reserveDecode(context.Background(), reencodeBudgetBytes)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err := StripImageMetadata(ctx, enc.Bytes(), "image/png"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("re-encode while the budget is full: err = %v, want it to wait", err)
	}
	release()
	if _, err := StripImageMetadata(context.Background(), enc.Bytes(), "image/png"); err != nil {
		t.Fatalf("re-encode after the budget freed: %v", err)
	}
	if _, err := reserveDecode(context.Background(), reencodeBudgetBytes+1); !errors.Is(err, ErrImageTooLarge) {
		t.Errorf("an image larger than the whole budget: err = %v, want ErrImageTooLarge", err)
	}
}
