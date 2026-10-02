// Paid advertising on the marketing site (spec section 3.9 / 9). Read-only and
// client-side only: the site is prerendered, so nothing here may run at build
// time. Every call is anonymous (`credentials: "omit"`), every failure resolves
// to "no ad", and an ad can never break the page it sits on.
import { apiUrl } from "./api";

/** The only placement the marketing site sells (spec section 3.1). */
export const MARKETING_PLACEMENT = "marketing-card";

/** Where on the site the slot sits; sent to the slate for reporting only. */
export type AdSection = "home" | "news";

/** One creative from `GET /api/ads/slate` (spec section 4.4). */
export interface SlateAd {
  id: string;
  format: "banner" | "card" | "rect";
  imageUrl: string;
  imageUrlDesktop?: string;
  imageUrlMobile?: string;
  headline?: string;
  body?: string;
  alt: string;
  /** "Ad" or "Political ad", shown verbatim. */
  chip: string;
  /** "Sponsored · {displayName}" or "Paid for by {legalName}", shown verbatim. */
  sponsorLine: string;
  political: boolean;
  electionName?: string;
  syntheticMedia?: boolean;
  clickUrl?: string;
  token: string;
  exp: number;
  weight: number;
}

export interface Slate {
  placement: string;
  /** Plain-language description of where the ad shows, e.g. "Oguaa news pages". */
  why: string;
  ads: SlateAd[];
}

const SEEN_KEY = "oguaa.ads.seen";
/** A campaign is skipped after this many renders in one browser session. */
export const SESSION_CAP = 3;

function isSlateAd(v: unknown): v is SlateAd {
  if (v == null || typeof v !== "object") return false;
  const a = v as Partial<SlateAd>;
  return (
    typeof a.id === "string" &&
    a.id.length > 0 &&
    typeof a.imageUrl === "string" &&
    /^https?:\/\//i.test(a.imageUrl) &&
    typeof a.alt === "string" &&
    typeof a.chip === "string" &&
    typeof a.sponsorLine === "string" &&
    typeof a.token === "string" &&
    typeof a.exp === "number" &&
    typeof a.weight === "number"
  );
}

/** Keep only well-formed card creatives; anything odd is dropped, not shown. */
function parseSlate(data: unknown): Slate | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as { placement?: unknown; why?: unknown; ads?: unknown };
  if (!Array.isArray(d.ads)) return null;
  return {
    placement: typeof d.placement === "string" ? d.placement : MARKETING_PLACEMENT,
    why: typeof d.why === "string" && d.why.trim() ? d.why : "Oguaa pages",
    ads: d.ads.filter(isSlateAd).filter((a) => a.format === "card"),
  };
}

/**
 * Read the slate for a placement. Resolves to an empty slate on any error so
 * callers only ever have to handle "ads" or "no ads". The request carries no
 * cookies or credentials: serving is contextual, never personal.
 */
export async function fetchSlate(placement: string, section: AdSection, signal?: AbortSignal): Promise<Slate> {
  const empty: Slate = { placement, why: "", ads: [] };
  const qs = new URLSearchParams({ placement, section, political: "0", surface: "marketing" });
  try {
    const res = await fetch(apiUrl(`/api/ads/slate?${qs.toString()}`), {
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return empty;
    return parseSlate(await res.json()) ?? empty;
  } catch {
    return empty;
  }
}

function readSeen(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Count one render of a campaign for the session frequency cap. Never sent anywhere. */
export function markSeen(id: string): void {
  try {
    const seen = readSeen();
    seen[id] = (Number(seen[id]) || 0) + 1;
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage unavailable (private mode): the cap simply doesn't apply */
  }
}

const FILL_KEY = `oguaa.ads.fill.${MARKETING_PLACEMENT}`;

/**
 * Whether the slot showed an ad earlier in this session. If it did, the slot
 * keeps the frame's space while the next slate loads instead of pushing the
 * page down when the ad arrives. Read once, in a lazy state initialiser.
 */
export function fillExpected(): boolean {
  try {
    return sessionStorage.getItem(FILL_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember whether the slot had an ad to show (cleared when the slate comes back empty). */
export function rememberFill(filled: boolean): void {
  try {
    if (filled) sessionStorage.setItem(FILL_KEY, "1");
    else sessionStorage.removeItem(FILL_KEY);
  } catch {
    /* storage unavailable: the slot simply doesn't reserve space */
  }
}

/**
 * Pick one ad by weight, skipping campaigns already rendered SESSION_CAP times
 * this session. Returns null when nothing is left, which collapses the slot.
 */
export function pickAd(ads: readonly SlateAd[], random: () => number = Math.random): SlateAd | null {
  const seen = readSeen();
  const pool = ads.filter((a) => a.weight > 0 && (Number(seen[a.id]) || 0) < SESSION_CAP);
  const total = pool.reduce((sum, a) => sum + a.weight, 0);
  if (total <= 0) return null;
  let roll = random() * total;
  for (const ad of pool) {
    roll -= ad.weight;
    if (roll < 0) return ad;
  }
  return pool.at(-1) ?? null;
}

/**
 * The click-through link. Always built against our own API (which redirects to
 * the landing page it has on record), never taken from the response, so a bad
 * slate can't turn the slot into an open link.
 */
export function clickUrl(ad: Pick<SlateAd, "id" | "token" | "exp">, placement: string): string {
  const qs = new URLSearchParams({ p: placement, t: ad.token, e: String(ad.exp) });
  return apiUrl(`/api/ads/c/${encodeURIComponent(ad.id)}?${qs.toString()}`);
}

/** A fresh id for one render's viewable impression. */
export function newViewId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}

/**
 * Report one viewable impression. Fire-and-forget: `keepalive` lets it finish
 * if the reader navigates away, `text/plain` keeps it a simple CORS request,
 * and the server always answers 204 whether or not the view was billed.
 */
export function beacon(ad: Pick<SlateAd, "id" | "token" | "exp">, placement: string, viewId: string): void {
  try {
    void fetch(apiUrl("/api/ads/v"), {
      method: "POST",
      keepalive: true,
      credentials: "omit",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ c: ad.id, p: placement, v: viewId, t: ad.token, e: ad.exp }),
    }).catch(() => {
      /* a lost beacon is an unbilled view, never an error */
    });
  } catch {
    /* fetch unavailable */
  }
}
