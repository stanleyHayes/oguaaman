const STORAGE_KEY = "oguaa.theme";

export type Theme = "light" | "dark";

/**
 * A theme *mode* the user can pick in Settings. "system" follows the OS and is
 * represented by the *absence* of a stored `oguaa.theme` value — the same rule
 * the index.html boot script uses (no key ⇒ prefers-color-scheme). "light" /
 * "dark" persist an explicit override. This keeps the header ThemeToggle (which
 * only writes light/dark) and the Settings segmented control in lock-step.
 */
export type ThemeMode = "light" | "dark" | "system";

/** Fired on `window` whenever the theme (or mode) changes in *this* tab, so the
 * header toggle and the Settings control stay in sync (the native `storage`
 * event only fires cross-tab). */
const THEME_EVENT = "oguaa:theme-change";

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
  notifyThemeChange();
}

export function toggleTheme(): Theme {
  const next = getInitialTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/** The concrete light/dark the OS currently prefers. */
export function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The mode the user has selected: an explicit stored override, or "system". */
export function getThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

/** The light/dark a mode resolves to right now. */
export function resolveThemeMode(mode: ThemeMode): Theme {
  return mode === "system" ? systemTheme() : mode;
}

/**
 * Apply + persist a mode. "system" clears the stored override (so the OS drives
 * the theme, matching the boot script); "light"/"dark" persist the override.
 */
export function setThemeMode(mode: ThemeMode): void {
  if (mode === "system") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    applyTheme(systemTheme());
    notifyThemeChange();
  } else {
    setTheme(mode);
  }
}

function notifyThemeChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(THEME_EVENT));
  } catch {
    // ignore (older browsers / SSR)
  }
}

/** Subscribe to same-tab theme/mode changes. Returns an unsubscribe fn. */
export function onThemeChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(THEME_EVENT, handler);
  return () => window.removeEventListener(THEME_EVENT, handler);
}
