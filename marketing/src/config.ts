// Where the marketing site's calls-to-action point. The portal is a SEPARATE
// app (frontend/) — the web equivalent of the mobile app that Cape Coasters use.
// Set VITE_PORTAL_URL (see .env.production / .env.example) to the citizen web
// app for each environment; it always wins. When it's absent we fall back to
// sensible defaults so "Open the app" still lands on the portal, never a dead
// link: localhost auto-detection in dev, the deployed citizen app otherwise.

/** Deployed default when no VITE_PORTAL_URL is set (updated per environment). */
const DEFAULT_PORTAL_URL = "https://oguaa-citizen.vercel.app";

function resolvePortalUrl(): string {
  const configured = import.meta.env.VITE_PORTAL_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    const { hostname, port, protocol } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      // `make dev`: marketing :5175 → portal :5173.
      // Docker/full stack: marketing :3003 → portal :3000.
      const portalPort = port === "5175" ? "5173" : "3000";
      return `${protocol}//${hostname}:${portalPort}`;
    }
  }

  return DEFAULT_PORTAL_URL;
}

export const PORTAL_URL = resolvePortalUrl();

/** Canonical/meta base for the marketing site itself (SEO). Env-driven so it
 *  tracks localhost / Vercel / the live domain; see index.html %VITE_SITE_URL%. */
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL?.trim() ||
  (typeof window !== "undefined" ? window.location.origin : "https://oguaa.vercel.app")
).replace(/\/+$/, "");

/** "Open the web app" — the portal home. */
export const PORTAL_APP_URL = PORTAL_URL;
/** Deep link into the portal's sign-in. */
export const PORTAL_JOIN_URL = `${PORTAL_URL}/signin`;

/** Store links (placeholders until the apps are published). */
export const IOS_URL = import.meta.env.VITE_IOS_URL ?? "#";
export const ANDROID_URL = import.meta.env.VITE_ANDROID_URL ?? "#";

/** Contact / social. */
export const CONTACT_EMAIL = "hello@oguaa.gh";
