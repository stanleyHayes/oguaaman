// Shared helpers for paid advertising on the portal (spec §3): money and
// number formatting, the per-session frequency cap, the weighted pick, dates
// in Africa/Accra, status labels and the human copy for API error codes.
// Kept free of React so pages and components can share it.
import { cld } from "./cloudinary";
import { apiErrorCode, type ApiError } from "./api";
import type { AdCategory, AdFormat, AdPlacementSlug, AdSlateAd, AdStatus } from "./types";

// ── Placements ───────────────────────────────────────────────────────────────

/** The fixed placements and their creative format (spec §3.1). */
export const PLACEMENT_FORMAT: Record<AdPlacementSlug, AdFormat> = {
  "portal-home-banner": "banner",
  "portal-feed-card": "card",
  "portal-article-rect": "rect",
  "marketing-card": "card",
  "app-card": "card",
};

/** Plain-language "where it runs" for each placement, used on the rate card and in the wizard. */
export const PLACEMENT_WHERE: Record<AdPlacementSlug, string> = {
  "portal-home-banner": "Across the top of the Oguaa home page, just under the opening picture.",
  "portal-feed-card": "In the news and events lists, after the fourth story or event.",
  "portal-article-rect": "Beside every news article on wide screens, and under the sources on phones.",
  "marketing-card": "On oguaaman.com, between the town's headlines and its campaigns.",
  "app-card": "In the Oguaa app, on the home screen and in the news list.",
};

/** Creative sizes per format, in CSS pixels (uploads should be at least this size). */
export const FORMAT_SIZES: Record<AdFormat, string> = {
  banner: "728 × 90 for desktop and 320 × 100 for phones",
  card: "1200 × 628",
  rect: "300 × 250",
};

/** Text limits on a card creative (spec §3.1). */
export const AD_LIMITS = { headline: 60, body: 90, alt: 125, landingUrl: 2048 } as const;

/**
 * A Cloudinary creative at its forced aspect: c_fill at twice the CSS size
 * (spec §3.1). Non-Cloudinary URLs pass through unchanged.
 */
export function adImage(url: string | undefined, w: number, h: number): string | undefined {
  return cld(url, `c_fill,w_${w * 2},h_${h * 2},f_auto,q_auto`);
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** "GH₵ 1,080.00" from integer pesewas. */
export function formatGhs(pesewas: number, decimals = 2): string {
  return `GH₵ ${(pesewas / 100).toLocaleString("en-GH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** "12,000" — counts, impressions and views. */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-GH");
}

/** Basis points as a percentage: 2000 → "20%", 1250 → "12.5%". */
export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}%`;
}

// ── Dates (Africa/Accra is UTC+0 all year) ───────────────────────────────────

/** Today in Accra as YYYY-MM-DD. */
export function todayAccra(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A YYYY-MM-DD date moved by `n` days. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days from `from` to `to` inclusive (0 when `to` is before `from`). */
export function daysInclusive(from: string, to: string): number {
  if (!from || !to) return 0;
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.round(ms / 86_400_000) + 1;
}

/** "10 Oct" (or "10 Oct 2027" when not this year) from YYYY-MM-DD. */
export function shortDate(date: string, now: Date = new Date()): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric", timeZone: "UTC" });
}

// ── Session frequency cap + weighted pick (spec §3.9) ────────────────────────

const SEEN_KEY = "oguaa.ads.seen";
/** A campaign is skipped after it has rendered this many times in one session. */
export const SESSION_CAP = 3;

function readSeen(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Count one render of a campaign this session. Never sent to the server. */
export function markAdSeen(id: string): void {
  try {
    const seen = readSeen();
    seen[id] = (seen[id] ?? 0) + 1;
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Storage blocked: the cap simply does not apply.
  }
}

/** Pick one ad by weight, skipping campaigns already shown SESSION_CAP times. */
export function pickAd(ads: readonly AdSlateAd[], random: () => number = Math.random): AdSlateAd | null {
  const seen = readSeen();
  const pool = ads.filter((a) => a.weight > 0 && (seen[a.id] ?? 0) < SESSION_CAP);
  const total = pool.reduce((sum, a) => sum + a.weight, 0);
  if (total <= 0) return null;
  let roll = random() * total;
  for (const ad of pool) {
    roll -= ad.weight;
    if (roll < 0) return ad;
  }
  return pool.at(-1) ?? null;
}

// ── Reserved space (no layout shift) ────────────────────────────────────────

const FILL_KEY = "oguaa.ads.fill.";

/**
 * Whether this placement showed an ad earlier in the session. A slot that did
 * keeps its frame's space while the next slate loads, instead of pushing the
 * page down when the ad arrives. Read once, in a lazy state initialiser.
 */
export function adFillExpected(placement: AdPlacementSlug): boolean {
  try {
    return sessionStorage.getItem(FILL_KEY + placement) === "1";
  } catch {
    return false;
  }
}

/** Remember whether this placement had an ad to show (cleared when its slate comes back empty). */
export function rememberAdFill(placement: AdPlacementSlug, filled: boolean): void {
  try {
    if (filled) sessionStorage.setItem(FILL_KEY + placement, "1");
    else sessionStorage.removeItem(FILL_KEY + placement);
  } catch {
    // Storage blocked: the slot simply doesn't reserve space.
  }
}

/** A fresh view id for the beacon (`^[A-Za-z0-9-]{16,64}$`). */
export function newViewId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Run `fn` after first paint, when the browser is idle. Returns a cancel function. */
export function afterPaint(fn: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: 2000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 1);
  return () => window.clearTimeout(id);
}

// ── Statuses ─────────────────────────────────────────────────────────────────

export type StatusTone = "neutral" | "gold" | "green" | "teal" | "clay";

export const AD_STATUS: Record<AdStatus, { label: string; tone: StatusTone; note: string }> = {
  pending_review: { label: "In review", tone: "gold", note: "An Oguaa reviewer is checking your ad. Nothing is charged until it is approved." },
  approved: { label: "Approved · ready to pay", tone: "teal", note: "Your ad passed review. Pay before the approval expires to book your dates." },
  scheduled: { label: "Scheduled", tone: "green", note: "Paid and booked. It starts on your start date." },
  active: { label: "Running", tone: "green", note: "Your ad is live and counting viewable impressions." },
  paused: { label: "Paused", tone: "gold", note: "An Oguaa reviewer paused this ad. The dates are not extended; undelivered impressions are refunded at the end." },
  completed: { label: "Completed", tone: "neutral", note: "The campaign has ended. Any undelivered share is refunded to your original payment method." },
  rejected: { label: "Not approved", tone: "clay", note: "The reviewer could not approve this ad. You were not charged." },
  expired: { label: "Approval expired", tone: "neutral", note: "The approval ran out before payment. Submit the ad again to book new dates." },
  cancelled: { label: "Cancelled", tone: "neutral", note: "This campaign was cancelled." },
  removed: { label: "Removed", tone: "clay", note: "Oguaa removed this ad. The undelivered share is refunded." },
};

export const REFUND_REASON: Record<string, string> = {
  under_delivery: "Undelivered impressions",
  cancelled_before_start: "Cancelled before start",
  stopped_by_advertiser: "Stopped by you",
  removed: "Removed by Oguaa",
  election_blackout: "Election blackout",
  paid_after_close: "Paid after the approval closed",
  duplicate_charge: "Second payment refunded",
  manual: "Refund by Oguaa",
};

export const REFUND_STATUS: Record<string, string> = {
  requesting: "Requesting",
  pending: "On its way",
  processed: "Refunded",
  failed: "Failed, Oguaa will follow up",
  manual_check: "Being checked by Oguaa",
};

// ── Categories (spec §3.4) ───────────────────────────────────────────────────

/** Categories needing FDA registration plus ad approval. */
export const FDA_CATEGORIES = new Set(["food_drink", "health_medicine", "herbal", "cosmetics", "alcohol"]);

/** Regulators an advertiser may name, by category. */
export const CATEGORY_REGULATORS: Record<string, string[]> = {
  financial: ["SEC", "BoG", "NIC"],
  gambling: ["GamingCommission", "NLA"],
};

export const REGULATOR_LABEL: Record<string, string> = {
  SEC: "Securities and Exchange Commission (SEC)",
  BoG: "Bank of Ghana (BoG)",
  NIC: "National Insurance Commission (NIC)",
  GamingCommission: "Gaming Commission of Ghana",
  NLA: "National Lottery Authority (NLA)",
};

/** Used only when the rate card arrives without its category list. */
export const FALLBACK_CATEGORIES: AdCategory[] = [
  { slug: "general", name: "General" },
  { slug: "events", name: "Events" },
  { slug: "education", name: "Education" },
  { slug: "property", name: "Property" },
  { slug: "jobs", name: "Jobs" },
  { slug: "tourism", name: "Tourism" },
  { slug: "retail", name: "Retail" },
  { slug: "services", name: "Services" },
  { slug: "religious_events", name: "Religious events" },
  { slug: "ngo", name: "NGOs and charities" },
  { slug: "food_drink", name: "Food and drink", requires: ["fda"] },
  { slug: "health_medicine", name: "Health and medicine", requires: ["fda"] },
  { slug: "herbal", name: "Herbal products", requires: ["fda"] },
  { slug: "cosmetics", name: "Cosmetics", requires: ["fda"] },
  { slug: "financial", name: "Financial services", requires: ["licence"] },
  { slug: "government_public_service", name: "Government public service" },
];

/** Hard-blocked categories (code, not settings) and their plain names. */
export const BLOCKED_CATEGORY_NAMES: Record<string, string> = {
  alcohol: "Alcohol",
  gambling: "Gambling and betting",
  tobacco_vape: "Tobacco and vapes",
  crypto_forex: "Crypto and forex trading",
  adult: "Adult content",
  weapons: "Weapons",
  spiritual_money: "“Spiritual” money-doubling and miracle cures",
  infant_formula: "Infant formula",
  male_vitality: "Male-vitality products",
};

export function needsFda(category: string, cat?: AdCategory): boolean {
  return FDA_CATEGORIES.has(category) || Boolean(cat?.requires?.includes("fda"));
}

export function needsLicence(category: string, cat?: AdCategory): boolean {
  return category in CATEGORY_REGULATORS || Boolean(cat?.requires?.some((r) => r === "licence" || r === "regulator"));
}

// ── Errors ───────────────────────────────────────────────────────────────────

const AD_ERRORS: Record<string, string> = {
  invalid_placement: "Choose one of the listed placements.",
  invalid_dates: "Check the dates: the start must be far enough ahead for review, and the end on or after the start.",
  invalid_impressions: "Choose a number of impressions in the allowed steps.",
  below_minimum_order: "This order is below the minimum. Add impressions to reach it.",
  political_dates_outside_window: "Political ads must end before the election blackout starts.",
  district_assembly_not_allowed: "Oguaa does not accept District Assembly candidate ads.",
  inventory_unavailable: "There is not enough space left on those dates. Lower the impressions or move the dates.",
  ads_disabled: "Oguaa is not taking new ads right now.",
  political_disabled: "Oguaa is not taking political ads right now.",
  invalid_sponsor: "Check the sponsor details.",
  sponsor_name_not_allowed: "Use the sponsor's real legal name. Names such as “Concerned Citizens” or “Friends of” are not accepted.",
  citizenship_declaration_required: "Political sponsors must confirm the citizenship declaration.",
  sponsor_locked: "This sponsor is verified and can no longer be edited. Contact hello@oguaaman.com to change it.",
  invalid_creative: "Check the creative details.",
  invalid_image: "Upload the image through Oguaa so it can be reviewed and served.",
  invalid_landing_url: "The landing page must be a full https:// address on a public website.",
  ad_text_not_allowed: "Ads can't use news words such as “Breaking”, “Just in” or “Alert”.",
  content_blocked: "Something in the ad text breaks our content rules. Edit it and try again.",
  foreign_currency_not_allowed: "Show prices in Ghana cedis only. Dollar prices are not allowed.",
  category_blocked: "Oguaa does not accept ads in this category.",
  compliance_required: "This category needs its licence or approval details.",
  terms_not_accepted: "Accept the Advertising Policy and Terms of Sale to continue.",
  sponsor_kind_mismatch: "A political ad needs a political sponsor.",
  sponsor_not_found: "We couldn't find that sponsor. Choose it again.",
  not_approved: "This ad is not approved for payment yet.",
  approval_expired: "The approval has expired. Submit the ad again to book new dates.",
  already_paid: "This ad is already paid.",
  not_cancellable: "This campaign can no longer be cancelled.",
  rate_limited: "Too many tries in a short time. Wait a few minutes and try again.",
};

/** The field an API validation error names, if any. */
export function apiErrorField(err: unknown): string | undefined {
  const data = (err as ApiError | undefined)?.data as { field?: unknown } | undefined;
  return typeof data?.field === "string" ? data.field : undefined;
}

/** An extra number an ads error carries (maxAvailable, minOrderPesewas). */
export function apiErrorNumber(err: unknown, key: "maxAvailable" | "minOrderPesewas"): number | undefined {
  const data = (err as ApiError | undefined)?.data as Record<string, unknown> | undefined;
  const v = data?.[key];
  return typeof v === "number" ? v : undefined;
}

/** latestEndDate on a political-window error. */
export function apiErrorLatestEnd(err: unknown): string | undefined {
  const data = (err as ApiError | undefined)?.data as Record<string, unknown> | undefined;
  return typeof data?.latestEndDate === "string" && data.latestEndDate ? data.latestEndDate : undefined;
}

/** A human message for an ads API failure: the server's message first, then our copy. */
export function adErrorMessage(err: unknown, fallback = "We couldn't do that. Try again."): string {
  const message = (err as ApiError | undefined)?.data?.message;
  if (typeof message === "string" && message) return message;
  const code = apiErrorCode(err);
  if (code && AD_ERRORS[code]) return AD_ERRORS[code];
  return err instanceof Error && err.message && err.message !== "Request failed" ? err.message : fallback;
}
