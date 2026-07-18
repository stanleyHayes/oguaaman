// Where the marketing site's calls-to-action point. The portal is a SEPARATE
// app (frontend/) — the web equivalent of the mobile app that Cape Coasters use.
// Override at build time with VITE_PORTAL_URL / VITE_IOS_URL / VITE_ANDROID_URL.

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

  return "http://localhost:3000";
}

export const PORTAL_URL = resolvePortalUrl();

/** "Open the web app" — the portal home. */
export const PORTAL_APP_URL = PORTAL_URL;
/** Deep link into the portal's sign-in. */
export const PORTAL_JOIN_URL = `${PORTAL_URL}/signin`;

/** Store links (placeholders until the apps are published). */
export const IOS_URL = import.meta.env.VITE_IOS_URL ?? "#";
export const ANDROID_URL = import.meta.env.VITE_ANDROID_URL ?? "#";

/** Contact / social. */
export const CONTACT_EMAIL = "hello@oguaa.gh";
