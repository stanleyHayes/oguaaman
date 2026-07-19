// A tiny live-content layer for the marketing site. Every community section
// reads its data live from the app API (the same Go backend the portal uses,
// proxied at /api) — there is no client-side fallback. State inits to an empty
// list, the only update happens inside the fetch's .then guarded by a
// `cancelled` flag, and any failure leaves the list empty silently (a marketing
// page shows no errors). Sections render gracefully when their list is empty.
import { useEffect, useState } from "react";
import { Pill } from "@/components/ui";
import { PORTAL_APP_URL } from "@/config";
import { apiUrl } from "./api";

export interface Listing {
  id: string;
  type: string;
  slug: string;
  title: string;
  coverImageUrl?: string;
  tags?: string[];
  featured?: boolean;
  details?: Record<string, unknown>;
}

type PillTone = Parameters<typeof Pill>[0]["tone"];

function isListingArray(v: unknown): v is Listing[] {
  return (
    Array.isArray(v) &&
    v.every(
      (x) =>
        x != null &&
        typeof x === "object" &&
        typeof (x as Listing).title === "string" &&
        typeof (x as Listing).slug === "string",
    )
  );
}

/**
 * Read a public listings endpoint (e.g. "/api/artists") live from the API.
 * Starts empty and fills once the backend answers; on error/empty it stays
 * empty. Pass `limit` to cap how many are shown. The endpoint is the only
 * dependency, so the same hook serves every community section.
 */
export function useListings(endpoint: string, limit?: number): Listing[] {
  const [items, setItems] = useState<Listing[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl(endpoint), { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad response"))))
      .then((data: unknown) => {
        if (!cancelled && isListingArray(data)) setItems(data);
      })
      .catch(() => {
        /* stay empty silently — a marketing page shows no errors */
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  return typeof limit === "number" ? items.slice(0, limit) : items;
}

export const TYPE_LABEL: Record<string, string> = {
  event: "Event",
  business: "Business",
  artist: "Artist",
  memorial: "In memoriam",
  person: "Person",
  opportunity: "Opportunity",
  memory: "Memory",
};

export const TYPE_TONE: Record<string, NonNullable<PillTone>> = {
  event: "teal",
  business: "green",
  artist: "clay",
  memorial: "gold",
  person: "gold",
  opportunity: "teal",
  memory: "neutral",
};

// Types with their own detail page in the portal app, vs. types that only have
// a list page. Linking an event to /events/:slug would 404 — the portal has no
// per-event route — so those resolve to the list instead.
const DETAIL_PATH: Record<string, string> = {
  artist: "music",
  memorial: "memoriam",
  business: "business",
  person: "people",
};
const LIST_PATH: Record<string, string> = {
  event: "events",
  opportunity: "events",
  memory: "community",
};

/** Where a listing opens in the portal web app. */
export function portalHref(l: Pick<Listing, "type" | "slug">): string {
  if (DETAIL_PATH[l.type]) return `${PORTAL_APP_URL}/${DETAIL_PATH[l.type]}/${l.slug}`;
  if (LIST_PATH[l.type]) return `${PORTAL_APP_URL}/${LIST_PATH[l.type]}`;
  return PORTAL_APP_URL;
}

/** "2026-09-05" → "5 Sep 2026"; leaves anything unparseable untouched. */
function prettyDate(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isNaN(t)
    ? iso
    : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** A friendly one-line subtitle from a listing's details, by type. */
export function listingSubtitle(l: Listing): string {
  const d = l.details ?? {};
  const s = (k: string): string => (typeof d[k] === "string" ? (d[k] as string) : "");
  switch (l.type) {
    case "event":
      return [prettyDate(s("startsAt")), s("venue")].filter(Boolean).join(" · ") || "Cape Coast";
    case "business":
      return s("category") || s("address") || "Cape Coast";
    case "artist":
      return Array.isArray(d.genres) ? (d.genres as string[]).join(" · ") : "Cape Coast";
    case "person":
      return s("whyNotable") || s("era") || "Cape Coast";
    case "memorial":
      return s("honorific") ? `Remembered · ${s("honorific")}` : "Remembered";
    case "opportunity":
      return [s("kind"), s("deadline") && `apply by ${prettyDate(s("deadline"))}`].filter(Boolean).join(" · ") || "Opportunity";
    default:
      return "Cape Coast";
  }
}
