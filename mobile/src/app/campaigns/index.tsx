import { route } from "@/lib/routes";
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Link, Stack } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { S, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, PhotoHero, Thumb } from "@/ui";
import { StaggerIn } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon, DiamondIcon, UsersIcon } from "@/components/icons";
import { Progress, cedis } from "@/app/projects/index";

// Fundraising campaigns started by verified creators (Creator Monetization).
// A campaign is a project under the hood, so its detail + funding reuse the
// project screen and pledge flow.
export default function Campaigns() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, error, loading, refreshing, reload } = useApi<Listing[]>(() => api.campaigns(), "campaigns");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;
  const raised = data.reduce((sum, campaign) => sum + (campaign.details.raisedPesewas ?? 0), 0);
  const backers = data.reduce((sum, campaign) => sum + (campaign.details.backers ?? 0), 0);

  return (
    <>
      <Stack.Screen options={{ title: "Campaigns" }} />
      <ScrollView
        style={{ backgroundColor: C.paper }}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.greenText} />}
      >
      <PhotoHero
        image="/uploads/seed/fishermen.jpg"
        tone={C.green900}
        kicker="Fundraising · By the community"
        title="Campaigns started by Oguaa creators"
        lede="Verified creators raise money for the work, ideas and causes they care about. Every pledge is checked server-side before it moves the public total."
        icon={<UsersIcon size={24} color={C.gold} strokeWidth={1.8} />}
      >
        <View style={s.stats}>
          <HeroStat value={String(data.length)} label="live campaigns" styles={s} />
          <HeroStat value={cedis(raised)} label="raised together" styles={s} />
          <HeroStat value={String(backers)} label="backers" styles={s} />
        </View>
      </PhotoHero>
      <View style={{ padding: 16, gap: 14 }}>
        {data.length === 0 && <EmptyState icon={<DiamondIcon size={56} color={C.inkFaint} strokeWidth={1.5} />} title="No campaigns yet" body="Subscribed creators can start a fundraising campaign from the studio." />}
        {data.map((l, i) => (
          <StaggerIn key={l.id} index={i}>
            <Link href={route.project(l.slug)} asChild>
              <Pressable style={({ pressed }) => [s.card, pressed && s.cardPressed]} accessibilityRole="button" accessibilityLabel={`Open campaign ${l.title}`}>
                <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.cover} labelStyle={s.coverInit} />
                <View style={s.cardBody}>
                  <View style={s.kickerRow}>
                    <Text style={s.cardKicker}>FUNDRAISING CAMPAIGN</Text>
                    <View style={s.cardArrow}><ArrowRightIcon size={14} color={C.clayText} strokeWidth={2.4} /></View>
                  </View>
                  <Text style={s.title} numberOfLines={2}>{l.title}</Text>
                  <Text style={s.desc} numberOfLines={2}>{l.details.description}</Text>
                  <View style={s.progressWrap}>
                    <Progress raised={l.details.raisedPesewas} goal={l.details.goalPesewas} />
                  </View>
                  <View style={s.metaRow}>
                    <Text style={s.metaStrong}>{l.details.backers ?? 0} backers</Text>
                    {l.details.deadline ? <Text style={s.meta} numberOfLines={1}>Closes {String(l.details.deadline).slice(0, 10)}</Text> : null}
                  </View>
                </View>
              </Pressable>
            </Link>
          </StaggerIn>
        ))}
        </View>
      </ScrollView>
    </>
  );
}

function HeroStat({ value, label, styles }: Readonly<{ value: string; label: string; styles: ReturnType<typeof makeStyles> }>) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  stats: { flexDirection: "row", overflow: "hidden", borderWidth: 1, borderColor: C.onDarkText10, borderRadius: 14, backgroundColor: C.onDarkText10 },
  stat: { flex: 1, minHeight: 70, paddingHorizontal: 10, paddingVertical: 12, borderRightWidth: 1, borderRightColor: C.onDarkText10 },
  statLabel: { color: C.onDarkText60, fontSize: 8, lineHeight: 12, letterSpacing: 1.1, textTransform: "uppercase", ...S(600) },
  statValue: { color: "#F6F1E7", fontSize: 15, lineHeight: 19, marginTop: 4, ...S(700) },
  card: { minHeight: 180, flexDirection: "row", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, overflow: "hidden" },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  cover: { width: 100, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  coverInit: { color: C.cream, ...S(700), fontSize: 25 },
  cardBody: { flex: 1, minWidth: 0, paddingHorizontal: 13, paddingVertical: 12 },
  kickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardKicker: { color: C.clayText, fontSize: 8.5, letterSpacing: 1.2, ...S(700) },
  cardArrow: { width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand },
  title: { ...S(700), fontSize: 16, lineHeight: 20, color: C.ink, marginTop: 4 },
  desc: { color: C.inkMuted, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  progressWrap: { marginTop: 9 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 7 },
  metaStrong: { color: C.clayText, fontSize: 10.5, ...S(700) },
  meta: { flexShrink: 1, color: C.inkFaint, fontSize: 10, textAlign: "right" },
});
