import { useMemo, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { T as Text } from "@/components/typography";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  CalendarIcon,
  CediIcon,
  FileTextIcon,
  HandsIcon,
  SparkleIcon,
  UsersIcon,
  type IconProps,
} from "@/components/icons";
import { api } from "@/lib/api";
import { push } from "@/lib/router";
import { route, ROUTES } from "@/lib/routes";
import type { Listing } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { useTheme } from "@/lib/theme-context";
import { D, ON_GREEN, S, onFill, withAlpha, type Palette } from "@/theme";
import { ErrorView, Loading, PhotoHero, Thumb } from "@/ui";
import type { ComponentType } from "react";

type DoorFilter = "all" | "investment" | "mentorship";

interface CommunityData {
  opportunities: Listing[];
  events: Listing[];
  memories: Listing[];
}

const FILTERS: { key: DoorFilter; label: string }[] = [
  { key: "all", label: "All open doors" },
  { key: "investment", label: "Investment" },
  { key: "mentorship", label: "Mentorship" },
];

function hasKind(listing: Listing, kind: Exclude<DoorFilter, "all">): boolean {
  return listing.details.kind === kind || listing.tags.includes(kind);
}

function formatDate(iso?: string): string {
  if (!iso) return "Date to be announced";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function initials(value: string): string {
  return value.split(" ").filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function openExternal(url?: string) {
  const value = url?.trim();
  if (value && /^(https?:|mailto:|tel:)/i.test(value)) void Linking.openURL(value);
}

export default function Community() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [filter, setFilter] = useState<DoorFilter>("all");
  const { data, error, loading, refreshing, reload } = useApi<CommunityData>(
    () => Promise.all([api.opportunities(), api.events(), api.memories()]).then(([opportunities, events, memories]) => ({ opportunities, events, memories })),
    "community",
  );

  const openDoors = useMemo(() => {
    const opportunities = data?.opportunities ?? [];
    return (filter === "all" ? opportunities : opportunities.filter((item) => hasKind(item, filter))).slice(0, 4);
  }, [data?.opportunities, filter]);

  const { eventCards, upcomingEventCount } = useMemo(() => {
    const all = (data?.events ?? []).slice().sort((a, b) => (a.details.startsAt ?? "").localeCompare(b.details.startsAt ?? ""));
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = all.filter((item) => (item.details.startsAt ?? "") >= today);
    const visible = upcoming.length > 0 ? upcoming : all;
    return { eventCards: visible.slice(0, 3), upcomingEventCount: visible.length };
  }, [data?.events]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Community data is unavailable."} />;

  const investmentCount = data.opportunities.filter((item) => hasKind(item, "investment")).length;
  const mentorshipCount = data.opportunities.filter((item) => hasKind(item, "mentorship")).length;

  return (
    <>
      <Stack.Screen options={{ title: "Community" }} />
      <ScrollView
        style={{ backgroundColor: C.paper }}
        contentContainerStyle={{ paddingBottom: 56 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.teal} colors={[C.teal]} />}
      >
        <PhotoHero
          image="/uploads/seed/fishermen.jpg"
          tone={C.teal}
          kicker="Participation makes the town"
          title="The community"
          lede="Open doors for the next generation, preserve what came before, and show up for what is happening now."
        />

        <View style={s.content}>
          <View style={s.metrics}>
            <Metric value={data.opportunities.length} label="open doors" />
            <Metric value={upcomingEventCount} label="coming up" />
            <Metric value={data.memories.length} label="memories" />
          </View>

          <SectionHeading kicker="CHOOSE YOUR PART" title="Where do you want to help?" />
          <View style={s.actionGrid}>
            <ActionTile icon={SparkleIcon} tone={C.tealText} title="Youth & opportunity" blurb="Jobs, training and scholarships" onPress={() => push(ROUTES.youth)} />
            <ActionTile icon={HandsIcon} tone={C.goldText} title="Civic pledge" blurb="Build a better Oguaa" onPress={() => push(ROUTES.better)} />
            <ActionTile icon={CediIcon} tone={C.greenText} title="Adopt a project" blurb="Back practical town improvements" onPress={() => push(ROUTES.projects)} />
            <ActionTile icon={UsersIcon} tone={C.clayText} title="Diaspora bridge" blurb="Find Oguaa people everywhere" onPress={() => push(ROUTES.diaspora)} />
          </View>

          <View style={s.sectionTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionKicker}>OPEN DOORS</Text>
              <Text style={s.sectionTitle}>Opportunity, with purpose</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => push(ROUTES.youth)} style={s.textLink}>
              <Text style={s.textLinkLabel}>Full board</Text>
              <ArrowRightIcon size={15} color={C.tealText} strokeWidth={2.5} />
            </Pressable>
          </View>

          <View style={s.filters}>
            {FILTERS.map((item) => {
              const count = item.key === "investment" ? investmentCount : item.key === "mentorship" ? mentorshipCount : data.opportunities.length;
              const active = filter === item.key;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={item.key}
                  onPress={() => setFilter(item.key)}
                  style={[s.filter, active && s.filterActive]}
                >
                  <Text style={[s.filterLabel, active && s.filterLabelActive]}>{item.label}</Text>
                  <Text style={[s.filterCount, active && s.filterLabelActive]}>{count}</Text>
                </Pressable>
              );
            })}
          </View>

          {openDoors.length > 0 ? (
            <View style={s.list}>
              {openDoors.map((item) => <OpportunityCard key={item.id} item={item} />)}
            </View>
          ) : (
            <View style={s.emptyCard}>
              <BriefcaseIcon size={26} color={C.inkFaint} strokeWidth={1.7} />
              <Text style={s.emptyTitle}>No calls in this lane yet</Text>
              <Text style={s.emptyBody}>Try another filter or check the full opportunity board.</Text>
            </View>
          )}

          {eventCards.length > 0 ? (
            <>
              <SectionHeading kicker="SHOW UP" title="What’s happening next" action="Full calendar" onAction={() => push(ROUTES.browseEvents)} />
              <View style={s.list}>
                {eventCards.map((item) => <EventCard key={item.id} item={item} />)}
              </View>
            </>
          ) : null}

          {data.memories.length > 0 ? (
            <>
              <SectionHeading kicker="HERITAGE, PRESERVED" title="From the memory wall" action="See all" onAction={() => push(ROUTES.browseMemories)} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.memoryRail}>
                {data.memories.slice(0, 5).map((item) => <MemoryCard key={item.id} item={item} />)}
              </ScrollView>
            </>
          ) : null}

          <View style={s.joinCard}>
            <View style={s.joinIcon}><HandsIcon size={26} color={C.gold} strokeWidth={1.8} /></View>
            <Text style={s.joinKicker}>TWO CROCODILES, ONE STOMACH</Text>
            <Text style={s.joinTitle}>Oguaa moves when we move together.</Text>
            <Text style={s.joinBody}>Create your profile, rep your town and school, or contribute something the whole community can use.</Text>
            <View style={s.joinActions}>
              <Pressable accessibilityRole="button" onPress={() => push(ROUTES.me)} style={s.joinPrimary}>
                <Text style={s.joinPrimaryText}>My community profile</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => push(ROUTES.submit)} style={s.joinSecondary}>
                <Text style={s.joinSecondaryText}>Contribute</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function SectionHeading({ kicker, title, action, onAction }: Readonly<{ kicker: string; title: string; action?: string; onAction?: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.sectionTop}>
      <View style={{ flex: 1 }}>
        <Text style={s.sectionKicker}>{kicker}</Text>
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={s.textLink}>
          <Text style={s.textLinkLabel}>{action}</Text>
          <ArrowRightIcon size={15} color={C.tealText} strokeWidth={2.5} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Metric({ value, label }: Readonly<{ value: number; label: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.metric}>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function ActionTile({ icon: Icon, tone, title, blurb, onPress }: Readonly<{ icon: ComponentType<IconProps>; tone: string; title: string; blurb: string; onPress: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.actionTile}>
      <View style={[s.actionIcon, { backgroundColor: withAlpha(tone, 0.12) }]}><Icon size={21} color={tone} strokeWidth={1.8} /></View>
      <Text style={s.actionTitle}>{title}</Text>
      <Text style={s.actionBlurb} numberOfLines={2}>{blurb}</Text>
      <ArrowRightIcon size={17} color={C.inkFaint} strokeWidth={2} />
    </Pressable>
  );
}

function OpportunityCard({ item }: Readonly<{ item: Listing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const kind = item.details.kind || item.tags.find((tag) => tag === "investment" || tag === "mentorship") || "opportunity";
  return (
    <View style={s.opportunityCard}>
      <View style={s.cardAccent} />
      <View style={s.cardTopline}>
        <View style={s.kindPill}><Text style={s.kindPillText}>{kind}</Text></View>
        {item.details.deadline ? <Text style={s.deadline}>Closes {formatDate(item.details.deadline)}</Text> : null}
      </View>
      <Text style={s.cardTitle}>{item.title}</Text>
      {item.details.description ? <Text style={s.cardBody} numberOfLines={3}>{item.details.description}</Text> : null}
      <View style={s.cardFooter}>
        <View style={s.providerBlock}>
          <Text style={s.providerLabel}>OFFERED BY</Text>
          <Text style={s.provider} numberOfLines={1}>{item.details.provider || "Community opportunity"}</Text>
        </View>
        {item.details.applyUrl ? (
          <Pressable accessibilityRole="link" onPress={() => openExternal(item.details.applyUrl)} style={s.applyButton}>
            <Text style={s.applyButtonText}>How to apply</Text>
            <ArrowRightIcon size={13} color={C.tealText} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function EventCard({ item }: Readonly<{ item: Listing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
      onPress={() => push(route.event(item.slug))}
      style={({ pressed }) => [s.eventCard, pressed && s.cardPressed]}
    >
      <View style={s.eventDate}>
        <Text style={s.eventDateKicker}>DATE</Text>
        <Text style={s.eventDateText}>{formatDate(item.details.startsAt)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.eventKickerRow}>
          <CalendarIcon size={12} color={C.goldText} strokeWidth={2} />
          <Text style={s.eventKicker}>WHAT’S ON</Text>
        </View>
        <Text style={s.eventTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={s.eventMeta} numberOfLines={1}>{item.details.venue || item.details.organiser || "Cape Coast"}</Text>
      </View>
      <View style={s.cardArrow}><ArrowRightIcon size={15} color={C.tealText} strokeWidth={2.4} /></View>
    </Pressable>
  );
}

function MemoryCard({ item }: Readonly<{ item: Listing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open memory wall for ${item.title}`}
      onPress={() => push(ROUTES.browseMemories)}
      style={({ pressed }) => [s.memoryCard, pressed && s.cardPressed]}
    >
      <Thumb seed={item.slug} src={item.coverImageUrl} label={initials(item.title)} style={s.memoryImage} labelStyle={s.memoryInitials} />
      <View style={s.memoryBody}>
        <View style={s.memoryKickerRow}>
          <FileTextIcon size={13} color={C.clayText} strokeWidth={1.9} />
          <Text style={s.memoryKicker}>MEMORY WALL</Text>
        </View>
        <Text style={s.memoryTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={s.memoryText} numberOfLines={2}>{item.details.text || item.details.description || "A story preserved by the people of Oguaa."}</Text>
        <Text style={s.memoryAction}>Open memory wall →</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  content: { paddingHorizontal: 16 },
  metrics: { flexDirection: "row", marginTop: -16, borderRadius: 18, borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, overflow: "hidden" },
  metric: { flex: 1, alignItems: "center", paddingVertical: 15, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.sand },
  metricValue: { ...S(700), color: C.ink, fontSize: 23 },
  metricLabel: { ...S(600), color: C.inkFaint, fontSize: 10, marginTop: 1, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionTop: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 30, marginBottom: 13 },
  sectionKicker: { ...S(700), color: C.tealText, fontSize: 10, letterSpacing: 1.7 },
  sectionTitle: { ...D(700), color: C.ink, fontSize: 24, lineHeight: 29, marginTop: 3 },
  textLink: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 5 },
  textLinkLabel: { ...S(700), color: C.tealText, fontSize: 12 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionTile: { width: "48.5%", minHeight: 132, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 18, padding: 13, alignItems: "flex-start" },
  actionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  actionTitle: { ...S(700), color: C.ink, fontSize: 15, lineHeight: 19 },
  actionBlurb: { color: C.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 4, flex: 1 },
  filters: { flexDirection: "row", gap: 8, marginBottom: 14 },
  filter: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: C.sand, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 7, justifyContent: "center", backgroundColor: C.cream },
  filterActive: { borderColor: C.teal, backgroundColor: C.teal },
  filterLabel: { ...S(700), color: C.inkMuted, fontSize: 11 },
  filterCount: { ...S(600), color: C.inkFaint, fontSize: 10, marginTop: 2 },
  filterLabelActive: { color: onFill(C.teal) },
  list: { gap: 10 },
  opportunityCard: { position: "relative", overflow: "hidden", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, paddingVertical: 14, paddingLeft: 17, paddingRight: 14 },
  cardAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.teal },
  cardTopline: { flexDirection: "row", alignItems: "center", gap: 8 },
  kindPill: { borderWidth: 1, borderColor: C.teal, backgroundColor: withAlpha(C.teal, 0.08), borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  kindPillText: { ...S(700), color: C.tealText, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.7 },
  deadline: { ...S(600), marginLeft: "auto", color: C.clayText, fontSize: 10 },
  cardTitle: { ...S(700), color: C.ink, fontSize: 17, lineHeight: 21, marginTop: 8 },
  cardBody: { color: C.inkMuted, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  cardFooter: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 11, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sand },
  providerBlock: { flex: 1, minWidth: 0 },
  providerLabel: { ...S(700), color: C.inkFaint, fontSize: 8, letterSpacing: 1.1 },
  provider: { color: C.inkMuted, fontSize: 11, marginTop: 2 },
  applyButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: C.teal, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  applyButtonText: { ...S(700), color: C.tealText, fontSize: 12 },
  emptyCard: { alignItems: "center", borderRadius: 18, borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, padding: 26 },
  emptyTitle: { ...S(700), color: C.ink, fontSize: 16, marginTop: 10 },
  emptyBody: { color: C.inkMuted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 4 },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  eventCard: { flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: C.sand, borderRadius: 15, backgroundColor: C.cream, padding: 10 },
  eventDate: { width: 68, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 11, backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35, paddingHorizontal: 5 },
  eventDateKicker: { ...S(700), color: C.inkFaint, fontSize: 7.5, letterSpacing: 1.2 },
  eventDateText: { ...S(700), color: C.goldText, fontSize: 10, lineHeight: 13, textAlign: "center" },
  eventKickerRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 },
  eventKicker: { ...S(700), color: C.goldText, fontSize: 8.5, letterSpacing: 1.1 },
  eventTitle: { ...S(700), color: C.ink, fontSize: 15, lineHeight: 19 },
  eventMeta: { color: C.inkMuted, fontSize: 11, marginTop: 3 },
  cardArrow: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(C.teal, 0.09) },
  memoryRail: { gap: 12, paddingRight: 16 },
  memoryCard: { width: 270, minHeight: 126, flexDirection: "row", borderWidth: 1, borderColor: C.sand, borderRadius: 16, backgroundColor: C.cream, overflow: "hidden" },
  memoryImage: { width: 92, alignSelf: "stretch" },
  memoryInitials: { ...S(700), fontSize: 20 },
  memoryBody: { flex: 1, padding: 12, minWidth: 0 },
  memoryKickerRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  memoryKicker: { ...S(700), color: C.clayText, fontSize: 8.5, letterSpacing: 1.1 },
  memoryTitle: { ...S(700), color: C.ink, fontSize: 15, lineHeight: 19, marginTop: 6 },
  memoryText: { color: C.inkMuted, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  memoryAction: { ...S(700), color: C.tealText, fontSize: 10.5, marginTop: "auto", paddingTop: 6 },
  joinCard: { marginTop: 34, padding: 20, borderRadius: 22, backgroundColor: C.green900, overflow: "hidden" },
  joinIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  joinKicker: { ...S(700), color: C.gold, fontSize: 9, letterSpacing: 1.5, marginTop: 18 },
  joinTitle: { ...D(700), color: ON_GREEN, fontSize: 24, lineHeight: 29, marginTop: 5 },
  joinBody: { color: C.onDarkText85, fontSize: 13, lineHeight: 19, marginTop: 8 },
  joinActions: { flexDirection: "row", gap: 9, marginTop: 18 },
  joinPrimary: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 44, borderRadius: 999, backgroundColor: C.gold },
  joinPrimaryText: { ...S(700), color: C.green900, fontSize: 12 },
  joinSecondary: { alignItems: "center", justifyContent: "center", minHeight: 44, borderWidth: 1, borderColor: C.onDarkText30, borderRadius: 999, paddingHorizontal: 17 },
  joinSecondaryText: { ...S(700), color: ON_GREEN, fontSize: 12 },
});
