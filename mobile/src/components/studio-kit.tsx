import { useMemo } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { T as Text } from "@/components/typography";
import { S, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";

/*
 * Studio kit — shared primitives for the Creator Studio dashboards (Overview,
 * Money, Grow, My Work). Mirrors the web creator app's MetricCard + Pill +
 * money/date formatters, re-cut for React Native and the themeable palette.
 * Only the studio dashboard screens import this; the tool screens keep their
 * own form idiom.
 */

// ── Money + date formatting (Hermes-safe; no Intl locale dependency) ──

/** Pesewas → "GH₵ 50" (money travels as subunits across the API). Trims a
 *  trailing .00 and any single trailing zero, matching the web `cedis`. */
export function cedis(pesewas?: number): string {
  const value = (pesewas ?? 0) / 100;
  const fixed = (Math.round(value * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
  const [intPart, decPart] = fixed.split(".");
  const grouped = (intPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `GH₵ ${decPart ? `${grouped}.${decPart}` : grouped}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO / RFC3339 → "3 Jul 2026". Empty input renders an em dash. */
export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// ── Metric card ──

export type MetricTone = "green" | "teal" | "gold" | "clay" | "maroon" | "ink";

const TONE_ACCENT: Record<MetricTone, (C: Palette) => string> = {
  green: (C) => C.greenText,
  teal: (C) => C.teal,
  gold: (C) => C.goldBrand,
  clay: (C) => C.clayText,
  maroon: (C) => C.maroonText,
  ink: (C) => C.greenSlate,
};

/**
 * KPI metric card — the mobile cut of creator/src/components/metric-card.tsx:
 * an accent left border over a soft accent tint, a rounded icon chip (a text
 * glyph, matching the app's no-icon-font idiom), a bold value, a muted label,
 * and an optional accent sub-line. When `href` is set the whole card taps
 * through to that route. Cards flex to ~two per row; pass `style` (e.g.
 * `{ flexBasis: "100%" }`) to override the slot width.
 */
export function MetricCard({
  label,
  value,
  glyph,
  tone = "green",
  sub,
  href,
  style,
}: Readonly<{
  label: string;
  value: string | number;
  glyph: string;
  tone?: MetricTone;
  sub?: string;
  href?: string;
  style?: StyleProp<ViewStyle>;
}>) {
  const { C } = useTheme();
  const accent = TONE_ACCENT[tone](C);
  const s = useMemo(() => makeStyles(C), [C]);

  const card = (
    <View style={[s.card, { borderLeftColor: accent, backgroundColor: withAlpha(accent, 0.05) }]}>
      <View style={s.cardTop}>
        <View style={[s.iconChip, { backgroundColor: withAlpha(accent, 0.12) }]}>
          <Text style={[s.iconGlyph, { color: accent }]}>{glyph}</Text>
        </View>
        {href ? <Text style={s.arrow}>↗</Text> : null}
      </View>
      <Text style={s.value} numberOfLines={1}>{value}</Text>
      <Text style={s.label} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={[s.sub, { color: accent }]} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );

  return (
    <View style={[s.slot, style]}>
      {href ? <Pressable onPress={() => router.push(href as never)} style={s.fill}>{card}</Pressable> : card}
    </View>
  );
}

// ── Payment status pill (tickets / subscriptions / pledges / promotions) ──

export function PayPill({ status }: Readonly<{ status: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const tone =
    status === "success"
      ? { bg: withAlpha(C.green, 0.1), color: C.greenText }
      : status === "pending"
        ? { bg: withAlpha(C.gold, 0.16), color: C.goldText }
        : { bg: withAlpha(C.maroon, 0.1), color: C.maroonText };
  return (
    <View style={[s.pill, { backgroundColor: tone.bg }]}>
      <Text style={[s.pillText, { color: tone.color }]}>{status}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  slot: { flexBasis: "47%", flexGrow: 1, minWidth: 150 },
  fill: { flex: 1 },
  card: {
    flex: 1,
    borderWidth: 1, borderColor: C.sand, borderLeftWidth: 3, borderRadius: 16, padding: 14,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  iconChip: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  iconGlyph: { fontSize: 16, fontWeight: "700" },
  arrow: { color: C.inkFaint, fontSize: 13, fontWeight: "700", opacity: 0.5 },
  value: { ...S(700), fontSize: 21, color: C.ink },
  label: { color: C.inkFaint, fontSize: 11, marginTop: 2 },
  sub: { fontSize: 10, fontWeight: "700", marginTop: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
  pillText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
});
