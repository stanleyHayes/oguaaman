import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { T as Text, TI as TextInput } from "@/components/typography";
import { ON_GREEN, S, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";

export const STREAMING_PLATFORMS = [
  { label: "Spotify", mark: "◉" }, { label: "Apple Music", mark: "♪" },
  { label: "YouTube Music", mark: "▶" }, { label: "YouTube", mark: "▷" },
  { label: "Amazon Music", mark: "a" }, { label: "Audiomack", mark: "▥" },
  { label: "Boomplay", mark: "B" }, { label: "SoundCloud", mark: "☁" },
  { label: "Bandcamp", mark: "▰" }, { label: "Deezer", mark: "▤" },
  { label: "TIDAL", mark: "◆" }, { label: "Qobuz", mark: "Q" },
  { label: "Pandora", mark: "P" }, { label: "Anghami", mark: "A" },
  { label: "JioSaavn", mark: "J" }, { label: "JOOX", mark: "JX" },
  { label: "Claro Música", mark: "C" }, { label: "iHeartRadio", mark: "♥" },
  { label: "NetEase Cloud Music", mark: "N" }, { label: "QQ Music", mark: "QQ" },
  { label: "Kugou Music", mark: "K" }, { label: "Kuwo Music", mark: "K" },
  { label: "WeSing", mark: "W" }, { label: "Mixcloud", mark: "M" },
  { label: "Beatport", mark: "b" }, { label: "Traxsource", mark: "T" },
  { label: "ReverbNation", mark: "R" }, { label: "Shazam", mark: "S" },
] as const;

export const SOCIAL_PLATFORMS = [
  { label: "Website", mark: "W" }, { label: "Instagram", mark: "IG" },
  { label: "Facebook", mark: "f" }, { label: "TikTok", mark: "TT" },
  { label: "YouTube", mark: "▶" }, { label: "X / Twitter", mark: "X" },
  { label: "LinkedIn", mark: "in" }, { label: "WhatsApp", mark: "WA" },
  { label: "Threads", mark: "@" }, { label: "Snapchat", mark: "S" },
  { label: "Pinterest", mark: "P" }, { label: "Telegram", mark: "TG" },
  { label: "Discord", mark: "D" }, { label: "Twitch", mark: "T" },
  { label: "GitHub", mark: "GH" }, { label: "Behance", mark: "Bē" },
  { label: "Dribbble", mark: "Dr" }, { label: "Google Business Profile", mark: "G" },
] as const;

export function StreamingPlatformPicker({ value, onChange, kind = "streaming" }: Readonly<{ value: string; onChange: (value: string) => void; kind?: "streaming" | "social" }>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { C } = useTheme();
  const s = styles(C);
  const platforms = kind === "social" ? SOCIAL_PLATFORMS : STREAMING_PLATFORMS;
  const selected = platforms.find((platform) => platform.label === value);
  const filtered = platforms.filter((platform) => platform.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { setOpen((current) => !current); setQuery(""); }} style={s.trigger}>
        <View style={s.mark}><Text style={s.markText}>{selected?.mark ?? (kind === "social" ? "@" : "♪")}</Text></View>
        <Text style={s.triggerText}>{selected?.label ?? (value ? `Current · ${value}` : kind === "social" ? "Choose social platform" : "Choose platform")}</Text>
        <Text style={s.chevron}>{open ? "⌃" : "⌄"}</Text>
      </Pressable>
      {open && <View style={s.menu}><View style={s.searchWrap}><Text style={s.searchIcon}>⌕</Text><TextInput autoFocus value={query} onChangeText={setQuery} placeholder={kind === "social" ? "Search social platforms…" : "Search platforms…"} placeholderTextColor={C.inkFaint} style={s.search} /></View><ScrollView style={s.options} nestedScrollEnabled keyboardShouldPersistTaps="handled">{filtered.length ? filtered.map((platform) => <Pressable accessibilityRole="button" key={platform.label} onPress={() => { onChange(platform.label); setOpen(false); setQuery(""); }} style={[s.option, platform.label === value && s.optionOn]}><View style={s.optionMark}><Text style={s.optionMarkText}>{platform.mark}</Text></View><Text style={[s.optionText, platform.label === value && s.optionTextOn]}>{platform.label}</Text>{platform.label === value && <Text style={s.tick}>✓</Text>}</Pressable>) : <Text style={s.empty}>No matching platform</Text>}</ScrollView></View>}
    </View>
  );
}

const styles = (C: Palette) => StyleSheet.create({
  trigger: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: C.sand, borderRadius: 10, backgroundColor: C.cream, paddingLeft: 12, paddingRight: 16 },
  mark: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.green },
  markText: { color: ON_GREEN, fontSize: 11, ...S(700) },
  triggerText: { flex: 1, color: C.ink, fontSize: 14, ...S(600) },
  chevron: { marginLeft: 8, marginRight: 2, color: C.inkMuted, fontSize: 18 },
  menu: { marginTop: 6, maxHeight: 420, borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.paper, overflow: "hidden" },
  searchWrap: { margin: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.sand, borderRadius: 9, backgroundColor: C.cream, paddingHorizontal: 11 },
  searchIcon: { color: C.inkFaint, fontSize: 18 },
  search: { minHeight: 42, flex: 1, marginLeft: 8, color: C.ink, fontSize: 13 },
  options: { maxHeight: 350, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sand },
  option: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.sand },
  optionOn: { backgroundColor: C.goldTint14 },
  optionMark: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: C.green },
  optionMarkText: { color: ON_GREEN, fontSize: 9, ...S(700) },
  optionText: { flex: 1, color: C.inkMuted, fontSize: 13, ...S(500) },
  optionTextOn: { color: C.ink, ...S(700) },
  tick: { color: C.greenText, ...S(700) },
  empty: { padding: 24, textAlign: "center", color: C.inkFaint, fontSize: 13 },
});
