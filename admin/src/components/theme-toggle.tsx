import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { type Theme, getInitialTheme, setTheme } from "@/lib/theme";

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
        if (!document.startViewTransition || reduceMotion) {
          applyNext();
          return;
        }
        const transition = document.startViewTransition(applyNext);
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
          .catch(() => {});
      }}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${className}`}
    >
      {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
