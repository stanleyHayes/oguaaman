// Command livesubaccounts re-creates Paystack subaccounts for verified sellers
// after the API switches to a live key (P01/P46).
//
// Subaccounts belong to the key mode that created them. A code made while the
// server ran on an sk_test_ key, or an ACCT_SIM_ code from the simulation, does
// not exist under sk_live_, so every product checkout for that seller fails
// and the order is cancelled. For every verified business this asks Paystack
// (with the configured key) whether its stored code exists; when it does not,
// --apply creates a live subaccount from the KYC settlement details and stores
// the new code. Sellers whose code the live key already sees are left alone.
//
//	go run ./cmd/livesubaccounts             # dry run — reports, changes nothing
//	go run ./cmd/livesubaccounts --apply     # create live subaccounts and store them
//
// Reads MONGODB_URI/MONGODB_DB and PAYSTACK_SECRET_KEY, which must be a live
// sk_live_ key (--allow-test lets a rehearsal run against a test key). Check
// each new subaccount in Paystack Dashboard → Subaccounts afterwards.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/oguaa/backend/internal/config"
	mongox "github.com/oguaa/backend/internal/infra/mongo"
	"github.com/oguaa/backend/internal/service"
)

func main() {
	os.Exit(run())
}

// run returns the process exit code so deferred disconnects still run.
func run() int {
	apply := flag.Bool("apply", false, "create the live subaccounts and store them (default: dry run)")
	allowTest := flag.Bool("allow-test", false, "allow an sk_test_ key (rehearsal only)")
	flag.Parse()

	cfg := config.Load()
	switch mode := cfg.PaystackMode(); {
	case mode == config.PaystackModeLive:
	case mode == config.PaystackModeTest && *allowTest:
		fmt.Println("WARNING: running against a Paystack TEST key (--allow-test)")
	default:
		fmt.Fprintf(os.Stderr, "PAYSTACK_SECRET_KEY must be a live sk_live_ key (mode %q); use --allow-test only for a rehearsal\n", mode)
		return 2
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	client, db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect: %v\n", err)
		return 1
	}
	defer func() { _ = client.Disconnect(context.Background()) }()

	mode := map[bool]string{true: "APPLY", false: "dry run"}[*apply]
	fmt.Printf("database %s\nmode     %s\n\n", cfg.MongoDB, mode)
	rows, err := service.RelinkSubaccounts(ctx, mongox.NewBusinessVerificationRepo(db), service.NewPaystackClient(cfg.PaystackSecretKey), *apply)
	if err != nil {
		fmt.Fprintf(os.Stderr, "list verifications: %v\n", err)
		return 1
	}
	return report(rows, *apply)
}

// report prints one line per verified seller and returns the exit code: 1
// when any seller could not be relinked.
func report(rows []service.SubaccountRelink, apply bool) int {
	counts := map[string]int{}
	for _, r := range rows {
		counts[r.Action]++
		line := fmt.Sprintf("%-8s %-28s %-24s bank=%-8s acct=…%-4s old=%s", r.Action, r.ListingSlug, r.LegalName, r.BankCode, r.AccountTail, orNone(r.OldCode))
		if r.NewCode != "" {
			line += " new=" + r.NewCode
		}
		if r.Err != nil {
			line += " — " + r.Err.Error()
		}
		fmt.Println(line)
	}
	fmt.Printf("\n%d verified sellers: keep=%d create=%d skipped=%d failed=%d\n", len(rows),
		counts[service.RelinkKeep], counts[service.RelinkCreate], counts[service.RelinkSkipped], counts[service.RelinkFailed])
	if !apply && counts[service.RelinkCreate] > 0 {
		fmt.Println("dry run — nothing changed. Re-run with --apply to create the live subaccounts.")
	}
	if counts[service.RelinkFailed] > 0 || counts[service.RelinkSkipped] > 0 {
		return 1
	}
	return 0
}

func orNone(s string) string {
	if s == "" {
		return "(none)"
	}
	return s
}
