package graphql

import (
	"context"
	"time"

	"github.com/graphql-go/graphql"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// listings adapts a service read into a GraphQL field resolver.
func listings(fn func(context.Context) ([]domain.Listing, error)) graphql.FieldResolveFn {
	return func(p graphql.ResolveParams) (any, error) { return fn(p.Context) }
}

// bySlug adapts a slug-keyed single-listing read of a given type.
func bySlug(svc *service.Service, typ string) graphql.FieldResolveFn {
	return func(p graphql.ResolveParams) (any, error) {
		slug, _ := p.Args["slug"].(string)
		return svc.ListingBySlug(p.Context, typ, slug)
	}
}

var slugArg = graphql.FieldConfigArgument{
	"slug": &graphql.ArgumentConfig{Type: graphql.NewNonNull(graphql.String)},
}

// NewSchema builds the read-only query schema, resolving through to the service.
func NewSchema(svc *service.Service) (graphql.Schema, error) {
	listingList := graphql.NewList(listingType)

	query := graphql.NewObject(graphql.ObjectConfig{
		Name: "Query",
		Fields: graphql.Fields{
			"artists":         &graphql.Field{Type: listingList, Resolve: listings(svc.Artists)},
			"people":          &graphql.Field{Type: listingList, Resolve: listings(svc.People)},
			"musicLegacy":     &graphql.Field{Type: listingList, Resolve: listings(svc.MusicLegacy)},
			"memorials":       &graphql.Field{Type: listingList, Resolve: listings(svc.Memorials)},
			"businesses":      &graphql.Field{Type: listingList, Resolve: listings(svc.Businesses)},
			"events":          &graphql.Field{Type: listingList, Resolve: listings(svc.Events)},
			"opportunities":   &graphql.Field{Type: listingList, Resolve: listings(svc.Opportunities)},
			"memories":        &graphql.Field{Type: listingList, Resolve: listings(svc.Memories)},
			"spotlightArtist": &graphql.Field{Type: listingType, Resolve: func(p graphql.ResolveParams) (any, error) { return svc.SpotlightArtist(p.Context) }},

			"artist":   &graphql.Field{Type: listingType, Args: slugArg, Resolve: bySlug(svc, domain.TypeArtist)},
			"business": &graphql.Field{Type: listingType, Args: slugArg, Resolve: bySlug(svc, domain.TypeBusiness)},
			"memorial": &graphql.Field{Type: listingType, Args: slugArg, Resolve: bySlug(svc, domain.TypeMemorial)},

			"upcomingEvents": &graphql.Field{
				Type: listingList,
				Args: graphql.FieldConfigArgument{
					"limit": &graphql.ArgumentConfig{Type: graphql.Int, DefaultValue: 4},
				},
				Resolve: func(p graphql.ResolveParams) (any, error) {
					limit, _ := p.Args["limit"].(int)
					return svc.UpcomingEvents(p.Context, time.Now().UTC().Format("2006-01-02"), limit)
				},
			},

			"genres": &graphql.Field{
				Type:    graphql.NewList(graphql.String),
				Resolve: func(p graphql.ResolveParams) (any, error) { return svc.Genres(p.Context) },
			},

			"places":       &graphql.Field{Type: graphql.NewList(placeType), Resolve: func(p graphql.ResolveParams) (any, error) { return svc.Places(p.Context) }},
			"schools":      &graphql.Field{Type: graphql.NewList(organizationType), Resolve: func(p graphql.ResolveParams) (any, error) { return svc.Schools(p.Context) }},
			"institutions": &graphql.Field{Type: graphql.NewList(organizationType), Resolve: func(p graphql.ResolveParams) (any, error) { return svc.Institutions(p.Context) }},
			"institution": &graphql.Field{
				Type: organizationType, Args: slugArg,
				Resolve: func(p graphql.ResolveParams) (any, error) {
					slug, _ := p.Args["slug"].(string)
					return svc.InstitutionBySlug(p.Context, slug)
				},
			},

			"members": &graphql.Field{Type: graphql.NewList(memberType), Resolve: func(p graphql.ResolveParams) (any, error) { return svc.Members(p.Context) }},
			"member": &graphql.Field{
				Type: memberType, Args: slugArg,
				Resolve: func(p graphql.ResolveParams) (any, error) {
					slug, _ := p.Args["slug"].(string)
					return svc.MemberBySlug(p.Context, slug)
				},
			},

			"stats": &graphql.Field{Type: statsType, Resolve: func(p graphql.ResolveParams) (any, error) { return svc.Stats(p.Context) }},
		},
	})

	return graphql.NewSchema(graphql.SchemaConfig{Query: query})
}
