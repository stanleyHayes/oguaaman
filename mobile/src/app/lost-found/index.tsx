import { useMemo, useState } from "react";
import { route, ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { LostFound, LostFoundKind } from "@/lib/types";
import { KIND_LABEL, LF_STATUS_LABEL, lfStatusColor } from "@/lib/lostfound";
import { S, ON_GREEN, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, Thumb } from "@/ui";
import { StaggerIn } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon, QuestionIcon } from "@/components/icons";

const TABS: { kind: LostFoundKind; label: string }[] = [
  { kind: "lost_item", label: "Lost" },
  { kind: "found_item", label: "Found" },
  { kind: "missing_person", label: "Missing people" },
];

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function NoticeCard({ i }: Readonly<{ i: LostFound }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const d = i.details;
  const missing = d.kind === "missing_person";
  const stColor = lfStatusColor(C)[d.lfStatus] ?? C.inkMuted;
  const whereLabel = d.kind === "lost_item" ? "Lost" : "Found";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${KIND_LABEL[d.kind] ?? d.kind}: ${i.title}`}
      onPress={() => push(route.lostFound(i.slug))}
      style={({ pressed }) => [s.card, missing && s.cardMissing, pressed && s.cardPressed]}
    >
      <Thumb seed={i.slug} src={i.coverImageUrl} label={initials(i.title)} style={s.thumb} labelStyle={s.thumbLabel} />
      <View style={s.cardBody}>
        <View style={s.chipRow}>
          <View style={[s.chip, { borderColor: missing ? C.maroon : C.teal }]}>
            <Text style={[s.chipText, { color: missing ? C.maroonText : C.tealText }]}>{KIND_LABEL[d.kind] ?? d.kind}</Text>
          </View>
          <Text style={[s.status, { color: stColor }]}>{LF_STATUS_LABEL[d.lfStatus] ?? d.lfStatus}</Text>
        </View>
        <Text style={s.title} numberOfLines={2}>{i.title}</Text>
        {d.lastSeenLocation ? (
          <Text style={s.where} numberOfLines={1}>
            {missing ? "Last seen" : whereLabel} at {d.lastSeenLocation}{d.lastSeenDate ? ` · ${fmtDate(d.lastSeenDate)}` : ""}
          </Text>
        ) : null}
        {d.description ? <Text style={s.desc} numberOfLines={2}>{d.description}</Text> : null}
        <View style={s.cardFooter}>
          <Text style={s.posted}>Posted {fmtDate(i.createdAt)}</Text>
          <View style={s.cardArrow}><ArrowRightIcon size={14} color={stColor} strokeWidth={2.3} /></View>
        </View>
      </View>
    </Pressable>
  );
}

export default function LostFoundList() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [kind, setKind] = useState<LostFoundKind>("lost_item");
  const { data, error, loading, refreshing, reload } = useApi<LostFound[]>(() => api.lostFoundList(), "lost-found");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const shown = data.filter((i) => i.details.kind === kind);
  const count = (k: LostFoundKind) => data.filter((i) => i.details.kind === k).length;

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.greenText} />}
    >
      <Text style={s.lede}>
        Lost a phone, found a bunch of keys, searching for someone? Post here — notices go live immediately, and the town helps. When it works out, mark it reunited and share the good news.
      </Text>
      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.lostFoundNew)} style={s.cta}>
        <Text style={s.ctaText}>Post a notice</Text>
      </Pressable>

      <View style={s.tabs}>
        {TABS.map((t) => {
          const on = kind === t.kind;
          return (
            <Pressable accessibilityRole="button" key={t.kind} onPress={() => setKind(t.kind)} style={[s.tab, on && s.tabOn]}>
              <Text style={[s.tabText, on && s.tabTextOn]}>{t.label} ({count(t.kind)})</Text>
            </Pressable>
          );
        })}
      </View>

      {shown.length === 0 ? (
        <EmptyState icon={<QuestionIcon size={56} color={C.inkFaint} strokeWidth={1.5} />} title="Nothing here yet" body="…and may it stay that way." />
      ) : (
        <View style={{ gap: 12, marginTop: 16 }}>
          {shown.map((i, idx) => <StaggerIn key={i.id} index={idx}><NoticeCard i={i} /></StaggerIn>)}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  lede: { color: C.inkMuted, fontSize: 14, lineHeight: 20 },
  cta: { backgroundColor: C.teal, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 14 },
  ctaText: { color: C.cream, ...S(700), fontSize: 15 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 16 },
  tab: { flex: 1, borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 4, alignItems: "center", minHeight: 44, justifyContent: "center" },
  tabOn: { borderColor: C.green, backgroundColor: C.green },
  tabText: { color: C.inkMuted, fontSize: 12, ...S(700), textAlign: "center" },
  tabTextOn: { color: ON_GREEN },
  card: { flexDirection: "row", gap: 11, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 17, padding: 10 },
  cardMissing: { borderLeftWidth: 4, borderLeftColor: C.maroon },
  cardPressed: { opacity: 0.72 },
  thumb: { width: 82, minHeight: 108, alignSelf: "stretch", borderRadius: 13 },
  thumbLabel: { ...S(700), fontSize: 18 },
  cardBody: { flex: 1, minWidth: 0 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 11, ...S(700) },
  status: { marginLeft: "auto", fontSize: 11, ...S(700), letterSpacing: 1, textTransform: "uppercase" },
  title: { ...S(700), fontSize: 16, lineHeight: 20, color: C.ink, marginTop: 7 },
  where: { color: C.inkMuted, fontSize: 13, marginTop: 3 },
  desc: { color: C.inkFaint, fontSize: 13, lineHeight: 19, marginTop: 6 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  posted: { color: C.inkFaint, fontSize: 10.5 },
  cardArrow: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
});
