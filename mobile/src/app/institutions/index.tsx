import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Organization } from "@/lib/types";
import { C, serif, initials } from "@/theme";
import { Loading, ErrorView } from "@/ui";
import { cldCover } from "@/lib/cloudinary";

const KIND_LABEL: Record<string, string> = {
  school: "School",
  "traditional-authority": "Traditional authority",
  association: "Association",
  faith: "Faith",
  asafo: "Asafo company",
  civic: "Civic",
};

export default function Institutions() {
  const { data, error, loading, refreshing, reload } = useApi<Organization[]>(() => api.institutions(), "institutions");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.green} />}
    >
      <Text style={s.lede}>The official institutions of Cape Coast — schools, the traditional council, churches, the Asafo companies and civic bodies. Each keeps a verified page.</Text>
      {data.map((o) => (
          <Link key={o.id} href={`/institutions/${o.slug}`} asChild>
            <Pressable style={s.card}>
              {o.crestUrl ? (
                <Image source={{ uri: cldCover(o.crestUrl, 120) }} resizeMode="cover" style={s.crest} />
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
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  lede: { color: C.inkMuted, fontSize: 14, lineHeight: 20 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 12 },
  crest: { width: 52, height: 52, borderRadius: 10, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper },
  crestInit: { color: C.cream, fontFamily: serif, fontSize: 18, fontWeight: "700" },
  name: { fontFamily: serif, fontSize: 17, fontWeight: "700", color: C.ink, flexShrink: 1 },
  verified: { color: C.goldText, fontSize: 13, fontWeight: "700" },
  kind: { color: C.goldText, fontSize: 12, marginTop: 2 },
  motto: { color: C.inkMuted, fontSize: 12, fontStyle: "italic", marginTop: 2 },
  chevron: { color: C.inkFaint, fontSize: 22, fontWeight: "700" },
});
