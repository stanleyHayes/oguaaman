import { useMemo } from "react";
import { Linking, RefreshControl, StyleSheet, View, Pressable } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Animated from "react-native-reanimated";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { usePaginatedList, wholeListAsPage, type PageFetcher } from "@/lib/use-paginated";
import type { Listing } from "@/lib/types";
import { D, S, fillFor, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, PhotoHero, Thumb } from "@/ui";
import { cldCover } from "@/lib/cloudinary";
import { RevealView, StaggerIn, useHeroParallax } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import { ListFooter } from "@/components/list-footer";

function openURL(url?: string) {
  const u = (url ?? "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(u)) Linking.openURL(u).catch(() => {});
}

interface BrowseView {
  title: string;
  kicker: string;
  lede: string;
  /** Palette token for the hero band tint — resolved against the active theme. */
  tone: keyof Palette;
  /** Seed photo for the hero band (mirrors the portal section heroes). */
  image: string;
  countNoun: string;
  /**
   * Page fetcher. Backend-paginated pillars (business/events/memories) hit the
   * `?page` envelope; the rest come back whole as a single page via
   * `wholeListAsPage` (so the list renders through one uniform path).
   */
  load: PageFetcher<Listing>;
  sub: (l: Listing) => string;
  /** Route for a card tap; undefined = not navigable. */
  href?: (l: Listing) => string;
}

const VIEWS: Record<string, BrowseView> = {
  people: {
    title: "People",
    kicker: "The wall of pride",
    lede: "Sons and daughters of Oguaa — icons past and living.",
    tone: "green",
    image: "/uploads/seed/fetu-queenmother.jpg",
    countNoun: "people",
    load: wholeListAsPage(() => api.people()),
    sub: (l) => [l.details.era, l.details.whyNotable].filter(Boolean).join(" · ") || "Cape Coast",
    href: (l) => `/people/${l.slug}`,
  },
  business: {
    title: "Business",
    kicker: "The working city",
    lede: "The working city — markets, fishing, trade and the people behind them.",
    tone: "teal",
    image: "/uploads/seed/market-women.jpg",
    countNoun: "businesses",
    load: (page, pageSize) => api.businesses({ page, pageSize }),
    sub: (l) => l.details.category || l.details.address || "Cape Coast",
    href: (l) => `/business/${l.slug}`,
  },
  events: {
    title: "Events",
    kicker: "The town calendar",
    lede: "From Fetu Afahye to school speech days and homecomings.",
    tone: "green900",
    image: "/uploads/seed/bakatue-2016.jpg",
    countNoun: "events",
    load: (page, pageSize) => api.events({ page, pageSize }),
    sub: (l) => [l.details.startsAt, l.details.venue].filter(Boolean).join(" · ") || "Cape Coast",
    href: (l) => `/events/${l.slug}`,
  },
  opportunities: {
    title: "Opportunities",
    kicker: "Youth & opportunity",
    lede: "Jobs, scholarships, mentorship and investment calls shared within the community.",
    tone: "teal",
    image: "/uploads/seed/school-girl-ghana.jpg",
    countNoun: "opportunities",
    load: wholeListAsPage(() => api.opportunities()),
    sub: (l) => [l.details.kind, l.details.deadline ? `closes ${l.details.deadline}` : ""].filter(Boolean).join(" · ") || "Open",
  },
  memories: {
    title: "Memories",
    kicker: "Old Cape Coast",
    lede: "Photos and stories of old Cape Coast, preserved.",
    tone: "clay",
    image: "/uploads/seed/fishermen.jpg",
    countNoun: "memories",
    load: (page, pageSize) => api.memories({ page, pageSize }),
    sub: (l) => l.details.text?.slice(0, 80) ?? "",
  },
};

// The anchor festival (Fetu Afahye) leads the events list, like the web page.
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

/** Group events into ascending month sections (ISO date strings sort lexically). */
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
function EventHero({ e }: Readonly<{ e: Listing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={[s.hero, { backgroundColor: fillFor(e.slug, C) }]}>
      {e.coverImageUrl ? <Thumb seed={e.slug} src={cldCover(e.coverImageUrl, 400)} style={s.heroImg} /> : null}
      <View style={s.heroBody}>
        <Text style={s.heroKicker}>THE ANCHOR FESTIVAL</Text>
        <Text style={s.heroTitle}>{e.title}</Text>
        <Text style={s.heroMeta}>{[e.details.startsAt, e.details.venue].filter(Boolean).join(" · ")}</Text>
        {e.details.description ? <Text style={s.heroDesc} numberOfLines={3}>{e.details.description}</Text> : null}
      </View>
    </View>
  );
}

export default function Browse() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const view = VIEWS[type ?? ""];
  const { scrollY, onScroll } = useHeroParallax();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const { items, total, loading, loadingMore, refreshing, error, hasMore, loadMore, refresh } =
    usePaginatedList<Listing>(
      (page, pageSize) => (view ? view.load(page, pageSize) : Promise.resolve({ items: [], total: 0, page, pageSize, totalPages: 0 })),
      `browse:${type}`,
    );

  const isEvents = type === "events";
  const isOpportunities = type === "opportunities";
  // Fetu Afahye leads the events screen in a dedicated hero, out of the month grid.
  const anchor = isEvents ? items.find((l) => l.details.anchorFestival) : undefined;
  const rest = anchor ? items.filter((l) => l.id !== anchor.id) : items;
  const sections = useMemo(() => (isEvents ? groupByMonth(rest) : []), [isEvents, rest]);

  if (!view) return <ErrorView message="Unknown category" />;
  if (loading) return <Loading />;
  if (error && items.length === 0) return <ErrorView message={error} />;

  const renderCard = (l: Listing, i: number) => {
    const href = view.href?.(l);
    const card = (
      <View style={[s.card, isOpportunities && { alignItems: "flex-start" }]}>
        <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.thumb} labelStyle={s.thumbInit} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title}>{l.title}</Text>
          <Text style={s.sub}>{view.sub(l)}</Text>
          {isOpportunities && l.details.description ? (
            <Text style={s.oppDesc} numberOfLines={3}>{l.details.description}</Text>
          ) : null}
          {isOpportunities && l.details.applyUrl ? (
            <Pressable onPress={() => openURL(l.details.applyUrl)} style={s.applyBtn}>
              <Text style={s.applyText}>How to apply ↗</Text>
            </Pressable>
          ) : null}
        </View>
        {href ? <Text style={s.chevron}>›</Text> : null}
      </View>
    );
    return (
      <StaggerIn key={l.id} index={i}>
        {href ? (
          <Pressable onPress={() => router.push(href as never)}>{card}</Pressable>
        ) : (
          <View>{card}</View>
        )}
      </StaggerIn>
    );
  };

  const header = (
    <View>
      <PhotoHero image={view.image} tone={C[view.tone]} kicker={view.kicker} title={view.title} lede={view.lede} count={`${total} ${view.countNoun}`} scrollY={scrollY} />
      {anchor ? (
        <View style={s.pad}>
          <RevealView>
            <Pressable onPress={() => router.push(`/events/${anchor.slug}` as never)}><EventHero e={anchor} /></Pressable>
          </RevealView>
        </View>
      ) : null}
    </View>
  );

  const footer = (
    <ListFooter
      loadingMore={loadingMore}
      hasMore={hasMore}
      onLoadMore={loadMore}
      endLabel={!hasMore && total > 0 ? `${total} ${view.countNoun}` : undefined}
    />
  );

  const empty = items.length === 0
    ? <View style={s.pad}><EmptyState glyph="◎" title="Nothing here yet" body="Be the first to contribute." /></View>
    : null;

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green} colors={[C.green]} />
  );

  const shared = {
    style: { backgroundColor: C.paper },
    contentContainerStyle: { paddingBottom: 40 },
    onScroll,
    scrollEventThrottle: 16,
    onEndReached: () => loadMore(),
    onEndReachedThreshold: 0.5,
    ListHeaderComponent: header,
    ListFooterComponent: footer,
    ListEmptyComponent: empty,
    refreshControl,
  };

  return (
    <>
      <Stack.Screen options={{ title: view.title }} />
      {isEvents ? (
        <Animated.FlatList<MonthSection>
          {...shared}
          data={sections}
          keyExtractor={(sec) => sec.key}
          renderItem={({ item: sec }) => (
            <View style={[s.section, s.pad]}>
              <Text style={s.sectionHeader}>{sec.label}</Text>
              {sec.items.map((l, i) => renderCard(l, i))}
            </View>
          )}
        />
      ) : (
        <Animated.FlatList<Listing>
          {...shared}
          data={items}
          keyExtractor={(l) => l.id}
          renderItem={({ item, index }) => (
            <View style={[s.pad, { paddingTop: index === 0 ? 16 : 12 }]}>{renderCard(item, index)}</View>
          )}
        />
      )}
    </>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingTop: 16 },
  section: { gap: 12 },
  sectionHeader: { color: C.goldText, ...S(700), fontSize: 15, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 },
  card: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 14, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  thumb: { width: 60, height: 60, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  thumbInit: { color: C.cream, ...S(700), fontSize: 20 },
  title: { ...S(700), fontSize: 18, color: C.ink },
  sub: { color: C.goldText, fontSize: 12, marginTop: 3 },
  chevron: { color: C.inkFaint, fontSize: 22, fontWeight: "700" },
  oppDesc: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  applyBtn: { alignSelf: "flex-start", borderWidth: 1, borderColor: C.teal, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, marginTop: 10 },
  applyText: { color: C.tealText, fontSize: 13, fontWeight: "700" },
  hero: { borderRadius: 16, overflow: "hidden" },
  heroImg: { width: "100%", height: 130 },
  heroBody: { padding: 16 },
  // On-dark kicker at 0.8 — no palette token carries this alpha, and the hero
  // fill stays dark in both themes, so the literal is effectively theme-proof.
  heroKicker: { color: "rgba(246,241,231,0.8)", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  heroTitle: { color: C.cream, ...D(700), fontSize: 24, marginTop: 4 },
  heroMeta: { color: C.onDarkText85, fontSize: 13, marginTop: 4 },
  heroDesc: { color: C.onDarkText85, fontSize: 13, lineHeight: 19, marginTop: 8 },
});
