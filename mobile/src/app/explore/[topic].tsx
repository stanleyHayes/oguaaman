import { route } from "@/lib/routes";
import { useMemo } from "react";
import { push } from "@/lib/router";
import { StyleSheet, View, Pressable } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import Animated from "react-native-reanimated";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { HistoryView } from "@/lib/types";
import { D, S, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, PhotoHero, Thumb } from "@/ui";
import { StaggerIn, useHeroParallax } from "@/components/anim";
import { ArrowRightIcon, FileTextIcon, LandmarkIcon, UserIcon } from "@/components/icons";

// Static editorial for Heritage / Culture / Visit, ported from the portal and
// grounded in the fact-checked Cape Coast research brief (agent_plan.md §1).

interface Block { h?: string; p?: string; items?: { label: string; text?: string; colors?: string[] }[] }
// `tone` is a palette token name, resolved against the active theme at render.
interface Topic { title: string; kicker: string; tone: keyof Palette; image: string; lede: string; blocks: Block[]; link?: { label: string; href: string } }

const TOPICS: Record<string, Topic> = {
  heritage: {
    title: "Heritage",
    kicker: "SANKOFA · GO BACK AND FETCH IT",
    tone: "green",
    image: "/uploads/seed/castle-courtyard.jpg",
    lede: "Oguaa remembers. The Castle and the Door of No Return, the lawyers and journalists of the old capital, the country's oldest schools.",
    blocks: [], // data-driven from /api/history — see HeritageScreen below
  },
  culture: {
    title: "Culture",
    kicker: "FETU AFAHYE · THE 77 GODS",
    tone: "goldBrand",
    image: "/uploads/seed/fetu-crowd.jpg",
    lede: "Oguaa celebrates. The festival, the durbar, the seven Asafo companies and the Traditional Council that binds them.",
    blocks: [
      { h: "Fetu Afahye", p: "The harvest-and-cleansing festival of the Oguaa Traditional Area climaxes on the first Saturday of September. 'Fetu' is the clearing of the dirt: a ban on drumming and noise precedes it, thanks are given to the 77 gods of Oguaa and to the sea, and the chiefs ride in palanquins under state umbrellas to the grand durbar. At Bakatue, on the Fosu Lagoon, the Omanhene casts a net three times — then the companies race canoes." },
      // Real-world Asafo company flag colours — theme-independent by nature.
      { h: "The seven companies", items: [
        { label: "Bentsir — No. 1", colors: ["#A4161A"] },
        { label: "Anaafo — No. 2", colors: ["#1E4FA3", "#FBFBFB"] },
        { label: "Ntsin — No. 3", colors: ["#1E6B3A"] },
        { label: "Nkum — No. 4 · the oldest", colors: ["#E3B23C"] },
        { label: "Amanful — No. 5 · 'New Town'", colors: ["#7C2D2D", "#161616"] },
        { label: "Brofomba — No. 6", colors: ["#FBFBFB"] },
        { label: "Akrampa — No. 7", colors: ["#FBFBFB", "#161616"] },
      ] },
      { h: "The Traditional Council", p: "The Oguaa Traditional Council is headed by the Omanhene — Osabarimba Kwesi Atta II, installed 1998 — with the Ohemaa (queen mother) and the Okyeame, the linguist, for a chief never speaks in public. Identity is broadcast in posuban shrines and appliqué frankaa flags: red for sacrifice, white for purity, black for solidarity, blue for the Asafo." },
      { h: "The table", p: "Fante kenkey — dokonu — unsalted fermented corn dough steamed in plantain leaves, softer and sourer than the Ga kind, taken with fresh fish, shito and pepper. Argue about it at Kotokuraba." },
    ],
    link: { label: "Visit the Oguaa Traditional Area's official page →", href: "/institutions/oguaa-traditional-area" },
  },
  visit: {
    title: "Visit",
    kicker: "AKWAABA · YOU ARE WELCOME",
    tone: "teal",
    image: "/uploads/seed/kakum-canopy.jpg",
    lede: "Two hard contrasts in soft light: the bone-white Castle by the sea, the green hush of Kakum inland — and the town between them.",
    blocks: [
      { h: "Cape Coast Castle", p: "Walk the ramparts, stand at the Door of No Return, and take the guided tour through the dungeons. Give it a half day, and give it silence where it asks for it." },
      { h: "Kakum canopy walkway", p: "Seven rope bridges, about 350 metres long and up to 40 metres above the forest floor, opened in March 1995 with the backing of Conservation International and the UNDP. Go early — the forest is loudest at dawn." },
      { h: "The town itself", p: "Kotokuraba Market — the 'crab hamlet' the town is named for — the Fosu Lagoon at sunset, beached pirogues along the shore, and kenkey with fresh fish wherever you smell woodsmoke." },
      { h: "When to come", p: "The first week of September, if you can: Fetu Afahye fills the streets, with the grand durbar on the first Saturday. Cape Coast is about three hours from Accra by road." },
    ],
  },
};

export default function Explore() {
  const { topic } = useLocalSearchParams<{ topic: string }>();
  const t = TOPICS[topic ?? ""];
  const { scrollY, onScroll } = useHeroParallax();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (!t) return <ErrorView message="Unknown topic" />;
  if (topic === "heritage") return <HeritageScreen topic={t} />;

  return (
    <>
      <Stack.Screen options={{ title: t.title }} />
      <Animated.ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }} onScroll={onScroll} scrollEventThrottle={16}>
        <PhotoHero image={t.image} tone={C[t.tone]} kicker={t.kicker} lede={t.lede} scrollY={scrollY} />
        <View style={s.body}>
          {t.blocks.map((b, i) => (
            <StaggerIn key={`${b.h ?? ""}-${i}`} index={i} style={{ marginTop: i === 0 ? 0 : 22 }}>
              {b.h ? <Text style={s.h}>{b.h}</Text> : null}
              {b.p ? <Text style={s.p}>{b.p}</Text> : null}
              {b.items ? (
                <View style={{ gap: 8, marginTop: 4 }}>
                  {b.items.map((it) => (
                    <View key={it.label} style={s.itemRow}>
                      {it.colors ? (
                        <View style={{ flexDirection: "row", gap: 4 }}>
                          {it.colors.map((c) => <View key={c} style={[s.colorDot, { backgroundColor: c }]} />)}
                        </View>
                      ) : (
                        <Text style={[s.itemLabel, { color: C[t.tone] }]}>{it.label}</Text>
                      )}
                      <Text style={s.itemText}>{it.colors ? it.label : it.text}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </StaggerIn>
          ))}
          {t.link ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.link.label.replace(/\s*→$/, "")}
              accessibilityHint="Opens the institution page"
              onPress={() => push(t.link!.href)}
              style={({ pressed }) => [s.linkCard, pressed && s.cardPressed]}
            >
              <View style={s.linkIcon}><LandmarkIcon size={20} color={C.greenText} strokeWidth={1.9} /></View>
              <View style={s.linkBody}>
                <Text style={s.linkKicker}>TRADITIONAL COUNCIL</Text>
                <Text style={s.linkText}>{t.link.label.replace(/\s*→$/, "")}</Text>
              </View>
              <View style={s.cardArrow}><ArrowRightIcon size={15} color={C.greenText} strokeWidth={2.3} /></View>
            </Pressable>
          ) : null}
        </View>
      </Animated.ScrollView>
    </>
  );
}

// Heritage is the living record: the town's timeline plus heritage sites,
// people and memories — all served by /api/history (the history hub).
function HeritageScreen({ topic: t }: Readonly<{ topic: Topic }>) {
  const { data, error, loading } = useApi<HistoryView>(() => api.history(), "history");
  const { scrollY, onScroll } = useHeroParallax();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  return (
    <>
      <Stack.Screen options={{ title: t.title }} />
      <Animated.ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }} onScroll={onScroll} scrollEventThrottle={16}>
        <PhotoHero image={t.image} tone={C[t.tone]} kicker={t.kicker} lede={t.lede} scrollY={scrollY} />
        <View style={s.body}>
          {/* Timeline — nkyinkyim: the path is twisted */}
          <Text style={s.h}>A timeline of Oguaa</Text>
          <View style={{ gap: 8, marginTop: 4 }}>
            {data.timeline.map((e, i) => (
              <StaggerIn key={e.id} index={i} style={s.timelineCard}>
                <View style={s.yearTile}>
                  <Text style={s.yearTileLabel}>YEAR</Text>
                  <Text style={s.yearTileValue}>{e.year}</Text>
                </View>
                <View style={s.timelineBody}>
                  <Text style={s.timelineTitle}>{e.title}</Text>
                  {e.summary ? <Text style={s.timelineSummary}>{e.summary}</Text> : null}
                </View>
              </StaggerIn>
            ))}
          </View>

          {/* Heritage sites */}
          {data.heritage.length > 0 && (
            <>
              <Text style={[s.h, { marginTop: 24 }]}>The places that hold the story</Text>
              <View style={{ gap: 10, marginTop: 4 }}>
                {data.heritage.map((o, i) => (
                  <StaggerIn key={o.id} index={i} style={s.placeCard}>
                    <Thumb seed={o.slug} src={o.crestUrl} label={initials(o.name)} style={s.placeThumb} labelStyle={s.placeThumbLabel} />
                    <View style={s.placeBody}>
                      <View style={s.kickerRow}>
                        <LandmarkIcon size={12} color={C.goldText} strokeWidth={1.9} />
                        <Text style={s.placeClass} numberOfLines={1}>{o.classification || "Heritage place"}</Text>
                      </View>
                      <Text style={s.placeName} numberOfLines={2}>{o.name}</Text>
                      {o.summary ? <Text style={s.placeSummary} numberOfLines={2}>{o.summary}</Text> : null}
                    </View>
                  </StaggerIn>
                ))}
              </View>
            </>
          )}

          {/* People */}
          {data.people.length > 0 && (
            <>
              <Text style={[s.h, { marginTop: 24 }]}>The people who carry the story</Text>
              <View style={{ gap: 8, marginTop: 4 }}>
                {data.people.map((p, i) => (
                  <StaggerIn key={p.id} index={i}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${p.title}. ${[p.details.era, p.details.whyNotable].filter(Boolean).join(". ")}`}
                      accessibilityHint="Opens person profile"
                      onPress={() => push(route.person(p.slug))}
                      style={({ pressed }) => [s.linkRow, pressed && s.cardPressed]}
                    >
                      <Thumb seed={p.slug} src={p.coverImageUrl} label={initials(p.title)} style={s.personThumb} labelStyle={s.personThumbLabel} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={s.kickerRow}>
                          <UserIcon size={12} color={C.goldText} strokeWidth={1.9} />
                          <Text style={s.personKicker} numberOfLines={1}>{p.details.era || "Oguaa legacy"}</Text>
                        </View>
                        <Text style={s.linkTitle} numberOfLines={2}>{p.title}</Text>
                        {p.details.whyNotable ? <Text style={s.linkSub} numberOfLines={2}>{p.details.whyNotable}</Text> : null}
                      </View>
                      <View style={s.cardArrow}><ArrowRightIcon size={15} color={C.greenText} strokeWidth={2.3} /></View>
                    </Pressable>
                  </StaggerIn>
                ))}
              </View>
            </>
          )}

          {/* Memories */}
          {data.memories.length > 0 && (
            <>
              <Text style={[s.h, { marginTop: 24 }]}>Memories of the town</Text>
              <View style={{ gap: 8, marginTop: 4 }}>
                {data.memories.map((m, i) => (
                  <StaggerIn key={m.id} index={i} style={s.placeCard}>
                    <Thumb seed={m.slug} src={m.coverImageUrl} label={initials(m.title)} style={s.placeThumb} labelStyle={s.placeThumbLabel} />
                    <View style={s.placeBody}>
                      <View style={s.kickerRow}>
                        <FileTextIcon size={12} color={C.clayText} strokeWidth={1.9} />
                        <Text style={[s.placeClass, { color: C.clayText }]}>MEMORY WALL</Text>
                      </View>
                      <Text style={s.placeName} numberOfLines={2}>{m.title}</Text>
                      {m.details.text ? <Text style={s.placeSummary} numberOfLines={2}>{m.details.text}</Text> : null}
                    </View>
                  </StaggerIn>
                ))}
              </View>
            </>
          )}
        </View>
      </Animated.ScrollView>
    </>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  body: { padding: 20 },
  h: { ...D(700), fontSize: 20, color: C.ink, marginBottom: 6 },
  p: { ...S(400), fontSize: 16, lineHeight: 25, color: C.ink },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  itemLabel: { ...S(700), fontSize: 14, minWidth: 78 },
  itemText: { color: C.ink, fontSize: 14, flex: 1, lineHeight: 20 },
  colorDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: C.sand },
  timelineCard: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 10, minHeight: 86 },
  yearTile: { width: 70, minHeight: 64, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, paddingHorizontal: 5 },
  yearTileLabel: { ...S(700), color: C.goldText, fontSize: 8, letterSpacing: 1.3 },
  yearTileValue: { ...S(700), color: C.greenText, fontSize: 15, marginTop: 2, textAlign: "center" },
  timelineBody: { flex: 1, minWidth: 0, paddingVertical: 2 },
  timelineTitle: { ...S(700), color: C.ink, fontSize: 15, lineHeight: 19 },
  timelineSummary: { color: C.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  linkCard: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 24, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 11 },
  linkIcon: { width: 48, height: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand },
  linkBody: { flex: 1, minWidth: 0 },
  linkKicker: { color: C.goldText, fontSize: 9, letterSpacing: 1.2, ...S(700) },
  linkText: { color: C.ink, ...S(700), fontSize: 14, lineHeight: 18, marginTop: 2 },
  placeCard: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 10, minHeight: 92 },
  placeThumb: { width: 70, height: 70, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
  placeThumbLabel: { color: C.cream, ...S(700), fontSize: 18 },
  placeBody: { flex: 1, minWidth: 0, paddingVertical: 2 },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  placeName: { ...S(700), fontSize: 16, lineHeight: 20, color: C.ink, marginTop: 2 },
  placeClass: { flexShrink: 1, color: C.goldText, fontSize: 9, ...S(700), letterSpacing: 1, textTransform: "uppercase" },
  placeSummary: { color: C.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 10, minHeight: 92 },
  personThumb: { width: 70, height: 70, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  personThumbLabel: { color: C.cream, ...S(700), fontSize: 18 },
  personKicker: { flexShrink: 1, color: C.goldText, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", ...S(700) },
  linkTitle: { ...S(700), fontSize: 16, lineHeight: 20, color: C.ink, marginTop: 2 },
  linkSub: { color: C.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  cardArrow: { width: 29, height: 29, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
