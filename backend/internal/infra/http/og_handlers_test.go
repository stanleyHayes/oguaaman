package http

import (
	"bytes"
	"image"
	"image/png"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// F096: a cover with huge declared dimensions is refused before decoding.
func TestDecodeBoundedImage(t *testing.T) {
	var small bytes.Buffer
	if err := png.Encode(&small, image.NewGray(image.Rect(0, 0, 40, 20))); err != nil {
		t.Fatal(err)
	}
	if decodeBoundedImage(bytes.NewReader(small.Bytes())) == nil {
		t.Fatal("a normal cover must decode")
	}
	var huge bytes.Buffer
	if err := png.Encode(&huge, image.NewGray(image.Rect(0, 0, ogCoverMaxSide+1, 1))); err != nil {
		t.Fatal(err)
	}
	if decodeBoundedImage(bytes.NewReader(huge.Bytes())) != nil {
		t.Fatal("an oversized cover must be refused")
	}
}

// F101: lists read back from Mongo (bson.A) and integer years render.
func TestOGDetailString(t *testing.T) {
	m := map[string]any{"genres": bson.A{"Highlife", "Gospel"}, "tags": []string{"a", "b"}, "year": int32(1994), "n": 2.5}
	for k, want := range map[string]string{"genres": "Highlife · Gospel", "tags": "a · b", "year": "1994", "n": "2.5", "missing": ""} {
		if got := ogDetailString(m, k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
	}
}
