import { useState } from "react";
import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { Link, router } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { C, serif, initials } from "@/theme";
import { Loading, ErrorView, Pill, Thumb } from "@/ui";
import { PressScale, StaggerIn } from "@/components/anim";

// Genre filter chips (client-side filtering, like the web directory).
function GenreChips({ active, onPick }: Readonly<{ active: string; onPick: (g: string) => void }>) {
  const { data } = useApi<string[]>(() => api.genres(), "genres");
  const genres = data ?? [];
  if (genres.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {["All", ...genres].map((g) => {
        const on = active === g || (g === "All" && !active);
        return (
          <Pressable key={g} onPress={() => onPick(g === "All" ? "" : g)} style={[s.genreChip, on && s.genreChipOn]}>
            <Text style={[s.genreChipText, on && s.genreChipTextOn]}>{g}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function Music() {
  const { data, error, loading } = useApi<Listing[]>(() => api.artists(), "artists");
  const [genre, setGenre] = useState("");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const shown = genre ? data.filter((a) => (a.details.genres ?? []).includes(genre)) : data;

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
      <Text style={s.lede}>Cape Coast’s artists and the rotating spotlight. We link out to streaming — no audio is hosted.</Text>
      <PressScale onPress={() => router.push("/music/the-oguaa-sound" as never)} style={s.soundCard}>
        <Text style={s.soundKicker}>THE OGUAA SOUND</Text>
        <Text style={s.soundTitle}>Where highlife learned to swim ›</Text>
        <Text style={s.soundSub}>The grandfathers of the sound — C.K. Mann, Ebo Taylor, and the osode wave.</Text>
      </PressScale>
      <GenreChips active={genre} onPick={setGenre} />
      {shown.length === 0 && <Text style={s.empty}>No artists in this genre yet.</Text>}
      {shown.map((a, i) => (
        <StaggerIn key={a.id} index={i}>
          <Link href={`/music/${a.slug}`} asChild>
            <Pressable style={s.card}>
            <Thumb
              seed={a.slug}
              src={a.coverImageUrl}
              label={initials(a.details.actName ?? a.title)}
              style={s.thumb}
              labelStyle={s.init}
            />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={s.name}>{a.details.actName ?? a.title}</Text>
                {a.details.spotlight && <Pill label="Spotlight" color={C.cream} bg={C.clay} border={C.clay} />}
              </View>
              <Text style={s.genre}>{(a.details.genres ?? []).join(" · ")}</Text>
              <Text style={s.bio} numberOfLines={2}>{a.details.bio}</Text>
            </View>
            </Pressable>
          </Link>
        </StaggerIn>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  lede: { color: C.inkMuted, fontSize: 14, lineHeight: 20 },
  empty: { color: C.inkFaint, fontStyle: "italic", textAlign: "center", marginTop: 20 },
  soundCard: { backgroundColor: C.green900, borderRadius: 14, padding: 16 },
  soundKicker: { color: C.gold, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  soundTitle: { color: C.cream, fontFamily: serif, fontSize: 20, fontWeight: "700", marginTop: 4 },
  soundSub: { color: "rgba(246,241,231,0.75)", fontSize: 13, lineHeight: 19, marginTop: 4 },
  genreChip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  genreChipOn: { backgroundColor: C.clay, borderColor: C.clay },
  genreChipText: { color: C.inkMuted, fontSize: 13, fontWeight: "600" },
  genreChipTextOn: { color: C.cream },
  card: { flexDirection: "row", gap: 12, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 12 },
  thumb: { width: 64, height: 64, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  init: { color: C.cream, fontFamily: serif, fontSize: 22, fontWeight: "700" },
  name: { fontFamily: serif, fontSize: 19, fontWeight: "700", color: C.ink },
  genre: { color: C.goldText, fontSize: 12, marginTop: 1 },
  bio: { color: C.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
});
