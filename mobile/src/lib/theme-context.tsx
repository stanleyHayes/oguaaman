import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { DARK, LIGHT, type Palette, type ThemeName } from "@/theme";

/**
 * Theme state for the mobile app (Phase D of the dark-theme rollout). Mirrors
 * the LanguageProvider pattern in lib/i18n.tsx: a persisted manual override
 * ("light" | "dark") with an in-memory sync cache, hydrated once at startup.
 * Resolution: stored override wins, else the OS scheme, else "light".
 *
 * Components read the active palette with:
 *   const { C } = useTheme();   // C follows the theme — zero JSX churn
 */

/** What the user picked: an explicit palette, or follow the OS. */
export type ThemeSetting = ThemeName | "system";

const KEY = "oguaa.theme";
let mem: ThemeSetting = "system";

function isSetting(v: string | null | undefined): v is ThemeSetting {
  return v === "light" || v === "dark" || v === "system";
}

function readSetting(): ThemeSetting {
  if (Platform.OS === "web") {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    const v = ls?.getItem(KEY);
    if (isSetting(v)) return v;
  }
  return mem;
}

// Persist the choice: localStorage on web, the encrypted store on native (the
// same mechanism the auth token and language use, so it survives app restarts).
function writeSetting(v: ThemeSetting) {
  mem = v;
  if (Platform.OS === "web") {
    (globalThis as { localStorage?: Storage }).localStorage?.setItem(KEY, v);
  } else {
    SecureStore.setItemAsync(KEY, v).catch(() => {});
  }
}

interface ThemeState {
  /** Resolved theme actually in effect. */
  theme: ThemeName;
  /** The user's stored preference (may be "system"). */
  setting: ThemeSetting;
  setTheme: (v: ThemeSetting) => void;
  palette: Palette;
  /** Alias of `palette` so call sites keep reading `C.paper` etc. */
  C: Palette;
}

const Ctx = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const system = useColorScheme();
  const [setting, setSetting] = useState<ThemeSetting>(() => readSetting());
  // On native, hydrate the persisted choice once at startup.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let alive = true;
    SecureStore.getItemAsync(KEY)
      .then((v) => { if (alive && isSetting(v)) { mem = v; setSetting(v); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const setTheme = useCallback((v: ThemeSetting) => {
    setSetting(v);
    writeSetting(v);
  }, []);
  const theme: ThemeName = setting === "system" ? (system === "dark" ? "dark" : "light") : setting;
  const palette = theme === "dark" ? DARK : LIGHT;
  const value = useMemo(
    () => ({ theme, setting, setTheme, palette, C: palette }),
    [theme, setting, setTheme, palette],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
