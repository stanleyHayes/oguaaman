package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRemoveUploadOnlyTouchesPlainNamesInTheDirectory(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "uploads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(root, "keep.txt")
	if err := os.WriteFile(outside, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "a.jpg"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	l := LocalUploads{Dir: dir}

	for _, bad := range []string{"", "../keep.txt", "sub/a.jpg", ".hidden", `..\keep.txt`} {
		if err := l.RemoveUpload(bad); err == nil {
			t.Errorf("RemoveUpload(%q) accepted a non-plain name", bad)
		}
	}
	if _, err := os.Stat(outside); err != nil {
		t.Fatal("a file outside the upload directory was touched")
	}
	if err := l.RemoveUpload("a.jpg"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "a.jpg")); !os.IsNotExist(err) {
		t.Error("the upload was not deleted")
	}
	if err := l.RemoveUpload("a.jpg"); err != nil {
		t.Errorf("deleting an already-deleted upload: %v", err)
	}
}
