package brandimg

import (
	"image/png"
	"testing"
)

// Outlook for Windows and Windows Mail ignore border-radius on <img>, so the
// icon's corners outside its rounded tile must be transparent, not white.
func TestEmailIcon_cornersAreTransparent(t *testing.T) {
	f, err := FS.Open("email-icon-96.png")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	img, err := png.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	b := img.Bounds()
	if b.Dx() != 96 || b.Dy() != 96 {
		t.Fatalf("icon is %dx%d, want 96x96", b.Dx(), b.Dy())
	}
	for _, p := range [][2]int{{0, 0}, {2, 2}, {4, 4}, {95, 0}, {0, 95}, {95, 95}, {93, 93}} {
		if _, _, _, a := img.At(b.Min.X+p[0], b.Min.Y+p[1]).RGBA(); a != 0 {
			t.Errorf("corner pixel %v has alpha %d, want 0", p, a>>8)
		}
	}
	if _, _, _, a := img.At(48, 48).RGBA(); a != 0xffff {
		t.Errorf("tile centre alpha = %d, want opaque", a>>8)
	}
}
