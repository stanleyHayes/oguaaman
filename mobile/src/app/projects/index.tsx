import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { C, S, initials } from "@/theme";
import { Loading, ErrorView, PhotoHero, Thumb } from "@/ui";
import { StaggerIn } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";

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
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.green} />}
    >
      <PhotoHero
        image="/uploads/seed/town-view.jpg"
        tone={C.green}
        kicker="Adopt a project"
        title="Pride that builds something"
        lede="Concrete, costed improvements for Cape Coast — proposed by verified institutions, funded by residents and the diaspora together. Receipts are published to backers."
      />
      <View style={{ padding: 16, gap: 14 }}>
      {data.length === 0 && <EmptyState glyph="◈" title="No open projects yet" body="The first campaigns are being costed." />}
      {data.map((l, i) => (
        <StaggerIn key={l.id} index={i}>
          <Link href={`/projects/${l.slug}` as never} asChild>
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
        </StaggerIn>
      ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, overflow: "hidden" },
  cover: { width: "100%", height: 130, alignItems: "center", justifyContent: "center" },
  coverInit: { color: C.cream, ...S(700), fontSize: 32 },
  title: { ...S(700), fontSize: 20, color: C.ink },
  organiser: { color: C.goldText, fontSize: 12, marginTop: 2 },
  desc: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  meta: { color: C.inkFaint, fontSize: 12, marginTop: 8 },
});
