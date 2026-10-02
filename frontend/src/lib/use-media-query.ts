import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, kept live. Server/first render reads
 * `fallback`. Use it when only ONE copy of a component may mount (an ad slot
 * that moves between columns must not fetch twice).
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : fallback);
  return useSyncExternalStore(subscribe, get, () => fallback);
}

/** "auto" when the reader has asked the system for reduced motion, else "smooth". */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined" || !window.matchMedia) return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
