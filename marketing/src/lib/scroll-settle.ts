// Keeps a navigation's intended scroll position once the page actually exists.
//
// <ScrollRestoration /> scrolls in the layout effect of the commit that changes
// the location. On this site that is too early: PageTransition holds the old
// page for its exit animation, and pages fetch their data in effects, so the
// destination is still a short skeleton. window.scrollTo clamps to that height
// and is never re-applied — Back from an article lands ~900 px above the story
// the reader came from, and a hash link (/festivals#rite) finds no element.
//
// This hook records each history entry's scroll position and, after a Back /
// Forward (or a navigation to a #hash), re-applies the target every frame
// while the page grows into it. It stops after SETTLE_MS, or the moment the
// reader scrolls, taps, clicks or presses a key themselves.
import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const SETTLE_MS = 3000;
const TOLERANCE_PX = 2;
const CANCEL_EVENTS = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
/** Where <ScrollRestoration /> persists positions across reloads. */
const RR_STORAGE_KEY = "react-router-scroll-positions";
/** Key react-router gives an entry with no history state (a full page load). */
const DEFAULT_KEY = "default";

type Target = { kind: "y"; y: number } | { kind: "hash"; id: string };

function storedPosition(key: string): number | undefined {
  if (key === DEFAULT_KEY) return undefined;
  try {
    const raw = sessionStorage.getItem(RR_STORAGE_KEY);
    const y = raw ? (JSON.parse(raw) as Record<string, unknown>)[key] : undefined;
    return typeof y === "number" ? y : undefined;
  } catch {
    return undefined;
  }
}

function hashId(hash: string): string | null {
  if (!hash || hash === "#") return null;
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
}

function jump(top: number) {
  // "instant": the root sets scroll-behavior: smooth, which would turn every
  // correction into a new animation.
  window.scrollTo({ top, behavior: "instant" });
}

/** Nudge the page toward the target; a no-op once it is there. */
function applyTarget(target: Target) {
  if (target.kind === "y") {
    if (Math.abs(window.scrollY - target.y) > TOLERANCE_PX) jump(target.y);
    return;
  }
  const el = document.getElementById(target.id);
  if (!el) return;
  const margin = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const offset = el.getBoundingClientRect().top - margin;
  if (Math.abs(offset) > TOLERANCE_PX) jump(window.scrollY + offset);
}

export function useSettledScroll() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const currentKey = useRef(location.key);
  const settling = useRef(false);
  const firstRun = useRef(true);

  // Remember where the reader is on the current entry.
  useEffect(() => {
    const onScroll = () => {
      if (!settling.current) positions.current.set(currentKey.current, window.scrollY);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    currentKey.current = location.key;
    const initial = firstRun.current;
    firstRun.current = false;

    const id = hashId(location.hash);
    let target: Target | null = id ? { kind: "hash", id } : null;
    if (navigationType === "POP" && !initial) {
      const y = positions.current.get(location.key) ?? storedPosition(location.key);
      if (typeof y === "number") target = { kind: "y", y };
    }
    if (!target) return;
    const goal = target;

    settling.current = true;
    const started = performance.now();
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      settling.current = false;
      for (const type of CANCEL_EVENTS) window.removeEventListener(type, stop);
    };
    const tick = () => {
      applyTarget(goal);
      if (performance.now() - started < SETTLE_MS) frame = requestAnimationFrame(tick);
      else stop();
    };
    for (const type of CANCEL_EVENTS) window.addEventListener(type, stop, { passive: true });
    tick();
    return stop;
  }, [location.key, location.hash, navigationType]);
}
