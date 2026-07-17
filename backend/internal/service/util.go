package service

import (
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

// newID mints a time-based unique identifier with the given prefix. It centralises
// the "nanosecond timestamp" ID pattern so every record type uses one helper.
func newID(prefix string) string {
	return prefix + strconv.FormatInt(time.Now().UnixNano(), 10)
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = slugRe.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

func asString(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// monthDayOf extracts the "MM-DD" portion from a "YYYY-MM-DD" or "MM-DD" date,
// or "" if it can't. Used to match anniversaries/birthdays regardless of format.
func monthDayOf(date string) string {
	switch {
	case len(date) >= 10:
		// Validate the date looks like YYYY-MM-DD before slicing.
		if _, err := time.Parse(time.DateOnly, date[:10]); err != nil {
			return ""
		}
		return date[5:10]
	case len(date) == 5:
		if _, err := time.Parse("01-02", date); err != nil {
			return ""
		}
		return date
	default:
		return ""
	}
}

// asStringSlice extracts strings from any slice value. It uses reflection so it
// works for []string, []any, and the MongoDB driver's bson.A (a named slice
// type) alike — without the service layer importing the bson package.
func asStringSlice(v any) []string {
	if arr, ok := v.([]string); ok {
		return arr
	}
	rv := reflect.ValueOf(v)
	if rv.Kind() != reflect.Slice {
		return nil
	}
	out := make([]string, 0, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		if s, ok := rv.Index(i).Interface().(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func contains(ss []string, target string) bool {
	for _, s := range ss {
		if s == target {
			return true
		}
	}
	return false
}

func sortByStart(events []domain.Listing) {
	sort.SliceStable(events, func(i, j int) bool {
		return asString(events[i].Details, "startsAt") < asString(events[j].Details, "startsAt")
	})
}

func dedupeByID(items []domain.Listing) []domain.Listing {
	seen := map[string]struct{}{}
	out := []domain.Listing{}
	for _, it := range items {
		if _, ok := seen[it.ID]; !ok {
			seen[it.ID] = struct{}{}
			out = append(out, it)
		}
	}
	return out
}
