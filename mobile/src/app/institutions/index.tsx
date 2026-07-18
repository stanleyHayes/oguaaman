import { route } from "@/lib/routes";
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Organization } from "@/lib/types";
import { S, SI, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, PhotoHero, Thumb, VerifiedBadge } from "@/ui";
import { StaggerIn } from "@/components/anim";
import { ArrowRightIcon } from "@/components/icons";

const KIND_LABEL: Record<string, string> = {
  school: "School",
  "traditional-authority": "Traditional authority",
  association: "Association",
  faith: "Faith",
  asafo: "Asafo company",
  civic: "Civic",
};

export default function Institutions() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, error, loading, refreshing, reload } = useApi<Organization[]>(() => api.institutions(), "institutions");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.greenText} />}
    >
      <PhotoHero
        image="/uploads/seed/mfantsipim-campus.jpg"
        tone={C.maroon}
        kicker="Rep your school · the powerhouse"
        title="Institutions of Oguaa"
        lede="The official institutions of Cape Coast — schools, the traditional council, churches, the Asafo companies and civic bodies. Each keeps a verified page."
      />
      <View style={{ padding: 16, gap: 12 }}>
      {data.map((o, i) => (
          <StaggerIn key={o.id} index={i}>
            <Link href={route.institution(o.slug)} asChild>
              <Pressable style={({ pressed }) => [s.card, pressed && s.cardPressed]} accessibilityRole="button" accessibilityLabel={`Open ${o.name}`}>
              <View style={[s.cardAccent, { backgroundColor: o.houseColors?.[0] ?? C.maroon }]} />
              <Thumb seed={o.slug} src={o.crestUrl} label={initials(o.name)} style={s.crest} labelStyle={s.crestInit} />
              <View style={s.cardBody}>
                <View style={s.kickerRow}>
                  <Text style={s.kind} numberOfLines={1}>{KIND_LABEL[o.kind] ?? o.kind}</Text>
                  {o.verified ? <VerifiedBadge size={15} /> : null}
                </View>
                <Text style={s.name} numberOfLines={2}>{o.name}</Text>
                {o.classification ? <Text style={s.classification} numberOfLines={1}>{o.classification}</Text> : null}
                {o.motto ? <Text style={s.motto} numberOfLines={2}>“{o.motto}”</Text> : null}
              </View>
              <View style={s.cardArrow}><ArrowRightIcon size={15} color={C.maroonText} strokeWidth={2.4} /></View>
              </Pressable>
            </Link>
          </StaggerIn>
      ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  card: { position: "relative", overflow: "hidden", flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 15, paddingVertical: 11, paddingLeft: 15, paddingRight: 11 },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  cardAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  crest: { width: 64, height: 70, borderRadius: 12, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper },
  crestInit: { color: C.cream, ...S(700), fontSize: 18 },
  cardBody: { flex: 1, minWidth: 0 },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { ...S(700), fontSize: 16, lineHeight: 20, color: C.ink, marginTop: 3 },
  kind: { flex: 1, color: C.goldText, fontSize: 8.5, letterSpacing: 1.1, textTransform: "uppercase", ...S(700) },
  classification: { color: C.inkFaint, fontSize: 10.5, marginTop: 2, ...S(600) },
  motto: { ...SI(), color: C.inkMuted, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  cardArrow: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand },
});
