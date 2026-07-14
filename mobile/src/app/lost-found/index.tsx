import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { LostFound, LostFoundKind } from "@/lib/types";
import { KIND_LABEL, LF_STATUS_COLOR, LF_STATUS_LABEL } from "@/lib/lostfound";
import { C, serif } from "@/theme";
import { Loading, ErrorView } from "@/ui";
import { StaggerIn } from "@/components/anim";

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
  const d = i.details;
  const missing = d.kind === "missing_person";
  const stColor = LF_STATUS_COLOR[d.lfStatus] ?? C.inkMuted;
  const whereLabel = d.kind === "lost_item" ? "Lost" : "Found";
  return (
    <Pressable onPress={() => router.push(`/lost-found/${i.slug}` as never)} style={[s.card, missing && s.cardMissing]}>
      <View style={s.chipRow}>
        <View style={[s.chip, { borderColor: missing ? C.maroon : C.teal }]}>
          <Text style={[s.chipText, { color: missing ? C.maroon : C.tealText }]}>{KIND_LABEL[d.kind] ?? d.kind}</Text>
        </View>
        <Text style={[s.status, { color: stColor }]}>{LF_STATUS_LABEL[d.lfStatus] ?? d.lfStatus}</Text>
      </View>
      <Text style={s.title}>{i.title}</Text>
      {d.lastSeenLocation ? (
        <Text style={s.where}>
          {missing ? "Last seen" : whereLabel} at {d.lastSeenLocation}{d.lastSeenDate ? ` · ${fmtDate(d.lastSeenDate)}` : ""}
        </Text>
      ) : null}
      {d.description ? <Text style={s.desc} numberOfLines={2}>{d.description}</Text> : null}
      <Text style={s.posted}>Posted {fmtDate(i.createdAt)}</Text>
    </Pressable>
  );
}

export default function LostFoundList() {
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.green} />}
    >
      <Text style={s.lede}>
        Lost a phone, found a bunch of keys, searching for someone? Post here — notices go live immediately, and the town helps. When it works out, mark it reunited and share the good news.
      </Text>
      <Pressable onPress={() => router.push("/lost-found/new" as never)} style={s.cta}>
        <Text style={s.ctaText}>Post a notice</Text>
      </Pressable>

      <View style={s.tabs}>
        {TABS.map((t) => {
          const on = kind === t.kind;
          return (
            <Pressable key={t.kind} onPress={() => setKind(t.kind)} style={[s.tab, on && s.tabOn]}>
              <Text style={[s.tabText, on && s.tabTextOn]}>{t.label} ({count(t.kind)})</Text>
            </Pressable>
          );
        })}
      </View>

      {shown.length === 0 ? (
        <Text style={s.empty}>Nothing here yet — and may it stay that way.</Text>
      ) : (
        <View style={{ gap: 12, marginTop: 16 }}>
          {shown.map((i, idx) => <StaggerIn key={i.id} index={idx}><NoticeCard i={i} /></StaggerIn>)}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  lede: { color: C.inkMuted, fontSize: 14, lineHeight: 20 },
  cta: { backgroundColor: C.teal, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 14 },
  ctaText: { color: C.cream, fontWeight: "700", fontSize: 15 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 16 },
  tab: { flex: 1, borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 4, alignItems: "center", minHeight: 44, justifyContent: "center" },
  tabOn: { borderColor: C.green, backgroundColor: C.green },
  tabText: { color: C.inkMuted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  tabTextOn: { color: C.cream },
  empty: { color: C.inkFaint, fontStyle: "italic", textAlign: "center", marginTop: 32, lineHeight: 20 },
  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 14 },
  cardMissing: { borderLeftWidth: 4, borderLeftColor: C.maroon },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: "700" },
  status: { marginLeft: "auto", fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  title: { fontFamily: serif, fontSize: 18, fontWeight: "700", color: C.ink, marginTop: 10 },
  where: { color: C.inkMuted, fontSize: 13, marginTop: 3 },
  desc: { color: C.inkFaint, fontSize: 13, lineHeight: 19, marginTop: 6 },
  posted: { color: C.inkFaint, fontSize: 11, marginTop: 10 },
});
