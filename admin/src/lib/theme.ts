const STORAGE_KEY = "oguaa.theme";

export type Theme = "light" | "dark";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  persistTheme(theme);
}

export function toggleTheme(): Theme {
  const next = getInitialTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
