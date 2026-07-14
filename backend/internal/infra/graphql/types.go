// Package graphql is a read-only GraphQL delivery layer over the service core.
// It is schema-first-by-code (graphql-go): object types mirror the domain, and
// the root Query resolves straight through to *service.Service — no new logic.
package graphql

import (
	"github.com/graphql-go/graphql"
	"github.com/graphql-go/graphql/language/ast"
)

// jsonScalar carries arbitrary JSON (a Listing's free-form Details object). The
// default resolver hands the Go map straight through; serialization is identity.
var jsonScalar = graphql.NewScalar(graphql.ScalarConfig{
	Name:         "JSON",
	Description:  "Arbitrary JSON value (e.g. a listing's type-specific details).",
	Serialize:    func(v any) any { return v },
	ParseValue:   func(v any) any { return v },
	ParseLiteral: func(ast.Value) any { return nil },
})

var socialLinkType = graphql.NewObject(graphql.ObjectConfig{
	Name: "SocialLink",
	Fields: graphql.Fields{
		"label": &graphql.Field{Type: graphql.String},
		"url":   &graphql.Field{Type: graphql.String},
	},
})

var tributeType = graphql.NewObject(graphql.ObjectConfig{
	Name: "Tribute",
	Fields: graphql.Fields{
		"id":         &graphql.Field{Type: graphql.String},
		"authorName": &graphql.Field{Type: graphql.String},
		"relation":   &graphql.Field{Type: graphql.String},
		"message":    &graphql.Field{Type: graphql.String},
		"createdAt":  &graphql.Field{Type: graphql.String},
	},
})

var officeType = graphql.NewObject(graphql.ObjectConfig{
	Name: "Office",
	Fields: graphql.Fields{
		"id":         &graphql.Field{Type: graphql.String},
		"role":       &graphql.Field{Type: graphql.String},
		"holderId":   &graphql.Field{Type: graphql.String},
		"holderName": &graphql.Field{Type: graphql.String},
		"verified":   &graphql.Field{Type: graphql.Boolean},
	},
})

var listingType = graphql.NewObject(graphql.ObjectConfig{
	Name: "Listing",
	Fields: graphql.Fields{
		"id":            &graphql.Field{Type: graphql.String},
		"slug":          &graphql.Field{Type: graphql.String},
		"type":          &graphql.Field{Type: graphql.String},
		"ownerId":       &graphql.Field{Type: graphql.String},
		"title":         &graphql.Field{Type: graphql.String},
		"status":        &graphql.Field{Type: graphql.String},
		"tags":          &graphql.Field{Type: graphql.NewList(graphql.String)},
		"townId":        &graphql.Field{Type: graphql.String},
		"schoolIds":     &graphql.Field{Type: graphql.NewList(graphql.String)},
		"postedByOrgId": &graphql.Field{Type: graphql.String},
		"coverImageUrl": &graphql.Field{Type: graphql.String},
		"details":       &graphql.Field{Type: jsonScalar},
		"tributes":      &graphql.Field{Type: graphql.NewList(tributeType)},
		"createdAt":     &graphql.Field{Type: graphql.String},
		"submittedAt":   &graphql.Field{Type: graphql.String},
		"publishedAt":   &graphql.Field{Type: graphql.String},
	},
})

var memberType = graphql.NewObject(graphql.ObjectConfig{
	Name: "Member",
	Fields: graphql.Fields{
		"id":            &graphql.Field{Type: graphql.String},
		"slug":          &graphql.Field{Type: graphql.String},
		"displayName":   &graphql.Field{Type: graphql.String},
		"initials":      &graphql.Field{Type: graphql.String},
		"photoUrl":      &graphql.Field{Type: graphql.String},
		"bio":           &graphql.Field{Type: graphql.String},
		"townId":        &graphql.Field{Type: graphql.String},
		"schoolIds":     &graphql.Field{Type: graphql.NewList(graphql.String)},
		"links":         &graphql.Field{Type: graphql.NewList(socialLinkType)},
		"phoneVerified": &graphql.Field{Type: graphql.Boolean},
		"role":          &graphql.Field{Type: graphql.String},
		"suspended":     &graphql.Field{Type: graphql.Boolean},
		"joinedAt":      &graphql.Field{Type: graphql.String},
		// Note: phone/email are intentionally absent — private (spec §11).
	},
})

var organizationType = graphql.NewObject(graphql.ObjectConfig{
	Name: "Organization",
	Fields: graphql.Fields{
		"id":             &graphql.Field{Type: graphql.String},
		"slug":           &graphql.Field{Type: graphql.String},
		"kind":           &graphql.Field{Type: graphql.String},
		"name":           &graphql.Field{Type: graphql.String},
		"officialTitle":  &graphql.Field{Type: graphql.String},
		"motto":          &graphql.Field{Type: graphql.String},
		"crestUrl":       &graphql.Field{Type: graphql.String},
		"summary":        &graphql.Field{Type: graphql.String},
		"history":        &graphql.Field{Type: graphql.String},
		"founded":        &graphql.Field{Type: graphql.Int},
		"classification": &graphql.Field{Type: graphql.String},
		"jurisdiction":   &graphql.Field{Type: graphql.String},
		"contact":        &graphql.Field{Type: graphql.NewList(socialLinkType)},
		"offices":        &graphql.Field{Type: graphql.NewList(officeType)},
		"relatedOrgIds":  &graphql.Field{Type: graphql.NewList(graphql.String)},
		"verified":       &graphql.Field{Type: graphql.Boolean},
		"verifiedOn":     &graphql.Field{Type: graphql.String},
		"houseColors":    &graphql.Field{Type: graphql.NewList(graphql.String)},
		"osaName":        &graphql.Field{Type: graphql.String},
		"memberCount":    &graphql.Field{Type: graphql.Int},
	},
})

var placeType = graphql.NewObject(graphql.ObjectConfig{
	Name: "Place",
	Fields: graphql.Fields{
		"id":       &graphql.Field{Type: graphql.String},
		"slug":     &graphql.Field{Type: graphql.String},
		"name":     &graphql.Field{Type: graphql.String},
		"parentId": &graphql.Field{Type: graphql.String},
		"blurb":    &graphql.Field{Type: graphql.String},
	},
})

var statsType = graphql.NewObject(graphql.ObjectConfig{
	Name: "Stats",
	Fields: graphql.Fields{
		"members":      &graphql.Field{Type: graphql.Int},
		"listings":     &graphql.Field{Type: graphql.Int},
		"schools":      &graphql.Field{Type: graphql.Int},
		"institutions": &graphql.Field{Type: graphql.Int},
		"artists":      &graphql.Field{Type: graphql.Int},
		"memorials":    &graphql.Field{Type: graphql.Int},
		"memories":     &graphql.Field{Type: graphql.Int},
		"pending":      &graphql.Field{Type: graphql.Int},
	},
})
