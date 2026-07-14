package graphql

import (
	"net/http"

	"github.com/graphql-go/handler"

	"github.com/oguaa/backend/internal/service"
)

// NewHandler returns an HTTP handler serving the GraphQL endpoint. GET in a
// browser opens the GraphiQL playground; POST executes queries. Mount at /graphql.
func NewHandler(svc *service.Service) (http.Handler, error) {
	schema, err := NewSchema(svc)
	if err != nil {
		return nil, err
	}
	return handler.New(&handler.Config{
		Schema:     &schema,
		Pretty:     true,
		GraphiQL:   false,
		Playground: true,
	}), nil
}
