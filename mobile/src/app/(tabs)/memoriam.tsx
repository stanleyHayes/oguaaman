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
import { ArrowRightIcon, CandleIcon } from "@/components/icons";

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
    <ScrollView style={{ backgroundColor: C.cream }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={s.title}>Let us remember</Text>
      <Text style={s.lede}>
        Yɛnkae — “let us remember.” A permanent, dignified home for members of the Oguaa community who have passed. Light a candle and remember together.
      </Text>
      <View style={{ height: 16 }} />
      {data.map((m, i) => (
        <StaggerIn key={m.id} index={i}>
          <Link href={route.memoriam(m.slug)} asChild>
            <Pressable
              style={s.card}
              accessibilityRole="button"
              accessibilityLabel={`${m.title}. ${lifeDates(m.details.bornYear, m.details.diedDate)}. ${m.details.candles ?? 0} candles`}
              accessibilityHint="Opens memorial"
            >
              {m.coverImageUrl ? (
                <Thumb seed={m.slug} src={m.coverImageUrl} label={initials(m.title)} style={s.portrait} labelStyle={s.portraitInit} />
              ) : (
                <View style={s.portrait}>
                  <Text style={s.portraitInit}>{initials(m.title)}</Text>
                </View>
              )}
              <View style={s.cardBody}>
                <Text style={s.cardKicker}>In memoriam · {lifeDates(m.details.bornYear, m.details.diedDate) || "Yɛnkae"}</Text>
                <Text style={s.name} numberOfLines={2}>{m.details.honorific ? m.details.honorific + " " : ""}{m.title}</Text>
                {m.details.epitaph ? <Text style={s.epitaph} numberOfLines={2}>“{m.details.epitaph}”</Text> : null}
                <View style={s.metaRow}>
                  <CandleIcon size={14} color={C.goldText} strokeWidth={1.8} />
                  <Text style={s.meta}>{m.details.candles ?? 0} candles</Text>
                  <View style={s.metaDot} />
                  <Text style={s.meta}>{m.details.rememberedByCount ?? 0} remembering</Text>
                </View>
              </View>
              <View style={s.cardArrow}>
                <ArrowRightIcon size={16} color={C.greenText} strokeWidth={2.2} />
              </View>
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
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.paper, borderWidth: 1, borderLeftWidth: 3, borderColor: C.sand, borderLeftColor: C.goldBrand, borderRadius: 18, padding: 11, minHeight: 108, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.035, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  // Was the hand-picked parchment "#EADFC4"; goldTint14 is the semantic token
  // for a soft gold wash behind decorative circles, and follows the theme.
  portrait: { width: 74, height: 74, borderRadius: 37, backgroundColor: C.goldTint14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.goldBrand },
  portraitInit: { ...S(600), fontSize: 22, color: C.greenText },
  cardBody: { flex: 1, minWidth: 0, paddingVertical: 2 },
  cardKicker: { color: C.goldText, ...S(700), fontSize: 9, lineHeight: 13, letterSpacing: 1.1, textTransform: "uppercase" },
  name: { ...S(700), fontSize: 17, lineHeight: 21, color: C.ink, marginTop: 3 },
  epitaph: { ...SI(), color: C.inkMuted, fontSize: 12, lineHeight: 16, marginTop: 3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7, flexWrap: "wrap" },
  meta: { color: C.inkFaint, ...S(500), fontSize: 10 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: C.inkFaint },
  cardArrow: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
});
