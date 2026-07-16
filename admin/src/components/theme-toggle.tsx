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
      onClick={() => {
        const next = isDark ? "light" : "dark";
        set(next);
        setTheme(next);
      }}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${className}`}
    >
      {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
