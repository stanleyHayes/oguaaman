import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { S, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";

/**
 * Footer for an infinite-scroll list (drop into `ListFooterComponent`). Shows a
 * skeleton shimmer while the next page loads, a tappable "Load more" fallback while pages
 * remain (so users on short screens / with `onEndReached` misses can still
 * advance), or a quiet end-cap once everything is loaded. Theme-aware. Renders
 * nothing on an empty/single page unless `endLabel` is given.
 */
export function ListFooter({
  loadingMore,
  hasMore,
  onLoadMore,
  endLabel,
}: Readonly<{
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  /** Shown once every page is loaded; omit to render nothing at the end. */
  endLabel?: string;
}>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  if (loadingMore) {
    return (
      <View style={s.wrap}>
        <View style={s.skeletonRow}>
          <View style={s.skeletonDot} />
          <View style={s.skeletonLine} />
        </View>
        <Text style={s.hint}>Loading more…</Text>
      </View>
    );
  }
  if (hasMore) {
    return (
      <View style={s.wrap}>
        <Pressable onPress={onLoadMore} style={s.btn} accessibilityRole="button" hitSlop={8}>
          <Text style={s.btnText}>Load more</Text>
        </Pressable>
      </View>
    );
  }
  if (endLabel) {
    return (
      <View style={s.wrap}>
        <Text style={s.end}>{endLabel}</Text>
      </View>
    );
  }
  return null;
}

const makeStyles = (C: Palette) => StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: 22, paddingHorizontal: 16, gap: 8 },
  hint: { color: C.inkFaint, fontSize: 12, ...S(500) },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: 8, opacity: 0.9 },
  skeletonDot: { width: 10, height: 10, borderRadius: 3, backgroundColor: C.sand },
  skeletonLine: { width: 82, height: 10, borderRadius: 4, backgroundColor: C.sand },
  btn: { borderWidth: 1, borderColor: C.goldBorder, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 22, backgroundColor: C.cream },
  btnText: { color: C.goldText, fontSize: 13, ...S(700) },
  end: { color: C.inkFaint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", ...S(600) },
});
