import { useMemo } from "react";
import { Image, ScrollView, StyleSheet, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, router } from "expo-router";
import Animated from "react-native-reanimated";
import { T as Text } from "@/components/typography";
import { api, mediaUrl } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { HomeData, Listing, NewsArticle } from "@/lib/types";
import { D, S, SI, ON_GREEN, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, Mark, Pill, Thumb } from "@/ui";
import { HeroParallax, PressScale, RevealView, StaggerIn, useHeroParallax } from "@/components/anim";
import { useNavDrawer } from "@/components/nav-drawer";
import { useDirectives } from "@/lib/directives";
import { TopBarActions } from "@/components/top-bar-actions";

// Route a featured listing to its canonical screen (any type can be featured).
function featuredRoute(l: Listing): string {
  switch (l.type) {
    case "artist": return `/music/${l.slug}`;
    case "memorial": return `/memoriam/${l.slug}`;
    case "business": return `/business/${l.slug}`;
    case "person": return `/people/${l.slug}`;
    case "project": return `/projects/${l.slug}`;
    case "event": return "/browse/events";
    default: return "/browse/memories";
  }
}

// Paid/editorial featured placements (spec §8.14) — quietly skipped when empty.
function FeaturedRow() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data } = useApi<Listing[]>(() => api.featured(), "home:featured");
  const items = (data ?? []).slice(0, 6);
  if (items.length === 0) return null;
  return (
    <View style={s.section}>
      <Text style={s.kicker}>FEATURED IN OGUAA</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
        {items.map((l, i) => (
          <StaggerIn key={l.id} index={i}>
            <Pressable onPress={() => router.push(featuredRoute(l) as never)} style={s.artistCard}>
              <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.artistThumb} labelStyle={s.thumbInit} />
              <Text style={s.artistName} numberOfLines={1}>{l.title}</Text>
              <Text style={s.artistGenre} numberOfLines={1}>{l.type}</Text>
            </Pressable>
          </StaggerIn>
        ))}
      </ScrollView>
    </View>
  );
}

// Latest news headlines — the re-engagement strip (→ /news).
function NewsStrip() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data } = useApi<NewsArticle[]>(() => api.news(), "home:news");
  const items = (data ?? []).slice(0, 3);
  if (items.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={s.rowBetween}>
        <Text style={s.kicker}>FROM THE NEWSROOM</Text>
        <Link href="/news"><Text style={s.link}>All →</Text></Link>
      </View>
      <View style={{ gap: 8 }}>
        {items.map((a, i) => (
          <StaggerIn key={a.id} index={i}>
            <PressScale onPress={() => router.push(`/news/${a.slug}` as never)} style={s.newsRow}>
              <View style={[s.newsBar, { backgroundColor: a.coverColor ?? C.green }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.newsTitle} numberOfLines={2}>{a.title}</Text>
                <Text style={s.newsMeta}>{a.authorName}</Text>
              </View>
              <Text style={s.newsChevron}>›</Text>
            </PressScale>
          </StaggerIn>
        ))}
      </View>
    </View>
  );
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { scrollY, onScroll } = useHeroParallax();
  const { open } = useNavDrawer();
  // The alert banner (rendered above the tabs) already owns the top safe-area
  // inset when it's showing, so the hero shouldn't add it again.
  const { bannerVisible } = useDirectives();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, error, loading } = useApi<HomeData>(() => api.home(), "home");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const { spotlight, artists, memorial, stats } = data;
  const more = artists.filter((a) => a.id !== spotlight.id).slice(0, 6);
  const events = (data.events ?? []).slice(0, 3);

  return (
    <Animated.ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }} onScroll={onScroll} scrollEventThrottle={16}>
      {/* hero — castle photo under the green, mirroring the portal home */}
      <View style={[s.hero, { paddingTop: (bannerVisible ? 12 : insets.top) + 24 }]}>
        <Image source={{ uri: mediaUrl("/uploads/seed/castle-exterior.jpg") }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, s.heroScrim]} />
        <HeroParallax scrollY={scrollY}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable onPress={open} hitSlop={12} accessibilityLabel="Open menu" style={{ paddingVertical: 4, paddingRight: 4 }}>
              <Text style={s.menuGlyph}>☰</Text>
            </Pressable>
            <Mark size={26} />
            <Text style={s.eyebrow}>CAPE COAST · GHANA</Text>
            <View style={{ flex: 1 }} />
            {/* Same shared top-bar actions the other tabs carry in their header. */}
            <TopBarActions />
          </View>
          <Text style={s.heroTitle}>
            This is <Text style={{ color: C.gold }}>Oguaa.</Text>
          </Text>
          <Text style={s.heroSub}>
            The town that began as a market — its music, its people, its memory, in one place. Made by us, for us.
          </Text>
          <View style={s.stats}>
            {([["Members", stats.members], ["Listings", stats.listings], ["Schools", stats.schools], ["Artists", stats.artists]] as const).map(([k, v]) => (
              <View key={k} style={s.stat}>
                <Text style={s.statNum}>{v}</Text>
                <Text style={s.statLbl}>{k}</Text>
              </View>
            ))}
          </View>
        </HeroParallax>
      </View>

      {/* spotlight */}
      <View style={s.section}>
        <Text style={s.kicker}>ROTATING SPOTLIGHT</Text>
        <StaggerIn index={0}>
          <Link href={`/music/${spotlight.slug}`} asChild>
            <Pressable style={s.spotlight}>
            <Thumb
              seed={spotlight.slug}
              src={spotlight.coverImageUrl}
              label={initials(spotlight.details.actName ?? spotlight.title)}
              style={s.thumb}
              labelStyle={s.thumbInit}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.spotName}>{spotlight.details.actName ?? spotlight.title}</Text>
              <Text style={s.spotGenre}>{(spotlight.details.genres ?? []).join(" · ")}</Text>
              <Text style={s.spotBio} numberOfLines={3}>{spotlight.details.bio}</Text>
            </View>
          </Pressable>
          </Link>
        </StaggerIn>
      </View>

      {/* artists preview */}
      <View style={s.section}>
        <View style={s.rowBetween}>
          <Text style={s.kicker}>THE OGUAA SOUND</Text>
          <Link href="/music"><Text style={s.link}>All →</Text></Link>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
          {more.map((a, i) => (
            <StaggerIn key={a.id} index={i + 1}>
              <Link href={`/music/${a.slug}`} asChild>
                <Pressable style={s.artistCard}>
                  <Thumb
                    seed={a.slug}
                    src={a.coverImageUrl}
                    label={initials(a.details.actName ?? a.title)}
                    style={s.artistThumb}
                    labelStyle={s.thumbInit}
                  />
                  <Text style={s.artistName} numberOfLines={1}>{a.details.actName ?? a.title}</Text>
                  <Text style={s.artistGenre} numberOfLines={1}>{(a.details.genres ?? [])[0]}</Text>
                </Pressable>
              </Link>
            </StaggerIn>
          ))}
        </ScrollView>
      </View>

      <FeaturedRow />

      {/* upcoming events */}
      {events.length > 0 && (
        <View style={s.section}>
          <View style={s.rowBetween}>
            <Text style={s.kicker}>HAPPENING IN OGUAA</Text>
            <Link href="/browse/events"><Text style={s.link}>All →</Text></Link>
          </View>
          <View style={{ gap: 8 }}>
            {events.map((e, i) => (
              <StaggerIn key={e.id} index={i}>
                <PressScale onPress={() => router.push("/browse/events" as never)} style={s.newsRow}>
                  <View style={[s.newsBar, { backgroundColor: C.teal }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.newsTitle} numberOfLines={1}>{e.title}</Text>
                    <Text style={s.newsMeta}>{[e.details.startsAt, e.details.venue].filter(Boolean).join(" · ")}</Text>
                  </View>
                  <Text style={s.newsChevron}>›</Text>
                </PressScale>
              </StaggerIn>
            ))}
          </View>
        </View>
      )}

      <NewsStrip />

      {/* memorial teaser */}
      {memorial && (
        <View style={s.section}>
          <Text style={s.kicker}>YƐNKAE · IN MEMORIAM</Text>
          <RevealView>
            <Link href={`/memoriam/${memorial.slug}`} asChild>
              <Pressable style={s.memorial}>
              {memorial.coverImageUrl ? (
                <Thumb seed={memorial.slug} src={memorial.coverImageUrl} label={initials(memorial.title)} style={s.memPortrait} labelStyle={s.memPortraitInit} />
              ) : null}
              <Text style={s.memName}>{memorial.details.honorific ? memorial.details.honorific + " " : ""}{memorial.title}</Text>
              {memorial.details.epitaph && <Text style={s.memEpitaph}>“{memorial.details.epitaph}”</Text>}
              <View style={{ marginTop: 8 }}>
                <Pill label={`${memorial.details.candles ?? 0} candles · remember together`} color={C.goldText} bg={C.cream} border={C.sand} />
              </View>
              </Pressable>
            </Link>
          </RevealView>
        </View>
      )}
    </Animated.ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  hero: { backgroundColor: C.green, paddingHorizontal: 20, paddingBottom: 24, overflow: "hidden" },
  heroScrim: { backgroundColor: C.heroScrim },
  menuGlyph: { color: ON_GREEN, fontSize: 20, fontWeight: "700" },
  eyebrow: { color: C.gold, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  heroTitle: { color: ON_GREEN, ...D(600), fontSize: 44, marginTop: 10 },
  heroSub: { color: C.onDarkText85, fontSize: 15, lineHeight: 22, marginTop: 8 },
  // On-dark hairline at 0.12 — no palette token carries this alpha, and the
  // hero stays dark in both themes, so the literal is effectively theme-proof.
  stats: { flexDirection: "row", marginTop: 20, borderTopWidth: 1, borderTopColor: "rgba(246,241,231,0.12)", paddingTop: 14 },
  stat: { flex: 1, alignItems: "center" },
  statNum: { color: C.gold, ...S(700), fontSize: 24 },
  statLbl: { color: C.onDarkText60, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 },
  section: { paddingHorizontal: 20, paddingTop: 22 },
  kicker: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { color: C.clayText, fontWeight: "700", fontSize: 13 },
  spotlight: { flexDirection: "row", gap: 14, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 14 },
  thumb: { width: 76, height: 76, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  thumbInit: { color: C.cream, ...S(700), fontSize: 26 },
  spotName: { ...S(700), fontSize: 22, color: C.ink },
  spotGenre: { color: C.goldText, fontSize: 12, marginTop: 2 },
  spotBio: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  artistCard: { width: 130 },
  artistThumb: { width: 130, height: 110, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  artistName: { ...S(700), fontSize: 16, color: C.ink, marginTop: 6 },
  artistGenre: { color: C.inkFaint, fontSize: 12 },
  newsRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 12 },
  newsBar: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  newsTitle: { color: C.ink, fontSize: 14, fontWeight: "600", lineHeight: 19 },
  newsMeta: { color: C.inkFaint, fontSize: 12, marginTop: 2 },
  newsChevron: { color: C.inkFaint, fontSize: 20, fontWeight: "700" },
  memorial: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 16, alignItems: "center" },
  memPortrait: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, borderColor: C.goldBrand, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  memPortraitInit: { ...S(600), fontSize: 26, color: C.cream },
  memName: { ...S(600), fontSize: 22, color: C.ink, textAlign: "center" },
  memEpitaph: { ...SI(), color: C.inkMuted, textAlign: "center", marginTop: 6 },
});
