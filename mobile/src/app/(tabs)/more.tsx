import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { router } from "expo-router";
import { C, serif } from "@/theme";
import { Mark } from "@/ui";
import { useAuth } from "@/lib/auth";
import { useLang, LANGS } from "@/lib/i18n";

// NOTE: no StaggerIn/RevealView here — reanimated entering animations misfire
// on web once the drawer scrolls (cards re-animate at wrong offsets). The panel
// slide-in above is the drawer's one motion; content renders still.

type MoreItem = { label: string; blurb: string; href: string };

// Mirrors the web navbar grouping: Discover · City · Notices, plus the
// funding board. These are the secondary links that live in the drawer while
// the primary destinations stay on the bottom navbar.
const GROUPS: { heading: string; items: MoreItem[] }[] = [
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
      { label: "Opportunities", blurb: "Jobs, scholarships and mentorship shared within the community.", href: "/browse/opportunities" },
    ],
  },
];

export default function More() {
  const { member, signOut } = useAuth();
  const { lang, setLang } = useLang();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = reduced ? 1 : withSpring(1, { damping: 22, stiffness: 160 });
  }, [progress, reduced]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * 360 }],
  }));

  const close = () => router.replace("/");

  return (
    <View style={s.root}>
      <Pressable style={s.backdrop} onPress={close} />
      <Animated.View style={[s.panel, panelStyle]}>
        <View style={s.handleRow}>
          <View style={s.handle} />
          <Pressable onPress={close} hitSlop={12} style={s.closeBtn}>
            <Text style={s.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: "center", marginBottom: 8 }}>
            <Mark size={40} color={C.goldBrand} />
          </View>
          <Text style={s.title}>The town that began as a market</Text>
          <Text style={s.body}>
            Oguaa — Cape Coast — is one of the richest places in Ghana: the old colonial capital, the global symbol of the diaspora homecoming, the Citadel of Education, home of the Fante Confederacy and the Asafo. This app leads with local pride; investment and the diaspora follow.
          </Text>

          {/* Auth */}
          <View style={s.authCard}>
            {member ? (
              <>
                <Text style={s.authName}>Signed in as {member.displayName}</Text>
                <Text style={s.authRole}>{member.role}</Text>
                <Pressable onPress={() => router.push("/me")} style={s.authBtn}><Text style={s.authBtnText}>My profile &amp; connections</Text></Pressable>
                <View style={s.authBtnRow}>
                  <Pressable onPress={() => router.push("/submit")} style={[s.authBtnOutline, { flex: 1 }]}><Text style={s.authBtnOutlineText}>Contribute</Text></Pressable>
                  <Pressable onPress={() => router.push("/notifications")} style={[s.authBtnOutline, { flex: 1 }]}><Text style={s.authBtnOutlineText}>Notifications</Text></Pressable>
                </View>
                <Pressable onPress={signOut}><Text style={s.signOutLink}>Sign out</Text></Pressable>
              </>
            ) : (
              <>
                <Text style={s.authName}>Rep your town</Text>
                <Text style={s.authRole}>Sign in to contribute, follow memorials, and rep your school.</Text>
                <Pressable onPress={() => router.push("/signin")} style={s.authBtn}><Text style={s.authBtnText}>Sign in / create account</Text></Pressable>
              </>
            )}
          </View>

          <Text style={s.kicker}>LANGUAGE</Text>
          <View style={s.langRow}>
            {LANGS.map((l) => (
              <Pressable key={l.code} onPress={() => setLang(l.code)} style={[s.langChip, lang === l.code && s.langChipOn]}>
                <Text style={[s.langChipText, lang === l.code && s.langChipTextOn]}>{l.native}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => router.push("/search")} style={s.searchBtn}>
            <Text style={s.searchText}>🔍  Search people, places & memories</Text>
          </Pressable>

          {GROUPS.map((g) => (
            <View key={g.heading}>
              <Text style={s.kicker}>{g.heading}</Text>
              {g.items.map((x) => (
                <View key={x.label}>
                  <Pressable onPress={() => router.push(x.href as never)} style={s.card}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={s.cardTitle}>{x.label}</Text>
                      <Text style={s.chevron}>›</Text>
                    </View>
                    <Text style={s.cardBlurb}>{x.blurb}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ))}

          <View style={s.legalRow}>
            <Pressable onPress={() => router.push("/legal/privacy" as never)}><Text style={s.legalLink}>Privacy</Text></Pressable>
            <Text style={s.legalDot}>·</Text>
            <Pressable onPress={() => router.push("/legal/terms" as never)}><Text style={s.legalLink}>Terms</Text></Pressable>
            <Text style={s.legalDot}>·</Text>
            <Pressable onPress={() => router.push("/legal/acceptable-use" as never)}><Text style={s.legalLink}>Acceptable Use</Text></Pressable>
          </View>

          <Text style={s.foot}>Yɛn ara asaase ni — this is our own land.</Text>
          <Text style={s.note}>An independent community initiative. Made by us, for us. For ages 18+.</Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.green900 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(12,44,31,0.55)" },
  panel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "88%",
    maxWidth: 400,
    backgroundColor: C.paper,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: -8, height: 0 },
    elevation: 12,
  },
  handleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  handle: { width: 44, height: 5, borderRadius: 999, backgroundColor: C.sand, alignSelf: "center" },
  closeBtn: { width: 36, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: C.cream },
  closeText: { color: C.inkMuted, fontSize: 15, fontWeight: "700" },
  scrollContent: { padding: 20, paddingTop: 8, paddingBottom: 48 },
  title: { fontFamily: serif, fontSize: 26, fontWeight: "600", color: C.ink, textAlign: "center" },
  body: { color: C.inkMuted, fontSize: 14, lineHeight: 21, marginTop: 10, textAlign: "center" },
  kicker: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 24, marginBottom: 10 },
  searchBtn: { marginTop: 18, borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center" },
  searchText: { color: C.inkMuted, fontSize: 14, fontWeight: "600" },
  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { fontFamily: serif, fontSize: 18, fontWeight: "700", color: C.ink },
  chevron: { color: C.inkFaint, fontSize: 22, fontWeight: "700" },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  langChip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  langChipOn: { borderColor: C.green, backgroundColor: C.green },
  langChipText: { color: C.inkMuted, fontSize: 13, fontWeight: "600" },
  langChipTextOn: { color: C.cream },
  cardBlurb: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  legalRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 22 },
  legalLink: { color: C.tealText, fontSize: 13, fontWeight: "600" },
  legalDot: { color: C.inkFaint },
  foot: { fontFamily: serif, fontStyle: "italic", color: C.goldText, textAlign: "center", marginTop: 24, fontSize: 16 },
  note: { color: C.inkFaint, fontSize: 12, textAlign: "center", marginTop: 6 },
  authCard: { backgroundColor: C.green, borderRadius: 14, padding: 18, marginTop: 18, alignItems: "center" },
  authName: { fontFamily: serif, fontSize: 20, fontWeight: "600", color: C.cream },
  authRole: { color: "rgba(246,241,231,0.75)", fontSize: 13, textAlign: "center", marginTop: 4, textTransform: "capitalize" },
  authBtn: { backgroundColor: C.goldBrand, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 20, marginTop: 12 },
  authBtnText: { color: C.green900, fontWeight: "700" },
  authBtnOutline: { borderWidth: 1, borderColor: "rgba(246,241,231,0.4)", borderRadius: 999, paddingVertical: 10, paddingHorizontal: 20, marginTop: 12, alignItems: "center" },
  authBtnOutlineText: { color: C.cream, fontWeight: "600" },
  authBtnRow: { flexDirection: "row", gap: 8 },
  signOutLink: { color: "rgba(246,241,231,0.7)", fontWeight: "600", textDecorationLine: "underline", marginTop: 14 },
});
