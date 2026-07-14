import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Incident } from "@/lib/types";
import { CATEGORY_LABEL, STATUS_COLOR, STATUS_LABEL } from "@/lib/incidents";
import { C, serif } from "@/theme";
import { Loading, ErrorView } from "@/ui";

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function IncidentDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<Incident>(() => api.incident(slug), `incident:${slug}`);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;

  const d = data.details;
  const SEV_BG = { critical: C.maroon, high: C.clay, medium: C.goldBrand, low: C.teal } as const;
  const st = STATUS_COLOR[d.incidentStatus] ?? C.inkMuted;
  const history = d.statusHistory ?? [];

  return (
    <>
      <Stack.Screen options={{ title: "Safety" }} />
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
        <View style={[s.hero, { backgroundColor: SEV_BG[d.severity] ?? C.greenSlate }]}>
          <Text style={s.heroKicker}>{(CATEGORY_LABEL[d.category] ?? d.category).toUpperCase()} · {d.severity.toUpperCase()} SEVERITY</Text>
          <Text style={s.heroTitle}>{data.title}</Text>
          <Text style={s.heroStatus}>{STATUS_LABEL[d.incidentStatus] ?? d.incidentStatus}</Text>
        </View>

        <View style={s.body}>
          <View style={s.facts}>
            <View style={s.factRow}><Text style={s.factLabel}>LOCATION</Text><Text style={s.factValue}>{d.location}</Text></View>
            {d.contact ? <View style={s.factRow}><Text style={s.factLabel}>CONTACT</Text><Text style={s.factValue}>{d.contact}</Text></View> : null}
            <View style={s.factRow}><Text style={s.factLabel}>REPORTED</Text><Text style={s.factValue}>{fmtDate(data.createdAt)}</Text></View>
          </View>

          {d.description ? <Text style={s.desc}>{d.description}</Text> : null}

          <Text style={s.kicker}>STATUS TIMELINE</Text>
          <View style={s.timeline}>
            {history.map((h, idx) => {
              const c = STATUS_COLOR[h.status] ?? C.inkMuted;
              const last = idx === history.length - 1;
              return (
                <View key={`${h.status}-${h.at}-${idx}`} style={s.tlRow}>
                  <View style={s.tlRail}>
                    <View style={[s.tlDot, { backgroundColor: c }]} />
                    {!last && <View style={s.tlLine} />}
                  </View>
                  <View style={[s.tlBody, last && { paddingBottom: 0 }]}>
                    <Text style={[s.tlStatus, { color: c }]}>{STATUS_LABEL[h.status] ?? h.status}</Text>
                    {h.note ? <Text style={s.tlNote}>{h.note}</Text> : null}
                    <Text style={s.tlAt}>{fmtDate(h.at)}</Text>
                  </View>
                </View>
              );
            })}
            {history.length === 0 && <Text style={s.tlEmpty}>No updates yet — a curator will verify this report.</Text>}
          </View>

          <View style={[s.currentBox, { borderColor: st }]}>
            <Text style={s.currentLabel}>CURRENT STATUS</Text>
            <Text style={[s.currentStatus, { color: st }]}>{STATUS_LABEL[d.incidentStatus] ?? d.incidentStatus}</Text>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingVertical: 26 },
  heroKicker: { color: "rgba(246,241,231,0.85)", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  heroTitle: { color: C.cream, fontFamily: serif, fontSize: 24, fontWeight: "700", lineHeight: 30, marginTop: 8 },
  heroStatus: { color: C.cream, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 10 },
  body: { padding: 20 },
  facts: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14 },
  factRow: { flexDirection: "row", gap: 12, paddingVertical: 7 },
  factLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 1, fontWeight: "700", width: 88 },
  factValue: { color: C.ink, fontSize: 14, flex: 1, lineHeight: 20 },
  desc: { fontFamily: serif, fontSize: 16, lineHeight: 25, color: C.ink, marginTop: 18 },
  kicker: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 26, marginBottom: 12 },
  timeline: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 16 },
  tlRow: { flexDirection: "row", gap: 12 },
  tlRail: { width: 12, alignItems: "center" },
  tlDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  tlLine: { flex: 1, width: 2, backgroundColor: C.sand, marginVertical: 3 },
  tlBody: { flex: 1, paddingBottom: 16 },
  tlStatus: { fontSize: 14, fontWeight: "700" },
  tlNote: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  tlAt: { color: C.inkFaint, fontSize: 11, marginTop: 4 },
  tlEmpty: { color: C.inkFaint, fontSize: 13, fontStyle: "italic" },
  currentBox: { marginTop: 22, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: "center" },
  currentLabel: { color: C.inkFaint, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  currentStatus: { fontFamily: serif, fontSize: 20, fontWeight: "700", marginTop: 4 },
});
