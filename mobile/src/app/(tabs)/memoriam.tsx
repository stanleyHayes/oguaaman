import { route } from "@/lib/routes";
import { useMemo } from "react";
import { ScrollView, StyleSheet, View, Pressable } from "react-native";
import { Link } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Listing } from "@/lib/types";
import { D, S, SI, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, Thumb } from "@/ui";
import { StaggerIn } from "@/components/anim";

function lifeDates(bornYear?: number, diedDate?: string) {
  return [bornYear ? String(bornYear) : "", diedDate ? diedDate.slice(0, 4) : ""].filter(Boolean).join(" — ");
}

export default function Memoriam() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, error, loading } = useApi<Listing[]>(() => api.memorials(), "memorials");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  return (
    <ScrollView style={{ backgroundColor: C.cream }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Text style={s.title}>Let us remember</Text>
      <Text style={s.lede}>
        Yɛnkae — “let us remember.” A permanent, dignified home for members of the Oguaa community who have passed. Light a candle and remember together.
      </Text>
      <View style={{ height: 18 }} />
      {data.map((m, i) => (
        <StaggerIn key={m.id} index={i}>
          <Link href={route.memoriam(m.slug)} asChild>
            <Pressable style={s.card} accessibilityRole="button" accessibilityLabel={m.title}>
            {m.coverImageUrl ? (
              <Thumb seed={m.slug} src={m.coverImageUrl} label={initials(m.title)} style={s.portrait} labelStyle={s.portraitInit} />
            ) : (
              <View style={s.portrait}>
                <Text style={s.portraitInit}>{initials(m.title)}</Text>
              </View>
            )}
            <Text style={s.name}>{m.details.honorific ? m.details.honorific + " " : ""}{m.title}</Text>
            <Text style={s.dates}>{lifeDates(m.details.bornYear, m.details.diedDate)}</Text>
            {m.details.epitaph && <Text style={s.epitaph} numberOfLines={2}>“{m.details.epitaph}”</Text>}
            <Text style={s.meta}>{m.details.candles ?? 0} candles · {m.details.rememberedByCount ?? 0} remembering</Text>
            </Pressable>
          </Link>
        </StaggerIn>
      ))}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  title: { ...D(600), fontSize: 34, color: C.ink, textAlign: "center" },
  lede: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10 },
  card: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 20, alignItems: "center", marginBottom: 14 },
  // Was the hand-picked parchment "#EADFC4"; goldTint14 is the semantic token
  // for a soft gold wash behind decorative circles, and follows the theme.
  portrait: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.goldTint14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.goldBrand },
  portraitInit: { ...S(600), fontSize: 24, color: C.greenText },
  name: { ...S(600), fontSize: 22, color: C.ink, marginTop: 12, textAlign: "center" },
  dates: { color: C.goldText, fontSize: 12, letterSpacing: 2, marginTop: 4 },
  epitaph: { ...SI(), color: C.inkMuted, textAlign: "center", marginTop: 8 },
  meta: { color: C.inkFaint, fontSize: 12, marginTop: 10 },
});
