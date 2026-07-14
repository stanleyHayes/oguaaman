import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { C, serif, initials } from "@/theme";
import { Loading, ErrorView, Thumb } from "@/ui";

export const cedis = (pesewas?: number) =>
  `GH₵ ${((pesewas ?? 0) / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;

export function Progress({ raised, goal }: Readonly<{ raised?: number; goal?: number }>) {
  const pct = goal ? Math.min(100, Math.round(((raised ?? 0) / goal) * 100)) : 0;
  return (
    <View>
      <View style={p.track}><View style={[p.fill, { width: `${pct}%` }]} /></View>
      <View style={p.row}>
        <Text style={p.raised}>{cedis(raised)} raised</Text>
        <Text style={p.goal}>{pct}% of {cedis(goal)}</Text>
      </View>
    </View>
  );
}
const p = StyleSheet.create({
  track: { height: 7, borderRadius: 4, backgroundColor: C.sand, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: C.green },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  raised: { color: C.green, fontSize: 12, fontWeight: "700" },
  goal: { color: C.inkFaint, fontSize: 12 },
});

export default function Projects() {
  const { data, error, loading, refreshing, reload } = useApi<Listing[]>(() => api.projects(), "projects");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.green} />}
    >
      <Text style={s.lede}>Concrete, costed improvements for Cape Coast — proposed by verified institutions, funded by residents and the diaspora together. Receipts are published to backers.</Text>
      {data.length === 0 && <Text style={s.empty}>No open projects yet — the first campaigns are being costed.</Text>}
      {data.map((l) => (
        <Link key={l.id} href={`/projects/${l.slug}` as never} asChild>
          <Pressable style={s.card}>
            <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.cover} labelStyle={s.coverInit} />
            <View style={{ padding: 14 }}>
              <Text style={s.title}>{l.title}</Text>
              {l.details.organiser ? <Text style={s.organiser}>{l.details.organiser}</Text> : null}
              <Text style={s.desc} numberOfLines={2}>{l.details.description}</Text>
              <View style={{ marginTop: 12 }}>
                <Progress raised={l.details.raisedPesewas} goal={l.details.goalPesewas} />
              </View>
              <Text style={s.meta}>{l.details.backers ?? 0} backers{l.details.deadline ? ` · closes ${l.details.deadline}` : ""}</Text>
            </View>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  lede: { color: C.inkMuted, fontSize: 14, lineHeight: 20 },
  empty: { color: C.inkFaint, fontStyle: "italic", textAlign: "center", marginTop: 20 },
  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, overflow: "hidden" },
  cover: { width: "100%", height: 130, alignItems: "center", justifyContent: "center" },
  coverInit: { color: C.cream, fontFamily: serif, fontSize: 32, fontWeight: "700" },
  title: { fontFamily: serif, fontSize: 20, fontWeight: "700", color: C.ink },
  organiser: { color: C.goldText, fontSize: 12, marginTop: 2 },
  desc: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  meta: { color: C.inkFaint, fontSize: 12, marginTop: 8 },
});
