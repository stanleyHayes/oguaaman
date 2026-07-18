import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import Animated from "react-native-reanimated";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme-context";
import type { Listing, MemberView } from "@/lib/types";
import { D, S, ON_GREEN, initials, type Palette } from "@/theme";
import { Loading, ErrorView, Thumb, VerifiedBadge } from "@/ui";
import { HeroParallax, RevealView, useHeroParallax } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon, PenIcon } from "@/components/icons";
import { memberRoleLabel } from "@/lib/member-role";
import { route, ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";

function contributionHref(listing: Listing) {
  if (listing.type === "artist") return route.music(listing.slug);
  if (listing.type === "memorial") return route.memoriam(listing.slug);
  if (listing.type === "business") return route.business(listing.slug);
  if (listing.type === "person") return route.person(listing.slug);
  if (listing.type === "project") return route.project(listing.slug);
  if (listing.type === "event") return route.event(listing.slug);
  if (listing.type === "memory") return ROUTES.browseMemories;
  if (listing.type === "opportunity") return ROUTES.browseOpportunities;
  return null;
}

function FollowButton({ slug }: Readonly<{ slug: string }>) {
  const { member } = useAuth();
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState<number | null>(null); // known after a toggle
  const [busy, setBusy] = useState(false);
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  useEffect(() => {
    if (!member) return;
    let alive = true;
    api.memberFollowState(slug).then((r) => { if (alive) setFollowing(r.following); }).catch(() => {});
    return () => { alive = false; };
  }, [member, slug]);

  if (!member || member.slug === slug) return null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      const r = next ? await api.followMember(slug) : await api.unfollowMember(slug);
      setFollowing(r.following);
      setFollowers(r.followers);
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable accessibilityRole="button" onPress={toggle} disabled={busy} style={[s.follow, following && s.followOn]}>
      <Text style={[s.followText, following && s.followTextOn]}>
        {following ? "Following" : "Follow"}{followers != null ? ` · ${followers}` : ""}
      </Text>
    </Pressable>
  );
}

export default function MemberProfile() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<MemberView>(() => api.member(slug), `member:${slug}`);
  const { scrollY, onScroll } = useHeroParallax();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;

  const { member: m, listings } = data;
  const published = listings.filter((l) => l.status === "approved");
  const places = data.places ?? [];
  const schools = data.schools ?? [];
  const quarter = places.find((p) => p.id === m.townId && p.kind !== "asafo");
  const asafo = places.find((p) => p.id === m.asafoId);
  const stints = (m.schooling ?? []).map((st) => {
    const name = schools.find((sc) => sc.id === st.schoolId)?.name ?? st.schoolId;
    const years = [st.fromYear, st.toYear].filter(Boolean).join("–");
    return years ? `${name} · ${years}` : name;
  });

  return (
    <>
      <Stack.Screen options={{ title: m.displayName }} />
      <Animated.ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }} onScroll={onScroll} scrollEventThrottle={16}>
        <View style={s.header}>
          <HeroParallax scrollY={scrollY} style={{ width: "100%", alignItems: "center" }}>
            {m.photoUrl ? (
              <Thumb seed={m.slug} src={m.photoUrl} label={m.initials || initials(m.displayName)} style={s.avatar} labelStyle={s.avatarText} />
            ) : (
              <View style={s.avatar}><Text style={s.avatarText}>{m.initials || initials(m.displayName)}</Text></View>
            )}
            <View style={s.nameRow}>
              <Text style={s.name}>{m.displayName}</Text>
              {m.verified ? <VerifiedBadge onDark size={18} /> : null}
            </View>
            <Text style={s.role}>{memberRoleLabel(m.role)}{m.joinedAt ? ` · joined ${m.joinedAt}` : ""}</Text>
            {m.verified && m.verifiedAs ? (
              <View style={{ marginTop: 8 }}><VerifiedBadge onDark label={`Verified · ${m.verifiedAs}`} /></View>
            ) : null}
            {m.bio ? <Text style={s.bio}>{m.bio}</Text> : null}
            {(quarter || asafo || stints.length > 0) && (
              <View style={s.chipRow}>
                {quarter ? <View style={s.chip}><Text style={s.chipText}>{quarter.name}</Text></View> : null}
                {asafo ? <View style={s.chip}><Text style={s.chipText}>{asafo.name}</Text></View> : null}
                {stints.map((label) => (
                  <View key={label} style={s.chip}><Text style={s.chipText}>{label}</Text></View>
                ))}
              </View>
            )}
            <FollowButton slug={m.slug} />
          </HeroParallax>
        </View>

        <View style={s.body}>
          <RevealView style={s.sectionCard}>
            <Text style={s.sectionTitle}>Contributions</Text>
            <Text style={s.sectionHelp}>Everything {m.displayName.split(" ")[0]} has shared with the town.</Text>
            {published.length === 0 && <EmptyState compact icon={<PenIcon size={32} color={C.inkFaint} strokeWidth={1.5} />} title="No public contributions yet" />}
            {published.map((l) => {
              const href = contributionHref(l);
              const content = (
                <>
                  <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.cardThumb} labelStyle={s.cardThumbInit} />
                  <View style={s.cardBody}>
                    <Text style={s.cardType}>{l.type}</Text>
                    <Text style={s.cardTitle} numberOfLines={2}>{l.title}</Text>
                  </View>
                  {href ? <View style={s.cardArrow}><ArrowRightIcon size={15} color={C.goldText} strokeWidth={2.3} /></View> : null}
                </>
              );
              return href ? (
                <Pressable key={l.id} accessibilityRole="button" accessibilityLabel={`Open ${l.title}`} onPress={() => push(href)} style={({ pressed }) => [s.card, pressed && s.cardPressed]}>{content}</Pressable>
              ) : (
                <View key={l.id} style={s.card}>{content}</View>
              );
            })}
          </RevealView>
        </View>
      </Animated.ScrollView>
    </>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { backgroundColor: C.green, alignItems: "center", paddingVertical: 28, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.greenSlate, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.goldBrand },
  avatarText: { color: ON_GREEN, ...S(700), fontSize: 32 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap", justifyContent: "center" },
  name: { ...D(700), fontSize: 26, color: ON_GREEN },
  role: { color: C.gold, fontSize: 12, letterSpacing: 1, marginTop: 2, textTransform: "uppercase" },
  // The header stays dark green in both themes, so this light cream bio text is
  // theme-independent — no palette token exists at alpha 0.8.
  bio: { color: "rgba(246,241,231,0.8)", fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8, maxWidth: 320 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12, justifyContent: "center" },
  chip: { borderWidth: 1, borderColor: C.onDarkText30, backgroundColor: C.onDarkText10, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: ON_GREEN, fontSize: 12, ...S(600) },
  follow: { marginTop: 16, borderWidth: 1, borderColor: C.onDarkText50, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 26 },
  followOn: { backgroundColor: C.gold, borderColor: C.gold },
  followText: { color: ON_GREEN, ...S(700) },
  followTextOn: { color: C.green900 },
  body: { padding: 16 },
  sectionCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sectionTitle: { ...D(700), fontSize: 20, color: C.ink },
  sectionHelp: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 10, marginBottom: 9 },
  cardPressed: { opacity: 0.72 },
  cardThumb: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardThumbInit: { color: C.cream, ...S(700), fontSize: 18 },
  cardBody: { flex: 1, minWidth: 0 },
  cardType: { color: C.goldText, fontSize: 10, letterSpacing: 1, ...S(700), textTransform: "uppercase" },
  cardTitle: { ...S(700), fontSize: 16, lineHeight: 20, color: C.ink, marginTop: 2 },
  cardArrow: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.cream },
});
