import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import type { SearchHit } from "@/lib/types";
import { C, serif, initials } from "@/theme";
import { Thumb } from "@/ui";

// Map a hit to its canonical mobile route (parity with the web's hrefFor).
// Per-listing base paths; browse pages have no slug of their own.
const LISTING_ROUTE: Record<string, { base: string; withSlug: boolean }> = {
  artist: { base: "/music/", withSlug: true },
  memorial: { base: "/memoriam/", withSlug: true },
  person: { base: "/people/", withSlug: true },
  business: { base: "/business/", withSlug: true },
  project: { base: "/projects/", withSlug: true },
  event: { base: "/browse/events", withSlug: false },
  memory: { base: "/browse/memories", withSlug: false },
  opportunity: { base: "/browse/opportunities", withSlug: false },
};
function routeFor(h: SearchHit): string | null {
  if (h.kind === "member") return `/members/${h.slug}`;
  if (h.kind === "institution") return `/institutions/${h.slug}`;
  if (h.kind !== "listing" || !h.type) return null;
  const r = LISTING_ROUTE[h.type];
  if (!r) return null;
  return r.withSlug ? `${r.base}${h.slug}` : r.base;
}

const KIND_LABEL: Record<string, string> = {
  member: "Person", institution: "Institution", artist: "Artist", business: "Business",
  memorial: "In memoriam", person: "Son / daughter", event: "Event", memory: "Memory", opportunity: "Opportunity",
};
function label(h: SearchHit): string {
  return KIND_LABEL[h.kind === "listing" ? (h.type ?? "") : h.kind] ?? "Result";
}

export default function Search() {
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
      <TextInput
        autoFocus
        value={q}
        onChangeText={setQ}
        placeholder="Search people, businesses, memorials…"
        placeholderTextColor={C.inkFaint}
        autoCapitalize="none"
        style={s.input}
      />

      <Results q={q} hits={hits} loading={loading} />
    </ScrollView>
  );
}

function Results({ q, hits, loading }: Readonly<{ q: string; hits: SearchHit[] | null; loading: boolean }>) {
  if (q.trim().length < 2) return <Text style={s.hint}>Type at least two letters to search.</Text>;
  if (loading && !hits) return <Text style={s.hint}>Searching…</Text>;
  if ((hits?.length ?? 0) === 0) return <Text style={s.hint}>No matches for “{q.trim()}”.</Text>;
  return (
    <View style={{ marginTop: 14, gap: 10 }}>
      {(hits ?? []).map((h) => <HitRow key={`${h.kind}-${h.slug}`} hit={h} />)}
    </View>
  );
}

function HitRow({ hit: h }: Readonly<{ hit: SearchHit }>) {
  const route = routeFor(h);
  const inner = (
    <View style={s.row}>
      {h.imageUrl ? <Thumb seed={h.slug} src={h.imageUrl} label={initials(h.title)} style={s.rowThumb} labelStyle={s.rowThumbInit} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{h.title}</Text>
        {h.subtitle ? <Text style={s.rowSub} numberOfLines={1}>{h.subtitle}</Text> : null}
      </View>
      <Text style={s.tag}>{label(h)}</Text>
    </View>
  );
  if (!route) return <View>{inner}</View>;
  return <Pressable onPress={() => router.push(route as never)}>{inner}</Pressable>;
}

const s = StyleSheet.create({
  input: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, fontSize: 16, color: C.ink },
  hint: { color: C.inkFaint, textAlign: "center", marginTop: 28, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14 },
  rowThumb: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowThumbInit: { color: C.cream, fontFamily: serif, fontSize: 15, fontWeight: "700" },
  rowTitle: { fontFamily: serif, fontSize: 16, fontWeight: "700", color: C.ink },
  rowSub: { color: C.inkMuted, fontSize: 13, marginTop: 2 },
  tag: { color: C.inkFaint, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
});
