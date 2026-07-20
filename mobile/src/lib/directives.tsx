import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, Vibration } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "./api";
import type { Directive, DirectiveSeverity } from "./types";
import type { Palette } from "@/theme";

/**
 * Directives context — the app-wide safety-alert channel. Mirrors the unread
 * poll in (tabs)/_layout.tsx: fetch api.directives(true) every 30s. When a NEW
 * high/critical directive id appears (one we've never buzzed for), fire the
 * built-in Vibration API — no native deps, so it works on the current binary.
 *
 * Seen ids persist the same way the auth token / language do (SecureStore on
 * native, localStorage on web), so a directive only ever buzzes once, even
 * across app restarts. The FIRST run with no stored baseline seeds silently so
 * opening the app never buzzes for notices that were already standing.
 *
 * The banner + alerts screen read `active`/`visible` from here; `dismissed` is
 * in-memory for the session (critical notices are non-dismissable in the UI).
 */

const POLL_MS = 30_000;
const SEEN_KEY = "oguaa.directives.seen";
const SEEN_CAP = 100; // keep the persisted set small (SecureStore favours < 2KB)

// The severity alert cadence: short-short-long buzz. Import { Vibration } from
// "react-native" (built-in) — expo-haptics would need a native rebuild.
const ALERT_PATTERN = [0, 300, 150, 300, 150, 500];
// A critical alert rings like a call: this pattern LOOPS (Vibration.vibrate(p,
// true)) until the person answers/dismisses. Built-in Vibration, no native dep.
const RING_PATTERN = [0, 700, 500, 700, 500];

function alerting(sev: DirectiveSeverity): boolean {
  return sev === "high" || sev === "critical";
}

// ── seen-id storage (module-level, hydrated once) ─────────────────────────────
async function loadSeen(): Promise<Set<string> | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      raw = (globalThis as { localStorage?: Storage }).localStorage?.getItem(SEEN_KEY) ?? null;
    } else {
      raw = await SecureStore.getItemAsync(SEEN_KEY);
    }
    if (raw == null) return null; // no baseline yet
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return null;
  }
}

function persistSeen(set: Set<string>) {
  // Sets preserve insertion order, so slicing the tail keeps the most recent ids.
  const raw = JSON.stringify([...set].slice(-SEEN_CAP));
  if (Platform.OS === "web") {
    (globalThis as { localStorage?: Storage }).localStorage?.setItem(SEEN_KEY, raw);
  } else {
    SecureStore.setItemAsync(SEEN_KEY, raw).catch(() => {});
  }
}

// ── shared UI helpers ─────────────────────────────────────────────────────────

/**
 * Filled-badge colours per severity — mirrors the incident palette
 * (critical=maroon, high=clay, medium=gold, low=teal) but returns a fill + a
 * legible foreground for it. Theme-safe: all values come from the active
 * palette. Gold is light, so it takes green900 text; the darker fills take cream.
 */
export function directiveFill(sev: DirectiveSeverity, C: Palette): { bg: string; fg: string } {
  switch (sev) {
    case "critical": return { bg: C.maroon, fg: C.cream };
    case "high": return { bg: C.clay, fg: C.cream };
    case "medium": return { bg: C.gold, fg: C.green900 };
    case "low": return { bg: C.teal, fg: C.cream };
  }
}

export const SEVERITY_RANK: Record<DirectiveSeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 };
export const DIRECTIVE_SEVERITY_LABEL: Record<DirectiveSeverity, string> = {
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};
export const DIRECTIVE_KIND_LABEL: Record<Directive["kind"], string> = {
  advisory: "Advisory", directive: "Directive", emergency: "Emergency",
};

/** The contract's "Active" rule, evaluated client-side against `at` (ms). */
export function isActiveAt(d: Directive, at: number): boolean {
  if (d.status !== "active") return false;
  const from = Date.parse(d.effectiveFrom);
  if (!Number.isNaN(from) && at < from) return false;
  if (d.effectiveUntil) {
    const until = Date.parse(d.effectiveUntil);
    if (!Number.isNaN(until) && at > until) return false;
  }
  return true;
}

/** Live countdown text to `until` from `now` (both ms). Null when open-ended. */
export function countdownTo(until: string | undefined, now: number): string | null {
  if (!until) return null;
  const end = Date.parse(until);
  if (Number.isNaN(end)) return null;
  let s = Math.round((end - now) / 1000);
  if (s <= 0) return "Ending now";
  const d = Math.floor(s / 86_400); s -= d * 86_400;
  const h = Math.floor(s / 3_600); s -= h * 3_600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${s}s left`;
  return `${s}s left`;
}

// ── context ───────────────────────────────────────────────────────────────────
interface DirectivesState {
  /** Currently-active directives, most-severe first (server-sorted). */
  active: Directive[];
  /** The top active directive not dismissed this session, or null. */
  visible: Directive | null;
  /** Convenience: is the alert banner currently showing something. */
  bannerVisible: boolean;
  dismiss: (id: string) => void;
  /** A CRITICAL directive that's ringing like a call (full-screen), or null. */
  ringing: Directive | null;
  /** Stop the ring (cancels the looping vibration). */
  clearRing: () => void;
}

const Ctx = createContext<DirectivesState | null>(null);

export function DirectivesProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [active, setActive] = useState<Directive[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [ringing, setRinging] = useState<Directive | null>(null);
  // null until hydrated; stays null when no baseline was ever persisted.
  const seenRef = useRef<Set<string> | null>(null);
  const hydratedRef = useRef(false);

  const maybeAlert = useCallback((list: Directive[]) => {
    if (!hydratedRef.current) return; // handled on the next tick post-hydration
    const ids = list.filter((d) => alerting(d.severity)).map((d) => d.id);
    if (seenRef.current === null) {
      // First run, no baseline — record what's already standing without buzzing.
      const baseline = new Set(ids);
      seenRef.current = baseline;
      persistSeen(baseline);
      return;
    }
    const fresh = ids.filter((id) => !seenRef.current!.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) seenRef.current.add(id);
    persistSeen(seenRef.current);
    // A fresh CRITICAL directive rings like a call (looping vibration + a
    // full-screen takeover); a high one buzzes once.
    const critical = list.find((d) => d.severity === "critical" && fresh.includes(d.id));
    if (critical) {
      setRinging(critical);
      Vibration.vibrate(RING_PATTERN, true); // repeat=true → loops until cleared
    } else {
      Vibration.vibrate(ALERT_PATTERN);
    }
  }, []);

  const clearRing = useCallback(() => {
    Vibration.cancel();
    setRinging(null);
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      seenRef.current = await loadSeen();
      hydratedRef.current = true;
      if (!alive) return;
      const tick = async () => {
        try {
          const list = await api.directives(true);
          if (!alive) return;
          setActive(list);
          maybeAlert(list);
        } catch {
          /* API down / offline — keep the last known list */
        }
      };
      await tick();
      if (!alive) return;
      timer = setInterval(tick, POLL_MS);
    })();
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [maybeAlert]);

  const dismiss = useCallback((id: string) => {
    setDismissed((cur) => {
      if (cur.has(id)) return cur;
      const next = new Set(cur);
      next.add(id);
      return next;
    });
  }, []);

  const visible = useMemo(
    () => active.find((d) => !dismissed.has(d.id)) ?? null,
    [active, dismissed],
  );

  const value = useMemo<DirectivesState>(
    () => ({ active, visible, bannerVisible: visible !== null, dismiss, ringing, clearRing }),
    [active, visible, dismiss, ringing, clearRing],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDirectives(): DirectivesState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDirectives must be used within DirectivesProvider");
  return c;
}
