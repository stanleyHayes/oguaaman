// The diaspora register (spec §4/§5/§15, Phase 2): sons & daughters who have
// opted in as living away from Oguaa — "abroad" includes elsewhere in Ghana.
import { useMemo } from "react";
import { route, ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Link, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme-context";
import type { Member } from "@/lib/types";
import { D, S, ON_GREEN, initials, type Palette } from "@/theme";
import { Loading, ErrorView, PhotoHero, Thumb } from "@/ui";
import { StaggerIn } from "@/components/anim";

type Group = { country: string; members: Member[] };

function groupByCountry(members: Member[]): Group[] {
  const byCountry = new Map<string, Member[]>();
  for (const m of members) {
    const country = m.diaspora?.country?.trim() || "Elsewhere";
    byCountry.set(country, [...(byCountry.get(country) ?? []), m]);
  }
  return [...byCountry.entries()]
    .map(([country, ms]) => ({ country, members: ms }))
    .sort((a, b) => b.members.length - a.members.length || a.country.localeCompare(b.country));
}

function MemberCard({ m, index }: Readonly<{ m: Member; index: number }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const where = [m.diaspora?.city?.trim(), m.diaspora?.country?.trim()].filter(Boolean).join(", ");
  return (
    <StaggerIn index={index}>
      <Link href={route.member(m.slug)} asChild>
        <Pressable style={s.card} accessibilityRole="button" accessibilityLabel={m.displayName}>
          <Thumb seed={m.slug} src={m.photoUrl} label={m.initials || initials(m.displayName)} style={s.avatar} labelStyle={s.avatarText} />
          <View style={s.cardBody}>
            <Text style={s.cardName}>{m.displayName}</Text>
            {where ? <Text style={s.cardWhere}>{where}</Text> : null}
            {m.bio ? <Text style={s.cardBio} numberOfLines={2}>{m.bio}</Text> : null}
          </View>
          <Text style={s.chevron}>›</Text>
        </Pressable>
      </Link>
    </StaggerIn>
  );
}

export default function Diaspora() {
  const { data, error, loading } = useApi<Member[]>(() => api.diaspora(), "diaspora");
  const { member } = useAuth();
  const router = useRouter();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const groups = groupByCountry(data);
  const cityCount = new Set(data.map((m) => `${m.diaspora?.city}|${m.diaspora?.country}`)).size;
  const joinLabel = member?.diaspora?.abroad
    ? "You're on the register — update your details"
    : member
      ? "Add yourself — the “Oguaa abroad” panel"
      : "Sign in to join the register";
  const joinHref = member ? ROUTES.me : ROUTES.signIn;

  return (
    <ScrollView style={{ backgroundColor: C.cream }} contentContainerStyle={{ paddingBottom: 48 }}>
      <PhotoHero
        image="/uploads/seed/elmina-pano.jpg"
        tone={C.teal}
        kicker="OGUAA ABROAD · THE DIASPORA REGISTER"
        title="Sons & daughters, everywhere."
        fante="Abɔkyirfoɔ"
        lede="The register of Cape Coasters living away from home — across the world and across Ghana. Sankofa: the bridge for homecomings, projects, and the doors we open for the young."
      />
      <View style={{ padding: 20 }}>

      {data.length > 0 && (
        <View style={s.statsRow}>
          <View style={s.stat}><Text style={s.statNum}>{data.length}</Text><Text style={s.statLabel}>on the register</Text></View>
          <View style={s.stat}><Text style={s.statNum}>{groups.length}</Text><Text style={s.statLabel}>{groups.length === 1 ? "country" : "countries"}</Text></View>
          <View style={s.stat}><Text style={s.statNum}>{cityCount}</Text><Text style={s.statLabel}>{cityCount === 1 ? "city" : "cities"}</Text></View>
        </View>
      )}

      {groups.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>The register is open</Text>
          <Text style={s.emptyBody}>Be the first son or daughter abroad on it — homecomings, projects and mentorship start with knowing where we all are.</Text>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.country} style={s.group}>
            <Text style={s.groupKicker}>
              {g.country === "Ghana" ? "ELSEWHERE IN GHANA — AWAY, NEVER FAR" : `${g.members.length} ${g.members.length === 1 ? "SON OR DAUGHTER" : "SONS & DAUGHTERS"}`}
            </Text>
            <Text style={s.groupTitle}>{g.country}</Text>
            {g.members.map((m, i) => <MemberCard key={m.id} m={m} index={i} />)}
          </View>
        ))
      )}

      <View style={s.bridge}>
        <Text style={s.bridgeKicker}>THE BRIDGE WORKS BOTH WAYS</Text>
        <Text style={s.bridgeTitle}>What the register feeds</Text>
        <Pressable accessibilityRole="button" style={s.bridgeCard} onPress={() => push(ROUTES.festivals)}>
          <Text style={s.bridgeCardTitle}>Come home for Afahye</Text>
          <Text style={s.bridgeCardBody}>The annual homecoming beat — the first Saturday of September, wherever you live.</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={s.bridgeCard} onPress={() => push(ROUTES.projects)}>
          <Text style={s.bridgeCardTitle}>Back a project</Text>
          <Text style={s.bridgeCardBody}>Fund the classrooms, boreholes and sea walls back home — openly, pesewa by pesewa.</Text>
        </Pressable>
        <View style={[s.bridgeCard, s.bridgeCardSoon]}>
          <Text style={s.bridgeCardTitle}>Mentor the young</Text>
          <Text style={s.bridgeCardBody}>Launching once the safeguarding policy, vetting and guardian consent are in place.</Text>
          <Text style={s.soonChip}>COMING WITH SAFEGUARDS</Text>
        </View>
      </View>

      <View style={s.join}>
        <Text style={s.joinTitle}>Wherever you are, Oguaa keeps your name</Text>
        <Text style={s.joinBody}>Opt-in, a minute to add. Your phone stays private — only what you choose to show is shown.</Text>
        <Link href={joinHref} asChild>
          <Pressable style={s.joinBtn} accessibilityRole="button" accessibilityLabel={joinLabel}><Text style={s.joinBtnText}>{joinLabel}</Text></Pressable>
        </Link>
      </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  statsRow: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, backgroundColor: C.paper, borderRadius: 14, borderWidth: 1, borderColor: C.sand, padding: 12, alignItems: "center" },
  statNum: { ...D(700), fontSize: 24, color: C.goldText },
  statLabel: { ...S(), fontSize: 12, color: C.inkMuted, marginTop: 2, textAlign: "center" },
  group: { marginTop: 28 },
  groupKicker: { ...S(600), fontSize: 10.5, letterSpacing: 1.4, color: C.inkFaint },
  groupTitle: { ...D(600), fontSize: 22, color: C.ink, marginTop: 4, marginBottom: 10 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.paper, borderRadius: 16, borderWidth: 1, borderColor: C.sand, padding: 14, marginBottom: 10 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarText: { ...S(600), fontSize: 17, color: C.cream },
  cardBody: { flex: 1 },
  cardName: { ...S(600), fontSize: 16, color: C.ink },
  cardWhere: { ...S(500), fontSize: 13, color: C.goldText, marginTop: 1 },
  cardBio: { ...S(), fontSize: 13, lineHeight: 18, color: C.inkMuted, marginTop: 4 },
  chevron: { ...S(), fontSize: 22, color: C.inkFaint },
  empty: { marginTop: 24, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: C.goldBrand, backgroundColor: C.paper, padding: 20, alignItems: "center" },
  emptyTitle: { ...D(600), fontSize: 20, color: C.ink },
  emptyBody: { ...S(), fontSize: 14, lineHeight: 21, color: C.inkMuted, textAlign: "center", marginTop: 8 },
  bridge: { marginTop: 32 },
  bridgeKicker: { ...S(600), fontSize: 10.5, letterSpacing: 1.4, color: C.inkFaint },
  bridgeTitle: { ...D(600), fontSize: 22, color: C.ink, marginTop: 4, marginBottom: 10 },
  bridgeCard: { backgroundColor: C.paper, borderRadius: 16, borderWidth: 1, borderColor: C.sand, padding: 16, marginBottom: 10 },
  bridgeCardSoon: { borderStyle: "dashed", backgroundColor: "transparent" },
  bridgeCardTitle: { ...S(600), fontSize: 15, color: C.ink },
  bridgeCardBody: { ...S(), fontSize: 13, lineHeight: 19, color: C.inkMuted, marginTop: 4 },
  soonChip: { ...S(600), fontSize: 10, letterSpacing: 1.2, color: C.inkFaint, marginTop: 10 },
  join: { marginTop: 28, backgroundColor: C.green, borderRadius: 20, padding: 22 },
  joinTitle: { ...D(600), fontSize: 22, color: ON_GREEN },
  // The join box stays dark green in both themes, so its overlay text is a
  // theme-independent light cream — no palette token exists at alpha 0.8.
  joinBody: { ...S(), fontSize: 14, lineHeight: 21, color: "rgba(246,241,231,0.8)", marginTop: 8 },
  joinBtn: { marginTop: 16, backgroundColor: C.goldBrand, borderRadius: 999, paddingVertical: 12, alignItems: "center" },
  joinBtnText: { ...S(600), fontSize: 14, color: C.cream },
});
