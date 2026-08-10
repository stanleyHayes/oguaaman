// Command grantrole promotes an existing account to a back-office role.
//
// This is the admin bootstrap for a live database, and it exists because
// cmd/seedlive deliberately creates no accounts at all: every seeded member
// carries an @oguaa.test address and the shared password documented in this
// repository, so none of them may exist in production.
//
// That is the right trade, but it leaves a real gap on a fresh deployment —
// with no curator or steward, nothing can be approved, so no listing is ever
// published and the sitemap has nothing to advertise. Promote your own account
// once, after signing up through the app.
//
//	go run ./cmd/grantrole -email you@example.com -role steward
//
// Roles: member | curator | steward | editor | moderator.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/oguaa/backend/internal/config"
	"github.com/oguaa/backend/internal/domain"
	mongox "github.com/oguaa/backend/internal/infra/mongo"
)

var allowed = map[string]bool{
	domain.RoleMember: true, domain.RoleCurator: true, domain.RoleSteward: true,
	"editor": true, "moderator": true,
}

func main() {
	email := flag.String("email", "", "email address of an existing account")
	role := flag.String("role", "", "member | curator | steward | editor | moderator")
	flag.Parse()

	*email = strings.ToLower(strings.TrimSpace(*email))
	if *email == "" || *role == "" {
		fmt.Fprintln(os.Stderr, "usage: grantrole -email you@example.com -role steward")
		os.Exit(2)
	}
	if !allowed[*role] {
		fmt.Fprintf(os.Stderr, "unknown role %q\n", *role)
		os.Exit(2)
	}
	// The seeded identities must never be promoted: they share one password that
	// is published in this repository.
	if strings.HasSuffix(*email, domain.DemoMemberEmailSuffix) {
		fmt.Fprintf(os.Stderr, "refusing to promote a demo account (%s)\n", *email)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cfg := config.Load()
	client, db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		fmt.Fprintln(os.Stderr, "connect:", err)
		os.Exit(1)
	}
	defer func() { _ = client.Disconnect(context.Background()) }()

	res, err := db.Collection("members").UpdateOne(ctx,
		bson.M{"email": *email}, bson.M{"$set": bson.M{"role": *role}})
	if err != nil {
		fmt.Fprintln(os.Stderr, "update:", err)
		os.Exit(1)
	}
	if res.MatchedCount == 0 {
		fmt.Fprintf(os.Stderr, "no account with email %s in %s — sign up through the app first\n", *email, cfg.MongoDB)
		os.Exit(1)
	}
	fmt.Printf("%s is now %s in %s\n", *email, *role, cfg.MongoDB)
}
