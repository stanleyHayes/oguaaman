import { route } from "@/lib/routes";
import { useMemo } from "react";
import { push } from "@/lib/router";
import { Linking, StyleSheet, View, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import Animated from "react-native-reanimated";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useRecordView } from "@/lib/use-record-view";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { ON_GREEN, D, S, fillFor, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, Pill, Thumb } from "@/ui";
import { ReportButton } from "@/report-button";
import { HeroParallax, RevealView, useHeroParallax } from "@/components/anim";

// "Reps <school>" — resolves the artist's first school affiliation to its
// institution page, hiding itself if the lookup fails (mirrors the web page).
function SchoolLink({ orgId }: Readonly<{ orgId: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data } = useApi(() => api.institution(orgId), `artist-school:${orgId}`);
  if (!data) return null;
  return (
    <Pressable accessibilityRole="button" onPress={() => push(route.institution(data.institution.slug))} style={s.school}>
      <Text style={s.schoolText}>Reps <Text style={{ ...S(700), color: C.maroonText }}>{data.institution.name}</Text> ›</Text>
    </Pressable>
  );
}

export default function Artist() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<Listing>(() => api.artist(slug), `artist:${slug}`);
  const { scrollY, onScroll } = useHeroParallax();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  useRecordView(data?.id);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;
  const d = data.details;

  return (
    <Animated.ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }} onScroll={onScroll} scrollEventThrottle={16}>
      <View style={[s.head, { backgroundColor: fillFor(data.slug, C) }]}>
        <HeroParallax scrollY={scrollY} style={{ width: "100%", alignItems: "center" }}>
          <Thumb seed={data.slug} src={data.coverImageUrl} label={initials(d.actName ?? data.title)} style={s.thumb} labelStyle={s.thumbInit} />

          <Text style={s.name}>{d.actName ?? data.title}</Text>
          <View style={s.genres}>
            {(d.genres ?? []).map((g) => (
              <View key={g} style={s.genrePill}><Text style={s.genrePillText}>{g}</Text></View>
            ))}
          </View>
        </HeroParallax>
      </View>

      <RevealView delay={100} style={s.body}>
        <Text style={s.kicker}>ABOUT</Text>
        <Text style={s.bio}>{d.bio}</Text>

        {d.latestRelease && (
          <View style={s.release}>
            <Text style={s.kicker}>LATEST RELEASE</Text>
            <Text style={s.releaseTitle}>{d.latestRelease.title}{d.latestRelease.year ? `  ·  ${d.latestRelease.year}` : ""}</Text>
          </View>
        )}

        <Text style={[s.kicker, { marginTop: 22 }]}>LISTEN</Text>
        <Text style={s.linkNote}>We link out — no audio is hosted here.</Text>
        <View style={{ gap: 8, marginTop: 8 }}>
          {(d.streamingLinks ?? []).map((l) => (
            <Pressable accessibilityRole="button" key={l.label} style={s.stream} onPress={() => Linking.openURL(l.url)}>
              <Text style={s.streamLabel}>{l.label}</Text>
              <Text style={s.streamArrow}>↗</Text>
            </Pressable>
          ))}
        </View>

        {data.tags.length > 0 && (
          <View style={s.tags}>
            {data.tags.map((t) => <Pill key={t} label={`#${t}`} color={C.clayText} bg={C.cream} border={C.sand} />)}
          </View>
        )}

        {data.schoolIds?.[0] ? <SchoolLink orgId={data.schoolIds[0]} /> : null}

        <View style={{ marginTop: 22, alignItems: "center" }}>
          <ReportButton listingId={data.id} />
        </View>
      </RevealView>
    </Animated.ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  head: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 20 },
  // Pure-black tint over the fillFor() band — theme-independent by design.
  thumb: { width: 96, height: 96, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.18)", alignItems: "center", justifyContent: "center" },
  thumbInit: { color: C.cream, ...S(700), fontSize: 36 },
  name: { color: ON_GREEN, ...D(700), fontSize: 32, marginTop: 14, textAlign: "center" },
  genres: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, justifyContent: "center" },
  genrePill: { borderWidth: 1, borderColor: C.onDarkText50, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  genrePillText: { color: ON_GREEN, fontSize: 12 },
  body: { padding: 20 },
  kicker: { color: C.clayText, fontSize: 11, letterSpacing: 2, ...D(700) },
  bio: { color: C.ink, ...S(400), fontSize: 17, lineHeight: 25, marginTop: 8 },
  release: { marginTop: 20, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14 },
  releaseTitle: { ...S(400), fontSize: 20, color: C.ink, marginTop: 6 },
  linkNote: { color: C.inkFaint, fontSize: 12, marginTop: 4 },
  stream: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: C.green, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  streamLabel: { color: C.greenText, ...S(700) },
  streamArrow: { color: C.greenText },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 20 },
  school: { marginTop: 20, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  schoolText: { color: C.inkMuted, fontSize: 14 },
});
