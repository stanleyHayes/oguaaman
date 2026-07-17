import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text } from "@/components/typography";
import { api, canUseStudio } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { CreatorOverview, Organization } from "@/lib/types";
import { D, ON_GREEN, S, initials, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, HeroBand, Thumb } from "@/ui";
import { MetricCard, cedis } from "@/components/studio-kit";

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Creator Studio — Overview + hub (Phase 2 mobile parity).
 *
 * Ports creator/src/pages/Overview.tsx: the at-a-glance KPI cards from
 * api.creatorOverview(), plus the tool-nav rows and the managed-institutions
 * list that make this screen the hub. There is no separate /studio/overview
 * route — this screen (route "/studio") is the Overview slot.
 *
 * Gating: the Me + More entry points use canUseStudio(member); this hub does
 * the authoritative check — creatorTypes OR any managed institution.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Tool = { glyph: string; label: string; desc: string; href: string };

export default function StudioHub() {
  const { member, loading } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  if (loading) return <Loading />;
  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Creator studio</Text>
        <Text style={s.gateBody}>Sign in to manage your listings, institutions, promotions and earnings in one place.</Text>
        <Pressable onPress={() => router.replace("/signin")} style={s.primaryBtn}>
          <Text style={s.primaryBtnText}>Sign in / create account</Text>
        </Pressable>
      </View>
    );
  }
  return <StudioLoaded />;
}

function StudioLoaded() {
  const { member } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  // Authoritative institution check — also catches managers with no creator type.
  const { data: orgs, loading: orgsLoading } = useApi<Organization[]>(
    () => api.myInstitutions(),
    `studio:institutions:${member?.id ?? "anon"}`,
  );
  const { data: overview } = useApi<CreatorOverview>(
    () => api.creatorOverview(),
    `studio:overview:${member?.id ?? "anon"}`,
  );
  const institutions = orgs ?? [];
  const eligible = canUseStudio(member) || institutions.length > 0;
  const firstName = member?.displayName.split(" ")[0] ?? "";

  const tools: Tool[] = [
    { glyph: "▦", label: "My work", desc: "Listings you own, with review status", href: "/studio/work" },
    { glyph: "↗", label: "Grow", desc: "Promote your work and pick a plan", href: "/studio/grow" },
    { glyph: "₵", label: "Money", desc: "Tickets sold and pledges raised", href: "/studio/money" },
    { glyph: "◈", label: "Team", desc: "Manage your institution roster", href: "/studio/team" },
  ];

  // Mirrors the web Overview status line under the title.
  const statusLine = overview
    ? overview.pending > 0
      ? `You have ${overview.pending} listing${overview.pending === 1 ? "" : "s"} waiting for review.`
      : overview.live > 0
        ? "Everything you've published is live. Keep the town talking."
        : "Nothing live yet — your first listing is one form away."
    : null;

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <HeroBand
        tone={C.green}
        kicker="Creator studio · at a glance"
        title={firstName ? `Welcome, ${firstName}` : "Your creator studio"}
        lede="Everything you've published on Oguaa — your listings, institutions, promotions and earnings — in one place."
      />

      <View style={s.body}>
        {!eligible && !orgsLoading && (
          <View style={s.citizenCard}>
            <Text style={s.citizenTitle}>You&apos;re signed in as a citizen</Text>
            <Text style={s.citizenBody}>Tell us what you create — business, art, events — and this studio lights up around your work. It takes a few seconds on your profile.</Text>
            <Pressable onPress={() => router.push("/me")} style={[s.primaryBtn, { alignSelf: "flex-start", marginTop: 14 }]}>
              <Text style={s.primaryBtnText}>Set up your creator profile</Text>
            </Pressable>
          </View>
        )}

        {eligible && (
          <>
            {statusLine ? <Text style={s.statusLine}>{statusLine}</Text> : null}

            {overview && (
              <View style={s.grid}>
                <MetricCard label="Live listings" value={overview.live} glyph="▦" tone="teal" sub={overview.pending ? `${overview.pending} in review` : undefined} href="/studio/work" />
                <MetricCard label="In review" value={overview.pending} glyph="◷" tone="gold" sub="Moderation queue" href="/studio/work" />
                <MetricCard label="Active promotions" value={overview.activePromotions} glyph="↗" tone="green" sub={overview.promotionDaysLeft ? `${overview.promotionDaysLeft} days left` : "GH₵ 10 per day"} href="/studio/grow" />
                <MetricCard label="Plan" value={overview.activeSubscription ? "Supporter" : "Starter"} glyph="★" tone="ink" sub={overview.activeSubscription ? "★ badge + priority" : "Free"} href="/studio/grow" />
                <MetricCard label="Tickets sold" value={overview.ticketsSold} glyph="▧" tone="teal" sub={cedis(overview.ticketsGrossPesewas)} href="/studio/money" />
                <MetricCard label="Pledges raised" value={cedis(overview.pledgesRaisedPesewas)} glyph="₵" tone="gold" sub="Net to your projects" href="/studio/money" />
                <MetricCard label="Views this month" value={overview.viewsThisMonth ?? 0} glyph="◉" tone="teal" sub="Unique daily views on your listings" style={{ flexBasis: "100%" }} />
              </View>
            )}

            <Text style={[s.sectionLabel, { marginTop: 22 }]}>Your tools</Text>
            <View style={{ gap: 8 }}>
              {tools.map((t) => (
                <Pressable key={t.href} onPress={() => router.push(t.href as never)} style={s.toolRow}>
                  <View style={s.toolIcon}><Text style={s.toolIconText}>{t.glyph}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.toolLabel}>{t.label}</Text>
                    <Text style={s.toolDesc}>{t.desc}</Text>
                  </View>
                  <Text style={s.chevron}>›</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.sectionLabel, { marginTop: 22 }]}>Institutions you manage</Text>
            {orgsLoading ? (
              <Text style={s.help}>Loading your institutions…</Text>
            ) : institutions.length === 0 ? (
              <Text style={s.help}>You don&apos;t manage any institutions yet. Claim one from its page to steward its official profile and team.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {institutions.map((org) => (
                  <Pressable
                    key={org.id}
                    onPress={() => router.push(`/institutions/${org.slug}/manage` as never)}
                    style={s.toolRow}
                  >
                    {org.crestUrl ? (
                      <Thumb seed={org.slug} src={org.crestUrl} label={initials(org.name)} style={s.crest} labelStyle={s.crestText} />
                    ) : (
                      <View style={s.crest}><Text style={s.crestText}>{initials(org.name)}</Text></View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.toolLabel} numberOfLines={1}>{org.name}</Text>
                      <Text style={s.toolDesc}>{org.verified ? "Verified · official" : "Manage official page"}</Text>
                    </View>
                    <Text style={s.chevron}>›</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable onPress={() => router.push("/submit" as never)} style={s.addListingBtn}>
              <Text style={s.addListingText}>+ Add a listing</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { ...D(600), fontSize: 26, color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
  primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, marginTop: 18 },
  primaryBtnText: { color: ON_GREEN, fontWeight: "700", fontSize: 15 },

  body: { padding: 16 },
  statusLine: { color: C.inkMuted, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  sectionLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 1.5, fontWeight: "700", textTransform: "uppercase", marginBottom: 10 },
  help: { color: C.inkMuted, fontSize: 13, lineHeight: 19 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  citizenCard: { backgroundColor: withAlpha(C.gold, 0.08), borderWidth: 1, borderColor: C.goldBorder, borderRadius: 16, padding: 18, marginBottom: 20 },
  citizenTitle: { ...S(700), fontSize: 18, color: C.ink },
  citizenBody: { color: C.inkMuted, fontSize: 13, lineHeight: 20, marginTop: 6 },

  toolRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13 },
  toolIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: withAlpha(C.green, 0.08), alignItems: "center", justifyContent: "center" },
  toolIconText: { color: C.greenText, fontSize: 18, fontWeight: "700" },
  toolLabel: { color: C.ink, fontSize: 15, fontWeight: "700" },
  toolDesc: { color: C.inkFaint, fontSize: 12, marginTop: 2 },
  crest: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  crestText: { color: ON_GREEN, ...S(700), fontSize: 15 },
  chevron: { color: C.inkFaint, fontSize: 20, fontWeight: "700" },

  addListingBtn: { borderWidth: 1, borderStyle: "dashed", borderColor: C.goldBrand, borderRadius: 999, paddingVertical: 12, alignItems: "center", marginTop: 22 },
  addListingText: { color: C.goldText, fontSize: 14, fontWeight: "700" },
});
