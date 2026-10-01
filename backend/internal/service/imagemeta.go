package service

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"

	"golang.org/x/sync/semaphore"
)

// ── stripping image metadata from public uploads (G086) ─────────────────────
//
// Phone photos carry EXIF: GPS coordinates of where they were taken (often the
// uploader's home), the device, timestamps. Public uploads are re-published
// verbatim, so the metadata must go before the file is stored:
//   - JPEG and PNG are decoded and re-encoded, which writes only pixels. The
//     EXIF orientation is applied to the pixels first, or portrait photos
//     would turn sideways once the tag is gone.
//   - WebP is rewritten at the container level: the EXIF and XMP chunks are
//     dropped (Go has a WebP decoder but no encoder, so it is not re-encoded).
//   - GIF is rewritten at the block level: comments and application
//     extensions other than the animation loop are dropped.
// Nothing is decoded without first checking the declared dimensions, so a
// small file cannot unpack into gigabytes of pixels. The API runs on a small
// instance (512 MB), so decoding is also memory-budgeted: each re-encode
// estimates its peak memory from the header (pixels × bytes per pixel,
// including the progressive-JPEG coefficient buffers and the rotated copy),
// and all re-encodes in flight share one budget. Large images therefore run
// one at a time; small ones run side by side.

// MaxUploadMegapixels bounds decoded image size.
const MaxUploadMegapixels = 16

// maxUploadPixels is MaxUploadMegapixels in pixels.
const maxUploadPixels = MaxUploadMegapixels * 1_000_000

// reencodeBudgetBytes is the memory all concurrent re-encodes may use together
// (and so the most one image may need).
const reencodeBudgetBytes = 192 << 20

// reencodeBudget admits re-encodes against reencodeBudgetBytes.
var reencodeBudget = semaphore.NewWeighted(reencodeBudgetBytes)

// jpegReencodeQuality is the quality used when re-encoding JPEGs.
const jpegReencodeQuality = 90

// ErrImageTooLarge is returned for images whose dimensions exceed the cap.
var ErrImageTooLarge = errors.New("the image dimensions are too large")

// ErrImageUnreadable is returned when an image cannot be parsed.
var ErrImageUnreadable = errors.New("the image could not be read")

// StripImageMetadata returns data with its metadata removed. contentType must
// be the sniffed type; unknown types are returned unchanged. A re-encode waits
// for its share of the memory budget; ctx ends the wait (a gone client).
func StripImageMetadata(ctx context.Context, data []byte, contentType string) ([]byte, error) {
	switch contentType {
	case "image/jpeg":
		return reencodeJPEG(ctx, data)
	case "image/png":
		return reencodePNG(ctx, data)
	case "image/webp":
		return stripWebPMetadata(data)
	case "image/gif":
		return stripGIFMetadata(data)
	}
	return data, nil
}

func checkDimensions(cfg image.Config) error {
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return ErrImageUnreadable
	}
	if int64(cfg.Width)*int64(cfg.Height) > maxUploadPixels {
		return ErrImageTooLarge
	}
	return nil
}

// reserveDecode waits until cost bytes of the shared re-encode budget are
// free and returns the release func. An image that could never fit is too
// large.
func reserveDecode(ctx context.Context, cost int64) (func(), error) {
	if cost > reencodeBudgetBytes {
		return nil, ErrImageTooLarge
	}
	if err := reencodeBudget.Acquire(ctx, cost); err != nil {
		return nil, err
	}
	return func() { reencodeBudget.Release(cost) }, nil
}

func reencodeJPEG(ctx context.Context, data []byte) ([]byte, error) {
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, ErrImageUnreadable
	}
	if err := checkDimensions(cfg); err != nil {
		return nil, err
	}
	orientation := jpegOrientation(data)
	release, err := reserveDecode(ctx, jpegDecodeCost(data, cfg, orientation))
	if err != nil {
		return nil, err
	}
	defer release()
	img, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, ErrImageUnreadable
	}
	img = applyOrientation(img, orientation)
	var out bytes.Buffer
	if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: jpegReencodeQuality}); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func reencodePNG(ctx context.Context, data []byte) ([]byte, error) {
	cfg, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, ErrImageUnreadable
	}
	if err := checkDimensions(cfg); err != nil {
		return nil, err
	}
	release, err := reserveDecode(ctx, pngDecodeCost(data, cfg))
	if err != nil {
		return nil, err
	}
	defer release()
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, ErrImageUnreadable
	}
	var out bytes.Buffer
	if err := png.Encode(&out, img); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// ── decode memory estimates ─────────────────────────────────────────────────

// pngBytesPerPixel is the decoded size of one pixel for a PNG colour model.
func pngBytesPerPixel(m color.Model) int64 {
	switch m {
	case color.GrayModel:
		return 1
	case color.Gray16Model:
		return 2
	case color.RGBAModel, color.NRGBAModel:
		return 4
	}
	if _, ok := m.(color.Palette); ok {
		return 1
	}
	return 8 // 16-bit colour (RGBA64 / NRGBA64) and anything unknown
}

// pngDecodeCost estimates the peak memory of decoding and re-encoding a PNG:
// the decoded pixels, plus the file and its re-encoded copy.
func pngDecodeCost(data []byte, cfg image.Config) int64 {
	return int64(cfg.Width)*int64(cfg.Height)*pngBytesPerPixel(cfg.ColorModel) + 2*int64(len(data))
}

// jpegDecodeCost estimates the peak memory of decoding, rotating and
// re-encoding a JPEG: the decoded samples, the coefficient buffers a
// progressive JPEG keeps while decoding (4 bytes per sample), and the upright
// RGBA copy when an EXIF orientation must be applied.
func jpegDecodeCost(data []byte, cfg image.Config, orientation int) int64 {
	pixels := int64(cfg.Width) * int64(cfg.Height)
	progressive, samplesX4 := jpegLayout(data)
	perPixelX4 := samplesX4 // decoded samples, ×4 to keep 4:2:0 exact
	if progressive {
		perPixelX4 += 4 * samplesX4
	}
	if orientation >= 2 && orientation <= 8 {
		perPixelX4 += 4 * 4 // the upright RGBA copy
		if samplesX4 > 12 {
			perPixelX4 += 4 * 4 // CMYK is first converted to RGBA
		}
	}
	return pixels*perPixelX4/4 + 2*int64(len(data))
}

// ── JPEG segments: EXIF orientation and frame layout ─────────────────────────

// jpegSegments calls fn for each marker segment before the image data, in
// order, until fn returns false. Malformed structure ends the walk.
func jpegSegments(data []byte, fn func(marker byte, seg []byte) bool) {
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return
	}
	for i := 2; i+4 <= len(data); {
		if data[i] != 0xFF {
			return
		}
		if data[i+1] == 0xFF { // fill byte before a marker
			i++
			continue
		}
		marker := data[i+1]
		if marker == 0xDA || marker == 0xD9 { // start of scan / end of image
			return
		}
		size := int(binary.BigEndian.Uint16(data[i+2 : i+4]))
		if size < 2 || i+2+size > len(data) {
			return
		}
		if !fn(marker, data[i+4:i+2+size]) {
			return
		}
		i += 2 + size
	}
}

// jpegOrientation reads the EXIF Orientation tag (1–8) from a JPEG's APP1
// segment; 1 (no transform) when absent or unreadable.
func jpegOrientation(data []byte) int {
	o := 1
	jpegSegments(data, func(marker byte, seg []byte) bool {
		if marker == 0xE1 && bytes.HasPrefix(seg, []byte("Exif\x00\x00")) {
			o = exifOrientation(seg[6:])
			return false
		}
		return true
	})
	return o
}

// jpegLayout reads the frame header: whether the JPEG is progressive, and its
// decoded samples per pixel ×4 (4:2:0 colour = 6, greyscale = 4, 4:4:4 = 12,
// CMYK = 16). Unknown layouts are assumed to be the costliest common one.
func jpegLayout(data []byte) (progressive bool, samplesX4 int64) {
	samplesX4 = 16
	jpegSegments(data, func(marker byte, seg []byte) bool {
		if marker < 0xC0 || marker > 0xCF || marker == 0xC4 || marker == 0xC8 || marker == 0xCC {
			return true
		}
		progressive = marker == 0xC2 || marker == 0xC6 || marker == 0xCA || marker == 0xCE
		if s, ok := sofSamplesX4(seg); ok {
			samplesX4 = s
		}
		return false
	})
	return progressive, samplesX4
}

// sofSamplesX4 sums, over a frame's components, the samples each stores per
// pixel (Hi·Vi / Hmax·Vmax), times 4.
func sofSamplesX4(seg []byte) (int64, bool) {
	if len(seg) < 6 {
		return 0, false
	}
	n := int(seg[5])
	if n < 1 || n > 4 || len(seg) < 6+3*n {
		return 0, false
	}
	var hMax, vMax int64 = 1, 1
	for c := range n {
		hv := seg[6+3*c+1]
		hMax, vMax = max(hMax, int64(hv>>4)), max(vMax, int64(hv&0x0F))
	}
	var sum int64
	for c := range n {
		hv := seg[6+3*c+1]
		sum += 4 * int64(hv>>4) * int64(hv&0x0F)
	}
	return max(sum/(hMax*vMax), 1), true
}

// exifOrientation finds tag 0x0112 in IFD0 of a TIFF-structured EXIF block.
func exifOrientation(tiff []byte) int {
	if len(tiff) < 8 {
		return 1
	}
	var order binary.ByteOrder
	switch string(tiff[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1
	}
	ifd := int(order.Uint32(tiff[4:8]))
	if ifd < 8 || ifd+2 > len(tiff) {
		return 1
	}
	count := int(order.Uint16(tiff[ifd : ifd+2]))
	for e := 0; e < count; e++ {
		off := ifd + 2 + e*12
		if off+12 > len(tiff) {
			return 1
		}
		if order.Uint16(tiff[off:off+2]) == 0x0112 {
			v := int(order.Uint16(tiff[off+8 : off+10]))
			if v >= 1 && v <= 8 {
				return v
			}
			return 1
		}
	}
	return 1
}

// orientedSource maps a destination pixel (x, y) of the upright image back to
// the stored pixel, for EXIF orientation o on a w×h stored image.
func orientedSource(o, x, y, w, h int) (int, int) {
	switch o {
	case 2:
		return w - 1 - x, y
	case 3:
		return w - 1 - x, h - 1 - y
	case 4:
		return x, h - 1 - y
	case 5:
		return y, x
	case 6:
		return y, h - 1 - x
	case 7:
		return w - 1 - y, h - 1 - x
	case 8:
		return w - 1 - y, x
	}
	return x, y
}

// applyOrientation returns img transformed so it displays upright without
// its EXIF orientation tag. Only the upright copy is allocated: pixels are
// read straight from the decoded image (colour JPEGs and greyscale ones).
func applyOrientation(img image.Image, o int) image.Image {
	if o < 2 || o > 8 {
		return img
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	dw, dh := w, h
	if o >= 5 { // the transposing orientations swap width and height
		dw, dh = h, w
	}
	read := rgbaReader(img)
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	for y := 0; y < dh; y++ {
		for x := 0; x < dw; x++ {
			sx, sy := orientedSource(o, x, y, w, h)
			di := dst.PixOffset(x, y)
			read(dst.Pix[di:di+4], b.Min.X+sx, b.Min.Y+sy)
		}
	}
	return dst
}

// rgbaReader returns a func writing the RGBA bytes of img's pixel (x, y) into
// px. Decoded JPEGs (YCbCr, Gray) are read in place; anything else is first
// converted to RGBA.
func rgbaReader(img image.Image) func(px []uint8, x, y int) {
	switch m := img.(type) {
	case *image.YCbCr:
		return func(px []uint8, x, y int) {
			c := m.YCbCrAt(x, y)
			px[0], px[1], px[2] = color.YCbCrToRGB(c.Y, c.Cb, c.Cr)
			px[3] = 0xFF
		}
	case *image.Gray:
		return func(px []uint8, x, y int) {
			v := m.GrayAt(x, y).Y
			px[0], px[1], px[2], px[3] = v, v, v, 0xFF
		}
	}
	b := img.Bounds()
	src := image.NewRGBA(b)
	draw.Draw(src, b, img, b.Min, draw.Src)
	return func(px []uint8, x, y int) {
		i := src.PixOffset(x, y)
		copy(px, src.Pix[i:i+4])
	}
}

// ── WebP: drop EXIF / XMP chunks ─────────────────────────────────────────────

// WebP VP8X feature flags for embedded metadata.
const (
	webpFlagEXIF = 0x08
	webpFlagXMP  = 0x04
)

func stripWebPMetadata(data []byte) ([]byte, error) {
	if len(data) < 12 || string(data[:4]) != "RIFF" || string(data[8:12]) != "WEBP" {
		return nil, ErrImageUnreadable
	}
	// Parse only what the RIFF header declares; bytes after it are dropped.
	limit := min(8+int(binary.LittleEndian.Uint32(data[4:8])), len(data))
	var body bytes.Buffer
	for i := 12; i < limit; {
		if i+8 > limit {
			return nil, ErrImageUnreadable
		}
		fourCC := string(data[i : i+4])
		size := int(binary.LittleEndian.Uint32(data[i+4 : i+8]))
		padded := size + size%2
		if i+8+size > limit {
			return nil, ErrImageUnreadable
		}
		end := min(i+8+padded, limit)
		chunk := append([]byte(nil), data[i:end]...)
		i = end
		switch fourCC {
		case "EXIF", "XMP ":
			continue
		case "VP8X":
			if len(chunk) > 8 {
				chunk[8] &^= webpFlagEXIF | webpFlagXMP
			}
		}
		if len(chunk)%2 == 1 {
			chunk = append(chunk, 0)
		}
		body.Write(chunk)
	}
	out := make([]byte, 0, 12+body.Len())
	out = append(out, "RIFF"...)
	out = binary.LittleEndian.AppendUint32(out, uint32(4+body.Len()))
	out = append(out, "WEBP"...)
	return append(out, body.Bytes()...), nil
}

// ── GIF: drop comments and foreign application extensions ──────────────────

func stripGIFMetadata(data []byte) ([]byte, error) {
	if len(data) < 13 || (string(data[:6]) != "GIF87a" && string(data[:6]) != "GIF89a") {
		return nil, ErrImageUnreadable
	}
	i := 13
	if flags := data[10]; flags&0x80 != 0 {
		i += 3 << ((flags & 0x07) + 1)
	}
	if i > len(data) {
		return nil, ErrImageUnreadable
	}
	out := append([]byte(nil), data[:i]...)
	for i < len(data) {
		switch data[i] {
		case 0x3B: // trailer — anything after it is dropped too
			return append(out, 0x3B), nil
		case 0x21:
			next, keep, err := gifExtension(data, i)
			if err != nil {
				return nil, err
			}
			if keep {
				out = append(out, data[i:next]...)
			}
			i = next
		case 0x2C:
			next, err := gifImage(data, i)
			if err != nil {
				return nil, err
			}
			out = append(out, data[i:next]...)
			i = next
		default:
			return nil, ErrImageUnreadable
		}
	}
	return nil, ErrImageUnreadable // no trailer
}

// gifExtension returns the end of the extension block at i and whether it is
// kept: graphic control and plain-text extensions (they affect rendering) and
// the NETSCAPE/ANIMEXTS looping extension. Comments and other application
// data (XMP, editor metadata) are dropped.
func gifExtension(data []byte, i int) (int, bool, error) {
	if i+2 > len(data) {
		return 0, false, ErrImageUnreadable
	}
	label := data[i+1]
	end, err := gifSubBlocks(data, i+2)
	if err != nil {
		return 0, false, err
	}
	switch label {
	case 0xF9, 0x01:
		return end, true, nil
	case 0xFF:
		if i+3 < len(data) && data[i+2] == 11 && i+14 <= len(data) {
			app := string(data[i+3 : i+14])
			return end, app == "NETSCAPE2.0" || app == "ANIMEXTS1.0", nil
		}
	}
	return end, false, nil
}

// gifImage returns the end of the image block (descriptor, local colour
// table, LZW data) at i.
func gifImage(data []byte, i int) (int, error) {
	if i+10 > len(data) {
		return 0, ErrImageUnreadable
	}
	j := i + 10
	if flags := data[i+9]; flags&0x80 != 0 {
		j += 3 << ((flags & 0x07) + 1)
	}
	j++ // LZW minimum code size
	if j > len(data) {
		return 0, ErrImageUnreadable
	}
	return gifSubBlocks(data, j)
}

// gifSubBlocks skips a chain of data sub-blocks starting at i and returns the
// index after its zero-length terminator.
func gifSubBlocks(data []byte, i int) (int, error) {
	for i < len(data) {
		n := int(data[i])
		i++
		if n == 0 {
			return i, nil
		}
		i += n
	}
	return 0, ErrImageUnreadable
}
