import { route } from "@/lib/routes";
import { useMemo } from "react";
import { push } from "@/lib/router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useTheme } from "@/lib/theme-context";
import type { FestivalSummary } from "@/lib/types";
import { S, type Palette } from "@/theme";
import { Loading, ErrorView, PhotoHero, Thumb } from "@/ui";
import { StaggerIn } from "@/components/anim";
import { ArrowRightIcon } from "@/components/icons";

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export default function Festivals() {
  const { data, error, loading, refreshing, reload } = useApi<FestivalSummary[]>(() => api.festivals(), "festivals");
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.greenText} />}
    >
      <PhotoHero
        image="/uploads/seed/bakatue.jpg"
        tone={C.green}
        kicker="The living archive"
        title="Festivals of the coast"
        lede="Every edition of every festival — Fetu Afahye, Edina Bakatue, PANAFEST and the rest — kept year by year: recaps of the ones behind us, programmes for the ones ahead."
      />
      <View style={{ padding: 16, gap: 14 }}>
      {data.map((f, i) => (
        <StaggerIn key={f.slug} index={i}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={f.name}
            onPress={() => push(route.festival(f.slug))}
            style={({ pressed }) => [s.card, pressed && s.cardPressed]}
          >
            <Thumb seed={f.slug} src={f.nextEdition?.coverImageUrl} label={f.name} style={s.cover} labelStyle={s.coverLabel} />
            <View style={s.cardBody}>
              <Text style={s.kicker}>LIVING ARCHIVE</Text>
              <Text style={s.name} numberOfLines={1}>{f.name}</Text>
              {f.tagline ? <Text style={s.tagline} numberOfLines={2}>{f.tagline}</Text> : null}
              <View style={s.metaRow}>
                <Text style={s.meta} numberOfLines={1}>
                  {f.nextEdition?.details.startsAt ? <>Next <Text style={s.metaNext}>{fmtDate(f.nextEdition.details.startsAt)}</Text> · </> : null}
                  {f.editions} edition{f.editions === 1 ? "" : "s"} archived
                </Text>
                <View style={s.cardArrow}><ArrowRightIcon size={14} color={C.goldText} strokeWidth={2.3} /></View>
              </View>
            </View>
          </Pressable>
        </StaggerIn>
      ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  card: { minHeight: 118, flexDirection: "row", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 18, overflow: "hidden" },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  cover: { width: 108, alignSelf: "stretch", minHeight: 118, alignItems: "center", justifyContent: "center" },
  coverLabel: { color: C.cream, ...S(700), fontSize: 15, lineHeight: 18, textAlign: "center", paddingHorizontal: 10 },
  cardBody: { flex: 1, minWidth: 0, padding: 12 },
  kicker: { color: C.goldText, fontSize: 8.5, letterSpacing: 1.25, ...S(700) },
  name: { ...S(700), fontSize: 17, color: C.ink, marginTop: 2 },
  tagline: { color: C.inkMuted, fontSize: 12.5, lineHeight: 17, marginTop: 3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 8 },
  meta: { flex: 1, color: C.inkFaint, fontSize: 10.5 },
  metaNext: { color: C.goldText, ...S(700) },
  cardArrow: { width: 25, height: 25, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
});
