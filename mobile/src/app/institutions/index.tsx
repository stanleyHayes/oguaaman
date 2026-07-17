import { route } from "@/lib/routes";
import { useMemo } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { T as Text } from "@/components/typography";
import { api, mediaUrl } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Organization } from "@/lib/types";
import { S, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, PhotoHero } from "@/ui";
import { cldCover } from "@/lib/cloudinary";
import { StaggerIn } from "@/components/anim";

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
              <Pressable style={s.card} accessibilityRole="button" accessibilityLabel={o.name}>
              {o.crestUrl ? (
                <Image source={{ uri: cldCover(mediaUrl(o.crestUrl), 120) }} resizeMode="cover" style={s.crest} />
              ) : (
                <View style={[s.crest, { backgroundColor: o.houseColors?.[0] ?? C.green, alignItems: "center", justifyContent: "center" }]}>
                  <Text style={s.crestInit}>{initials(o.name)}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={s.name} numberOfLines={1}>{o.name}</Text>
                  {o.verified && <Text style={s.verified}>✓</Text>}
                </View>
                <Text style={s.kind} numberOfLines={1}>
                  {KIND_LABEL[o.kind] ?? o.kind}{o.classification ? ` · ${o.classification}` : ""}
                </Text>
                {o.motto ? <Text style={s.motto} numberOfLines={1}>{o.motto}</Text> : null}
              </View>
              <Text style={s.chevron}>›</Text>
              </Pressable>
            </Link>
          </StaggerIn>
      ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 12 },
  crest: { width: 52, height: 52, borderRadius: 10, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper },
  crestInit: { color: C.cream, ...S(700), fontSize: 18 },
  name: { ...S(700), fontSize: 17, color: C.ink, flexShrink: 1 },
  verified: { color: C.goldText, fontSize: 13, ...S(700) },
  kind: { color: C.goldText, fontSize: 12, marginTop: 2 },
  motto: { color: C.inkMuted, fontSize: 12, fontStyle: "italic", marginTop: 2 },
  chevron: { color: C.inkFaint, fontSize: 22, ...S(700) },
});
