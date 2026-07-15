import { Linking, StyleSheet, View, Pressable } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Animated from "react-native-reanimated";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { C, D, S, fillFor, initials } from "@/theme";
import { Loading, ErrorView, Thumb } from "@/ui";
import { cldCover } from "@/lib/cloudinary";
import { HeroParallax, RevealView, StaggerIn, useHeroParallax } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";

function openURL(url?: string) {
  const u = (url ?? "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(u)) Linking.openURL(u).catch(() => {});
}

interface BrowseView {
  title: string;
  kicker: string;
  lede: string;
  tone: string;
  countNoun: string;
  fetch: () => Promise<Listing[]>;
  sub: (l: Listing) => string;
  /** Route for a card tap; undefined = not navigable. */
  href?: (l: Listing) => string;
}

const VIEWS: Record<string, BrowseView> = {
  people: {
    title: "People",
    kicker: "The wall of pride",
    lede: "Sons and daughters of Oguaa — icons past and living.",
    tone: C.green,
    countNoun: "people",
    fetch: () => api.people(),
    sub: (l) => [l.details.era, l.details.whyNotable].filter(Boolean).join(" · ") || "Cape Coast",
    href: (l) => `/people/${l.slug}`,
  },
  business: {
    title: "Business",
    kicker: "The working city",
    lede: "The working city — markets, fishing, trade and the people behind them.",
    tone: C.teal,
    countNoun: "businesses",
    fetch: () => api.businesses(),
    sub: (l) => l.details.category || l.details.address || "Cape Coast",
    href: (l) => `/business/${l.slug}`,
  },
  events: {
    title: "Events",
    kicker: "The town calendar",
    lede: "From Fetu Afahye to school speech days and homecomings.",
    tone: C.green900,
    countNoun: "events",
    fetch: () => api.events(),
    sub: (l) => [l.details.startsAt, l.details.venue].filter(Boolean).join(" · ") || "Cape Coast",
    href: (l) => `/events/${l.slug}`,
  },
  opportunities: {
    title: "Opportunities",
    kicker: "Youth & opportunity",
    lede: "Jobs, scholarships and mentorship shared within the community.",
    tone: C.teal,
    countNoun: "opportunities",
    fetch: () => api.opportunities(),
    sub: (l) => [l.details.kind, l.details.deadline ? `closes ${l.details.deadline}` : ""].filter(Boolean).join(" · ") || "Open",
  },
  memories: {
    title: "Memories",
    kicker: "Old Cape Coast",
    lede: "Photos and stories of old Cape Coast, preserved.",
    tone: C.clay,
    countNoun: "memories",
    fetch: () => api.memories(),
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
  return (
    <View style={[s.hero, { backgroundColor: fillFor(e.slug) }]}>
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
  const { data, error, loading } = useApi<Listing[]>(
    () => (view ? view.fetch() : Promise.resolve([])),
    `browse:${type}`,
  );

  if (!view) return <ErrorView message="Unknown category" />;
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const isEvents = type === "events";
  const anchor = isEvents ? data.find((l) => l.details.anchorFestival) : undefined;
  const rest = anchor ? data.filter((l) => l.id !== anchor.id) : data;
  const isOpportunities = type === "opportunities";
  const sections = isEvents ? groupByMonth(rest) : [];

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

  return (
    <>
      <Stack.Screen options={{ title: view.title }} />
      <Animated.ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }} onScroll={onScroll} scrollEventThrottle={16}>
        <View style={[s.catHero, { backgroundColor: view.tone }]}>
          <HeroParallax scrollY={scrollY}>
            <Text style={s.catKicker}>{view.kicker}</Text>
            <Text style={s.catTitle}>{view.title}</Text>
            <Text style={s.catLede}>{view.lede}</Text>
            <Text style={s.catCount}>{data.length} {view.countNoun}</Text>
          </HeroParallax>
        </View>
        <View style={{ padding: 16, gap: 12 }}>
          {anchor && <RevealView><Pressable onPress={() => router.push(`/events/${anchor.slug}` as never)}><EventHero e={anchor} /></Pressable></RevealView>}
          {data.length === 0 && <EmptyState glyph="◎" title="Nothing here yet" body="Be the first to contribute." />}
          {isEvents
            ? sections.map((sec) => (
              <View key={sec.key} style={s.section}>
                <Text style={s.sectionHeader}>{sec.label}</Text>
                {sec.items.map((l, i) => renderCard(l, i))}
              </View>
            ))
            : rest.map((l, i) => renderCard(l, i))}
        </View>
      </Animated.ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  catHero: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 26, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  catKicker: { color: C.gold, fontSize: 10, letterSpacing: 2, fontWeight: "700", textTransform: "uppercase" },
  catTitle: { color: C.cream, ...D(700), fontSize: 32, marginTop: 6 },
  catLede: { color: "rgba(246,241,231,0.8)", fontSize: 14, lineHeight: 20, marginTop: 6 },
  catCount: { color: "rgba(246,241,231,0.55)", fontSize: 12, marginTop: 10, textTransform: "uppercase", letterSpacing: 1 },
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
  heroKicker: { color: "rgba(246,241,231,0.8)", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  heroTitle: { color: C.cream, ...D(700), fontSize: 24, marginTop: 4 },
  heroMeta: { color: "rgba(246,241,231,0.85)", fontSize: 13, marginTop: 4 },
  heroDesc: { color: "rgba(246,241,231,0.85)", fontSize: 13, lineHeight: 19, marginTop: 8 },
});
