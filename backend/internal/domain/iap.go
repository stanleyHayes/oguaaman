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

// PlanForAppleProduct inverts AppleProductForPlan.
func PlanForAppleProduct(productID string) (string, bool) {
	for plan, pid := range AppleProductForPlan {
		if pid == productID {
			return plan, true
		}
	}
	return "", false
}

// AppleTransactionRecord is a redeemed StoreKit transaction.
//
// It exists for replay protection. A signed receipt stays valid forever, so
// without a record of what has already been redeemed, one genuine purchase
// could be posted repeatedly — by the buyer, or by anyone who obtained the
// token — and extend a subscription indefinitely. The transaction id is the
// document _id, so a second redemption is a duplicate-key error rather than a
// race we have to reason about.
type AppleTransactionRecord struct {
	TransactionID         string `json:"transactionId" bson:"_id"`
	OriginalTransactionID string `json:"originalTransactionId" bson:"originalTransactionId"`
	MemberID              string `json:"memberId" bson:"memberId"`
	ProductID             string `json:"productId" bson:"productId"`
	PlanSlug              string `json:"planSlug" bson:"planSlug"`
	Reference             string `json:"reference" bson:"reference"`
	Environment           string `json:"environment" bson:"environment"`
	PurchasedAt           string `json:"purchasedAt" bson:"purchasedAt"`
	ExpiresAt             string `json:"expiresAt,omitempty" bson:"expiresAt,omitempty"`
	RedeemedAt            string `json:"redeemedAt" bson:"redeemedAt"`
}

// AppleTransactionRepository stores redeemed transactions.
type AppleTransactionRepository interface {
	// Claim records a transaction as redeemed. It returns alreadyRedeemed=true
	// when the transaction id has been seen before, and must be atomic: two
	// concurrent redemptions of the same receipt may not both succeed.
	Claim(ctx context.Context, rec AppleTransactionRecord) (alreadyRedeemed bool, err error)
	ByTransactionID(ctx context.Context, transactionID string) (*AppleTransactionRecord, error)
	// DeleteByMember removes a member's redemption history on account erasure.
	DeleteByMember(ctx context.Context, memberID string) error
}
