import { useMemo } from "react";
import { ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native";

import { T as Text } from "@/components/typography";
import { useTheme, type ThemeSetting } from "@/lib/theme-context";
import { useDirectives } from "@/lib/directives";
import { BellIcon, MoonIcon, SearchIcon, SunIcon, SystemIcon, type IconProps } from "@/components/icons";
import { ON_GREEN, type Palette, S } from "@/theme";

// The shared header action cluster — theme toggle, alerts bell (badged with the
// count of active high/critical directives), and search. Rendered on the RIGHT
// of every tab's green header (via Tabs headerRight) AND inside the home hero,
// so the same three actions sit on top of every tab. Icons are cream vector
// glyphs on the dark-green header (which stays dark in both palettes).

const ICON_SIZE = 24;

// Theme cycles System → Light → Dark → System. The icon reflects the current
// stored setting so the control shows where you are, not just that it toggles.
const THEME_NEXT: Record<ThemeSetting, ThemeSetting> = {
  system: "light",
  light: "dark",
  dark: "system",
};
const THEME_ICON: Record<ThemeSetting, (p: IconProps) => React.JSX.Element> = {
  system: SystemIcon,
  light: SunIcon,
  dark: MoonIcon,
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
  const ThemeIcon = THEME_ICON[setting];

  return (
    <View style={s.row}>
      <Pressable accessibilityRole="button"
        onPress={(e: GestureResponderEvent) =>
          setTheme(THEME_NEXT[setting], { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })
        }
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`${THEME_LABEL[setting]}. Tap to change.`}
        style={s.action}
      >
        <ThemeIcon size={ICON_SIZE} color={ON_GREEN} strokeWidth={2} />
      </Pressable>

      <Pressable accessibilityRole="button"
        onPress={() => push(ROUTES.alerts)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={urgent > 0 ? `Alerts, ${urgent} active` : "Alerts"}
        style={s.action}
      >
        <BellIcon size={ICON_SIZE} color={ON_GREEN} strokeWidth={2} />
        {urgent > 0 ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </Pressable>

      <Pressable accessibilityRole="button"
        onPress={() => push(ROUTES.search)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Search"
        style={s.action}
      >
        <SearchIcon size={ICON_SIZE} color={ON_GREEN} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 10 },
  action: { paddingHorizontal: 7, paddingVertical: 6, alignItems: "center", justifyContent: "center" },
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
  badgeText: { color: ON_GREEN, fontSize: 10, ...S(700), lineHeight: 13 },
});
