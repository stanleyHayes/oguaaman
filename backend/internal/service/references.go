package service

import "strings"

// ── payment references on a shared Paystack integration (C5) ────────────────
//
// The owner's Paystack keys also serve other apps, so every reference Oguaa
// issues carries the "oguaa-" namespace ahead of its flow prefix (Paystack
// allows only alphanumerics, "-", "." and "="): oguaa-tkt-…, oguaa-ord-….
// References issued before the namespace (plg-…, tkt-…) still confirm and
// still route through the webhook.

// RefNamespace starts every reference Oguaa issues.
const RefNamespace = "oguaa-"

// metadataApp is the metadata.app tag every Oguaa initialize sends.
const metadataApp = "oguaa"

// refFlows lists every flow prefix (after the namespace).
var refFlows = []string{
	RefPrefixPledge, RefPrefixDonation, RefPrefixTicket, RefPrefixSubscription,
	RefPrefixCreatorSubscription, RefPrefixPromotion, RefPrefixOrder, RefPrefixAgentJob, RefPrefixAd,
}

// newReference builds a namespaced reference: oguaa-<prefix><parts joined by ->.
func newReference(prefix string, parts ...string) string {
	return RefNamespace + prefix + strings.Join(parts, "-")
}

// RefFlow returns the flow prefix a reference was issued for ("" when it is
// no Oguaa flow's) and whether it carries the oguaa- namespace. A legacy
// reference without the namespace is only Oguaa's if a record holds it.
func RefFlow(ref string) (prefix string, namespaced bool) {
	rest, namespaced := strings.CutPrefix(ref, RefNamespace)
	for _, p := range refFlows {
		if strings.HasPrefix(rest, p) {
			return p, namespaced
		}
	}
	return "", namespaced
}

// refFlowName is the metadata.flow tag for a reference.
func refFlowName(ref string) string {
	prefix, _ := RefFlow(ref)
	return strings.TrimSuffix(prefix, "-")
}
