import { useMemo } from "react";
import { route, ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Image, ScrollView, StyleSheet, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, type Href } from "expo-router";
import Animated from "react-native-reanimated";
import { T as Text } from "@/components/typography";
import { api, mediaUrl } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { HomeData, Listing, NewsArticle, Goal } from "@/lib/types";
import { D, S, SI, ON_GREEN, initials, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, Mark, Pill, Thumb } from "@/ui";
import { HeroParallax, PressScale, RevealView, StaggerIn, useHeroParallax } from "@/components/anim";
import { useNavDrawer } from "@/components/nav-drawer";
import { useDirectives } from "@/lib/directives";
import { TopBarActions } from "@/components/top-bar-actions";
import { ArrowRightIcon, BriefcaseIcon, CalendarIcon, CandleIcon, ChevronRightIcon, HandsIcon, MenuIcon, StarIcon } from "@/components/icons";

// Prominent civic call-to-action at the top of the home feed — the resident's
// door into "Build a better Oguaa" (the civic hub, /better). A bold gold banner
// with a big icon, the pledge tease and a chevron, so it's never buried.
function CivicBanner() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.civicSection}>
      <PressScale onPress={() => push(ROUTES.better)} style={s.civicBanner}>
        <View style={s.civicTopline}>
          <View style={s.civicIcon}>
            <HandsIcon size={24} color={C.gold} strokeWidth={2} />
          </View>
          <Text style={s.civicKicker}>THE CIVIC REVOLUTION · OGUAA</Text>
          <Text style={s.civicNumber}>01</Text>
        </View>
        <Text style={s.civicTitle}>Build a <Text style={s.civicTitleAccent}>better</Text> Oguaa.</Text>
        <Text style={s.civicTease}>
          Great towns are built by small daily habits. Keep the good, drop the harmful, and take the pledge for Cape Coast.
        </Text>
        <View style={s.civicAction}>
          <Text style={s.civicActionText}>Open the town&apos;s code</Text>
          <ArrowRightIcon size={19} color={C.green900} strokeWidth={2.4} />
        </View>
      </PressScale>
    </View>
  );
}

function goalStatusLabel(status: Goal["status"]): string {
  switch (status) {
    case "achieved": return "ACHIEVED";
    case "missed": return "MISSED";
    case "pending_review": return "AWAITING REVIEW";
    default: return "IN PROGRESS";
  }
}

// The town's featured goal (annual/durbar), a prominent reminder that opens the
// civic hub. Renders nothing until a featured goal loads.
function CivicGoalBanner() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data } = useApi<Goal[]>(() => api.goals(), "home:goals");
  const goals = data ?? [];
  const featured = goals.find((g) => g.featured) ?? goals.find((g) => g.cadence === "annual");
  if (!featured) return null;
  const statusTone = featured.status === "missed"
    ? C.clayText
    : featured.status === "pending_review"
      ? C.goldText
      : C.greenText;
  return (
    <View style={s.goalSection}>
      <PressScale onPress={() => push(ROUTES.better)} style={s.goalCard}>
        <View style={s.goalRail} />
        <View style={s.goalBody}>
          <View style={s.goalMetaRow}>
            <Text style={s.goalKicker}>OGUAA&apos;S GOAL · {featured.periodLabel.toUpperCase()}</Text>
            <View style={[s.goalStatus, { borderColor: withAlpha(statusTone, 0.3), backgroundColor: withAlpha(statusTone, 0.1) }]}>
              <Text style={[s.goalStatusText, { color: statusTone }]}>{goalStatusLabel(featured.status)}</Text>
            </View>
          </View>
          <Text style={s.goalTitle} numberOfLines={2}>{featured.title}</Text>
          {featured.target ? (
            <Text style={s.goalTarget} numberOfLines={2}><Text style={s.goalTargetLabel}>Target — </Text>{featured.target}</Text>
          ) : null}
          <View style={s.goalFooter}>
            <Text style={s.goalNote}>{featured.setAtDurbar ? "Set at the grand durbar" : "Town accountability"}</Text>
            <View style={s.goalArrow}><ChevronRightIcon size={16} color={C.goldText} strokeWidth={2.4} /></View>
          </View>
        </View>
      </PressScale>
    </View>
  );
}

// A compact bridge from the home feed into the Oguaa Outside trust layer.
// It stays distinct from the civic pledge: this is practical, paid help for
// residents and diaspora who need a task completed back home.
function OutsideBanner() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.outsideSection}>
      <PressScale onPress={() => push(ROUTES.outside)} style={s.outsideBanner}>
        <View style={s.outsideIcon}><BriefcaseIcon size={23} color={C.gold} strokeWidth={1.9} /></View>
        <View style={s.outsideCopy}>
          <Text style={s.outsideKicker}>OGUAA OUTSIDE · VETTED HELP</Text>
          <Text style={s.outsideTitle}>Get things done back home.</Text>
          <Text style={s.outsideBody} numberOfLines={2}>Find agents for errands, procurement, inspections and shipping — with managed escrow.</Text>
        </View>
        <View style={s.outsideArrow}><ArrowRightIcon size={17} color={C.green900} strokeWidth={2.4} /></View>
      </PressScale>
    </View>
  );
}

// Route a featured listing to its canonical screen (any type can be featured).
function featuredRoute(l: Listing): Href {
  switch (l.type) {
    case "artist": return route.music(l.slug);
    case "memorial": return route.memoriam(l.slug);
    case "business": return route.business(l.slug);
    case "property": return route.property(l.slug);
    case "person": return route.person(l.slug);
    case "project": return route.project(l.slug);
    case "event": return ROUTES.browseEvents;
    default: return ROUTES.browseMemories;
  }
}

function SectionHeading({ index, kicker, title, href }: Readonly<{ index: string; kicker: string; title: string; href?: Href }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.sectionHeading}>
      <View style={s.sectionHeadingCopy}>
        <Text style={s.sectionIndex}>{index}</Text>
        <View style={s.sectionTitleGroup}>
          <Text style={s.kicker}>{kicker}</Text>
          <Text style={s.sectionTitle}>{title}</Text>
        </View>
      </View>
      {href ? (
        <Pressable onPress={() => push(href)} hitSlop={10} accessibilityRole="link" accessibilityLabel={`View all ${kicker.toLowerCase()}`} style={s.sectionLink}>
          <Text style={s.sectionLinkText}>All</Text>
          <ArrowRightIcon size={15} color={C.clayText} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
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
      <SectionHeading index="04" kicker="FEATURED IN OGUAA" title="Community picks" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontalRail}>
        {items.map((l, i) => (
          <StaggerIn key={l.id} index={i}>
            <Pressable accessibilityRole="button" onPress={() => push(featuredRoute(l))} style={s.artistCard}>
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
      <SectionHeading index="06" kicker="FROM THE NEWSROOM" title="The town, in brief" href={ROUTES.news} />
      <View style={s.listStack}>
        {items.map((a, i) => (
          <StaggerIn key={a.id} index={i}>
            <PressScale onPress={() => push(route.newsArticle(a.slug))} style={s.newsRow}>
              <View style={[s.newsBar, { backgroundColor: a.coverColor ?? C.green }]} />
              <Text style={s.newsIndex}>{String(i + 1).padStart(2, "0")}</Text>
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
    <Animated.ScrollView style={s.page} contentContainerStyle={s.pageContent} onScroll={onScroll} scrollEventThrottle={16}>
      {/* hero — castle photo under the green, mirroring the portal home */}
      <View style={[s.hero, { paddingTop: (bannerVisible ? 12 : insets.top) + 24 }]}>
        <Image source={{ uri: mediaUrl("/uploads/seed/castle-exterior.jpg") }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, s.heroScrim]} />
        <HeroParallax scrollY={scrollY}>
          <View style={s.heroNav}>
            <Pressable onPress={open} hitSlop={12} accessibilityLabel="Open menu" style={s.menuButton} accessibilityRole="button">
              <MenuIcon size={21} color={ON_GREEN} strokeWidth={2} />
            </Pressable>
            <Mark size={26} />
            <Text style={s.eyebrow}>CAPE COAST · GHANA</Text>
            <View style={s.flexSpacer} />
            {/* Same shared top-bar actions the other tabs carry in their header. */}
            <TopBarActions />
          </View>
          <View style={s.heroEditionRow}>
            <View style={s.heroEditionLine} />
            <Text style={s.heroEdition}>THE COMMUNITY EDITION</Text>
          </View>
          <Text style={s.heroTitle}>
            This is <Text style={{ color: C.gold }}>Oguaa.</Text>
          </Text>
          <Text style={s.heroSub}>
            The town that began as a market — its music, its people, its memory, in one place. Made by us, for us.
          </Text>
          <View style={s.stats}>
            {([["Members", stats.members], ["Listings", stats.listings], ["Schools", stats.schools], ["Artists", stats.artists]] as const).map(([k, v], index) => (
              <View key={k} style={[s.stat, index > 0 && s.statDivided]}>
                <Text style={s.statNum}>{v}</Text>
                <Text style={s.statLbl}>{k}</Text>
              </View>
            ))}
          </View>
        </HeroParallax>
      </View>

      {/* prominent civic entry — first thing under the hero */}
      <CivicBanner />
      <CivicGoalBanner />
      <OutsideBanner />

      {/* spotlight */}
      <View style={s.section}>
        <SectionHeading index="02" kicker="ROTATING SPOTLIGHT" title="A voice from the coast" />
        <StaggerIn index={0}>
          <Link href={route.music(spotlight.slug)} asChild>
            <Pressable style={s.spotlight} accessibilityRole="button" accessibilityLabel={spotlight.details.actName ?? spotlight.title}>
              <View style={s.spotImageWrap}>
                <Thumb
                  seed={spotlight.slug}
                  src={spotlight.coverImageUrl}
                  label={initials(spotlight.details.actName ?? spotlight.title)}
                  style={s.thumb}
                  labelStyle={s.thumbInit}
                />
                <View style={s.spotBadge}><StarIcon size={13} color={C.green900} strokeWidth={2.2} /><Text style={s.spotBadgeText}>OGUAA SPOTLIGHT</Text></View>
              </View>
              <View style={s.spotCopy}>
                <Text style={s.spotGenre}>{(spotlight.details.genres ?? []).join(" · ")}</Text>
                <Text style={s.spotName}>{spotlight.details.actName ?? spotlight.title}</Text>
                <Text style={s.spotBio} numberOfLines={3}>{spotlight.details.bio}</Text>
                <View style={s.spotLink}><Text style={s.spotLinkText}>Open artist profile</Text><ArrowRightIcon size={15} color={C.gold} strokeWidth={2.2} /></View>
              </View>
            </Pressable>
          </Link>
        </StaggerIn>
      </View>

      {/* artists preview */}
      <View style={s.section}>
        <SectionHeading index="03" kicker="THE OGUAA SOUND" title="More in rotation" href={ROUTES.music} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontalRail}>
          {more.map((a, i) => (
            <StaggerIn key={a.id} index={i + 1}>
              <Link href={route.music(a.slug)} asChild>
                <Pressable style={s.artistCard} accessibilityRole="button" accessibilityLabel={a.details.actName ?? a.title}>
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
          <SectionHeading index="05" kicker="HAPPENING IN OGUAA" title="What’s on next" href={ROUTES.browseEvents} />
          <View style={s.listStack}>
            {events.map((e, i) => (
              <StaggerIn key={e.id} index={i}>
                <PressScale onPress={() => push(ROUTES.browseEvents)} style={s.newsRow}>
                  <View style={[s.newsBar, { backgroundColor: C.teal }]} />
                  <View style={s.eventIcon}><CalendarIcon size={17} color={C.tealText} strokeWidth={2} /></View>
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
          <SectionHeading index="07" kicker="YƐNKAE · IN MEMORIAM" title="The names we carry" />
          <RevealView>
            <Link href={route.memoriam(memorial.slug)} asChild>
              <Pressable style={s.memorial} accessibilityRole="button" accessibilityLabel={memorial.title}>
              <View style={s.memorialKicker}><CandleIcon size={15} color={C.gold} strokeWidth={2} /><Text style={s.memorialKickerText}>REMEMBERED IN OGUAA</Text></View>
              {memorial.coverImageUrl ? (
                <Thumb seed={memorial.slug} src={memorial.coverImageUrl} label={initials(memorial.title)} style={s.memPortrait} labelStyle={s.memPortraitInit} />
              ) : null}
              <Text style={s.memName}>{memorial.details.honorific ? memorial.details.honorific + " " : ""}{memorial.title}</Text>
              {memorial.details.epitaph && <Text style={s.memEpitaph}>“{memorial.details.epitaph}”</Text>}
              <View style={{ marginTop: 8 }}>
                <Pill label={`${memorial.details.candles ?? 0} candles · remember together`} color={C.gold} bg={C.goldTint14} border={C.goldBorder35} />
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
  page: { backgroundColor: C.paper },
  pageContent: { paddingBottom: 44 },
  outsideSection: { paddingHorizontal: 16, marginTop: 14 },
  outsideBanner: { flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden", backgroundColor: C.cream, borderWidth: 1, borderColor: C.goldBorder35, borderRadius: 20, padding: 15 },
  outsideIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.green900 },
  outsideCopy: { flex: 1, minWidth: 0 },
  outsideKicker: { color: C.goldText, ...S(700), fontSize: 8, letterSpacing: 1.3 },
  outsideTitle: { color: C.ink, ...D(700), fontSize: 18, marginTop: 2 },
  outsideBody: { color: C.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  outsideArrow: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: C.goldBrand },
  flexSpacer: { flex: 1 },
  hero: { backgroundColor: C.green900, paddingHorizontal: 20, paddingBottom: 20, overflow: "hidden" },
  heroScrim: { backgroundColor: C.heroScrim },
  heroNav: { flexDirection: "row", alignItems: "center", gap: 9 },
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.onDarkText10,
    backgroundColor: withAlpha(ON_GREEN, 0.06),
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: { color: C.gold, fontSize: 10, letterSpacing: 1.75, ...S(700) },
  heroEditionRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 30 },
  heroEditionLine: { width: 24, height: 1, backgroundColor: C.gold },
  heroEdition: { color: C.onDarkText60, fontSize: 9, letterSpacing: 1.65, ...S(700) },
  heroTitle: { color: ON_GREEN, ...D(600), fontSize: 46, lineHeight: 50, marginTop: 8 },
  heroSub: { color: C.onDarkText85, fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 370 },
  stats: {
    flexDirection: "row",
    marginTop: 22,
    borderWidth: 1,
    borderColor: C.onDarkText10,
    borderRadius: 14,
    backgroundColor: withAlpha(C.green900, 0.48),
    overflow: "hidden",
  },
  stat: { flex: 1, alignItems: "center", paddingVertical: 12, paddingHorizontal: 2 },
  statDivided: { borderLeftWidth: 1, borderLeftColor: C.onDarkText10 },
  statNum: { color: C.gold, ...S(700), fontSize: 20 },
  statLbl: { color: C.onDarkText60, fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.75, marginTop: 2, ...S(600) },

  civicSection: { paddingHorizontal: 20, paddingTop: 22 },
  civicBanner: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: withAlpha(C.gold, 0.28),
    backgroundColor: C.green900,
    padding: 20,
    shadowColor: C.green900,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 4,
  },
  civicTopline: { flexDirection: "row", alignItems: "center", gap: 10 },
  civicIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  civicKicker: { flex: 1, color: C.onDarkText60, fontSize: 9, letterSpacing: 1.45, ...S(700) },
  civicNumber: { color: C.gold, fontSize: 11, letterSpacing: 1.4, ...S(700) },
  civicTitle: { color: ON_GREEN, ...D(600), fontSize: 30, lineHeight: 34, marginTop: 18 },
  civicTitleAccent: { color: C.gold, ...D(600) },
  civicTease: { color: C.onDarkText85, fontSize: 13.5, lineHeight: 20, ...S(400), marginTop: 10 },
  civicAction: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18, borderRadius: 11, backgroundColor: C.gold, paddingHorizontal: 14, paddingVertical: 10 },
  civicActionText: { color: C.green900, fontSize: 12.5, ...S(700) },

  goalSection: { paddingHorizontal: 20, paddingTop: 10 },
  goalCard: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.sand,
    backgroundColor: C.cream,
  },
  goalRail: { width: 4, backgroundColor: C.goldBrand },
  goalBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 13 },
  goalMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  goalKicker: { flex: 1, color: C.goldText, fontSize: 8.5, letterSpacing: 1.1, ...S(700) },
  goalStatus: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 4 },
  goalStatusText: { fontSize: 7.5, letterSpacing: 0.7, ...S(700) },
  goalTitle: { color: C.ink, fontSize: 16, lineHeight: 21, marginTop: 8, ...S(700) },
  goalTarget: { color: C.inkMuted, fontSize: 11.5, lineHeight: 16, marginTop: 5 },
  goalTargetLabel: { color: C.goldText, ...S(700) },
  goalFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.sand, marginTop: 10, paddingTop: 9 },
  goalNote: { color: C.inkFaint, fontSize: 10.5, ...S(500) },
  goalArrow: { width: 25, height: 25, borderRadius: 9, backgroundColor: C.goldTint14, alignItems: "center", justifyContent: "center" },

  section: { paddingHorizontal: 20, paddingTop: 30 },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 13 },
  sectionHeadingCopy: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  sectionTitleGroup: { flex: 1, minWidth: 0 },
  sectionIndex: { color: C.goldText, fontSize: 9, letterSpacing: 1.2, paddingTop: 1, ...S(700) },
  kicker: { color: C.inkFaint, fontSize: 9, letterSpacing: 1.55, marginBottom: 3, ...S(700) },
  sectionTitle: { color: C.ink, fontSize: 22, lineHeight: 27, ...D(600) },
  sectionLink: { flexDirection: "row", alignItems: "center", gap: 4, borderBottomWidth: 1, borderBottomColor: withAlpha(C.clayText, 0.38), paddingBottom: 2, marginBottom: 2 },
  sectionLinkText: { color: C.clayText, fontSize: 11.5, ...S(700) },
  horizontalRail: { gap: 11, paddingVertical: 2, paddingRight: 4 },
  listStack: { gap: 8 },

  spotlight: { flexDirection: "row", overflow: "hidden", minHeight: 176, backgroundColor: C.green900, borderWidth: 1, borderColor: withAlpha(C.gold, 0.22), borderRadius: 19 },
  spotImageWrap: { width: 116, position: "relative", backgroundColor: C.green },
  thumb: { width: 116, height: "100%", minHeight: 176, alignItems: "center", justifyContent: "center" },
  thumbInit: { color: ON_GREEN, ...S(700), fontSize: 26 },
  spotBadge: { position: "absolute", left: 7, right: 7, bottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 8, backgroundColor: C.gold, paddingHorizontal: 5, paddingVertical: 5 },
  spotBadgeText: { color: C.green900, fontSize: 7, letterSpacing: 0.65, ...S(700) },
  spotCopy: { flex: 1, minWidth: 0, padding: 14 },
  spotName: { ...S(700), fontSize: 21, lineHeight: 25, color: ON_GREEN, marginTop: 4 },
  spotGenre: { color: C.gold, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase", ...S(700) },
  spotBio: { color: C.onDarkText60, fontSize: 12, lineHeight: 17, marginTop: 7 },
  spotLink: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: "auto", paddingTop: 10 },
  spotLinkText: { color: C.gold, fontSize: 10.5, ...S(700) },

  artistCard: { width: 144, overflow: "hidden", borderRadius: 14, borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, padding: 7 },
  artistThumb: { width: 128, height: 104, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  artistName: { ...S(700), fontSize: 14, color: C.ink, marginTop: 7, paddingHorizontal: 2 },
  artistGenre: { color: C.inkFaint, fontSize: 10.5, marginTop: 1, paddingHorizontal: 2, paddingBottom: 2, textTransform: "capitalize" },

  newsRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 68, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 13, padding: 11 },
  newsBar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  newsIndex: { color: C.goldText, fontSize: 9, letterSpacing: 0.5, ...S(700) },
  newsTitle: { color: C.ink, fontSize: 14, ...S(600), lineHeight: 19 },
  newsMeta: { color: C.inkFaint, fontSize: 11, marginTop: 3 },
  newsChevron: { color: C.inkFaint, fontSize: 20, ...S(700) },
  eventIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: withAlpha(C.teal, 0.1), alignItems: "center", justifyContent: "center" },

  memorial: { overflow: "hidden", backgroundColor: C.green900, borderWidth: 1, borderColor: withAlpha(C.gold, 0.25), borderRadius: 19, padding: 18, alignItems: "center" },
  memorialKicker: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginBottom: 14 },
  memorialKickerText: { color: C.gold, fontSize: 8.5, letterSpacing: 1.35, ...S(700) },
  memPortrait: { width: 82, height: 82, borderRadius: 41, borderWidth: 1, borderColor: C.goldBorder35, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  memPortraitInit: { ...S(600), fontSize: 26, color: ON_GREEN },
  memName: { ...S(600), fontSize: 22, color: ON_GREEN, textAlign: "center" },
  memEpitaph: { ...SI(), color: C.onDarkText60, textAlign: "center", lineHeight: 19, marginTop: 6 },
});
