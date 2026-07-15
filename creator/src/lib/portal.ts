import type { Listing } from "./types";

/**
 * The community portal origin. Public listing pages, the submission form and
 * institution editors live there; the creator app links out to them.
 * In Docker the portal is published on :3000; override with VITE_PORTAL_URL.
 */
export const PORTAL = (import.meta.env.VITE_PORTAL_URL as string | undefined) ?? "http://localhost:3000";

/** Where an approved listing can be viewed on the portal (null = no public page). */
export function publicPathFor(l: Listing): string | null {
  if (l.status !== "approved") return null;
  switch (l.type) {
    case "artist": return `/music/${l.slug}`;
    case "business": return `/business/${l.slug}`;
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
