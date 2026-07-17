package http

import (
	"net/http"
	"strconv"
)

// ── optional list pagination (non-breaking) ──────────────────────────────────
//
// A targeted GET list endpoint accepts two optional query params:
//
//	?page=<1-based int>   ?pageSize=<int, default 24, cap 100>
//
// When ?page is PRESENT the handler returns a Page envelope — the page slice
// plus the full filtered count. When ?page is ABSENT the handler returns its
// existing plain array unchanged, so untouched consumers keep working.
//
// The slice is taken from the fully filtered-and-sorted result the service
// already produces, so `total` is the exact filtered count, page ordering
// matches the unpaginated ordering, and the stable sort is preserved.

const (
	defaultPageSize = 24
	maxPageSize     = 100
)

// Page is the list envelope returned when ?page is supplied. Items is the page
// slice; Total is the full filtered count (not the length of Items).
type Page[T any] struct {
	Items      []T `json:"items"`
	Total      int `json:"total"`
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
	TotalPages int `json:"totalPages"`
}

// pageParams reports whether ?page was supplied and, if so, the clamped 1-based
// page and pageSize (default 24, floor 1, cap 100). A missing/blank/invalid
// page value defaults to 1 once ?page is present.
func pageParams(r *http.Request) (page, pageSize int, on bool) {
	q := r.URL.Query()
	if !q.Has("page") {
		return 0, 0, false
	}
	page, _ = strconv.Atoi(q.Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize = defaultPageSize
	if raw := q.Get("pageSize"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			pageSize = n
		}
	}
	if pageSize < 1 {
		pageSize = 1
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return page, pageSize, true
}

// pageOf slices a fully filtered-and-sorted result set into the requested page
// and wraps it in a Page envelope. total is the full length; an out-of-range
// page yields an empty (non-nil) Items list rather than an error.
func pageOf[T any](all []T, page, pageSize int) Page[T] {
	total := len(all)
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	items := all[start:end]
	if items == nil {
		items = []T{}
	}
	totalPages := 0
	if pageSize > 0 {
		totalPages = (total + pageSize - 1) / pageSize
	}
	return Page[T]{Items: items, Total: total, Page: page, PageSize: pageSize, TotalPages: totalPages}
}

// writeList writes a targeted list endpoint's response: the Page envelope when
// ?page is present, otherwise the plain array unchanged (backward-compat).
func writeList[T any](w http.ResponseWriter, r *http.Request, items []T) {
	if page, pageSize, on := pageParams(r); on {
		writeJSON(w, http.StatusOK, pageOf(items, page, pageSize))
		return
	}
	writeJSON(w, http.StatusOK, items)
}
