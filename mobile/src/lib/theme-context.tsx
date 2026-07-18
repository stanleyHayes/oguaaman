import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
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

/** Screen coordinates a theme change should visually radiate from. */
export interface RevealOrigin {
  x: number;
  y: number;
}

interface ThemeState {
  /** Resolved theme actually in effect. */
  theme: ThemeName;
  /** The user's stored preference (may be "system"). */
  setting: ThemeSetting;
  /**
   * Change the theme. Pass the tap's screen coordinates as `origin` to play the
   * circular-reveal transition (matching the web toggle); omit it for an
   * instant switch.
   */
  setTheme: (v: ThemeSetting, origin?: RevealOrigin) => void;
  palette: Palette;
  /** Alias of `palette` so call sites keep reading `C.paper` etc. */
  C: Palette;
}

const Ctx = createContext<ThemeState | null>(null);

function resolve(setting: ThemeSetting, system: string | null | undefined): ThemeName {
  return setting === "system" ? (system === "dark" ? "dark" : "light") : setting;
}

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

  // The theme swaps instantly — no screen-covering circle. The old reveal grew a
  // solid incoming-background circle over everything (a dark-green flood when
  // switching to dark), making every element vanish then reappear. Instead the
  // whole app gently fades + settles in OVER the new background, so the new theme
  // "develops in" with nothing ever disappearing. (A true circular content
  // reveal isn't feasible in RN without heavy view snapshotting/masking.)
  // origin is accepted for call-site compatibility but no longer used.
  const setTheme = useCallback((v: ThemeSetting, _origin?: RevealOrigin) => {
    if (v === setting) return;
    setSetting(v);
    writeSetting(v);
  }, [setting]);

  const theme: ThemeName = resolve(setting, system);
  const palette = theme === "dark" ? DARK : LIGHT;

  // Gentle fade+scale on every theme change (and once on first paint).
  const t = useSharedValue(1);
  useEffect(() => {
    t.value = 0;
    t.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [theme, t]);
  const contentStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + t.value * 0.45,
    transform: [{ scale: 0.985 + t.value * 0.015 }],
  }));

  const value = useMemo(
    () => ({ theme, setting, setTheme, palette, C: palette }),
    [theme, setting, setTheme, palette],
  );
  return (
    <Ctx.Provider value={value}>
      <View style={[styles.fill, { backgroundColor: palette.paper }]}>
        <Animated.View style={[styles.fill, contentStyle]}>{children}</Animated.View>
      </View>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

export function useTheme(): ThemeState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
