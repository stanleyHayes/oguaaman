import { useMemo } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Animated from "react-native-reanimated";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { HistoryView } from "@/lib/types";
import { D, S, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, PhotoHero } from "@/ui";
import { StaggerIn, useHeroParallax } from "@/components/anim";

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
            <Pressable onPress={() => router.push(t.link!.href as never)} style={s.linkCard}>
              <Text style={s.linkText}>{t.link.label}</Text>
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
              <StaggerIn key={e.id} index={i} style={s.itemRow}>
                <Text style={[s.itemLabel, { color: C.greenText }]}>{e.year}</Text>
                <Text style={s.itemText}><Text style={{ fontWeight: "700" }}>{e.title}</Text>{e.summary ? ` — ${e.summary}` : ""}</Text>
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
                    <Text style={s.placeName}>{o.name}</Text>
                    {o.classification ? <Text style={s.placeClass}>{o.classification}</Text> : null}
                    {o.summary ? <Text style={s.placeSummary}>{o.summary}</Text> : null}
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
                    <Pressable onPress={() => router.push(`/people/${p.slug}` as never)} style={s.linkRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.linkTitle}>{p.title}</Text>
                      <Text style={s.linkSub} numberOfLines={1}>{[p.details.era, p.details.whyNotable].filter(Boolean).join(" · ")}</Text>
                    </View>
                    <Text style={s.chevron}>›</Text>
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
                    <Text style={s.placeName}>{m.title}</Text>
                    {m.details.text ? <Text style={s.placeSummary}>{m.details.text}</Text> : null}
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
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  itemLabel: { ...S(700), fontSize: 14, minWidth: 78 },
  itemText: { color: C.ink, fontSize: 14, flex: 1, lineHeight: 20 },
  colorDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: C.sand },
  linkCard: { marginTop: 24, borderWidth: 1, borderColor: C.green, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  linkText: { color: C.greenText, fontWeight: "700", fontSize: 14 },
  placeCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 10, padding: 12 },
  placeName: { ...S(700), fontSize: 16, color: C.ink },
  placeClass: { color: C.goldText, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 2, textTransform: "uppercase" },
  placeSummary: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  linkTitle: { ...S(700), fontSize: 15, color: C.ink },
  linkSub: { color: C.inkFaint, fontSize: 12, marginTop: 1 },
  chevron: { color: C.inkFaint, fontSize: 22, fontWeight: "700" },
});
