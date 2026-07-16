import { StyleSheet, View, Pressable } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Animated from "react-native-reanimated";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useRecordView } from "@/lib/use-record-view";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { C, D, S, SI, fillFor, initials } from "@/theme";
import { Loading, ErrorView, Pill, Thumb } from "@/ui";
import { ReportButton } from "@/report-button";
import { HeroParallax, RevealView, useHeroParallax } from "@/components/anim";

export default function Person() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<Listing>(() => api.person(slug), `person:${slug}`);
  const { scrollY, onScroll } = useHeroParallax();
  useRecordView(data?.id);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;
  const d = data.details;
  const story = (d.bio ?? d.whyNotable ?? "").split("\n\n").filter(Boolean);

  return (
    <>
      <Stack.Screen options={{ title: data.title }} />
      <Animated.ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }} onScroll={onScroll} scrollEventThrottle={16}>
        <View style={[s.head, { backgroundColor: fillFor(data.slug) }]}>
          <HeroParallax scrollY={scrollY} style={{ width: "100%", alignItems: "center" }}>
            <Thumb seed={data.slug} src={data.coverImageUrl} label={initials(data.title)} style={s.thumb} labelStyle={s.thumbInit} />
            <View style={s.badge}><Text style={s.badgeText}>{d.living ? "LIVING ICON" : "IN LEGACY"}</Text></View>
            <Text style={s.name}>{data.title}</Text>
            {d.era ? <Text style={s.era}>{d.era}</Text> : null}
          </HeroParallax>
        </View>

        <RevealView delay={100} style={s.body}>
          <Text style={s.kicker}>WHY OGUAA IS PROUD</Text>
          {d.whyNotable ? <Text style={s.pull}>{d.whyNotable}</Text> : null}
          {story.map((p, i) => (
            <Text key={`${p.slice(0, 20)}-${i}`} style={[s.story, { marginTop: i === 0 ? 12 : 14 }]}>{p}</Text>
          ))}

          {data.tags.length > 0 && (
            <View style={s.tags}>
              {data.tags.map((t) => <Pill key={t} label={`#${t}`} color={C.goldText} bg={C.cream} border={C.sand} />)}
            </View>
          )}

          <Pressable onPress={() => router.push("/submit")} style={s.contribute}>
            <Text style={s.contributeText}>Know more about them? Contribute →</Text>
          </Pressable>

          <View style={{ marginTop: 22, alignItems: "center" }}>
            <ReportButton listingId={data.id} />
          </View>
        </RevealView>
      </Animated.ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  head: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 20 },
  thumb: { width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(0,0,0,0.18)", alignItems: "center", justifyContent: "center" },
  thumbInit: { color: C.cream, ...S(700), fontSize: 36 },
  badge: { backgroundColor: "rgba(246,241,231,0.18)", borderWidth: 1, borderColor: "rgba(246,241,231,0.4)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 14 },
  badgeText: { color: C.cream, fontSize: 10, letterSpacing: 1.5, fontWeight: "700" },
  name: { color: C.cream, ...D(700), fontSize: 30, marginTop: 8, textAlign: "center" },
  era: { color: "rgba(246,241,231,0.75)", fontSize: 12, letterSpacing: 2, marginTop: 6, textTransform: "uppercase" },
  body: { padding: 20 },
  kicker: { color: C.goldText, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  pull: { ...SI(), fontSize: 19, lineHeight: 27, color: C.ink, marginTop: 8 },
  story: { ...S(400), fontSize: 16, lineHeight: 24, color: C.ink },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 20 },
  contribute: { borderWidth: 1, borderColor: C.green, borderRadius: 999, paddingVertical: 12, alignItems: "center", marginTop: 22 },
  contributeText: { color: C.green, fontWeight: "700", fontSize: 14 },
});
