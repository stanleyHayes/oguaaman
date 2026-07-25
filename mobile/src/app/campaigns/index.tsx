import { route } from "@/lib/routes";
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { S, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, PhotoHero, Thumb } from "@/ui";
import { StaggerIn } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon, DiamondIcon } from "@/components/icons";
import { Progress } from "@/app/projects/index";

// Fundraising campaigns started by verified creators (Creator Monetization).
// A campaign is a project under the hood, so its detail + funding reuse the
// project screen and pledge flow.
export default function Campaigns() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, error, loading, refreshing, reload } = useApi<Listing[]>(() => api.campaigns(), "campaigns");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.greenText} />}
    >
      <PhotoHero
        image="/uploads/seed/fetu-procession.jpg"
        tone={C.clay}
        kicker="Back a campaign"
        title="Fund a Cape Coast dream"
        lede="Verified creators raise money for the causes and projects they care about — studios, festivals, libraries. Every pledge is checked before it counts."
      />
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
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
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
