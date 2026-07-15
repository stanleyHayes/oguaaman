import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { router } from "expo-router";
import { T as Text } from "@/components/typography";
import { C, D, S, SI } from "@/theme";
import { Mark } from "@/ui";

type NavItem = { label: string; blurb: string; href: string };

// Mirrors the web navbar grouping: Discover · City · Notices, plus the
// funding board. These section links live in the top-bar drawer (☰) while
// the primary destinations stay on the bottom tab bar.
const GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "DISCOVER",
    items: [
      { label: "Heritage", blurb: "The Castle and the Door of No Return, the Fante Confederacy, the Asafo.", href: "/explore/heritage" },
      { label: "Culture", blurb: "Fetu Afahye, the durbar, the 77 gods of Oguaa, and the seven Asafo companies.", href: "/explore/culture" },
      { label: "People", blurb: "Sons & daughters — icons past and living, from Kofi Annan to the grandfathers of highlife.", href: "/browse/people" },
      { label: "Visit", blurb: "The Castle, the Kakum canopy walkway, Kotokuraba — and when to come.", href: "/explore/visit" },
    ],
  },
  {
    heading: "CITY",
    items: [
      { label: "Institutions", blurb: "Schools, the traditional council, churches and the Asafo companies — official, verified pages.", href: "/institutions" },
      { label: "Business", blurb: "The working city — markets, fishing, trade and the people behind them.", href: "/browse/business" },
      { label: "Youth", blurb: "Opportunities board and a spotlight on the young talents coming up in Cape Coast.", href: "/youth" },
      { label: "Memories", blurb: "Photos and stories of old Cape Coast, preserved.", href: "/browse/memories" },
    ],
  },
  {
    heading: "NOTICES",
    items: [
      { label: "News", blurb: "Festivals, scholarships, homecomings and notices from Cape Coast.", href: "/news" },
      { label: "Events", blurb: "From Fetu Afahye to school speech days and homecomings.", href: "/browse/events" },
      { label: "Safety", blurb: "Floods, fires, accidents and hazards — reported by neighbours, followed through to recovery.", href: "/safety" },
      { label: "Lost & Found", blurb: "Lost a phone, found some keys, searching for someone? The town helps.", href: "/lost-found" },
    ],
  },
  {
    heading: "GET INVOLVED",
    items: [
      { label: "Festivals", blurb: "Fetu Afahye, Edina Bakatue, PANAFEST — every edition, year by year.", href: "/festivals" },
      { label: "Adopt a project", blurb: "Concrete, costed improvements — proposed by verified institutions, funded by us together.", href: "/projects" },
      { label: "Diaspora register", blurb: "Sons & daughters everywhere — the bridge home.", href: "/diaspora" },
      { label: "Opportunities", blurb: "Jobs, scholarships and mentorship shared within the community.", href: "/browse/opportunities" },
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
    router.push(href as never);
  };

  return (
    <View style={s.root}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View style={[s.panel, panelStyle]}>
        <View style={s.handleRow}>
          <View style={s.handle} />
          <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn} accessibilityLabel="Close menu">
            <Text style={s.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: "center", marginBottom: 8 }}>
            <Mark size={40} color={C.goldBrand} />
          </View>
          <Text style={s.title}>The town that began as a market</Text>
          <Text style={s.body}>
            Oguaa — Cape Coast — is one of the richest places in Ghana: the old colonial capital, the global symbol of the diaspora homecoming, the Citadel of Education, home of the Fante Confederacy and the Asafo.
          </Text>

          <Pressable onPress={() => go("/search")} style={s.searchBtn}>
            <Text style={s.searchText}>🔍  Search people, places & memories</Text>
          </Pressable>

          {GROUPS.map((g) => (
            <View key={g.heading}>
              <Text style={s.kicker}>{g.heading}</Text>
              {g.items.map((x) => (
                <Pressable key={x.label} onPress={() => go(x.href)} style={s.card}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={s.cardTitle}>{x.label}</Text>
                    <Text style={s.chevron}>›</Text>
                  </View>
                  <Text style={s.cardBlurb}>{x.blurb}</Text>
                </Pressable>
              ))}
            </View>
          ))}

          <Text style={s.foot}>Yɛn ara asaase ni — this is our own land.</Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(12,44,31,0.55)" },
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: "88%",
    maxWidth: 400,
    backgroundColor: C.paper,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 8, height: 0 },
    elevation: 12,
  },
  handleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  handle: { width: 44, height: 5, borderRadius: 999, backgroundColor: C.sand, alignSelf: "center" },
  closeBtn: { width: 36, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: C.cream },
  closeText: { color: C.inkMuted, fontSize: 15, fontWeight: "700" },
  scrollContent: { padding: 20, paddingTop: 8, paddingBottom: 48 },
  title: { ...D(600), fontSize: 26, color: C.ink, textAlign: "center" },
  body: { color: C.inkMuted, fontSize: 14, lineHeight: 21, marginTop: 10, textAlign: "center" },
  kicker: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 24, marginBottom: 10 },
  searchBtn: { marginTop: 18, borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center" },
  searchText: { color: C.inkMuted, fontSize: 14, fontWeight: "600" },
  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { ...S(700), fontSize: 18, color: C.ink },
  chevron: { color: C.inkFaint, fontSize: 22, fontWeight: "700" },
  cardBlurb: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  foot: { ...SI(), color: C.goldText, textAlign: "center", marginTop: 24, fontSize: 16 },
});
