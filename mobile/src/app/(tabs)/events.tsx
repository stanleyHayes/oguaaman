import { useMemo } from "react";
import { eventHasEnded, parseApiDate } from "@/lib/dates";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { D, S, initials, ON_GREEN, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, Thumb } from "@/ui";
import { EmptyState } from "@/components/empty-state";
import { route } from "@/lib/routes";
import { push } from "@/lib/router";
import { StaggerIn } from "@/components/anim";
import { ArrowRightIcon, CalendarIcon, MapPinIcon } from "@/components/icons";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface MonthSection {
  key: string;
  label: string;
  items: Listing[];
}

function monthLabel(key: string): string {
  if (key === "undated") return "Undated";
  const month = Number(key.slice(5, 7)) - 1;
  const name = MONTHS_LONG[month];
  return name ? `${name} ${key.slice(0, 4)}` : "Undated";
}

// Group already-sorted events into month sections. Past months carry a
// "past" key prefix and label so they never read as upcoming.
function groupByMonth(sorted: Listing[], past = false): MonthSection[] {
  const sections: MonthSection[] = [];
  for (const l of sorted) {
    const month = (l.details.startsAt ?? "").slice(0, 7) || "undated";
    const key = past ? `past:${month}` : month;
    const last = sections.at(-1);
    if (last?.key === key) last.items.push(l);
    else sections.push({ key, label: past ? `${monthLabel(month)} · past` : monthLabel(month), items: [l] });
  }
  return sections;
}

const byStart = (a: Listing, b: Listing) => (a.details.startsAt ?? "").localeCompare(b.details.startsAt ?? "");

// The calendar opens on what is still to come (soonest first, undated last);
// finished events follow, most recent first.
function splitCalendar(list: Listing[]): { sections: MonthSection[]; upcoming: number } {
  const upcoming = list.filter((l) => !eventHasEnded(l.details)).sort((a, b) => {
    if (!a.details.startsAt !== !b.details.startsAt) return a.details.startsAt ? -1 : 1;
    return byStart(a, b);
  });
  const past = list.filter((l) => eventHasEnded(l.details)).sort((a, b) => byStart(b, a));
  return { sections: [...groupByMonth(upcoming), ...groupByMonth(past, true)], upcoming: upcoming.length };
}

function eventDateParts(value?: string): { day: string; month: string } {
  if (!value) return { day: "--", month: "TBA" };
  const date = parseApiDate(value);
  if (!date) return { day: "--", month: "TBA" };
  return {
    day: date.toLocaleDateString(undefined, { day: "2-digit" }),
    month: date.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
  };
}

function EventCard({ listing: l, index }: Readonly<{ listing: Listing; index: number }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const date = eventDateParts(l.details.startsAt);
  const meta = [l.details.startsAt, l.details.venue].filter(Boolean).join(" · ") || "Cape Coast";
  return (
    <StaggerIn index={index}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${l.title}. ${meta}`}
        accessibilityHint="Opens event details"
        onPress={() => push(route.event(l.slug))}
        style={s.card}
      >
        <View style={s.thumbWrap}>
          <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.thumb} labelStyle={s.thumbInit} />
          <View style={s.dateBadge}>
            <Text style={s.dateDay}>{date.day}</Text>
            <Text style={s.dateMonth}>{date.month}</Text>
          </View>
        </View>
        <View style={s.cardBody}>
          <Text style={s.cardKicker}>{l.details.festival ? "Festival" : "Town event"}</Text>
          <Text style={s.title} numberOfLines={2}>{l.title}</Text>
          <View style={s.venueRow}>
            <MapPinIcon size={13} color={C.inkFaint} strokeWidth={2} />
            <Text style={s.sub} numberOfLines={1}>{l.details.venue || "Cape Coast"}</Text>
          </View>
        </View>
        <View style={s.cardArrow}>
          <ArrowRightIcon size={16} color={C.greenText} strokeWidth={2.2} />
        </View>
      </Pressable>
    </StaggerIn>
  );
}

export default function EventsTab() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  // GET /api/events returns every approved event, past editions included, so
  // the whole calendar is loaded and split here (a town calendar is small).
  const { data, loading, refreshing, error, reload } = useApi<Listing[]>(() => api.events(), "events:tab");
  const { sections, upcoming } = useMemo(() => splitCalendar(data ?? []), [data]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No events"} />;

  return (
    <>
      <Stack.Screen options={{ title: "Events" }} />
      <FlatList<MonthSection>
        style={{ backgroundColor: C.paper }}
        contentContainerStyle={{ paddingBottom: 40 }}
        data={sections}
        keyExtractor={(sec) => sec.key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.green} colors={[C.green]} />}
        ListHeaderComponent={
          <View style={s.hero}>
            <Text style={s.heroKicker}>THE TOWN CALENDAR</Text>
            <Text style={s.heroTitle}>Events</Text>
            <Text style={s.heroMeta}>{upcoming} upcoming {upcoming === 1 ? "event" : "events"}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={s.pad}>
            <EmptyState icon={<CalendarIcon size={28} color={C.goldText} strokeWidth={1.8} />} title="Nothing here yet" body="Be the first to contribute an event." />
          </View>
        }
        renderItem={({ item: sec }) => (
          <View style={s.section}>
            <View style={s.sectionHeadingRow}>
              <Text style={s.sectionHeader}>{sec.label}</Text>
              <Text style={s.sectionCount}>{sec.items.length} {sec.items.length === 1 ? "event" : "events"}</Text>
            </View>
            {sec.items.map((l, i) => <EventCard key={l.id} listing={l} index={i} />)}
          </View>
        )}
      />
    </>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingTop: 16 },
  hero: { backgroundColor: C.green, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 28, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroKicker: { color: C.gold, fontSize: 11, letterSpacing: 2, ...S(700) },
  heroTitle: { color: ON_GREEN, ...D(700), fontSize: 32, marginTop: 6 },
  heroMeta: { color: "rgba(246,241,231,0.8)", fontSize: 13, marginTop: 6 },
  section: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 3, marginBottom: 1 },
  sectionHeader: { color: C.goldText, ...S(700), fontSize: 14, textTransform: "uppercase", letterSpacing: 1.2 },
  sectionCount: { color: C.inkFaint, ...S(500), fontSize: 11 },
  card: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 18, padding: 10, minHeight: 104, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  thumbWrap: { width: 82, height: 82 },
  thumb: { width: 82, height: 82, borderRadius: 14 },
  thumbInit: { color: ON_GREEN, ...S(700), fontSize: 20 },
  dateBadge: { position: "absolute", left: 6, bottom: 6, minWidth: 38, borderRadius: 9, backgroundColor: C.green900, paddingHorizontal: 7, paddingVertical: 4, alignItems: "center", borderWidth: 1, borderColor: C.onDarkText30 },
  dateDay: { color: ON_GREEN, ...S(700), fontSize: 15, lineHeight: 16 },
  dateMonth: { color: C.gold, ...S(700), fontSize: 8, letterSpacing: 0.8, marginTop: 1 },
  cardBody: { flex: 1, minWidth: 0, paddingVertical: 2 },
  cardKicker: { color: C.goldText, ...S(700), fontSize: 10, letterSpacing: 1.25, textTransform: "uppercase" },
  title: { ...S(700), fontSize: 17, lineHeight: 21, color: C.ink, marginTop: 3 },
  venueRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  sub: { flex: 1, color: C.inkMuted, fontSize: 12 },
  cardArrow: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
});
