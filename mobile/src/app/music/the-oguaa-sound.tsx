import { useMemo } from "react";
import { Image, ScrollView, StyleSheet, View, Pressable } from "react-native";
import { Stack, router } from "expo-router";
import { T as Text } from "@/components/typography";
import { api, mediaUrl } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { D, S, ON_GREEN, initials, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Thumb } from "@/ui";

// The long-read behind the Music section (fact-checked, agent_plan.md §1.4):
// Cape Coast's place in the birth of highlife, and the grandfathers of the sound.

const STORY: { h?: string; p: string }[] = [
  { p: "Before the beat had a name, Cape Coast had orchestras. In the 1920s and 30s the town's dance bands — the Cape Coast Light Orchestra, the 'Sugar Babies' — folded brass, sea shanties and Fante rhythm into something new. That something became highlife." },
  { h: "The osode wave", p: "Out on the water, the fishermen kept their own time — osode, the rolling coastal rhythm sung to the pull of the nets. It stayed a working song until C.K. Mann, born in Cape Coast in 1936, electrified it and carried the sea into the dancehall. He passed in 2018; the rhythm did not." },
  { h: "The grandfathers", p: "Ebo Taylor — of Saltpond, up the same coast — wired highlife to Afro-funk and produced a generation: Pat Thomas, Jewel Ackah, Papa Yankson, and C.K. Mann himself. He worked until the very end, passing on 7 February 2026 at ninety. Between these two grandfathers runs the whole Oguaa Sound." },
  { h: "The pipeline", p: "The sound still flows: the University of Cape Coast's Department of Music and Dance (est. 1975), the schools' brass bands, and the chapel choirs keep feeding players into the tradition. The artists in this directory are its newest verse." },
  { p: "We link out to Audiomack, Boomplay, YouTube and Spotify — Oguaa hosts no audio. The music belongs to its makers; we just point the way home." },
];

export default function OguaaSound() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data } = useApi<Listing[]>(() => api.musicLegacy(), "music-legacy");
  const legacy = data ?? [];

  return (
    <>
      <Stack.Screen options={{ title: "The Oguaa Sound" }} />
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
        <View style={s.hero}>
          <Image source={{ uri: mediaUrl("/uploads/seed/fetu-procession.jpg") }} resizeMode="cover" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, s.heroScrim]} />
          <Text style={s.heroKicker}>SANKOFA · GO BACK AND FETCH IT</Text>
          <Text style={s.heroTitle}>Where highlife learned to swim</Text>
        </View>

        <View style={s.body}>
          {STORY.map((b, i) => (
            <View key={`${b.h ?? ""}-${i}`} style={{ marginTop: i === 0 ? 0 : 18 }}>
              {b.h ? <Text style={s.h}>{b.h}</Text> : null}
              <Text style={s.p}>{b.p}</Text>
            </View>
          ))}

          {legacy.length > 0 && (
            <>
              <Text style={s.kicker}>GRANDFATHERS OF THE SOUND</Text>
              <View style={{ gap: 10 }}>
                {legacy.map((l) => (
                  <Pressable key={l.id} onPress={() => router.push(`/people/${l.slug}` as never)} style={s.card}>
                    <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.thumb} labelStyle={s.thumbInit} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.cardTitle}>{l.title}</Text>
                      {l.details.era ? <Text style={s.cardEra}>{l.details.era}</Text> : null}
                      {l.details.whyNotable ? <Text style={s.cardWhy} numberOfLines={2}>{l.details.whyNotable}</Text> : null}
                    </View>
                    <Text style={s.chevron}>›</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  hero: { backgroundColor: C.clay, paddingHorizontal: 20, paddingVertical: 28, overflow: "hidden" },
  // Bespoke 0.62 scrim (no semantic token at this alpha) — green900-derived.
  heroScrim: { backgroundColor: withAlpha(C.green900, 0.62) },
  heroKicker: { color: C.onDarkText85, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  heroTitle: { color: ON_GREEN, ...D(700), fontSize: 30, marginTop: 6, lineHeight: 38 },
  body: { padding: 20 },
  h: { ...D(700), fontSize: 20, color: C.ink, marginBottom: 6 },
  p: { ...S(400), fontSize: 16, lineHeight: 25, color: C.ink },
  kicker: { color: C.clayText, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 28, marginBottom: 10 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 12 },
  thumb: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  thumbInit: { color: C.cream, ...S(700), fontSize: 20 },
  cardTitle: { ...S(700), fontSize: 18, color: C.ink },
  cardEra: { color: C.goldText, fontSize: 12, marginTop: 1 },
  cardWhy: { color: C.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  chevron: { color: C.inkFaint, fontSize: 22, fontWeight: "700" },
});
