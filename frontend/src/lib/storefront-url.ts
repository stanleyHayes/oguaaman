// The shareable storefront URL — single source of truth.
//
// FINAL form is a per-business SUBDOMAIN of the custom domain, e.g. a business
// with handle "neurodynecorp" shares  https://neurodynecorp.oguaaman.com .
// Set VITE_STOREFRONT_DOMAIN to that apex ("oguaaman.com") once it's owned and
// a wildcard domain (*.oguaaman.com → this app, rewriting /<host-sub> to
// /s/<handle>) is configured.
//
// UNTIL THEN we're on *.vercel.app, which can't host per-business subdomains,
// so it falls back to the path form  https://<citizen-app>/s/<handle> . The
// same /s/:handle route serves both, so the future switch is one env var.
const DOMAIN = (import.meta.env.VITE_STOREFRONT_DOMAIN as string | undefined)?.trim();

/** True once a custom storefront domain is configured (subdomain links live). */
export const storefrontSubdomains = Boolean(DOMAIN);

/** The full shareable URL for a storefront handle ("" when no handle yet). */
export function storefrontUrl(handle: string): string {
  const h = handle.trim();
  if (!h) return "";
  if (DOMAIN) return `https://${h}.${DOMAIN}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/s/${h}`;
}

/** Same URL without the scheme, for compact display. */
export function storefrontUrlLabel(handle: string): string {
  return storefrontUrl(handle).replace(/^https?:\/\//, "");
}

/** The fixed part shown around the editable handle field, so the owner sees the
 *  exact link shape. e.g. { prefix: "https://", suffix: ".oguaaman.com" } for a
 *  subdomain, or { prefix: "oguaa-citizen.vercel.app/s/", suffix: "" } for now. */
export function storefrontUrlParts(): { prefix: string; suffix: string } {
  if (DOMAIN) return { prefix: "https://", suffix: `.${DOMAIN}` };
  const origin = typeof window !== "undefined" ? window.location.origin.replace(/^https?:\/\//, "") : "";
  return { prefix: `${origin}/s/`, suffix: "" };
}
