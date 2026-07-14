import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { FestivalSummary } from "@/lib/types";
import { C, serif } from "@/theme";
import { Loading, ErrorView, Thumb } from "@/ui";
import { StaggerIn } from "@/components/anim";

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export default function Festivals() {
  const { data, error, loading, refreshing, reload } = useApi<FestivalSummary[]>(() => api.festivals(), "festivals");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.green} />}
    >
      <Text style={s.lede}>
        Every edition of every festival — Fetu Afahye, Edina Bakatue, PANAFEST and the rest — kept year by year: recaps of the ones behind us, programmes for the ones ahead.
      </Text>
      {data.map((f, i) => (
        <StaggerIn key={f.slug} index={i}>
          <Pressable onPress={() => router.push(`/festivals/${f.slug}` as never)} style={s.card}>
          <Thumb seed={f.slug} src={f.nextEdition?.coverImageUrl} label={f.name} style={s.cover} labelStyle={s.coverLabel} />
          <View style={{ padding: 14 }}>
            <Text style={s.name}>{f.name}</Text>
            {f.tagline ? <Text style={s.tagline}>{f.tagline}</Text> : null}
            <Text style={s.meta}>
              {f.nextEdition?.details.startsAt ? <>Next: <Text style={s.metaNext}>{fmtDate(f.nextEdition.details.startsAt)}</Text> · </> : null}
              {f.editions} edition{f.editions === 1 ? "" : "s"} archived
            </Text>
          </View>
          </Pressable>
        </StaggerIn>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  lede: { color: C.inkMuted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, overflow: "hidden" },
  cover: { width: "100%", height: 130, alignItems: "center", justifyContent: "center" },
  coverLabel: { color: C.cream, fontFamily: serif, fontSize: 24, fontWeight: "700", textAlign: "center", paddingHorizontal: 16 },
  name: { fontFamily: serif, fontSize: 22, fontWeight: "700", color: C.ink },
  tagline: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  meta: { color: C.inkFaint, fontSize: 12, marginTop: 10 },
  metaNext: { color: C.goldText, fontWeight: "700" },
});
