import { route, ROUTES } from "@/lib/routes";
import type { Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { push } from "@/lib/router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import type { SearchHit } from "@/lib/types";
import { D, S, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Thumb } from "@/ui";
import { StaggerIn } from "@/components/anim";
import { ArrowRightIcon } from "@/components/icons";

// Map a hit to its canonical mobile route (parity with the web's hrefFor).
// Per-listing base paths; browse pages have no slug of their own.
const LISTING_ROUTE: Record<string, { base: string; withSlug: boolean }> = {
  artist: { base: "/music/", withSlug: true },
  memorial: { base: "/memoriam/", withSlug: true },
  person: { base: "/people/", withSlug: true },
  business: { base: "/business/", withSlug: true },
  property: { base: "/rent-stay/", withSlug: true },
  project: { base: "/projects/", withSlug: true },
  event: { base: ROUTES.browseEvents, withSlug: false },
  memory: { base: ROUTES.browseMemories, withSlug: false },
  opportunity: { base: ROUTES.browseOpportunities, withSlug: false },
};
function routeFor(h: SearchHit): Href | null {
  if (h.kind === "member") return route.member(h.slug);
  if (h.kind === "institution") return route.institution(h.slug);
  if (h.kind !== "listing" || !h.type) return null;
  const r = LISTING_ROUTE[h.type];
  if (!r) return null;
  return (r.withSlug ? `${r.base}${h.slug}` : r.base) as Href;
}

const KIND_LABEL: Record<string, string> = {
  member: "Person", institution: "Institution", artist: "Artist", business: "Business",
  property: "Rent & Stay",
  memorial: "In memoriam", person: "Son / daughter", event: "Event", memory: "Memory", opportunity: "Opportunity",
};
const kindTone = (C: Palette): Record<string, string> => ({
  member: C.green, institution: C.maroon, artist: C.clay, business: C.teal,
  property: C.goldText,
  memorial: C.goldBrand, person: C.green, event: C.goldText, memory: C.clay, opportunity: C.teal,
});
function label(h: SearchHit): string {
  return KIND_LABEL[h.kind === "listing" ? (h.type ?? "") : h.kind] ?? "Result";
}
function tone(h: SearchHit, C: Palette): string {
  return kindTone(C)[h.kind === "listing" ? (h.type ?? "") : h.kind] ?? C.inkFaint;
}
// Readable-on-dark variant for tag TEXT: green/maroon flip to near-black in dark
// mode, so use their *Text tokens (a no-op in light mode where they're equal).
// The tag border keeps `tone` (borders aren't a contrast problem).
function toneText(h: SearchHit, C: Palette): string {
  const t = tone(h, C);
  if (t === C.green) return C.greenText;
  if (t === C.maroon) return C.maroonText;
  return t;
}

export default function Search() {
  const { C } = useTheme();
  const s = useStyles();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale results when the query is too short
    if (term.length < 2) { setHits(null); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api.search(term)
        .then((r) => { if (alive) setHits(r); })
        .catch(() => { if (alive) setHits([]); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={s.pageTitle}>Search</Text>
      <Text style={s.pageLede}>People, businesses, homes, memorials, events and more — the whole town in one box.</Text>
      <View style={s.inputWrap}>
        <Text style={s.inputIcon} aria-hidden>⌕</Text>
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="Search people, homes, businesses…"
          placeholderTextColor={C.inkFaint}
          autoCapitalize="none"
          style={s.input}
        />
      </View>

      <Results q={q} hits={hits} loading={loading} />
    </ScrollView>
  );
}

function Results({ q, hits, loading }: Readonly<{ q: string; hits: SearchHit[] | null; loading: boolean }>) {
  const s = useStyles();
  if (q.trim().length < 2) return <Text style={s.hint}>Type at least two letters to search.</Text>;
  if (loading && !hits) return <Text style={s.hint}>Searching…</Text>;
  if ((hits?.length ?? 0) === 0) return <Text style={s.hint}>No matches for “{q.trim()}”.</Text>;
  return (
    <View style={{ marginTop: 14, gap: 10 }}>
      {(hits ?? []).map((h, i) => <StaggerIn key={`${h.kind}-${h.slug}`} index={i}><HitRow hit={h} /></StaggerIn>)}
    </View>
  );
}

function HitRow({ hit: h }: Readonly<{ hit: SearchHit }>) {
  const { C } = useTheme();
  const s = useStyles();
  const href = routeFor(h);
  const inner = (
    <View style={[s.row, { borderLeftColor: tone(h, C) }]}>
      <Thumb seed={h.slug} src={h.imageUrl} label={initials(h.title)} style={s.rowThumb} labelStyle={s.rowThumbInit} />
      <View style={s.rowBody}>
        <Text style={[s.rowKicker, { color: toneText(h, C) }]}>{label(h)}</Text>
        <Text style={s.rowTitle} numberOfLines={1}>{h.title}</Text>
        {h.subtitle ? <Text style={s.rowSub} numberOfLines={1}>{h.subtitle}</Text> : null}
      </View>
      {href ? <View style={s.rowArrow}><ArrowRightIcon size={15} color={C.inkFaint} strokeWidth={2.3} /></View> : null}
    </View>
  );
  if (!href) return <View>{inner}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label(h)}: ${h.title}`} onPress={() => push(href)} style={({ pressed }) => pressed && s.rowPressed}>
      {inner}
    </Pressable>
  );
}

function useStyles() {
  const { C } = useTheme();
  return useMemo(() => makeStyles(C), [C]);
}

const makeStyles = (C: Palette) => StyleSheet.create({
  pageTitle: { ...D(700), fontSize: 26, color: C.ink },
  pageLede: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 14 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 16 },
  inputIcon: { color: C.goldText, fontSize: 18, ...S(700) },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: C.ink },
  hint: { color: C.inkFaint, textAlign: "center", marginTop: 28, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderLeftWidth: 3, borderRadius: 16, padding: 10 },
  rowPressed: { opacity: 0.72 },
  rowThumb: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rowThumbInit: { color: C.cream, ...S(700), fontSize: 16 },
  rowBody: { flex: 1, minWidth: 0 },
  rowKicker: { fontSize: 8.5, ...S(700), textTransform: "uppercase", letterSpacing: 1.1 },
  rowTitle: { ...S(700), fontSize: 15.5, color: C.ink, marginTop: 1 },
  rowSub: { color: C.inkMuted, fontSize: 12.5, marginTop: 1 },
  rowArrow: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
});
