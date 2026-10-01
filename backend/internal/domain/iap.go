package domain

import "context"

// AppleProductForPlan maps a creator plan slug to the App Store product id that
// sells it, and back.
//
// Apple product ids are configured in App Store Connect and cannot be derived,
// so this table is the contract between the two systems. It is deliberately a
// closed map: a receipt for a product we do not sell must never grant a plan,
// even if the receipt itself is genuine.
var AppleProductForPlan = map[string]string{
	"creator-supporter": "gh.oguaa.app.creator.supporter.monthly",
	"creator-pro":       "gh.oguaa.app.creator.pro.monthly",
	"supporter":         "gh.oguaa.app.business.supporter.monthly",
	"featured":          "gh.oguaa.app.business.featured.monthly",
}

// applePlanScopes says which account each Apple-sold plan attaches to: the
// member (creator plans) or one of the member's businesses.
var applePlanScopes = map[string]string{
	"creator-supporter": SubscriptionScopeCreator,
	"creator-pro":       SubscriptionScopeCreator,
	"supporter":         SubscriptionScopeBusiness,
	"featured":          SubscriptionScopeBusiness,
}

// AppleProduct is what an App Store product sells: a plan, for a scope.
type AppleProduct struct {
	ProductID string
	Plan      string
	Scope     string // SubscriptionScopeCreator | SubscriptionScopeBusiness
}

// PlanForAppleProduct inverts AppleProductForPlan.
func PlanForAppleProduct(productID string) (string, bool) {
	for plan, pid := range AppleProductForPlan {
		if pid == productID {
			return plan, true
		}
	}
	return "", false
}

// AppleProductByID resolves an App Store product id to the plan and scope it
// sells. The grant is always derived from this — never from a pending record
// the client names — so a cheap product can never unlock a dearer plan.
func AppleProductByID(productID string) (AppleProduct, bool) {
	plan, ok := PlanForAppleProduct(productID)
	if !ok {
		return AppleProduct{}, false
	}
	scope, ok := applePlanScopes[plan]
	return AppleProduct{ProductID: productID, Plan: plan, Scope: scope}, ok
}

// AppleTransactionRecord is a redeemed StoreKit transaction.
//
// It exists for replay protection. A signed receipt stays valid forever, so
// without a record of what has already been redeemed, one genuine purchase
// could be posted repeatedly — by the buyer, or by anyone who obtained the
// token — and extend a subscription indefinitely. The transaction id is the
// document _id, so a second redemption is a duplicate-key error rather than a
// race we have to reason about. Records are therefore never deleted: when a
// member is erased, the member link is replaced by a pseudonym and the
// purchase facts are kept for the tax-retention period (RetainUntil).
type AppleTransactionRecord struct {
	TransactionID         string `json:"transactionId" bson:"_id"`
	OriginalTransactionID string `json:"originalTransactionId" bson:"originalTransactionId"`
	MemberID              string `json:"memberId" bson:"memberId"` // a pseudonym once the member is erased
	ProductID             string `json:"productId" bson:"productId"`
	PlanSlug              string `json:"planSlug" bson:"planSlug"`
	Scope                 string `json:"scope,omitempty" bson:"scope,omitempty"`
	ListingID             string `json:"listingId,omitempty" bson:"listingId,omitempty"` // business plans: the business granted
	Reference             string `json:"reference,omitempty" bson:"reference,omitempty"`
	Environment           string `json:"environment" bson:"environment"`
	// Sandbox marks an App Store sandbox purchase (App Review, TestFlight):
	// no money moved, so it is excluded from revenue and its grant is short.
	Sandbox      bool   `json:"sandbox,omitempty" bson:"sandbox,omitempty"`
	PurchasedAt  string `json:"purchasedAt" bson:"purchasedAt"`
	ExpiresAt    string `json:"expiresAt,omitempty" bson:"expiresAt,omitempty"`
	GrantedUntil string `json:"grantedUntil,omitempty" bson:"grantedUntil,omitempty"` // the entitlement end actually applied
	RedeemedAt   string `json:"redeemedAt" bson:"redeemedAt"`
	ErasedAt     string `json:"erasedAt,omitempty" bson:"erasedAt,omitempty"`
	RetainUntil  string `json:"retainUntil,omitempty" bson:"retainUntil,omitempty"`
}

// AppleTransactionRepository stores redeemed transactions.
type AppleTransactionRepository interface {
	// Claim records a transaction as redeemed. It returns alreadyRedeemed=true
	// when the transaction id has been seen before, and must be atomic: two
	// concurrent redemptions of the same receipt may not both succeed.
	Claim(ctx context.Context, rec AppleTransactionRecord) (alreadyRedeemed bool, err error)
	// Unclaim removes a claim whose grant then failed, so the purchase can be
	// redeemed again (grants are idempotent, so a retry never double-grants).
	Unclaim(ctx context.Context, transactionID string) error
	ByTransactionID(ctx context.Context, transactionID string) (*AppleTransactionRecord, error)
	// LatestByOriginalTransactionID returns the newest redemption of a
	// subscription (renewals share the original transaction id), or nil.
	LatestByOriginalTransactionID(ctx context.Context, originalTransactionID string) (*AppleTransactionRecord, error)
	// PseudonymiseMember replaces a member's link on every record with a
	// pseudonym and drops the reference on account erasure. The records (and
	// with them the replay protection) are kept.
	PseudonymiseMember(ctx context.Context, memberID, pseudonym, erasedAt, retainUntil string) error
}
