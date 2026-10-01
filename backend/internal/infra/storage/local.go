// Package storage holds file-system helpers for first-party uploads.
package storage

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// LocalUploads deletes files from the first-party upload directory.
type LocalUploads struct{ Dir string }

// errBadName rejects anything that is not a plain file name in the directory.
var errBadName = errors.New("storage: invalid upload name")

// RemoveUpload deletes one uploaded file by name. A file that is already gone
// is not an error. Only plain names are accepted — never a path — so a stored
// name can never reach outside the upload directory.
func (l LocalUploads) RemoveUpload(name string) error {
	if name == "" || name != filepath.Base(name) || strings.HasPrefix(name, ".") || strings.ContainsAny(name, `/\`) {
		return errBadName
	}
	err := os.Remove(filepath.Join(l.Dir, name))
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}
