import { useEffect, useState, type RefObject } from "react";
import { AppState, Dimensions, type View } from "react-native";
import { useIsFocused } from "expo-router";

// Viewable-impression detection for ads (spec §3.9): at least `threshold` of
// the element's area on screen for `ms` continuous milliseconds, while this
// screen is focused and the app is in the foreground. The element is measured
// with measureInWindow every SAMPLE_MS, which covers scrolling in any scroll
// container (ScrollView, FlatList, Animated.ScrollView) without wiring scroll
// handlers through every screen. Sampling stops for good once the view counts.

const SAMPLE_MS = 200;

/** Share of a w×h box at (x, y) that falls inside the window, 0..1. */
export function visibleFraction(x: number, y: number, w: number, h: number, winW: number, winH: number): number {
  if (!(w > 0 && h > 0)) return 0;
  const visW = Math.max(0, Math.min(x + w, winW) - Math.max(x, 0));
  const visH = Math.max(0, Math.min(y + h, winH) - Math.max(y, 0));
  return (visW * visH) / (w * h);
}

export interface ViewabilityOptions {
  /** Share of the element that must be on screen (0..1). */
  threshold?: number;
  /** How long it must stay on screen without a break. */
  ms?: number;
  /** Start measuring only once the element is really showing. */
  enabled?: boolean;
}

/** Latches to `true` the first time the element meets the viewability rule. */
export function useViewability(ref: RefObject<View | null>, { threshold = 0.5, ms = 1000, enabled = true }: ViewabilityOptions = {}): boolean {
  const focused = useIsFocused();
  const [viewed, setViewed] = useState(false);

  useEffect(() => {
    if (!enabled || viewed || !focused) return;
    let since: number | null = null;
    let appActive = AppState.currentState === "active";
    let alive = true;
    const sub = AppState.addEventListener("change", (next) => {
      appActive = next === "active";
      if (!appActive) since = null;
    });
    const timer = setInterval(() => {
      const node = ref.current;
      if (!appActive || !node) {
        since = null;
        return;
      }
      node.measureInWindow((x, y, w, h) => {
        if (!alive) return;
        const win = Dimensions.get("window");
        if (visibleFraction(x, y, w, h, win.width, win.height) < threshold) {
          since = null;
          return;
        }
        const now = Date.now();
        since ??= now;
        if (now - since >= ms) setViewed(true);
      });
    }, SAMPLE_MS);
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, viewed, focused, threshold, ms, ref]);

  return viewed;
}
