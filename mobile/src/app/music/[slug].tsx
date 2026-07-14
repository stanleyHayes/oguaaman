import { Linking, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { C, serif, fillFor, initials } from "@/theme";
import { Loading, ErrorView, Pill, Thumb } from "@/ui";
import { ReportButton } from "@/report-button";

// "Reps <school>" — resolves the artist's first school affiliation to its
// institution page, hiding itself if the lookup fails (mirrors the web page).
function SchoolLink({ orgId }: Readonly<{ orgId: string }>) {
  const { data } = useApi(() => api.institution(orgId), `artist-school:${orgId}`);
  if (!data) return null;
  return (
    <Pressable onPress={() => router.push(`/institutions/${data.institution.slug}` as never)} style={s.school}>
      <Text style={s.schoolText}>Reps <Text style={{ fontWeight: "700", color: C.maroon }}>{data.institution.name}</Text> ›</Text>
    </Pressable>
  );
}

export default function Artist() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<Listing>(() => api.artist(slug), `artist:${slug}`);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;
  const d = data.details;

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.head, { backgroundColor: fillFor(data.slug) }]}>
        <Thumb seed={data.slug} src={data.coverImageUrl} label={initials(d.actName ?? data.title)} style={s.thumb} labelStyle={s.thumbInit} />

        <Text style={s.name}>{d.actName ?? data.title}</Text>
        <View style={s.genres}>
          {(d.genres ?? []).map((g) => (
            <View key={g} style={s.genrePill}><Text style={s.genrePillText}>{g}</Text></View>
          ))}
        </View>
      </View>

      <View style={s.body}>
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
            <Pressable key={l.label} style={s.stream} onPress={() => Linking.openURL(l.url)}>
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
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  head: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 20 },
  thumb: { width: 96, height: 96, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.18)", alignItems: "center", justifyContent: "center" },
  thumbInit: { color: C.cream, fontFamily: serif, fontSize: 36, fontWeight: "700" },
  name: { color: C.cream, fontFamily: serif, fontSize: 32, fontWeight: "700", marginTop: 14, textAlign: "center" },
  genres: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, justifyContent: "center" },
  genrePill: { borderWidth: 1, borderColor: "rgba(246,241,231,0.5)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  genrePillText: { color: C.cream, fontSize: 12 },
  body: { padding: 20 },
  kicker: { color: C.clayText, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  bio: { color: C.ink, fontFamily: serif, fontSize: 17, lineHeight: 25, marginTop: 8 },
  release: { marginTop: 20, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14 },
  releaseTitle: { fontFamily: serif, fontSize: 20, color: C.ink, marginTop: 6 },
  linkNote: { color: C.inkFaint, fontSize: 12, marginTop: 4 },
  stream: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: C.green, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  streamLabel: { color: C.green, fontWeight: "700" },
  streamArrow: { color: C.green },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 20 },
  school: { marginTop: 20, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  schoolText: { color: C.inkMuted, fontSize: 14 },
});
