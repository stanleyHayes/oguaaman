package graphql

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/graphql-go/graphql/gqlerrors"

	"github.com/oguaa/backend/internal/domain"
)

func aliasQuery(n int) string {
	var b strings.Builder
	b.WriteString("{")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&b, " a%d: members { id }", i)
	}
	b.WriteString(" }")
	return b.String()
}

func TestCheckQueryLimits(t *testing.T) {
	cases := []struct {
		name   string
		query  string
		reject bool
	}{
		{"empty", "", false},
		{"ordinary", "{ members { id displayName bio } institutions { slug name } }", false},
		{"syntax error passes to graphql-go", "{ members {", false},
		{"alias fan-out", aliasQuery(maxRootFields + 1), true},
		{"root limit exactly", aliasQuery(maxRootFields), false},
		{"too deep", "{ a { b { c { d { e { f { g } } } } } } }", true},
		{"fragment fan-out", "fragment F on Query { " + strings.TrimSuffix(strings.TrimPrefix(aliasQuery(maxRootFields+1), "{"), "}") + " } { ...F }", true},
		{"cyclic fragment terminates", "fragment A on Query { ...B } fragment B on Query { ...A } { ...A }", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := checkQuery(tc.query)
			if (got != "") != tc.reject {
				t.Fatalf("checkQuery reject=%v (reason %q), want reject=%v", got != "", got, tc.reject)
			}
		})
	}
}

func TestGuardRejectsBeforeResolving(t *testing.T) {
	called := false
	h := guard(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true }))

	big := `{"query":"` + strings.Repeat(" ", maxBodyBytes+1) + `{ members { id } }"}`
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/graphql", strings.NewReader(big)))
	if rec.Code != http.StatusRequestEntityTooLarge || called {
		t.Fatalf("oversized body: status %d called=%v", rec.Code, called)
	}

	body := fmt.Sprintf(`{"query":%q}`, aliasQuery(50))
	req := httptest.NewRequest(http.MethodPost, "/graphql", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest || called {
		t.Fatalf("alias fan-out: status %d called=%v", rec.Code, called)
	}

	req = httptest.NewRequest(http.MethodGet, "/graphql?query="+strings.Repeat("x", maxQueryBytes+1), nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusRequestEntityTooLarge || called {
		t.Fatalf("long GET: status %d called=%v", rec.Code, called)
	}

	body = `{"query":"{ members { id } }"}`
	req = httptest.NewRequest(http.MethodPost, "/graphql", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	var seen string
	h = guard(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b := make([]byte, 128)
		n, _ := r.Body.Read(b)
		seen = string(b[:n])
	}))
	h.ServeHTTP(httptest.NewRecorder(), req)
	if seen != body {
		t.Fatalf("allowed request body not replayed to the handler: %q", seen)
	}
}

func TestFormatErrorHidesInternalErrors(t *testing.T) {
	dbErr := errors.New("server selection error: cluster-0.mongodb.net")
	internal := gqlerrors.NewError(dbErr.Error(), nil, "", nil, nil, dbErr)
	if got := formatError(internal).Message; got != genericErrorMessage {
		t.Errorf("internal error leaked: %q", got)
	}
	nf := gqlerrors.NewError("institution not found", nil, "", nil, nil, &domain.NotFoundError{Entity: "institution"})
	if got := formatError(nf).Message; got != "institution not found" {
		t.Errorf("not-found message: %q", got)
	}
	syntax := gqlerrors.NewError(`Cannot query field "nope" on type "Query".`, nil, "", nil, nil, nil)
	if got := formatError(syntax).Message; !strings.Contains(got, "nope") {
		t.Errorf("validation message should pass through: %q", got)
	}
}

func TestEnabled(t *testing.T) {
	t.Setenv("GRAPHQL_ENABLED", "")
	t.Setenv("GO_ENV", "production")
	if Enabled() {
		t.Error("GraphQL must be off in production by default")
	}
	t.Setenv("GRAPHQL_ENABLED", "true")
	if !Enabled() {
		t.Error("GRAPHQL_ENABLED=true should mount it")
	}
	t.Setenv("GRAPHQL_ENABLED", "")
	t.Setenv("GO_ENV", "development")
	if !Enabled() {
		t.Error("GraphQL should be on outside production")
	}
}
