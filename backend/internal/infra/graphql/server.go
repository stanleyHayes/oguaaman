package graphql

import (
	"bytes"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"

	"github.com/graphql-go/graphql/gqlerrors"
	"github.com/graphql-go/graphql/language/ast"
	"github.com/graphql-go/graphql/language/parser"
	"github.com/graphql-go/handler"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// Limits applied to every GraphQL request. No first-party client uses GraphQL,
// so they are deliberately tight: the endpoint exists for exploration, not bulk
// reads, and every root field scans a whole collection.
const (
	maxBodyBytes   = 32 << 10 // POST body cap
	maxQueryBytes  = 8 << 10  // GET ?query= cap
	maxRootFields  = 10       // aliases count: each one runs the resolver again
	maxTotalFields = 100      // every selected field after expanding fragments
	maxQueryDepth  = 6

	genericErrorMessage = "internal error"
)

// Enabled reports whether /graphql should be mounted. It is off in production
// (GO_ENV=production) unless GRAPHQL_ENABLED=true, because no client uses it and
// every root field is an unpaginated collection read.
func Enabled() bool {
	if os.Getenv("GRAPHQL_ENABLED") == "true" {
		return true
	}
	return os.Getenv("GO_ENV") != "production"
}

// NewHandler returns an HTTP handler serving the GraphQL endpoint, or a nil
// handler when GraphQL is disabled (see Enabled) — the router skips a nil
// handler. Where mounted, POST bodies are size-capped, queries are rejected when
// they select too many fields or nest too deep, internal errors are never echoed
// to the caller, and the playground only runs outside production.
func NewHandler(svc *service.Service) (http.Handler, error) {
	if !Enabled() {
		return nil, nil
	}
	schema, err := NewSchema(svc)
	if err != nil {
		return nil, err
	}
	inner := handler.New(&handler.Config{
		Schema:        &schema,
		Pretty:        false,
		GraphiQL:      false,
		Playground:    os.Getenv("GO_ENV") != "production",
		FormatErrorFn: formatError,
	})
	return guard(inner), nil
}

// guard enforces the request-size and query-cost limits before the query is
// handed to graphql-go.
func guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.URL.RawQuery) > maxQueryBytes {
			reject(w, http.StatusRequestEntityTooLarge, "query too large")
			return
		}
		if r.Body != nil && r.Method == http.MethodPost {
			body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
			if err != nil {
				reject(w, http.StatusRequestEntityTooLarge, "request body too large")
				return
			}
			_ = r.Body.Close()
			// The options parser consumes the body (and may parse a form), so it
			// reads a copy; the real handler gets a fresh reader over the same bytes.
			probe := r.Clone(r.Context())
			probe.Body = io.NopCloser(bytes.NewReader(body))
			if msg := checkQuery(handler.NewRequestOptions(probe).Query); msg != "" {
				reject(w, http.StatusBadRequest, msg)
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(body))
		} else if msg := checkQuery(handler.NewRequestOptions(r).Query); msg != "" {
			reject(w, http.StatusBadRequest, msg)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func reject(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"errors":[{"message":"` + msg + `"}]}`))
}

// checkQuery returns a non-empty reason when the query exceeds the cost limits.
// An empty or unparseable query passes through: graphql-go reports syntax errors
// itself without resolving anything.
func checkQuery(query string) string {
	if query == "" {
		return ""
	}
	if len(query) > maxBodyBytes {
		return "query too large"
	}
	doc, err := parser.Parse(parser.ParseParams{Source: query})
	if err != nil {
		return ""
	}
	fragments := map[string]*ast.FragmentDefinition{}
	for _, def := range doc.Definitions {
		if fd, ok := def.(*ast.FragmentDefinition); ok && fd.Name != nil {
			fragments[fd.Name.Value] = fd
		}
	}
	c := &costCounter{fragments: fragments, visiting: map[string]bool{}}
	for _, def := range doc.Definitions {
		op, ok := def.(*ast.OperationDefinition)
		if !ok {
			continue
		}
		c.walk(op.SelectionSet, 1)
		if c.exceeded != "" {
			return c.exceeded
		}
	}
	return ""
}

// costCounter walks a selection set, expanding fragment spreads, and counts the
// selected fields. It stops as soon as a limit is exceeded, so a hostile query
// cannot make the check itself expensive.
type costCounter struct {
	fragments map[string]*ast.FragmentDefinition
	visiting  map[string]bool
	roots     int
	fields    int
	exceeded  string
}

func (c *costCounter) walk(set *ast.SelectionSet, depth int) {
	if set == nil || c.exceeded != "" {
		return
	}
	if depth > maxQueryDepth {
		c.exceeded = "query nests too deep"
		return
	}
	for _, sel := range set.Selections {
		if c.exceeded != "" {
			return
		}
		switch s := sel.(type) {
		case *ast.Field:
			c.count(depth)
			if c.exceeded != "" {
				return
			}
			c.walk(s.SelectionSet, depth+1)
		case *ast.InlineFragment:
			c.walk(s.SelectionSet, depth)
		case *ast.FragmentSpread:
			c.spread(s, depth)
		}
	}
}

func (c *costCounter) count(depth int) {
	c.fields++
	if depth == 1 {
		c.roots++
	}
	switch {
	case c.roots > maxRootFields:
		c.exceeded = "too many root fields"
	case c.fields > maxTotalFields:
		c.exceeded = "query selects too many fields"
	}
}

func (c *costCounter) spread(s *ast.FragmentSpread, depth int) {
	if s.Name == nil {
		return
	}
	name := s.Name.Value
	fd, ok := c.fragments[name]
	if !ok || c.visiting[name] {
		return // unknown or cyclic: graphql-go's validation rejects it
	}
	c.visiting[name] = true
	c.walk(fd.SelectionSet, depth)
	delete(c.visiting, name)
}

// formatError passes through only errors that are safe to show: query syntax
// and validation errors, and the domain's not-found / forbidden / validation
// errors. Anything else (a database error, a timeout) is logged and replaced by
// a generic message so cluster hostnames and internals never reach the caller.
func formatError(err error) gqlerrors.FormattedError {
	if err == nil {
		return gqlerrors.NewFormattedError(genericErrorMessage)
	}
	formatted := gqlerrors.FormatError(err)
	cause := err
	var gerr *gqlerrors.Error
	if errors.As(err, &gerr) {
		if gerr.OriginalError == nil {
			return formatted // a syntax/validation error about the query itself
		}
		cause = gerr.OriginalError // gqlerrors.Error does not implement Unwrap
	}
	if isPublicError(cause) {
		return formatted
	}
	slog.Default().Error("graphql resolver error", "err", err)
	formatted.Message = genericErrorMessage
	formatted.Extensions = nil
	return formatted
}

func isPublicError(err error) bool {
	var nf *domain.NotFoundError
	var fb *domain.ForbiddenError
	var ve *domain.ValidationError
	return errors.As(err, &nf) || errors.As(err, &fb) || errors.As(err, &ve)
}
