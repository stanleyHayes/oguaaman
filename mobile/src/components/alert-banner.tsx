import { useEffect, useMemo, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { T as Text } from "@/components/typography";
import { S, withAlpha, type Palette, D } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { ArrowRightIcon, BellIcon, CloseIcon } from "@/components/icons";
import { useDirectives, directiveFill, countdownTo, DIRECTIVE_KIND_LABEL, DIRECTIVE_SEVERITY_LABEL } from "@/lib/directives";

/**
 * App-wide safety banner — the top active directive, rendered sticky above the
 * tab navigator. Filled in the severity colour (mirrors the incident palette),
 * with the issuer, the action to take, and a live countdown to when it lifts.
 * Critical notices are non-dismissable; everything else can be dismissed for the
 * session. Tapping the banner opens the full alerts screen. Renders nothing when
 * there is no active, undismissed directive (so the layout is untouched).
 */
export function AlertBanner() {
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const { visible, dismiss } = useDirectives();
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second so the countdown stays live while a banner is showing.
  useEffect(() => {
    if (!visible?.effectiveUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [visible?.effectiveUntil]);

  const s = useMemo(() => makeStyles(C), [C]);
  const fill = useMemo(() => (visible ? directiveFill(visible.severity, C) : null), [visible, C]);

  if (!visible || !fill) return null;

  const { bg, fg } = fill;
  const dismissable = visible.severity !== "critical";
  const countdown = countdownTo(visible.effectiveUntil, now);
  const meta = [visible.issuedByName, visible.area].filter(Boolean).join(" · ");

  return (
    <View style={{ backgroundColor: bg, paddingTop: insets.top }}>
      {/* Gold (medium) is a light fill, so the status-bar icons flip dark; the
          darker fills keep the app's light icons. Overrides the root while shown. */}
      <StatusBar style={visible.severity === "medium" ? "dark" : "light"} />
      <Pressable        onPress={() => push(ROUTES.alerts)}
        accessibilityRole="button"
        accessibilityLabel={`Safety ${DIRECTIVE_KIND_LABEL[visible.kind]}: ${visible.title}. Open alerts.`}
        style={s.body}
      >
        <View style={s.topRow}>
          <View style={s.kickerRow}>
            <View style={[s.dot, { backgroundColor: fg }]} />
            <Text style={[s.kicker, { color: fg }]}>
              {DIRECTIVE_KIND_LABEL[visible.kind]} · {DIRECTIVE_SEVERITY_LABEL[visible.severity]}
            </Text>
          </View>
          {dismissable ? (
            <Pressable              onPress={() => dismiss(visible.id)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Dismiss alert"
              style={s.dismiss}
            >
              <CloseIcon size={14} color={fg} strokeWidth={2.5} />
            </Pressable>
          ) : (
            <BellIcon size={15} color={fg} strokeWidth={2} />
          )}
        </View>

        <Text style={[s.title, { color: fg }]} numberOfLines={2}>{visible.title}</Text>

        {visible.action ? (
          <View style={[s.actionChip, { backgroundColor: withAlpha(fg, 0.16) }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ArrowRightIcon size={12} color={fg} strokeWidth={2.5} />
              <Text style={[s.actionText, { color: fg }]} numberOfLines={2}>{visible.action}</Text>
            </View>
          </View>
        ) : null}

        <View style={s.metaRow}>
          <Text style={[s.meta, { color: fg }]} numberOfLines={1}>{meta}</Text>
          <Text style={[s.meta, { color: fg }]}>{countdown ?? "Ongoing"}</Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Text style={[s.viewAll, { color: fg }]}>View all alerts</Text>
          <ArrowRightIcon size={12} color={fg} strokeWidth={2.5} />
        </View>
      </Pressable>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 6 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  kicker: { fontSize: 10, letterSpacing: 1.5, ...D(700), textTransform: "uppercase" },
  dismiss: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  title: { ...S(700), fontSize: 16, lineHeight: 21 },
  actionChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start", maxWidth: "100%" },
  actionText: { fontSize: 13, ...S(700), lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  meta: { fontSize: 12, opacity: 0.85, flexShrink: 1 },
  viewAll: { fontSize: 12, ...S(700), opacity: 0.9, marginTop: 1 },
});
