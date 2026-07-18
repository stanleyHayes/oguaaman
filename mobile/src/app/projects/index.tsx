import { route } from "@/lib/routes";
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { S, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, PhotoHero, Thumb } from "@/ui";
import { StaggerIn } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon, DiamondIcon } from "@/components/icons";

export const cedis = (pesewas?: number) =>
  `GH₵ ${((pesewas ?? 0) / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;

export function Progress({ raised, goal }: Readonly<{ raised?: number; goal?: number }>) {
  const { C } = useTheme();
  const p = useMemo(() => makeProgressStyles(C), [C]);
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
const makeProgressStyles = (C: Palette) => StyleSheet.create({
  track: { height: 7, borderRadius: 4, backgroundColor: C.sand, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: C.green },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  raised: { color: C.greenText, fontSize: 12, ...S(700) },
  goal: { color: C.inkFaint, fontSize: 12 },
});

export default function Projects() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, error, loading, refreshing, reload } = useApi<Listing[]>(() => api.projects(), "projects");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.greenText} />}
    >
      <PhotoHero
        image="/uploads/seed/town-view.jpg"
        tone={C.green}
        kicker="Adopt a project"
        title="Pride that builds something"
        lede="Concrete, costed improvements for Cape Coast — proposed by verified institutions, funded by residents and the diaspora together. Receipts are published to backers."
      />
      <View style={{ padding: 16, gap: 14 }}>
      {data.length === 0 && <EmptyState icon={<DiamondIcon size={56} color={C.inkFaint} strokeWidth={1.5} />} title="No open projects yet" body="The first campaigns are being costed." />}
      {data.map((l, i) => (
        <StaggerIn key={l.id} index={i}>
          <Link href={route.project(l.slug)} asChild>
            <Pressable style={({ pressed }) => [s.card, pressed && s.cardPressed]} accessibilityRole="button" accessibilityLabel={`Open project ${l.title}`}>
            <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.cover} labelStyle={s.coverInit} />
            <View style={s.cardBody}>
              <View style={s.kickerRow}>
                <Text style={s.cardKicker}>COMMUNITY PROJECT</Text>
                <View style={s.cardArrow}><ArrowRightIcon size={14} color={C.greenText} strokeWidth={2.4} /></View>
              </View>
              <Text style={s.title} numberOfLines={2}>{l.title}</Text>
              {l.details.organiser ? <Text style={s.organiser} numberOfLines={1}>{l.details.organiser}</Text> : null}
              <Text style={s.desc} numberOfLines={2}>{l.details.description}</Text>
              <View style={s.progressWrap}>
                <Progress raised={l.details.raisedPesewas} goal={l.details.goalPesewas} />
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaStrong}>{l.details.backers ?? 0} backers</Text>
                {l.details.deadline ? <Text style={s.meta} numberOfLines={1}>Closes {l.details.deadline}</Text> : null}
              </View>
            </View>
            </Pressable>
          </Link>
        </StaggerIn>
      ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  card: { minHeight: 180, flexDirection: "row", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, overflow: "hidden" },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  cover: { width: 100, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  coverInit: { color: C.cream, ...S(700), fontSize: 25 },
  cardBody: { flex: 1, minWidth: 0, paddingHorizontal: 13, paddingVertical: 12 },
  kickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardKicker: { color: C.greenText, fontSize: 8.5, letterSpacing: 1.2, ...S(700) },
  cardArrow: { width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand },
  title: { ...S(700), fontSize: 16, lineHeight: 20, color: C.ink, marginTop: 4 },
  organiser: { color: C.goldText, fontSize: 10.5, marginTop: 2, ...S(600) },
  desc: { color: C.inkMuted, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  progressWrap: { marginTop: 9 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 7 },
  metaStrong: { color: C.greenText, fontSize: 10.5, ...S(700) },
  meta: { flexShrink: 1, color: C.inkFaint, fontSize: 10, textAlign: "right" },
});
