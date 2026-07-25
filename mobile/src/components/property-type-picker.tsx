import { useMemo, type ComponentType } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { BuildingIcon, HomeIcon, StarIcon, UsersIcon, type IconProps } from "@/components/icons";
import { useTheme } from "@/lib/theme-context";
import { ON_GREEN, S, withAlpha, type Palette } from "@/theme";

export type PropertyType = "room" | "apartment" | "house" | "guesthouse" | "hostel";

const TYPES: { value: PropertyType; label: string; description: string; icon: ComponentType<IconProps> }[] = [
  { value: "room", label: "Room", description: "Private or shared room", icon: HomeIcon },
  { value: "apartment", label: "Apartment", description: "Self-contained flat", icon: BuildingIcon },
  { value: "house", label: "House", description: "Entire standalone home", icon: HomeIcon },
  { value: "guesthouse", label: "Guesthouse", description: "Managed short stay", icon: StarIcon },
  { value: "hostel", label: "Hostel", description: "Student or shared lodging", icon: UsersIcon },
];

export function PropertyTypePicker({ value, onChange }: Readonly<{ value: string; onChange: (value: PropertyType) => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => styles(C), [C]);
  return <View><Text style={s.title}>WHAT KIND OF PLACE IS IT?</Text><Text style={s.intro}>Choose the closest match so people understand the space immediately.</Text><View style={s.grid}>{TYPES.map((option) => {
    const selected = option.value === value;
    const Icon = option.icon;
    return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} key={option.value} onPress={() => onChange(option.value)} style={[s.card, selected && s.cardOn]}><View style={s.watermark}><Icon size={88} color={C.ink} strokeWidth={1.2} /></View><View style={[s.icon, selected && s.iconOn]}><Icon size={19} color={selected ? ON_GREEN : C.goldText} strokeWidth={1.8} /></View>{selected && <View style={s.check}><Text style={s.checkText}>✓</Text></View>}<Text style={[s.label, selected && s.labelOn]}>{option.label}</Text><Text style={s.description}>{option.description}</Text></Pressable>;
  })}</View></View>;
}

const styles = (C: Palette) => StyleSheet.create({
  title: { marginTop: 14, color: C.ink, fontSize: 12, letterSpacing: 1.1, ...S(700) },
  intro: { marginTop: 5, marginBottom: 11, color: C.inkFaint, fontSize: 11.5, lineHeight: 17 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { position: "relative", overflow: "hidden", flexBasis: "47%", flexGrow: 1, minHeight: 118, borderWidth: 1, borderColor: C.sand, borderRadius: 13, backgroundColor: C.paper, padding: 12 },
  watermark: { position: "absolute", right: -18, bottom: -20, opacity: 0.045 },
  cardOn: { borderColor: C.green, backgroundColor: withAlpha(C.green, 0.08) },
  icon: { width: 35, height: 35, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: C.goldTint14 },
  iconOn: { backgroundColor: C.green },
  check: { position: "absolute", right: 10, top: 10, width: 23, height: 23, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: C.green },
  checkText: { color: ON_GREEN, fontSize: 12, ...S(700) },
  label: { marginTop: 10, color: C.ink, fontSize: 14, ...S(700) },
  labelOn: { color: C.greenText },
  description: { marginTop: 3, color: C.inkFaint, fontSize: 10.5, lineHeight: 15 },
});
