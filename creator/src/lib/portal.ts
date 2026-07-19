import type { Listing } from "./types";

/**
 * The community portal (citizen web app) origin. Public listing pages, the
 * submission form and institution editors live there; the creator app links
 * out to them. Set VITE_PORTAL_URL per environment (see .env.production /
 * .env.example) — it always wins. The fallback is the deployed citizen app so
 * links never dead-end on localhost in a real deployment; local dev overrides
 * it via .env.local (or the Vite proxy on :3000).
 */
const DEFAULT_PORTAL = "https://citizen-oguaa.vercel.app";
export const PORTAL = ((import.meta.env.VITE_PORTAL_URL as string | undefined)?.trim() || DEFAULT_PORTAL).replace(/\/+$/, "");

/** Where an approved listing can be viewed on the portal (null = no public page). */
export function publicPathFor(l: Listing): string | null {
  if (l.status !== "approved") return null;
  switch (l.type) {
    case "artist": return `/music/${l.slug}`;
    case "business": return `/business/${l.slug}`;
    case "property": return `/rent-stay/${l.slug}`;
    case "memorial": return `/memoriam/${l.slug}`;
    case "project": return `/projects/${l.slug}`;
    case "event": return `/events/${l.slug}`;
    case "person": return `/people/${l.slug}`;
    default: return null;
  }
}

export function portalUrl(path: string): string {
  return `${PORTAL}${path}`;
}
