import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { AgentCard, OutsideDisclaimer, serviceLabeller } from "@/components/outside";
import { ArrowRightIcon, BriefcaseIcon, SearchIcon, ShieldIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { push } from "@/lib/router";
import { ROUTES } from "@/lib/routes";
import { useApi } from "@/lib/use-api";
import { useTheme } from "@/lib/theme-context";
import type { Agent, AgentService } from "@/lib/types";
import { D, ON_GREEN, S, withAlpha, type Palette } from "@/theme";
import { ErrorView, Loading } from "@/ui";
import { EmptyState } from "@/components/empty-state";

interface OutsideData { agents: Agent[]; services: AgentService[] }

const ALL = "all";

export default function OutsideDirectoryScreen() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, loading, error, reload } = useApi<OutsideData>(async () => {
    const [agents, services] = await Promise.all([api.agents(), api.agentServices().catch(() => [] as AgentService[])]);
    return { agents, services };
  }, "outside:directory");
  const [query, setQuery] = useState("");
  const [service, setService] = useState(ALL);
  const [area, setArea] = useState(ALL);

  if (loading) return <Loading />;
  if (error && !data) return <ErrorView message={error} />;

  const agents = data?.agents ?? [];
  const services = data?.services ?? [];
  const offered = new Set(agents.flatMap((agent) => agent.services));
  const availableServices = services.filter((item) => offered.has(item.slug));
  const areas = [...new Set(agents.flatMap((agent) => agent.coverageAreas).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const term = query.trim().toLowerCase();
  const shown = agents.filter((agent) => {
    const haystack = [agent.displayName, agent.headline, agent.bio, ...agent.services, ...agent.coverageAreas].join(" ").toLowerCase();
    return (!term || haystack.includes(term))
      && (service === ALL || agent.services.includes(service))
      && (area === ALL || agent.coverageAreas.some((item) => item.toLowerCase() === area.toLowerCase()));
  });
  const labelFor = serviceLabeller(services);
  const hasFilters = !!term || service !== ALL || area !== ALL;

  function reset() {
    setQuery("");
    setService(ALL);
    setArea(ALL);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Oguaa Outside" }} />
      <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <View style={s.orbLarge} /><View style={s.orbSmall} />
          <Text style={s.heroKicker}>VETTED HELP · WHEREVER YOU ARE</Text>
          <Text style={s.heroTitle}>Get things done back home.</Text>
          <Text style={s.heroBody}>Find trusted people for procurement, shipping, inspections, travel coordination and official errands.</Text>
          <View style={s.heroActions}>
            <Pressable accessibilityRole="button" onPress={() => push(ROUTES.outsideJobs)} style={s.heroPrimary}>
              <Text style={s.heroPrimaryText}>My requests</Text><ArrowRightIcon size={16} color={C.green900} strokeWidth={2.4} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => push(ROUTES.outsideBecomeAgent)} style={s.heroSecondary}>
              <Text style={s.heroSecondaryText}>Become an agent</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.main}>
          <OutsideDisclaimer />

          <View style={s.filterCard}>
            <View style={s.filterHead}>
              <View><Text style={s.filterKicker}>FIND THE RIGHT HELP</Text><Text style={s.filterTitle}>Who can run this errand?</Text></View>
              <View style={s.filterIcon}><SearchIcon size={19} color={C.goldText} strokeWidth={2} /></View>
            </View>
            <View style={s.searchWrap}>
              <SearchIcon size={17} color={C.inkFaint} strokeWidth={2} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search agents, services or places" placeholderTextColor={C.inkFaint} style={s.searchInput} />
            </View>
            <Text style={s.label}>SERVICE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
              <FilterChip label="All services" active={service === ALL} onPress={() => setService(ALL)} />
              {availableServices.map((item) => <FilterChip key={item.slug} label={item.label} active={service === item.slug} onPress={() => setService(item.slug)} />)}
            </ScrollView>
            <Text style={s.label}>COVERAGE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
              <FilterChip label="Everywhere" active={area === ALL} onPress={() => setArea(ALL)} />
              {areas.map((item) => <FilterChip key={item} label={item} active={area === item} onPress={() => setArea(item)} />)}
            </ScrollView>
          </View>

          <View style={s.resultsHead}>
            <View><Text style={s.resultsKicker}>VERIFIED DIRECTORY</Text><Text style={s.resultsTitle}>{shown.length} {shown.length === 1 ? "agent" : "agents"}</Text></View>
            {hasFilters ? <Pressable accessibilityRole="button" hitSlop={10} onPress={reset}><Text style={s.reset}>Clear filters</Text></Pressable> : null}
          </View>

          {shown.length ? (
            <View style={s.list}>{shown.map((agent) => <AgentCard key={agent.id} agent={agent} serviceLabel={labelFor} />)}</View>
          ) : (
            <View style={s.empty}>
              <EmptyState
                icon={<BriefcaseIcon size={50} color={C.inkFaint} strokeWidth={1.5} />}
                title={hasFilters ? "No agent matches yet" : "The directory is opening soon"}
                body={hasFilters ? "Try a broader service or place." : "Applications are being vetted before agents appear here."}
                actionLabel={hasFilters ? "Clear filters" : "Refresh"}
                onAction={hasFilters ? reset : reload}
              />
            </View>
          )}

          <View style={s.howCard}>
            <View style={s.howIcon}><ShieldIcon size={24} color={C.gold} strokeWidth={2} /></View>
            <Text style={s.howKicker}>HOW IT WORKS</Text>
            <Text style={s.howTitle}>One request. Three protected steps.</Text>
            {[
              ["01", "Choose", "Read the agent's services, coverage and reputation."],
              ["02", "Fund", "Accept a quote and place the amount in managed escrow."],
              ["03", "Release", "Confirm only after the agent delivers the agreed work."],
            ].map(([n, title, body]) => (
              <View key={n} style={s.step}><Text style={s.stepNumber}>{n}</Text><View style={{ flex: 1 }}><Text style={s.stepTitle}>{title}</Text><Text style={s.stepBody}>{body}</Text></View></View>
            ))}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function FilterChip({ label, active, onPress }: Readonly<{ label: string; active: boolean; onPress: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  page: { flex: 1, backgroundColor: C.paper },
  content: { paddingBottom: 48 },
  hero: { minHeight: 350, overflow: "hidden", backgroundColor: C.green900, paddingHorizontal: 22, paddingTop: 44, paddingBottom: 32 },
  orbLarge: { position: "absolute", width: 270, height: 270, borderRadius: 140, right: -110, top: -90, borderWidth: 1, borderColor: C.goldBorder35, backgroundColor: C.goldTint14 },
  orbSmall: { position: "absolute", width: 110, height: 110, borderRadius: 60, right: 90, bottom: -56, borderWidth: 1, borderColor: C.onDarkText10 },
  heroKicker: { color: C.gold, ...S(700), fontSize: 10, letterSpacing: 2.1 },
  heroTitle: { color: ON_GREEN, ...D(700), fontSize: 41, lineHeight: 44, maxWidth: 330, marginTop: 13 },
  heroBody: { color: C.onDarkText85, fontSize: 15, lineHeight: 22, maxWidth: 340, marginTop: 14 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 24 },
  heroPrimary: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 17, paddingVertical: 12 },
  heroPrimaryText: { color: C.green900, ...S(700), fontSize: 13 },
  heroSecondary: { borderRadius: 999, borderWidth: 1, borderColor: C.onDarkText30, paddingHorizontal: 17, paddingVertical: 12 },
  heroSecondaryText: { color: ON_GREEN, ...S(700), fontSize: 13 },
  main: { padding: 16, gap: 18, marginTop: -18 },
  filterCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 20, padding: 15, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  filterHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  filterKicker: { color: C.goldText, ...S(700), fontSize: 9, letterSpacing: 1.5 },
  filterTitle: { color: C.ink, ...D(700), fontSize: 19, marginTop: 2 },
  filterIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35, alignItems: "center", justifyContent: "center" },
  searchWrap: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, paddingHorizontal: 12, marginTop: 15 },
  searchInput: { color: C.ink, flex: 1, minWidth: 0, fontSize: 14, paddingVertical: 11 },
  label: { color: C.inkFaint, ...S(700), fontSize: 9, letterSpacing: 1.5, marginTop: 15, marginBottom: 7 },
  chips: { gap: 7, paddingRight: 4 },
  chip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipActive: { borderColor: C.green, backgroundColor: C.green },
  chipText: { color: C.inkMuted, ...S(600), fontSize: 11 },
  chipTextActive: { color: ON_GREEN },
  resultsHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 4 },
  resultsKicker: { color: C.tealText, ...S(700), fontSize: 9, letterSpacing: 1.5 },
  resultsTitle: { color: C.ink, ...D(700), fontSize: 27, marginTop: 2 },
  reset: { color: C.clayText, ...S(700), fontSize: 12 },
  list: { gap: 12 },
  empty: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 20 },
  howCard: { overflow: "hidden", backgroundColor: C.green900, borderRadius: 22, padding: 18 },
  howIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: withAlpha(C.gold, 0.12), alignItems: "center", justifyContent: "center", marginBottom: 16 },
  howKicker: { color: C.gold, ...S(700), fontSize: 9, letterSpacing: 1.7 },
  howTitle: { color: ON_GREEN, ...D(700), fontSize: 24, lineHeight: 28, marginTop: 4, marginBottom: 10 },
  step: { flexDirection: "row", gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.onDarkText10 },
  stepNumber: { color: C.gold, ...S(700), fontSize: 11, letterSpacing: 1.2, marginTop: 2 },
  stepTitle: { color: ON_GREEN, ...S(700), fontSize: 13 },
  stepBody: { color: C.onDarkText60, fontSize: 12, lineHeight: 18, marginTop: 2 },
});
