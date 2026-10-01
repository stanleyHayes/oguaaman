/**
 * Where the sibling apps live — one source of truth for cross-app links.
 *
 * Oguaa ships as four separate SPAs on four hosts:
 *
 *   oguaaman.com          marketing        (marketing/)
 *   citizen.oguaaman.com  this app         (frontend/)
 *   creator.oguaaman.com  creator studio   (creator/)
 *   admin.oguaaman.com    back-office      (admin/)
 *
 * Each origin is env-driven so the same bundle works on preview deployments and
 * on the live domains, but the FALLBACK is the production host rather than a
 * localhost port. A localhost fallback is silently correct on a laptop and
 * silently broken for every real user — which is exactly how the creator links
 * shipped pointing at http://localhost:3004.
 *
 * Local development is detected from the serving origin instead, so `pnpm dev`
 * still hops between apps on the right ports without any .env.local.
 */

/** Dev port map, used only when the page is itself being served from localhost. */
const DEV_PORTS = { creator: "3004", marketing: "5175", admin: "5174" } as const;

function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function resolve(configured: string | undefined, devPort: string, productionDefault: string): string {
  const explicit = configured?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (isLocalhost()) return `${window.location.protocol}//${window.location.hostname}:${devPort}`;
  return productionDefault;
}

/** The creator studio — hosts the owner listing editor. */
export const CREATOR_URL = resolve(
  import.meta.env.VITE_CREATOR_URL as string | undefined,
  DEV_PORTS.creator,
  "https://creator.oguaaman.com",
);

/** The public marketing site. */
export const MARKETING_URL = resolve(
  import.meta.env.VITE_MARKETING_URL as string | undefined,
  DEV_PORTS.marketing,
  "https://oguaaman.com",
);

/**
 * This app's own public origin.
 *
 * Structured data has to carry absolute URLs — a Schema.org @id is a global
 * identifier, and a relative one would collide across the four hosts. On
 * localhost this resolves to the serving origin so JSON-LD stays inspectable in
 * dev without pointing at production.
 */
export const CITIZEN_URL = ((): string => {
  const explicit = (import.meta.env.VITE_CITIZEN_URL as string | undefined)?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (typeof window !== "undefined" && isLocalhost()) return window.location.origin;
  return "https://citizen.oguaaman.com";
})();

/** The staff back-office. */
export const ADMIN_URL = resolve(
  import.meta.env.VITE_ADMIN_URL as string | undefined,
  DEV_PORTS.admin,
  "https://admin.oguaaman.com",
);

// The notifications feed is shared by every app, so some links are routes of
// the creator studio or the back-office rather than of this portal.
const CREATOR_PATHS = ["/bookings", "/work", "/team", "/grow", "/money", "/institutions"];
const ADMIN_PATHS = ["/reports", "/incidents", "/privacy-requests", "/moderation", "/claims", "/outside-agents", "/outside-disputes"];

function underPath(link: string, prefixes: string[]): boolean {
  const path = link.split(/[?#]/)[0];
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Where a notification link should open: a portal route (navigate in-app) or
 * an absolute URL in another Oguaa app. Anything else (e.g. a non-http scheme)
 * resolves to null and is not followed.
 */
export function resolveNotificationLink(link: string): { internal: string } | { external: string } | null {
  const value = link.trim();
  if (/^https?:\/\//i.test(value)) return { external: value };
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (underPath(value, CREATOR_PATHS)) return { external: `${CREATOR_URL}${value}` };
  if (underPath(value, ADMIN_PATHS)) return { external: `${ADMIN_URL}${value}` };
  return { internal: value };
}

/** Build a link into the creator studio. */
export function creatorUrl(path = ""): string {
  return `${CREATOR_URL}${path}`;
}
