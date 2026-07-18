import { useMemo } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { usePaginatedList } from "@/lib/use-paginated";
import type { Listing } from "@/lib/types";
import { D, S, initials, ON_GREEN, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, Thumb } from "@/ui";
import { EmptyState } from "@/components/empty-state";
import { ListFooter } from "@/components/list-footer";
import { route } from "@/lib/routes";
import { push } from "@/lib/router";
import { StaggerIn } from "@/components/anim";
import { CalendarIcon } from "@/components/icons";

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

function groupByMonth(list: Listing[]): MonthSection[] {
  const sorted = list.slice().sort((a, b) => (a.details.startsAt ?? "").localeCompare(b.details.startsAt ?? ""));
  const sections: MonthSection[] = [];
  for (const l of sorted) {
    const key = (l.details.startsAt ?? "").slice(0, 7) || "undated";
    const last = sections.at(-1);
    if (last?.key === key) last.items.push(l);
    else sections.push({ key, label: monthLabel(key), items: [l] });
  }
  return sections;
}

function EventCard({ listing: l, index }: Readonly<{ listing: Listing; index: number }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <StaggerIn index={index}>
      <Pressable accessibilityRole="button" onPress={() => push(route.event(l.slug))} style={s.card}>
        <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.thumb} labelStyle={s.thumbInit} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title}>{l.title}</Text>
          <Text style={s.sub}>{[l.details.startsAt, l.details.venue].filter(Boolean).join(" · ") || "Cape Coast"}</Text>
        </View>
      </Pressable>
    </StaggerIn>
  );
}

export default function EventsTab() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { items, total, loading, loadingMore, refreshing, error, hasMore, loadMore, refresh } =
    usePaginatedList<Listing>((page, pageSize) => api.events({ page, pageSize }), "events:tab", 24);

  const sections = useMemo(() => groupByMonth(items), [items]);

  if (loading) return <Loading />;
  if (error && items.length === 0) return <ErrorView message={error} />;

  return (
    <>
      <Stack.Screen options={{ title: "Events" }} />
      <FlatList<MonthSection>
        style={{ backgroundColor: C.paper }}
        contentContainerStyle={{ paddingBottom: 40 }}
        data={sections}
        keyExtractor={(sec) => sec.key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green} colors={[C.green]} />}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={s.hero}>
            <Text style={s.heroKicker}>THE TOWN CALENDAR</Text>
            <Text style={s.heroTitle}>Events</Text>
            <Text style={s.heroMeta}>{total} upcoming {total === 1 ? "event" : "events"}</Text>
          </View>
        }
        ListFooterComponent={
          <ListFooter
            loadingMore={loadingMore}
            hasMore={hasMore}
            onLoadMore={loadMore}
            endLabel={!hasMore && total > 0 ? `${total} events` : undefined}
          />
        }
        ListEmptyComponent={
          <View style={s.pad}>
            <EmptyState icon={<CalendarIcon size={28} color={C.goldText} strokeWidth={1.8} />} title="Nothing here yet" body="Be the first to contribute an event." />
          </View>
        }
        renderItem={({ item: sec }) => (
          <View style={s.section}>
            <Text style={s.sectionHeader}>{sec.label}</Text>
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
  section: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  sectionHeader: { color: C.goldText, ...S(700), fontSize: 15, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 },
  card: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 14, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  thumb: { width: 60, height: 60, borderRadius: 12 },
  thumbInit: { color: ON_GREEN, ...S(700), fontSize: 20 },
  title: { ...S(700), fontSize: 18, color: C.ink },
  sub: { color: C.goldText, fontSize: 12, marginTop: 3 },
});
