import { useMemo, useState } from "react";
import { route, ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { ScrollView, StyleSheet, View, Pressable } from "react-native";
import { Link } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { D, S, ON_GREEN, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, PhotoHero, Pill, Thumb } from "@/ui";
import { PressScale, StaggerIn } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import { MusicIcon } from "@/components/icons";

// Genre filter chips (client-side filtering, like the web directory).
function GenreChips({ active, onPick }: Readonly<{ active: string; onPick: (g: string) => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data } = useApi<string[]>(() => api.genres(), "genres");
  const genres = data ?? [];
  if (genres.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {["All", ...genres].map((g) => {
        const on = active === g || (g === "All" && !active);
        return (
          <Pressable accessibilityRole="button" key={g} onPress={() => onPick(g === "All" ? "" : g)} style={[s.genreChip, on && s.genreChipOn]}>
            <Text style={[s.genreChipText, on && s.genreChipTextOn]}>{g}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function Music() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, error, loading } = useApi<Listing[]>(() => api.artists(), "artists");
  const [genre, setGenre] = useState("");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const shown = genre ? data.filter((a) => (a.details.genres ?? []).includes(genre)) : data;

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }}>
      <PhotoHero
        image="/uploads/seed/fetu-flagbearer.jpg"
        tone={C.green}
        kicker="The flagship · launch deep"
        title="The Oguaa Sound"
        lede="Local artists are the most starved of a spotlight and the most motivated to share. Give a musician a real profile and they push it to their following — music goes through the door first."
      />
      <View style={{ padding: 16, gap: 14 }}>
      <PressScale onPress={() => push(ROUTES.oguaaSound)} style={s.soundCard}>
        <Text style={s.soundKicker}>THE OGUAA SOUND</Text>
        <Text style={s.soundTitle}>Where highlife learned to swim ›</Text>
        <Text style={s.soundSub}>The grandfathers of the sound — C.K. Mann, Ebo Taylor, and the osode wave.</Text>
      </PressScale>
      <GenreChips active={genre} onPick={setGenre} />
      {shown.length === 0 && <EmptyState icon={<MusicIcon size={56} color={C.inkFaint} strokeWidth={1.5} />} title="No artists in this genre yet" />}
      {shown.map((a, i) => (
        <StaggerIn key={a.id} index={i}>
          <Link href={route.music(a.slug)} asChild>
            <Pressable style={s.card} accessibilityRole="button" accessibilityLabel={a.details.actName ?? a.title}>
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
      </View>
    </ScrollView>
  );
}

// On-dark text at a bespoke alpha (no palette token at this opacity): re-alpha
// the palette's on-dark text base so light mode stays pixel-identical
// (cream-based) and dark mode keeps light-on-dark text (dark-ink-based).
const onDarkText = (C: Palette, alpha: number) => C.onDarkText85.replace(/[^,]+\)$/, `${alpha})`);

const makeStyles = (C: Palette) => StyleSheet.create({
  soundCard: { backgroundColor: C.green900, borderRadius: 14, padding: 16 },
  soundKicker: { color: C.gold, fontSize: 10, letterSpacing: 2, ...D(700) },
  soundTitle: { color: ON_GREEN, ...D(700), fontSize: 20, marginTop: 4 },
  soundSub: { color: onDarkText(C, 0.75), fontSize: 13, lineHeight: 19, marginTop: 4 },
  genreChip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  genreChipOn: { backgroundColor: C.clay, borderColor: C.clay },
  genreChipText: { color: C.inkMuted, fontSize: 13, ...S(600) },
  genreChipTextOn: { color: C.cream },
  card: { flexDirection: "row", gap: 12, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 12 },
  thumb: { width: 64, height: 64, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  init: { color: C.cream, ...S(700), fontSize: 22 },
  name: { ...S(700), fontSize: 19, color: C.ink },
  genre: { color: C.goldText, fontSize: 12, marginTop: 1 },
  bio: { color: C.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
});
