import { Pressable, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { ON_GREEN, S, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";

const GENRES = ["Highlife", "Hiplife", "Gospel", "Afrobeats", "Afrobeat", "Amapiano", "Hip-hop", "R&B / Soul", "Reggae", "Dancehall", "Jazz", "Traditional", "Fante Folk", "Asafo Music", "Brass Band", "Palm-wine", "Acoustic", "Spoken Word", "Electronic"] as const;

export function GenrePicker({ value, onChange }: Readonly<{ value: string[]; onChange: (value: string[]) => void }>) {
  const { C } = useTheme();
  const s = styles(C);
  const options = [...GENRES, ...value.filter((genre) => !GENRES.some((label) => label.toLowerCase() === genre.toLowerCase()))];
  function toggle(genre: string) {
    const selected = value.some((item) => item.toLowerCase() === genre.toLowerCase());
    onChange(selected ? value.filter((item) => item.toLowerCase() !== genre.toLowerCase()) : [...value, genre]);
  }
  return <View style={s.wrap}>
    <View style={s.head}><View style={{ flex: 1 }}><Text style={s.title}>GENRE(S)</Text><Text style={s.hint}>Select every sound that describes the artist.</Text></View><Text style={s.count}>{value.length} SELECTED</Text></View>
    <View style={s.grid}>{options.map((genre) => { const selected = value.some((item) => item.toLowerCase() === genre.toLowerCase()); return <Pressable key={genre} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggle(genre)} style={[s.card, selected && s.cardOn]}><Text style={s.watermark}>♫</Text><View style={[s.mark, selected && s.markOn]}><Text style={[s.markText, selected && s.markTextOn]}>{selected ? "✓" : genre.slice(0, 2).toUpperCase()}</Text></View><Text style={[s.label, selected && s.labelOn]}>{genre}</Text></Pressable>; })}</View>
  </View>;
}

const styles = (C: Palette) => StyleSheet.create({
  wrap: { gap: 12 }, head: { flexDirection: "row", alignItems: "flex-end", gap: 12 }, title: { color: C.ink, fontSize: 12, letterSpacing: 1.1, ...S(700) }, hint: { marginTop: 4, color: C.inkFaint, fontSize: 12, lineHeight: 17 }, count: { color: C.greenText, fontSize: 10, ...S(700) },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, card: { position: "relative", overflow: "hidden", width: "48.5%", minHeight: 58, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: C.sand, borderRadius: 11, backgroundColor: C.paper, paddingHorizontal: 10, paddingVertical: 8 }, cardOn: { borderColor: C.green, backgroundColor: C.goldTint14 }, watermark: { position: "absolute", right: 1, bottom: -18, color: C.ink, opacity: 0.045, fontSize: 54, ...S(700) }, mark: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: C.cream }, markOn: { backgroundColor: C.green }, markText: { color: C.inkFaint, fontSize: 9, ...S(700) }, markTextOn: { color: ON_GREEN }, label: { flex: 1, color: C.inkMuted, fontSize: 12, ...S(600) }, labelOn: { color: C.greenText, ...S(700) },
});
