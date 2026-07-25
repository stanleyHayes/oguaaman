import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { useTheme } from "@/lib/theme-context";
import { ON_GREEN, S, withAlpha, type Palette } from "@/theme";

const AMENITIES = [
  { label: "Water", mark: "◒" }, { label: "Water tank", mark: "◓" }, { label: "Wi-Fi", mark: "⌁" }, { label: "Parking", mark: "P" },
  { label: "Air conditioning", mark: "❄" }, { label: "Ceiling fans", mark: "✣" }, { label: "Kitchen", mark: "◫" }, { label: "Private bathroom", mark: "◉" },
  { label: "Hot water", mark: "♨" }, { label: "Prepaid electricity", mark: "ϟ" }, { label: "Gated compound", mark: "▥" }, { label: "Security", mark: "◇" },
  { label: "Backup power", mark: "↯" }, { label: "Laundry", mark: "◎" }, { label: "Courtyard", mark: "□" }, { label: "Veranda", mark: "⌂" },
  { label: "Accessible", mark: "↗" }, { label: "Swimming pool", mark: "≈" }, { label: "Sea view", mark: "≋" }, { label: "Housekeeping", mark: "✦" },
] as const;

export function AmenitiesPicker({ value, onChange }: Readonly<{ value: string[]; onChange: (value: string[]) => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => styles(C), [C]);
  function has(label: string) { return value.some((item) => item.toLowerCase() === label.toLowerCase()); }
  function toggle(label: string) { onChange(has(label) ? value.filter((item) => item.toLowerCase() !== label.toLowerCase()) : [...value, label]); }
  return <View style={s.wrap}><View style={s.heading}><View style={{ flex: 1 }}><Text style={s.title}>WHAT DOES THIS PLACE INCLUDE?</Text><Text style={s.intro}>Select everything guests or tenants can reliably expect.</Text></View><Text style={s.count}>{value.length} SELECTED</Text></View><View style={s.grid}>{AMENITIES.map((amenity) => {
    const selected = has(amenity.label);
    return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={amenity.label} onPress={() => toggle(amenity.label)} style={[s.card, selected && s.cardOn]}><Text style={s.watermark}>{amenity.mark}</Text><View style={[s.icon, selected && s.iconOn]}><Text style={[s.iconText, selected && s.iconTextOn]}>{amenity.mark}</Text></View>{selected && <Text style={s.check}>✓</Text>}<Text style={[s.label, selected && s.labelOn]}>{amenity.label}</Text></Pressable>;
  })}</View></View>;
}

export function normalizeAmenities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const aliases: Record<string, string> = { kitchenette: "Kitchen", "private washroom": "Private bathroom", "prepaid meter": "Prepaid electricity", "walled yard": "Gated compound" };
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => aliases[item.toLowerCase()] ?? item))];
}

const styles = (C: Palette) => StyleSheet.create({
  wrap: { marginTop: 14 }, heading: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 11 },
  title: { color: C.ink, fontSize: 12, letterSpacing: 1.05, ...S(700) }, intro: { marginTop: 4, color: C.inkFaint, fontSize: 11.5, lineHeight: 17 },
  count: { overflow: "hidden", borderRadius: 8, backgroundColor: withAlpha(C.green, 0.08), color: C.greenText, paddingHorizontal: 8, paddingVertical: 5, fontSize: 9, ...S(700) },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { position: "relative", overflow: "hidden", flexBasis: "47%", flexGrow: 1, minHeight: 86, justifyContent: "space-between", borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.paper, padding: 10 },
  watermark: { position: "absolute", right: 1, bottom: -18, color: C.ink, opacity: 0.05, fontSize: 58, ...S(700) },
  cardOn: { borderColor: C.green, backgroundColor: withAlpha(C.green, 0.08) },
  icon: { width: 31, height: 31, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: C.goldTint14 }, iconOn: { backgroundColor: C.green },
  iconText: { color: C.goldText, fontSize: 11, ...S(700) }, iconTextOn: { color: ON_GREEN },
  check: { position: "absolute", right: 9, top: 8, color: C.greenText, fontSize: 13, ...S(700) },
  label: { marginTop: 8, color: C.ink, fontSize: 12, lineHeight: 16, ...S(600) }, labelOn: { color: C.greenText, ...S(700) },
});
