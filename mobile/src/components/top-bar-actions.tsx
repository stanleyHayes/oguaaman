import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text } from "@/components/typography";
import { useTheme, type ThemeSetting } from "@/lib/theme-context";
import { useDirectives } from "@/lib/directives";
import type { Palette } from "@/theme";

// The shared header action cluster — theme toggle, alerts bell (badged with the
// count of active high/critical directives), and search. Rendered on the RIGHT
// of every tab's green header (via Tabs headerRight) AND inside the home hero,
// so the same three actions sit on top of every tab. Glyphs are cream text on
// the dark-green header (which stays dark in both palettes), matching the ☰.

// Theme cycles System → Light → Dark → System. The glyph reflects the current
// stored setting so the control shows where you are, not just that it toggles.
const THEME_NEXT: Record<ThemeSetting, ThemeSetting> = {
  system: "light",
  light: "dark",
  dark: "system",
};
const THEME_GLYPH: Record<ThemeSetting, string> = {
  system: "◐",
  light: "☀",
  dark: "☾",
};
const THEME_LABEL: Record<ThemeSetting, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

export function TopBarActions() {
  const { C, setting, setTheme } = useTheme();
  const { active } = useDirectives();
  const s = useMemo(() => makeStyles(C), [C]);

  // Active high/critical directives drive the bell badge (same poll the banner
  // and alerts screen read from — no extra network).
  const urgent = active.filter((d) => d.severity === "high" || d.severity === "critical").length;
  const badge = urgent > 9 ? "9+" : String(urgent);

  return (
    <View style={s.row}>
      <Pressable
        onPress={() => setTheme(THEME_NEXT[setting])}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`${THEME_LABEL[setting]}. Tap to change.`}
        style={s.action}
      >
        <Text style={s.glyph}>{THEME_GLYPH[setting]}</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/alerts" as never)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={urgent > 0 ? `Alerts, ${urgent} active` : "Alerts"}
        style={s.action}
      >
        <Text style={s.bellGlyph}>🔔</Text>
        {urgent > 0 ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </Pressable>

      <Pressable
        onPress={() => router.push("/search")}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Search"
        style={s.action}
      >
        <Text style={s.glyph}>⌕</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 10 },
  action: { paddingHorizontal: 7, paddingVertical: 6, alignItems: "center", justifyContent: "center" },
  glyph: { color: C.cream, fontSize: 19, fontWeight: "700" },
  // The bell is an emoji (renders its own colour, like the row icons in More);
  // sized to sit level with the cream theme/search glyphs beside it.
  bellGlyph: { fontSize: 18, lineHeight: 22 },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: C.clay,
    borderWidth: 1,
    borderColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: C.cream, fontSize: 10, fontWeight: "800", lineHeight: 13 },
});
