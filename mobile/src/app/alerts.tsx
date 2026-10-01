import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Directive } from "@/lib/types";
import { S, type Palette, D } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { severityColors } from "@/lib/incidents";
import { directiveFill, isActiveAt, countdownTo, DIRECTIVE_KIND_LABEL, DIRECTIVE_SEVERITY_LABEL } from "@/lib/directives";
import { Loading, ErrorView } from "@/ui";
import { EmptyState } from "@/components/empty-state";
import { CheckIcon } from "@/components/icons";
import { EmergencyCallout, NOT_GOVERNMENT } from "@/components/notices";
import { openInAppBrowser } from "@/lib/webbrowser";

function fmtDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// A directive that is active but whose effectiveFrom is still ahead.
function isScheduledAt(d: Directive, at: number): boolean {
  const from = Date.parse(d.effectiveFrom);
  return d.status === "active" && !Number.isNaN(from) && at < from;
}

function footLabel(d: Directive, past: boolean | undefined, scheduled: boolean | undefined, countdown: string | null): string {
  if (scheduled) return `Starts ${fmtDateTime(d.effectiveFrom)}`;
  if (past) return d.status === "expired" || d.effectiveUntil ? "Ended" : "Lifted";
  return countdown ?? "Ongoing";
}

function DirectiveCard({ d, now, past, scheduled }: Readonly<{ d: Directive; now: number; past?: boolean; scheduled?: boolean }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const sevText = severityColors(C)[d.severity] ?? C.inkMuted;
  const rail = directiveFill(d.severity, C).bg;
  const countdown = countdownTo(d.effectiveUntil, now);

  return (
    <View style={[s.card, past && s.cardPast]}>
      <View style={[s.rail, { backgroundColor: rail, opacity: past ? 0.4 : 1 }]} />
      <View style={s.cardBody}>
        <View style={s.chipRow}>
          <View style={[s.chip, { borderColor: sevText }]}>
            <Text style={[s.chipText, { color: sevText }]}>{DIRECTIVE_SEVERITY_LABEL[d.severity]}</Text>
          </View>
          <View style={s.chip}>
            <Text style={s.chipText}>{DIRECTIVE_KIND_LABEL[d.kind]}</Text>
          </View>
          {d.automated ? <View style={s.chip}><Text style={s.chipText}>AUTOMATED</Text></View> : null}
          {d.area ? <Text style={s.area} numberOfLines={1}>{d.area}</Text> : null}
        </View>

        <Text style={s.title}>{d.title}</Text>
        <Text style={s.issuer}>{d.issuedByName}</Text>
        {d.sourceUrl?.startsWith("https://") ? (
          <Pressable accessibilityRole="link" onPress={() => { void openInAppBrowser(d.sourceUrl ?? ""); }} hitSlop={6}>
            <Text style={s.source}>Official source: {d.sourceName ?? d.issuedByName} ↗</Text>
          </Pressable>
        ) : null}

        {d.action ? (
          <View style={s.actionChip}>
            <Text style={s.actionText}>▸ {d.action}</Text>
          </View>
        ) : null}

        {d.body ? <Text style={s.body} numberOfLines={past ? 2 : 6}>{d.body}</Text> : null}

        <View style={s.footRow}>
          <Text style={s.foot}>Issued {fmtDateTime(scheduled ? d.createdAt : d.effectiveFrom || d.createdAt)}</Text>
          <Text style={[s.foot, !past && s.footLive]}>{footLabel(d, past, scheduled, countdown)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function Alerts() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  // The full non-cancelled set (active + computed-expired); we split it locally.
  const { data, error, loading, refreshing, reload } = useApi<Directive[]>(
    () => api.directives(false),
    "directives:all",
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const active = data.filter((d) => isActiveAt(d, now));
  const activeIds = new Set(active.map((d) => d.id));
  const scheduled = data.filter((d) => !activeIds.has(d.id) && isScheduledAt(d, now));
  const scheduledIds = new Set(scheduled.map((d) => d.id));
  const past = data.filter((d) => !activeIds.has(d.id) && !scheduledIds.has(d.id));

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.green} />}
    >
      <Text style={s.lede}>
        Advisories, directives and emergency notices from Cape Coast&apos;s authorities — the fire &amp; rescue service, the
        assembly, health and security. High and critical notices also buzz your phone and appear at the top of every screen.
      </Text>
      <Text style={s.notGov}>{NOT_GOVERNMENT}</Text>
      <View style={{ marginTop: 14 }}><EmergencyCallout /></View>

      {data.length === 0 ? (
        <EmptyState icon={<CheckIcon size={56} color={C.inkFaint} strokeWidth={1.5} />} title="No standing notices" body="There are no directives in effect right now." />
      ) : (
        <View style={{ gap: 12, marginTop: 16 }}>
          {active.length > 0 && (
            <>
              <Text style={s.section}>IN EFFECT NOW</Text>
              {active.map((d) => <DirectiveCard key={d.id} d={d} now={now} />)}
            </>
          )}
          {scheduled.length > 0 && (
            <>
              <Text style={[s.section, active.length > 0 && { marginTop: 12 }]}>COMING UP</Text>
              {scheduled.map((d) => <DirectiveCard key={d.id} d={d} now={now} scheduled />)}
            </>
          )}
          {past.length > 0 && (
            <>
              <Text style={[s.section, (active.length > 0 || scheduled.length > 0) && { marginTop: 12 }]}>RECENT &amp; LIFTED</Text>
              {past.map((d) => <DirectiveCard key={d.id} d={d} now={now} past />)}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  notGov: { color: C.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 10, fontStyle: "italic" },
  source: { color: C.tealText, fontSize: 12, textDecorationLine: "underline", marginTop: 4 },
  lede: { color: C.inkMuted, fontSize: 14, lineHeight: 20 },
  section: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, ...D(700), marginBottom: 2 },
  card: { flexDirection: "row", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, overflow: "hidden" },
  cardPast: { opacity: 0.7 },
  rail: { width: 5, alignSelf: "stretch" },
  cardBody: { flex: 1, padding: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chip: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { color: C.inkMuted, fontSize: 11, ...S(700), textTransform: "capitalize" },
  area: { marginLeft: "auto", color: C.inkFaint, fontSize: 11, ...S(700), letterSpacing: 0.5, flexShrink: 1 },
  title: { ...S(700), fontSize: 18, color: C.ink, marginTop: 10 },
  issuer: { color: C.goldText, fontSize: 13, ...S(600), marginTop: 2 },
  actionChip: { backgroundColor: C.clayTint, borderWidth: 1, borderColor: C.goldBorder35, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 10, alignSelf: "flex-start", maxWidth: "100%" },
  actionText: { color: C.clayText, fontSize: 13, ...S(700), lineHeight: 18 },
  body: { color: C.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 10 },
  footRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 8 },
  foot: { color: C.inkFaint, fontSize: 11 },
  footLive: { color: C.tealText, ...S(700) },
});
