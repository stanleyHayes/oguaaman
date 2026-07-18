package graphql

import (
	"testing"

	"github.com/oguaa/backend/internal/service"
)

// TestNewSchemaBuilds verifies the code-first schema assembles and exposes the
// expected root query fields. Resolvers capture the service but aren't invoked
// at build time, so a zero-value Service is sufficient here.
func TestNewSchemaBuilds(t *testing.T) {
	schema, err := NewSchema(&service.Service{})
	if err != nil {
		t.Fatalf("NewSchema: %v", err)
	}
	q := schema.QueryType()
	if q == nil {
		t.Fatal("schema has no query type")
	}
	want := []string{
		"artists", "people", "memorials", "businesses", "properties", "events", "opportunities",
		"memories", "genres", "spotlightArtist", "artist", "property", "memorial",
		"places", "schools", "institutions", "institution", "members", "member", "stats",
	}
	fields := q.Fields()
	for _, name := range want {
		if _, ok := fields[name]; !ok {
			t.Errorf("query is missing field %q", name)
		}
	}
}
