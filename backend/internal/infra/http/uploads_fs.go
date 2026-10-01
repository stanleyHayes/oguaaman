package http

import (
	"io/fs"
	"net/http"
	"os"
	"strings"
)

// ── serving /uploads without directory listings (F027) ──────────────────────
//
// http.FileServer renders an HTML index for any directory without an
// index.html. Upload names are random 128-bit hex precisely so they cannot be
// guessed; a listing of /uploads/ would hand every one of them out. Only plain
// files are served — directories (and dot-files) answer 404. Private documents
// never live on this disk at all: they are encrypted in MongoDB and served
// only through the authenticated private-upload endpoints.

// noListingFS wraps a FileSystem so directories and hidden files are not found.
type noListingFS struct{ fs http.FileSystem }

func (n noListingFS) Open(name string) (http.File, error) {
	for _, part := range strings.Split(name, "/") {
		if strings.HasPrefix(part, ".") && part != "." {
			return nil, os.ErrNotExist
		}
	}
	f, err := n.fs.Open(name)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	if st.IsDir() {
		_ = f.Close()
		return nil, fs.ErrNotExist
	}
	return f, nil
}

// staticFiles serves the files of fsys under prefix: plain files only (no
// directory listings, no hidden files) and no MIME sniffing by the browser.
func staticFiles(prefix string, fsys http.FileSystem) http.Handler {
	files := http.StripPrefix(prefix, http.FileServer(noListingFS{fsys}))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		files.ServeHTTP(w, r)
	})
}
