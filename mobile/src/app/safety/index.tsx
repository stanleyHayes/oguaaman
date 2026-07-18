import { useMemo, useState } from "react";
import { route, ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Incident, IncidentCategory } from "@/lib/types";
import { CATEGORY_LABEL, INCIDENT_CATEGORIES, INCIDENT_STATUSES, SEVERITY_COLOR, STATUS_COLOR, STATUS_LABEL } from "@/lib/incidents";
import { ON_GREEN, S, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView } from "@/ui";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function IncidentCard({ i }: Readonly<{ i: Incident }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const sev = SEVERITY_COLOR[i.details.severity] ?? C.inkMuted;
  const st = STATUS_COLOR[i.details.incidentStatus] ?? C.inkMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${i.details.severity} ${CATEGORY_LABEL[i.details.category] ?? i.details.category}: ${i.title}`}
      onPress={() => push(route.safety(i.slug))}
      style={({ pressed }) => [s.card, { borderLeftColor: sev }, pressed && s.cardPressed]}
    >
      <View style={s.chipRow}>
        <View style={[s.chip, { borderColor: sev }]}>
          <Text style={[s.chipText, { color: sev }]}>{i.details.severity}</Text>
        </View>
        <View style={s.chip}>
          <Text style={s.chipText}>{CATEGORY_LABEL[i.details.category] ?? i.details.category}</Text>
        </View>
        <Text style={[s.status, { color: st }]}>{STATUS_LABEL[i.details.incidentStatus] ?? i.details.incidentStatus}</Text>
      </View>
      <Text style={s.title}>{i.title}</Text>
      <Text style={s.location}>{i.details.location}</Text>
      {i.details.description ? <Text style={s.desc} numberOfLines={2}>{i.details.description}</Text> : null}
      <View style={s.cardFooter}>
        <Text style={s.posted}>Reported {fmtDate(i.createdAt)}</Text>
        <View style={s.cardArrow}><ArrowRightIcon size={14} color={st} strokeWidth={2.3} /></View>
      </View>
    </Pressable>
  );
}

export default function Safety() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [cat, setCat] = useState<IncidentCategory | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { data, error, loading, refreshing, reload } = useApi<Incident[]>(
    () => api.incidents({ category: cat ?? undefined, status: status ?? undefined }),
    `incidents:${cat ?? "all"}:${status ?? "all"}`,
  );
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const open = data.filter((i) => i.details.incidentStatus !== "resolved" && i.details.incidentStatus !== "recovered");
  const closed = data.filter((i) => i.details.incidentStatus === "resolved" || i.details.incidentStatus === "recovered");

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.green} />}
    >
      <Text style={s.lede}>
        Floods, fires, accidents and hazards across Cape Coast — reported by neighbours, verified by curators, and followed through to recovery. In an emergency, call the services first, then post here so the town can help.
      </Text>
      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.safetyReport)} style={s.cta}>
        <Text style={s.ctaText}>Report an incident</Text>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
        <Pressable accessibilityRole="button" onPress={() => setCat(null)} style={[s.filter, cat === null && s.filterOn]}>
          <Text style={[s.filterText, cat === null && s.filterTextOn]}>All</Text>
        </Pressable>
        {INCIDENT_CATEGORIES.map((c) => (
          <Pressable accessibilityRole="button" key={c.value} onPress={() => setCat(cat === c.value ? null : c.value)} style={[s.filter, cat === c.value && s.filterOn]}>
            <Text style={[s.filterText, cat === c.value && s.filterTextOn]}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.filters, { paddingTop: 8 }]}>
        <Pressable accessibilityRole="button" onPress={() => setStatus(null)} style={[s.filter, status === null && s.filterOn]}>
          <Text style={[s.filterText, status === null && s.filterTextOn]}>Any status</Text>
        </Pressable>
        {INCIDENT_STATUSES.map((st) => (
          <Pressable accessibilityRole="button" key={st.value} onPress={() => setStatus(status === st.value ? null : st.value)} style={[s.filter, status === st.value && s.filterOn]}>
            <Text style={[s.filterText, status === st.value && s.filterTextOn]}>{st.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {data.length === 0 ? (
        <EmptyState icon={<CheckIcon size={56} color={C.inkFaint} strokeWidth={1.5} />} title="The town is quiet" body="No incidents reported in this category." />
      ) : (
        <View style={{ gap: 12, marginTop: 16 }}>
          {open.length > 0 && (
            <>
              <Text style={s.section}>ACTIVE</Text>
              {open.map((i) => <IncidentCard key={i.id} i={i} />)}
            </>
          )}
          {closed.length > 0 && (
            <>
              <Text style={[s.section, open.length > 0 && { marginTop: 12 }]}>RESOLVED &amp; RECOVERED</Text>
              {closed.map((i) => <IncidentCard key={i.id} i={i} />)}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  lede: { color: C.inkMuted, fontSize: 14, lineHeight: 20 },
  cta: { backgroundColor: C.maroon, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 14 },
  ctaText: { color: ON_GREEN, ...S(700), fontSize: 15 },
  filters: { flexDirection: "row", gap: 8, marginTop: 14, paddingRight: 8 },
  filter: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  filterOn: { borderColor: C.green, backgroundColor: C.green },
  filterText: { color: C.inkMuted, fontSize: 13, ...S(600) },
  filterTextOn: { color: ON_GREEN },
  section: { color: C.inkFaint, fontSize: 10, letterSpacing: 1.8, ...S(700), marginBottom: 2 },
  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderLeftWidth: 3, borderRadius: 17, padding: 13 },
  cardPressed: { opacity: 0.72 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chip: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { color: C.inkMuted, fontSize: 11, ...S(700), textTransform: "capitalize" },
  status: { marginLeft: "auto", fontSize: 11, ...S(700), letterSpacing: 1, textTransform: "uppercase" },
  title: { ...S(700), fontSize: 17, lineHeight: 21, color: C.ink, marginTop: 9 },
  location: { color: C.inkMuted, fontSize: 13, marginTop: 3 },
  desc: { color: C.inkFaint, fontSize: 13, lineHeight: 19, marginTop: 6 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.sand },
  posted: { color: C.inkFaint, fontSize: 10.5, ...S(500) },
  cardArrow: { width: 25, height: 25, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
});
