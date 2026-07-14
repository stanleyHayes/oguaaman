import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { FestivalView, Listing } from "@/lib/types";
import { C, serif, fillFor } from "@/theme";
import { Loading, ErrorView, Thumb, Pill } from "@/ui";

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

const TODAY = new Date().toISOString().slice(0, 10);

function ProgrammeList({ e }: Readonly<{ e: Listing }>) {
  const programme = e.details.programme ?? [];
  return (
    <View style={{ marginTop: 4 }}>
      {e.details.startsAt ? (
        <Text style={s.when}>{fmtDate(e.details.startsAt)}{e.details.venue ? ` · ${e.details.venue}` : ""}</Text>
      ) : null}
      {e.details.description ? <Text style={s.evDesc}>{e.details.description}</Text> : null}
      {programme.length > 0 && (
        <View style={{ gap: 6, marginTop: 8 }}>
          {programme.map((p) => (
            <View key={`${p.day ?? ""}-${p.time ?? ""}-${p.title}`} style={s.progRow}>
              <View style={s.progDay}>
                <Text style={s.progDayText}>{p.day ?? ""}</Text>
                {p.time ? <Text style={s.progTime}>{p.time}</Text> : null}
              </View>
              <Text style={s.progTitle}>{p.title}</Text>
            </View>
          ))}
        </View>
      )}
      <Pressable onPress={() => router.push(`/events/${e.slug}` as never)} style={s.evLink}>
        <Text style={s.evLinkText}>See event details &amp; tickets →</Text>
      </Pressable>
    </View>
  );
}

export default function Festival() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<FestivalView>(() => api.festival(slug), `festival:${slug}`);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;

  const cover = data.editions.flatMap((e) => e.events).find((e) => e.coverImageUrl)?.coverImageUrl;

  return (
    <>
      <Stack.Screen options={{ title: data.name }} />
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
        <View style={s.hero}>
          {cover ? <Thumb seed={data.slug} src={cover} style={StyleSheet.absoluteFill} /> : null}
          <View style={s.heroShade}>
            <Text style={s.heroKicker}>THE LIVING ARCHIVE</Text>
            <Text style={s.heroTitle}>{data.name}</Text>
            {data.tagline ? <Text style={s.heroTagline}>{data.tagline}</Text> : null}
          </View>
        </View>

        <View style={s.body}>
          {data.history ? <Text style={s.history}>{data.history}</Text> : null}

          <Text style={s.kicker}>EDITIONS</Text>
          <View style={s.timeline}>
            {data.editions.map((ed, idx) => {
              const upcoming = ed.events.some((e) => (e.details.startsAt ?? "") >= TODAY);
              const last = idx === data.editions.length - 1;
              const recapPill = ed.recap ? <Pill label="Recap" color={C.green} bg={C.cream} border={C.green} /> : null;
              return (
                <View key={ed.year} style={s.tlRow}>
                  <View style={s.tlRail}>
                    <View style={s.tlDot} />
                    {!last && <View style={s.tlLine} />}
                  </View>
                  <View style={[s.tlBody, last && { paddingBottom: 0 }]}>
                    <View style={s.yearRow}>
                      <Text style={s.year}>{ed.year}</Text>
                      {upcoming ? <Pill label="Upcoming" color={C.goldText} bg={C.cream} border={C.gold} /> : recapPill}
                    </View>
                    {ed.events.map((e) => <ProgrammeList key={e.id} e={e} />)}
                    {ed.recap ? <Text style={s.recap}>{ed.recap}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: fillFor("festival"), height: 210, justifyContent: "flex-end" },
  heroShade: { backgroundColor: "rgba(12,44,31,0.72)", paddingHorizontal: 20, paddingVertical: 20 },
  heroKicker: { color: "rgba(246,241,231,0.85)", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  heroTitle: { color: C.cream, fontFamily: serif, fontSize: 30, fontWeight: "700", marginTop: 4 },
  heroTagline: { color: C.gold, fontSize: 14, marginTop: 6, lineHeight: 20 },
  body: { padding: 20 },
  history: { fontFamily: serif, fontSize: 16, lineHeight: 25, color: C.ink },
  kicker: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 26, marginBottom: 12 },
  timeline: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 16 },
  tlRow: { flexDirection: "row", gap: 12 },
  tlRail: { width: 12, alignItems: "center" },
  tlDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.goldBrand, marginTop: 4 },
  tlLine: { flex: 1, width: 2, backgroundColor: C.sand, marginVertical: 3 },
  tlBody: { flex: 1, paddingBottom: 20 },
  yearRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  year: { fontFamily: serif, fontSize: 22, fontWeight: "700", color: C.ink },
  when: { color: C.goldText, fontSize: 13, fontWeight: "600", marginTop: 8 },
  evDesc: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  progRow: { flexDirection: "row", gap: 10, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 8, padding: 10 },
  progDay: { width: 110, flexShrink: 0 },
  progDayText: { color: C.ink, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  progTime: { color: C.inkFaint, fontSize: 11, marginTop: 1 },
  progTitle: { color: C.inkMuted, fontSize: 13, lineHeight: 19, flex: 1 },
  evLink: { marginTop: 10, minHeight: 44, justifyContent: "center" },
  evLinkText: { color: C.tealText, fontSize: 13, fontWeight: "700" },
  recap: { fontFamily: serif, fontStyle: "italic", color: C.inkMuted, fontSize: 14, lineHeight: 21, borderLeftWidth: 2, borderLeftColor: C.goldBrand, paddingLeft: 12, marginTop: 10 },
});
