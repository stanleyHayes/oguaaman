import { Linking, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { C, serif, fillFor, initials } from "@/theme";
import { Loading, ErrorView, Thumb } from "@/ui";
import { cldCover } from "@/lib/cloudinary";

function openURL(url?: string) {
  const u = (url ?? "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(u)) Linking.openURL(u).catch(() => {});
}

interface BrowseView {
  title: string;
  lede: string;
  fetch: () => Promise<Listing[]>;
  sub: (l: Listing) => string;
  /** Route for a card tap; undefined = not navigable. */
  href?: (l: Listing) => string;
}

const VIEWS: Record<string, BrowseView> = {
  people: {
    title: "People",
    lede: "Sons and daughters of Oguaa — icons past and living.",
    fetch: () => api.people(),
    sub: (l) => [l.details.era, l.details.whyNotable].filter(Boolean).join(" · ") || "Cape Coast",
    href: (l) => `/people/${l.slug}`,
  },
  business: {
    title: "Business",
    lede: "The working city — markets, fishing, trade and the people behind them.",
    fetch: () => api.businesses(),
    sub: (l) => l.details.category || l.details.address || "Cape Coast",
    href: (l) => `/business/${l.slug}`,
  },
  events: {
    title: "Events",
    lede: "From Fetu Afahye to school speech days and homecomings.",
    fetch: () => api.events(),
    sub: (l) => [l.details.startsAt, l.details.venue].filter(Boolean).join(" · ") || "Cape Coast",
    href: (l) => `/events/${l.slug}`,
  },
  opportunities: {
    title: "Opportunities",
    lede: "Jobs, scholarships and mentorship shared within the community.",
    fetch: () => api.opportunities(),
    sub: (l) => [l.details.kind, l.details.deadline ? `closes ${l.details.deadline}` : ""].filter(Boolean).join(" · ") || "Open",
  },
  memories: {
    title: "Memories",
    lede: "Photos and stories of old Cape Coast, preserved.",
    fetch: () => api.memories(),
    sub: (l) => l.details.text?.slice(0, 80) ?? "",
  },
};

// The anchor festival (Fetu Afahye) leads the events list, like the web page.
function EventHero({ e }: { e: Listing }) {
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

  return (
    <>
      <Stack.Screen options={{ title: view.title }} />
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <Text style={s.lede}>{view.lede}</Text>
        {anchor && <Pressable onPress={() => router.push(`/events/${anchor.slug}` as never)}><EventHero e={anchor} /></Pressable>}
        {data.length === 0 && <Text style={s.empty}>Nothing here yet — be the first to contribute.</Text>}
        {rest.map((l) => {
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
          return href ? (
            <Pressable key={l.id} onPress={() => router.push(href as never)}>{card}</Pressable>
          ) : (
            <View key={l.id}>{card}</View>
          );
        })}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  lede: { color: C.inkMuted, fontSize: 14, lineHeight: 20 },
  empty: { color: C.inkFaint, fontStyle: "italic", textAlign: "center", marginTop: 20 },
  card: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 14 },
  thumb: { width: 56, height: 56, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  thumbInit: { color: C.cream, fontFamily: serif, fontSize: 20, fontWeight: "700" },
  title: { fontFamily: serif, fontSize: 18, fontWeight: "700", color: C.ink },
  sub: { color: C.goldText, fontSize: 12, marginTop: 3 },
  chevron: { color: C.inkFaint, fontSize: 22, fontWeight: "700" },
  oppDesc: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  applyBtn: { alignSelf: "flex-start", borderWidth: 1, borderColor: C.teal, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, marginTop: 10 },
  applyText: { color: C.tealText, fontSize: 13, fontWeight: "700" },
  hero: { borderRadius: 16, overflow: "hidden" },
  heroImg: { width: "100%", height: 130 },
  heroBody: { padding: 16 },
  heroKicker: { color: "rgba(246,241,231,0.8)", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  heroTitle: { color: C.cream, fontFamily: serif, fontSize: 24, fontWeight: "700", marginTop: 4 },
  heroMeta: { color: "rgba(246,241,231,0.85)", fontSize: 13, marginTop: 4 },
  heroDesc: { color: "rgba(246,241,231,0.85)", fontSize: 13, lineHeight: 19, marginTop: 8 },
});
