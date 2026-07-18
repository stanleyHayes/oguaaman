import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { ArrowRightIcon, CheckIcon, MapPinIcon, ShieldIcon, StarFilledIcon } from "@/components/icons";
import { push } from "@/lib/router";
import { route } from "@/lib/routes";
import { useTheme } from "@/lib/theme-context";
import type { Agent, AgentJobStatus, AgentService } from "@/lib/types";
import { D, S, fillFor, initials, onFill, withAlpha, type Palette } from "@/theme";

export function cedis(pesewas?: number): string {
  if (!pesewas) return "GH₵0";
  return `GH₵${(pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;
}

export function serviceLabeller(services: AgentService[]) {
  const labels = new Map(services.map((service) => [service.slug, service.label]));
  return (slug: string) => labels.get(slug) ?? slug.replaceAll("-", " ");
}

export const JOB_STATUS: Record<AgentJobStatus, { label: string; tone: "goldText" | "greenText" | "tealText" | "maroonText" | "inkFaint" }> = {
  requested: { label: "Awaiting quote", tone: "goldText" },
  quoted: { label: "Quote ready", tone: "tealText" },
  funded: { label: "Escrow funded", tone: "greenText" },
  delivered: { label: "Delivered", tone: "tealText" },
  completed: { label: "Completed", tone: "greenText" },
  disputed: { label: "Under review", tone: "maroonText" },
  cancelled: { label: "Cancelled", tone: "inkFaint" },
  refunded: { label: "Refunded", tone: "inkFaint" },
};

export function OutsideDisclaimer({ compact = false }: Readonly<{ compact?: boolean }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={[s.disclaimer, compact && s.disclaimerCompact]}>
      <View style={s.shield}><ShieldIcon size={18} color={C.goldText} strokeWidth={2} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.disclaimerTitle}>Vetted people. Protected payment.</Text>
        <Text style={s.disclaimerBody}>Oguaa verifies agents and holds funded work in managed escrow. Agree terms in writing and report problems quickly.</Text>
      </View>
    </View>
  );
}

export function StatusChip({ status }: Readonly<{ status: AgentJobStatus }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const meta = JOB_STATUS[status];
  const color = C[meta.tone];
  return (
    <View style={[s.status, { borderColor: withAlpha(color, 0.3), backgroundColor: withAlpha(color, 0.1) }]}>
      <Text style={[s.statusText, { color }]}>{meta.label.toUpperCase()}</Text>
    </View>
  );
}

export function AgentCard({ agent, serviceLabel }: Readonly<{ agent: Agent; serviceLabel: (slug: string) => string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const fill = fillFor(agent.slug, C);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${agent.displayName}, verified Oguaa Outside agent`}
      onPress={() => push(route.outsideAgent(agent.slug))}
      style={({ pressed }) => [s.agentCard, pressed && { opacity: 0.78 }]}
    >
      <View style={s.agentHead}>
        <View style={[s.avatar, { backgroundColor: fill }]}><Text style={[s.avatarText, { color: onFill(fill) }]}>{initials(agent.displayName)}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.nameRow}>
            <Text style={s.agentName} numberOfLines={1}>{agent.displayName}</Text>
            <View style={s.verified}><CheckIcon size={12} color={C.green900} strokeWidth={2.8} /></View>
          </View>
          <Text style={s.agentType}>{agent.type === "office" ? "VERIFIED OFFICE" : "VERIFIED INDIVIDUAL"}</Text>
        </View>
      </View>
      {agent.headline ? <Text style={s.headline} numberOfLines={2}>{agent.headline}</Text> : null}
      <View style={s.serviceRow}>
        {agent.services.slice(0, 3).map((service) => <View key={service} style={s.serviceChip}><Text style={s.serviceText} numberOfLines={1}>{serviceLabel(service)}</Text></View>)}
      </View>
      {agent.coverageAreas.length ? (
        <View style={s.locationRow}><MapPinIcon size={14} color={C.tealText} strokeWidth={2} /><Text style={s.location} numberOfLines={1}>{agent.coverageAreas.join(" · ")}</Text></View>
      ) : null}
      <View style={s.agentFoot}>
        <View style={s.ratingRow}>
          <StarFilledIcon size={14} color={C.goldBrand} />
          <Text style={s.rating}>{agent.ratingCount ? agent.ratingAvg.toFixed(1) : "New"}</Text>
          <Text style={s.jobs}>{agent.jobsCompleted} jobs done</Text>
        </View>
        <View style={s.open}><Text style={s.openText}>View</Text><ArrowRightIcon size={14} color={C.greenText} strokeWidth={2.3} /></View>
      </View>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  disclaimer: { flexDirection: "row", gap: 12, backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35, borderRadius: 18, padding: 15 },
  disclaimerCompact: { padding: 12, borderRadius: 14 },
  shield: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.cream, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.goldBorder35 },
  disclaimerTitle: { color: C.ink, ...S(700), fontSize: 13 },
  disclaimerBody: { color: C.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  status: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { ...S(700), fontSize: 9, letterSpacing: 0.9 },
  agentCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 20, padding: 16 },
  agentHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { ...D(700), fontSize: 20 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  agentName: { color: C.ink, ...D(700), fontSize: 20, flexShrink: 1 },
  verified: { width: 19, height: 19, borderRadius: 10, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" },
  agentType: { color: C.greenText, ...S(700), fontSize: 9, letterSpacing: 1.25, marginTop: 3 },
  headline: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 13 },
  serviceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 13 },
  serviceChip: { maxWidth: "100%", borderRadius: 999, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, paddingHorizontal: 9, paddingVertical: 5 },
  serviceText: { color: C.inkMuted, ...S(600), fontSize: 10 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 },
  location: { color: C.inkFaint, fontSize: 12, flex: 1 },
  agentFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 15, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sand },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  rating: { color: C.ink, ...S(700), fontSize: 12 },
  jobs: { color: C.inkFaint, fontSize: 11, marginLeft: 3 },
  open: { flexDirection: "row", alignItems: "center", gap: 4 },
  openText: { color: C.greenText, ...S(700), fontSize: 12 },
});
