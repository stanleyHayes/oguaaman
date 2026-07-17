import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dimensions, Platform, StyleSheet, View, useColorScheme } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
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

  // Circular-reveal overlay: a full-screen circle of the *incoming* background,
  // centred on the tapped control, that scales up to cover the screen before the
  // palette actually swaps underneath it — so the new theme appears to radiate
  // from the toggle, mirroring the web app's View-Transition reveal.
  const [reveal, setReveal] = useState<{ x: number; y: number; r: number; color: string } | null>(null);
  const grow = useSharedValue(0);
  const settingRef = useRef(setting);
  settingRef.current = setting;

  const commit = useCallback((v: ThemeSetting) => {
    setSetting(v);
    writeSetting(v);
    setReveal(null);
  }, []);

  const setTheme = useCallback((v: ThemeSetting, origin?: RevealOrigin) => {
    if (v === settingRef.current) return;
    const incoming = resolve(v, system) === "dark" ? DARK : LIGHT;
    // No origin: switch instantly (programmatic callers, e.g. Settings toggles).
    if (!origin) { setSetting(v); writeSetting(v); return; }
    const { width, height } = Dimensions.get("window");
    // The header sits top-right; if a platform doesn't surface tap coords
    // (some web synthetic events), radiate from there rather than skipping the
    // animation or drawing a NaN-sized circle.
    const x = Number.isFinite(origin.x) ? origin.x : width - 32;
    const y = Number.isFinite(origin.y) ? origin.y : 48;
    const r = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 8;
    setReveal({ x, y, r, color: incoming.paper });
    grow.value = 0;
    grow.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }, (done) => {
      if (done) runOnJS(commit)(v);
    });
  }, [system, grow, commit]);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: grow.value }] }));

  const theme: ThemeName = resolve(setting, system);
  const palette = theme === "dark" ? DARK : LIGHT;
  const value = useMemo(
    () => ({ theme, setting, setTheme, palette, C: palette }),
    [theme, setting, setTheme, palette],
  );
  return (
    <Ctx.Provider value={value}>
      <View style={styles.fill}>
        {children}
        {reveal ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: reveal.x - reveal.r,
                  top: reveal.y - reveal.r,
                  width: reveal.r * 2,
                  height: reveal.r * 2,
                  borderRadius: reveal.r,
                  backgroundColor: reveal.color,
                },
                circleStyle,
              ]}
            />
          </View>
        ) : null}
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
