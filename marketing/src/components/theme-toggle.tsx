import { useEffect, useState } from "react";
import { type Theme, getInitialTheme, setTheme } from "@/lib/theme";

function Moon({ size = 18 }: Readonly<{ size?: number }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function Sun({ size = 18 }: Readonly<{ size?: number }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

/**
 * Light/dark toggle for the marketing site — mirrors the client portal's toggle
 * (frontend/src/components/theme-toggle.tsx): a `data-theme` attribute on
 * <html>, persisted under "oguaa.theme", with a View-Transitions circular reveal
 * radiating from the button. Style it via `className` so it reads on both the
 * transparent-over-hero nav and the solid scrolled bar.
 */
export function ThemeToggle({ className = "" }: Readonly<{ className?: string }>) {
  const [theme, set] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "oguaa.theme") set((e.newValue as Theme) ?? getInitialTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={(event) => {
        const next = isDark ? "light" : "dark";
        const applyNext = () => {
          set(next);
          setTheme(next);
        };
        // Circular reveal from the toggle's centre via the View Transitions API.
        const rect = event.currentTarget.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const startVT = (document as Document & {
          startViewTransition?: (cb: () => void) => { ready: Promise<void> };
        }).startViewTransition;
        if (!startVT || reduceMotion) {
          applyNext();
          return;
        }
        const transition = startVT.call(document, applyNext);
        void transition.ready
          .then(() => {
            const max = Math.hypot(
              Math.max(x, window.innerWidth - x),
              Math.max(y, window.innerHeight - y),
            );
            document.documentElement.animate(
              { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${max}px at ${x}px ${y}px)`] },
              { duration: 450, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" },
            );
          })
          // A rapid re-toggle can skip/abort the transition — swallow the rejection.
          .catch(() => {});
      }}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${className}`}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
