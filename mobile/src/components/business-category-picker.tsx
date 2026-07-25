import { Pressable, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { ON_GREEN, type Palette, S, withAlpha } from "@/theme";
import { useTheme } from "@/lib/theme-context";

export const BUSINESS_CATEGORIES = [
  "Food & Drink", "Hospitality & Lodging", "Retail & Shopping", "Market & Fishing",
  "Fashion & Tailoring", "Beauty & Wellness", "Craft & Textiles", "Arts & Entertainment",
  "Professional Services", "Home & Construction", "Transport & Logistics", "Technology & Media",
  "Education & Training", "Health & Pharmacy", "Finance & Insurance", "Agriculture",
  "Books & Stationery", "Community Organisation",
] as const;
const MARKS = ["♨", "⌂", "▣", "≈", "✂", "✦", "◇", "♫", "§", "⌘", "➜", "◫", "⌑", "+", "₵", "♧", "▤", "◎"] as const;

export function BusinessCategoryPicker({ value, onChange }: Readonly<{ value: string[]; onChange: (value: string[]) => void }>) {
  const { C } = useTheme();
  const s = styles(C);
  function toggle(category: string) { onChange(value.includes(category) ? value.filter((item) => item !== category) : [...value, category]); }
  return <View><Text style={s.label}>BUSINESS CATEGORIES</Text><Text style={s.hint}>Choose all that apply. Your first selection is the main category.</Text><View style={s.grid}>{BUSINESS_CATEGORIES.map((category, index) => { const selected = value.includes(category); return <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={category} onPress={() => toggle(category)} style={[s.card, selected && s.cardOn]}><Text style={s.watermark}>{MARKS[index]}</Text><Text style={[s.cardText, selected && s.cardTextOn]}>{category}</Text><View style={[s.check, selected && s.checkOn]}><Text style={[s.tick, !selected && s.tickOff]}>✓</Text></View></Pressable>; })}</View><Text style={s.summary}>{value.length ? `${value.length} selected · ${value[0]} is primary` : "Select at least one category"}</Text></View>;
}

const styles = (C: Palette) => StyleSheet.create({
  label: { color: C.ink, fontSize: 12, letterSpacing: 1.2, ...S(700), marginTop: 18 },
  hint: { color: C.inkFaint, fontSize: 12, lineHeight: 18, marginTop: 5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  card: { width: "48.5%", minHeight: 62, justifyContent: "center", borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.paper, paddingVertical: 11, paddingLeft: 12, paddingRight: 38 },
  cardOn: { borderColor: C.green, backgroundColor: withAlpha(C.green, 0.07) },
  cardText: { color: C.inkMuted, fontSize: 13, lineHeight: 17, ...S(600) },
  cardTextOn: { color: C.greenText },
  check: { position: "absolute", right: 10, top: 10, width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: C.sand, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: C.green, borderColor: C.green },
  tick: { color: ON_GREEN, fontSize: 11, ...S(700) },
  tickOff: { color: "transparent" },
  summary: { color: C.greenText, fontSize: 11, ...S(600), marginTop: 10 },
  watermark: { position: "absolute", right: 2, bottom: -14, color: C.ink, opacity: 0.055, fontSize: 48, ...S(700) },
});
