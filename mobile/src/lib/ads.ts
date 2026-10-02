import type { AdCreative } from "./types";

// Client-side ad selection (spec §3.9). The server returns a paced slate; the
// app picks one ad by weight and caps how often a campaign repeats. The cap
// lives in memory for this app session only and is never sent anywhere.

/** A campaign is skipped once it has been shown this many times this session. */
export const SESSION_CAP = 3;

const seen = new Map<string, number>();

/** Picks one ad by weight, skipping campaigns already shown SESSION_CAP times. */
export function pickAd(ads: readonly AdCreative[], random: () => number = Math.random): AdCreative | null {
  const pool = ads.filter((a) => (seen.get(a.id) ?? 0) < SESSION_CAP);
  if (pool.length === 0) return null;
  const weights = pool.map((a) => (Number.isFinite(a.weight) && a.weight > 0 ? a.weight : 0));
  const total = weights.reduce((sum, w) => sum + w, 0);
  // All weights zero (or missing): fall back to an even pick.
  if (total <= 0) return pool[Math.floor(random() * pool.length)] ?? null;
  let roll = random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll < 0) return pool[i];
  }
  return pool.at(-1) ?? null;
}

/** Records that a campaign was rendered once more this session. */
export function markShown(id: string): void {
  seen.set(id, (seen.get(id) ?? 0) + 1);
}

/**
 * A fresh id for one rendered ad (the beacon's `v`, 16–64 of [A-Za-z0-9-]).
 * Uses the platform's crypto.randomUUID where it exists; otherwise a v4-shaped
 * id from Math.random, which is enough for de-duplicating a view.
 */
export function newViewId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      /* fall through to the local id */
    }
  }
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}
