package cloudinary

import (
	"context"
	"errors"
	"testing"
)

func TestCopyAdImageFetchesTheSourceIntoTheCampaignFolder(t *testing.T) {
	form := map[string]string{}
	c := uploadClientFor(t, captureUpload(form, `{"secure_url":"https://res.cloudinary.com/demo/image/upload/v3/oguaa/ads/ad-1/creative-1.jpg","public_id":"oguaa/ads/ad-1/creative-1","version":3}`))
	src := "https://res.cloudinary.com/demo/image/upload/v1/oguaa/m/m-1/banner.jpg"
	got, err := c.CopyAdImage(context.Background(), "ad-1", "creative-1", src)
	if err != nil {
		t.Fatal(err)
	}
	if got != "https://res.cloudinary.com/demo/image/upload/v3/oguaa/ads/ad-1/creative-1.jpg" {
		t.Fatalf("url = %q", got)
	}
	if form["file"] != src || form["folder"] != "oguaa/ads/ad-1" || form["public_id"] != "creative-1" || form["tags"] != "oguaa-ad" {
		t.Fatalf("form = %v", form)
	}
	if c.CloudName() != "demo" {
		t.Fatalf("cloud name = %q", c.CloudName())
	}
}

func TestCopyAdImageOnANilClientIsUnavailable(t *testing.T) {
	var c *Client
	if _, err := c.CopyAdImage(context.Background(), "ad-1", "creative-1", "https://x.test/a.jpg"); !errors.Is(err, ErrMediaUnavailable) {
		t.Fatalf("err = %v", err)
	}
	if c.CloudName() != "" {
		t.Fatal("nil client has no cloud name")
	}
}
