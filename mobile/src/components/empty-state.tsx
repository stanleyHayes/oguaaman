import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { ON_GREEN, S, withAlpha, type Palette, D } from "@/theme";
import { useTheme } from "@/lib/theme-context";

/**
 * Shared empty state — a glyph inside a soft double-ring circle, a title, a
 * description, and an optional action button. `compact` renders a slim
 * left-aligned row for nested contexts (inside cards/lists). Glyphs are
 * unicode symbols, matching the tab bar's text-icon idiom (no icon font dep).
 */
export function EmptyState({
  glyph,
  title,
  body,
  actionLabel,
  onAction,
  compact = false,
}: Readonly<{
  glyph: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (compact) {
    return (
      <View style={s.compactWrap}>
        <View style={s.compactCircle}>
          <Text style={s.compactGlyph}>{glyph}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.compactTitle}>{title}</Text>
          {body ? <Text style={s.compactBody}>{body}</Text> : null}
          {actionLabel ? (
            <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
              <Text style={s.compactAction}>{actionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }
  return (
    <View style={s.wrap}>
      <View style={s.ring}>
        <View style={s.circle}>
          <Text style={s.glyph}>{glyph}</Text>
        </View>
      </View>
      <Text style={s.title}>{title}</Text>
      {body ? <Text style={s.body}>{body}</Text> : null}
      {actionLabel ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={s.btn}>
          <Text style={s.btnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 24 },
  ring: {
    padding: 10, borderRadius: 999, borderWidth: 1,
    borderColor: withAlpha(C.goldBorder, 0.25),
  },
  circle: {
    width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center",
    backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35,
  },
  glyph: { fontSize: 26, color: C.goldText },
  title: { ...S(700), fontSize: 18, color: C.ink, marginTop: 16, textAlign: "center" },
  body: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: "center", maxWidth: 300 },
  btn: { marginTop: 16, backgroundColor: C.green, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 20 },
  btnText: { color: ON_GREEN, fontSize: 13, ...S(700) },

  compactWrap: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  compactCircle: {
    width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center",
    backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35,
  },
  compactGlyph: { fontSize: 16, color: C.goldText },
  compactTitle: { color: C.ink, fontSize: 13, ...D(700) },
  compactBody: { color: C.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  compactAction: { color: C.greenText, fontSize: 12, ...S(700), marginTop: 4 },
});
