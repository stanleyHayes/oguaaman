import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T as Text } from "@/components/typography";
import { D, ON_GREEN, S, SI, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import {
  BellIcon,
  BriefcaseIcon,
  BuildingIcon,
  CalendarIcon,
  CediIcon,
  CloseIcon,
  CompassIcon,
  DiamondIcon,
  FileTextIcon,
  GradCapIcon,
  HandsIcon,
  LandmarkIcon,
  MapIcon,
  MapPinIcon,
  PartyIcon,
  SearchIcon,
  ShieldIcon,
  ShoppingBagIcon,
  UsersIcon,
  type IconProps,
} from "@/components/icons";
import { Mark } from "@/ui";

type Accent = "greenText" | "goldText" | "clayText" | "tealText" | "maroonText";
type NavItem = {
  label: string;
  blurb: string;
  href: string;
  icon: ComponentType<IconProps>;
  accent: Accent;
};

// Mirrors the web navbar grouping: Discover · City · Notices, plus the
// funding board. These section links live in the top-bar drawer (☰) while
// the primary destinations stay on the bottom tab bar.
const GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "DISCOVER",
    items: [
      { label: "Heritage", blurb: "Castle, Confederacy and Asafo", href: ROUTES.exploreHeritage, icon: LandmarkIcon, accent: "greenText" },
      { label: "Culture", blurb: "Afahye, durbar and tradition", href: ROUTES.exploreCulture, icon: DiamondIcon, accent: "goldText" },
      { label: "People", blurb: "Sons and daughters of Oguaa", href: ROUTES.browsePeople, icon: UsersIcon, accent: "clayText" },
      { label: "Visit", blurb: "The coast, the food, the places", href: ROUTES.exploreVisit, icon: CompassIcon, accent: "tealText" },
    ],
  },
  {
    heading: "CITY",
    items: [
      { label: "Explore map", blurb: "Places, safety and walking trails", href: ROUTES.explore, icon: MapIcon, accent: "tealText" },
      { label: "Institutions", blurb: "Verified schools and authorities", href: ROUTES.institutions, icon: BuildingIcon, accent: "greenText" },
      { label: "Business", blurb: "Markets, trade and local makers", href: ROUTES.browseBusinesses, icon: ShoppingBagIcon, accent: "goldText" },
      { label: "Rent & Stay", blurb: "Homes, rooms and trusted local stays", href: ROUTES.rentStay, icon: BuildingIcon, accent: "tealText" },
      { label: "Youth", blurb: "Talent and open opportunities", href: ROUTES.youth, icon: GradCapIcon, accent: "tealText" },
      { label: "Memories", blurb: "Old Cape Coast, preserved", href: ROUTES.browseMemories, icon: FileTextIcon, accent: "clayText" },
    ],
  },
  {
    heading: "NOTICES",
    items: [
      { label: "Alerts", blurb: "Urgent community advisories", href: ROUTES.alerts, icon: BellIcon, accent: "maroonText" },
      { label: "News", blurb: "Headlines from Cape Coast", href: ROUTES.news, icon: FileTextIcon, accent: "greenText" },
      { label: "Events", blurb: "The town calendar", href: ROUTES.browseEvents, icon: CalendarIcon, accent: "goldText" },
      { label: "Safety", blurb: "Report and follow incidents", href: ROUTES.safety, icon: ShieldIcon, accent: "maroonText" },
      { label: "Lost & Found", blurb: "Let the town help", href: ROUTES.lostFound, icon: MapPinIcon, accent: "tealText" },
    ],
  },
  {
    heading: "GET INVOLVED",
    items: [
      { label: "Better Oguaa", blurb: "Take the civic pledge", href: ROUTES.better, icon: HandsIcon, accent: "goldText" },
      { label: "Festivals", blurb: "Every edition, year by year", href: ROUTES.festivals, icon: PartyIcon, accent: "clayText" },
      { label: "Adopt a project", blurb: "Fund practical improvements", href: ROUTES.projects, icon: CediIcon, accent: "greenText" },
      { label: "Oguaa Outside", blurb: "Vetted help for errands back home", href: ROUTES.outside, icon: BriefcaseIcon, accent: "goldText" },
      { label: "Diaspora", blurb: "The bridge home", href: ROUTES.diaspora, icon: UsersIcon, accent: "goldText" },
      { label: "Opportunities", blurb: "Jobs, mentorship and investment", href: ROUTES.browseOpportunities, icon: BriefcaseIcon, accent: "tealText" },
    ],
  },
];

const DrawerCtx = createContext<{ open: () => void }>({ open: () => {} });

/** Opens the section drawer from the ☰ button in the top bar / home hero. */
export function useNavDrawer() {
  return useContext(DrawerCtx);
}

export function NavDrawerProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <DrawerCtx.Provider value={value}>
      {children}
      {visible && <Drawer onClose={close} />}
    </DrawerCtx.Provider>
  );
}

// NOTE: no StaggerIn/RevealView inside the drawer — reanimated entering
// animations misfire on web once the panel scrolls. The slide-in is the
// drawer's one motion; content renders still.
function Drawer({ onClose }: Readonly<{ onClose: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = reduced ? 1 : withSpring(1, { damping: 22, stiffness: 160 });
  }, [progress, reduced]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * 360 }],
  }));

  const go = (href: string) => {
    onClose();
    push(href);
  };

  return (
    <View style={s.root}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button" />
      <Animated.View style={[s.panel, panelStyle]}>
        <View style={[s.header, { paddingTop: insets.top + 14 }]}>
          <View style={s.brandRow}>
            <View style={s.markWrap}><Mark size={30} color={C.gold} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.brandKicker}>OGUAA · CAPE COAST</Text>
              <Text style={s.brandName}>Our town, in one place</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn} accessibilityLabel="Close menu" accessibilityRole="button">
              <CloseIcon size={18} color={ON_GREEN} strokeWidth={2.2} />
            </Pressable>
          </View>
          <Text style={s.title}>Where do you want to go?</Text>
          <Text style={s.body}>Discover the coast, follow the town and find a place to take part.</Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <Pressable accessibilityRole="button" onPress={() => go(ROUTES.search)} style={s.searchBtn}>
            <SearchIcon size={18} color={C.inkMuted} strokeWidth={2} />
            <Text style={s.searchText}>Search people, places & memories</Text>
            <View style={s.searchGo}><Text style={s.searchGoText}>GO</Text></View>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => go(ROUTES.community)} style={s.communityCard}>
            <View style={s.communityIcon}><HandsIcon size={24} color={C.gold} strokeWidth={1.8} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.communityKickerRow}>
                <Text style={s.communityKicker}>COMMUNITY HUB</Text>
                <View style={s.newBadge}><Text style={s.newBadgeText}>NEW</Text></View>
              </View>
              <Text style={s.communityTitle}>Find your place in the work</Text>
              <Text style={s.communityBlurb} numberOfLines={2}>Opportunities, events, memories and practical ways to help.</Text>
            </View>
            <Text style={s.communityArrow}>›</Text>
          </Pressable>

          {GROUPS.map((g) => (
            <View key={g.heading} style={s.group}>
              <View style={s.groupHeading}>
                <Text style={s.kicker}>{g.heading}</Text>
                <Text style={s.groupCount}>{g.items.length}</Text>
              </View>
              <View style={s.grid}>
                {g.items.map((x) => {
                  const Icon = x.icon;
                  const accent = C[x.accent];
                  return (
                    <Pressable accessibilityRole="button" accessibilityLabel={`${x.label}. ${x.blurb}`} key={x.label} onPress={() => go(x.href)} style={s.card}>
                      <View style={[s.cardIcon, { backgroundColor: withAlpha(accent, 0.12) }]}>
                        <Icon size={20} color={accent} strokeWidth={1.8} />
                      </View>
                      <Text style={s.cardTitle} numberOfLines={1}>{x.label}</Text>
                      <Text style={s.cardBlurb} numberOfLines={2}>{x.blurb}</Text>
                      <Text style={s.chevron}>›</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          <Text style={s.foot}>Yɛn ara asaase ni — this is our own land.</Text>
          <Text style={s.footNote}>Made by us, for us.</Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.heroScrim },
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: "92%",
    maxWidth: 420,
    backgroundColor: C.paper,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.34,
    shadowRadius: 28,
    shadowOffset: { width: 8, height: 0 },
    elevation: 12,
  },
  header: { backgroundColor: C.green900, paddingHorizontal: 20, paddingBottom: 24, borderBottomRightRadius: 24 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  markWrap: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.onDarkText10, borderWidth: 1, borderColor: C.goldBorder35 },
  brandKicker: { ...S(700), color: C.gold, fontSize: 9, letterSpacing: 1.5 },
  brandName: { ...S(600), color: C.onDarkText85, fontSize: 13, marginTop: 2 },
  closeBtn: { width: 38, height: 38, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: C.onDarkText10, borderWidth: 1, borderColor: C.onDarkText10 },
  title: { ...D(700), fontSize: 29, lineHeight: 34, color: ON_GREEN, marginTop: 24 },
  body: { color: C.onDarkText85, fontSize: 13, lineHeight: 19, marginTop: 7, maxWidth: 310 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 },
  searchBtn: { flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 15, paddingVertical: 12, paddingLeft: 14, paddingRight: 8 },
  searchText: { flex: 1, color: C.inkMuted, fontSize: 13, ...S(600) },
  searchGo: { minWidth: 40, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
  searchGoText: { color: C.tealText, fontSize: 9, letterSpacing: 1, ...S(700) },
  communityCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.green, borderRadius: 19, padding: 15, marginTop: 12, overflow: "hidden" },
  communityIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  communityKickerRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  communityKicker: { ...S(700), color: C.gold, fontSize: 9, letterSpacing: 1.3 },
  newBadge: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: C.gold },
  newBadgeText: { ...S(700), color: C.green900, fontSize: 7, letterSpacing: 0.8 },
  communityTitle: { ...S(700), color: ON_GREEN, fontSize: 16, marginTop: 4 },
  communityBlurb: { color: C.onDarkText85, fontSize: 11, lineHeight: 16, marginTop: 2 },
  communityArrow: { ...S(700), color: C.gold, fontSize: 25 },
  group: { marginTop: 23 },
  groupHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9, paddingHorizontal: 2 },
  kicker: { ...S(700), color: C.inkFaint, fontSize: 10, letterSpacing: 1.8 },
  groupCount: { ...S(700), color: C.inkFaint, fontSize: 9, borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  card: { position: "relative", width: "48.5%", minHeight: 124, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 17, padding: 13, overflow: "hidden" },
  cardIcon: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  cardTitle: { ...S(700), fontSize: 14, color: C.ink, paddingRight: 16 },
  chevron: { position: "absolute", right: 11, top: 49, color: C.inkFaint, fontSize: 19, ...S(700) },
  cardBlurb: { color: C.inkMuted, fontSize: 10.5, lineHeight: 15, marginTop: 3, paddingRight: 8 },
  foot: { ...SI(), color: C.goldText, textAlign: "center", marginTop: 30, fontSize: 16 },
  footNote: { ...S(600), color: C.inkFaint, textAlign: "center", marginTop: 4, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" },
});
