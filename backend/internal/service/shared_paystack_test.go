package service

import (
	"context"
	"encoding/json"
	"errors"
	"go/ast"
	"go/parser"
	"go/token"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// C5: every transaction/initialize call site in the service passes an
// explicit callback URL built from config, never the shared dashboard default.
func TestEveryInitializeSendsACallbackURL(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	fset := token.NewFileSet()
	var sites []string
	for _, name := range files {
		if strings.HasSuffix(name, "_test.go") {
			continue
		}
		src, err := os.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		f, err := parser.ParseFile(fset, name, src, 0)
		if err != nil {
			t.Fatal(err)
		}
		for _, decl := range f.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Body == nil {
				continue
			}
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || (sel.Sel.Name != "Initialize" && sel.Sel.Name != "InitializeSplit") || len(call.Args) < 6 {
					return true
				}
				site := fset.Position(call.Pos()).String() + " in " + fn.Name.Name
				arg, ok := call.Args[5].(*ast.Ident)
				if !ok || (arg.Name != "callback" && arg.Name != "callbackURL") {
					t.Errorf("%s: callback argument is %T, want the flow's callback URL", site, call.Args[5])
				}
				sites = append(sites, fn.Name.Name)
				return true
			})
		}
	}
	for _, flow := range []string{"StartPledge", "StartDonation", "StartTicketPurchase", "StartSubscriptionFrom", "StartCreatorSubscription", "StartPromotionFrom", "StartOrder", "AcceptAndFund"} {
		if !slices.Contains(sites, flow) {
			t.Errorf("no Paystack initialize found in %s (sites: %v)", flow, sites)
		}
	}
}

// C5: the live client refuses an initialize without a callback URL and tags
// every transaction metadata.app=oguaa with its flow.
func TestPaystackInitialize_callbackAndMetadata(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{"status":true,"data":{"authorization_url":"https://checkout.paystack.com/x","access_code":"x"}}`))
	}))
	defer srv.Close()
	p := NewPaystackClient("sk_test_x")
	p.base = srv.URL
	ctx := context.Background()
	if _, _, err := p.Initialize(ctx, "a@b.c", 500, "GHS", "oguaa-tkt-x-1", " "); !errors.Is(err, errNoCallbackURL) {
		t.Fatalf("blank callback: err=%v", err)
	}
	if _, _, err := (SimulatedPaystack{}).Initialize(ctx, "a@b.c", 500, "GHS", "oguaa-tkt-x-1", ""); !errors.Is(err, errNoCallbackURL) {
		t.Fatalf("simulated blank callback: err=%v", err)
	}
	if _, _, err := p.InitializeSplit(ctx, "a@b.c", 500, "GHS", "oguaa-ord-shop-1", "https://citizen.test/business/shop/order?reference=oguaa-ord-shop-1", "ACCT_x", 25); err != nil {
		t.Fatal(err)
	}
	meta, _ := got["metadata"].(map[string]any)
	if got["callback_url"] == "" || meta["app"] != "oguaa" || meta["flow"] != "ord" || got["bearer"] != "subaccount" {
		t.Fatalf("payload = %v", got)
	}
}

// C5: new references carry the oguaa- namespace; legacy ones still route.
func TestRefFlow(t *testing.T) {
	cases := map[string]struct {
		prefix     string
		namespaced bool
	}{
		"oguaa-tkt-fetu-1":   {RefPrefixTicket, true},
		"oguaa-csub-m-1-2":   {RefPrefixCreatorSubscription, true},
		"oguaa-sub-shop-1":   {RefPrefixSubscription, true},
		"plg-library-1":      {RefPrefixPledge, false},
		"ord-shop-1":         {RefPrefixOrder, false},
		"oguaa-unknown-1":    {"", true},
		"T123456789":         {"", false},
		"another-app-tkt-12": {"", false},
	}
	for ref, want := range cases {
		prefix, ns := RefFlow(ref)
		if prefix != want.prefix || ns != want.namespaced {
			t.Errorf("RefFlow(%q) = %q,%v; want %q,%v", ref, prefix, ns, want.prefix, want.namespaced)
		}
	}
	if ref := newReference(RefPrefixPledge, "library", "1"); ref != "oguaa-plg-library-1" {
		t.Fatalf("newReference = %q", ref)
	}
}
