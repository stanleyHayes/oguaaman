// Legal document routes and the notice version the portal asks members to
// agree to. The server records its own current versions (domain.CurrentTermsVersion);
// termsVersion here is informational, so keep it in step with docs/legal.

/** The Terms of Use / Privacy Notice version shown at sign-up. */
export const TERMS_VERSION = "2026-10-02";

export const LEGAL = {
  terms: "/terms",
  privacy: "/privacy",
  acceptableUse: "/acceptable-use",
  termsOfSale: "/terms-of-sale",
  childSafety: "/child-safety",
  safeguarding: "/safeguarding",
  advertising: "/advertising",
  editorial: "/editorial",
  deleteAccount: "/account/delete",
  privacyRequest: "/privacy/request",
} as const;

/** Where "Is this about you?" links point, with the request prefilled. */
export function privacyRequestHref(type: "correction" | "deletion" | "objection", targetUrl: string): string {
  const q = new URLSearchParams({ type, target: targetUrl });
  return `${LEGAL.privacyRequest}?${q.toString()}`;
}
