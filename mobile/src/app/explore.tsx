import { useMemo, useState } from "react";
import { push } from "@/lib/router";
import { Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { MapArea, MapData, MapLayer, MapPoint, MapTrail } from "@/lib/types";
import { severityColors } from "@/lib/incidents";
import { ON_GREEN, S, withAlpha, type Palette, D } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, PhotoHero, Pill } from "@/ui";
import { EmptyState } from "@/components/empty-state";

// Explore is the mobile stand-in for the web map: the same /api/map feed, but
// presented as filterable, grouped lists so it works without a native map
// module. Every pin, trail stop and directive centre carries a WALKING
// "Directions" button that hands off to the phone's maps app via Linking.

/**
 * Open turn-by-turn WALKING directions in the device's maps app. On iOS we
 * prefer the native Apple Maps deep link (dirflg=w) and fall back to the Google
 * Maps universal link; everywhere else the Google link opens Google Maps (app
 * or browser). No native map dependency involved.
 */
function openWalkingDirections(lat: number, lng: number) {
  const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
  if (Platform.OS === "ios") {
    const apple = `maps://?daddr=${lat},${lng}&dirflg=w`;
    Linking.canOpenURL(apple)
      .then((ok) => Linking.openURL(ok ? apple : google))
      .catch(() => { void Linking.openURL(google).catch(() => {}); });
    return;
  }
  void Linking.openURL(google).catch(() => {});
}

/**
 * The API emits web-app routes. The mobile app's org detail lives at
 * /institutions/:slug (there is no /education route here), so rewrite that one
 * prefix; business/events/safety/lost-found routes already match. A missing
 * href means the entity has no detail page (POI-only services, transport).
 */
function mobileRoute(href?: string): string | null {
  if (!href) return null;
  if (href.startsWith("/education/")) return href.replace("/education/", "/institutions/");
  return href;
}

const LAYER_META: { layer: MapLayer; label: string; glyph: string }[] = [
  { layer: "business", label: "Businesses", glyph: "🛍️" },
  { layer: "events", label: "Events", glyph: "🎪" },
  { layer: "institutions", label: "Schools & Institutions", glyph: "🎓" },
  { layer: "landmarks", label: "Heritage & Landmarks", glyph: "🏛️" },
  { layer: "safety", label: "Safety", glyph: "⚠️" },
  { layer: "lostfound", label: "Lost & Found", glyph: "🔎" },
  { layer: "services", label: "Services", glyph: "🚑" },
  { layer: "transport", label: "Transport", glyph: "🚌" },
];
const LAYER_GLYPH: Record<MapLayer, string> = Object.fromEntries(
  LAYER_META.map((m) => [m.layer, m.glyph]),
) as Record<MapLayer, string>;

function accentFor(layer: MapLayer, C: Palette): string {
  switch (layer) {
    case "business": return C.goldBrand;
    case "events": return C.teal;
    case "institutions": return C.green;
    case "landmarks": return C.goldText;
    case "safety": return C.maroonText;
    case "lostfound": return C.clayText;
    case "services": return C.tealText;
    case "transport": return C.greenSlate;
  }
}

// Category strings arrive in mixed shapes ("Market & Fishing", "found_item",
// "emergency-service"). Leave already-human labels alone; title-case the slugs.
function prettyCategory(c: string): string {
  if (c.includes(" ") || /[A-Z]/.test(c)) return c;
  return c.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatRadius(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function fmtDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

function DirectionsButton({ lat, lng, to, small = false }: Readonly<{ lat: number; lng: number; to: string; small?: boolean }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable
      onPress={() => openWalkingDirections(lat, lng)}
      style={({ pressed }) => [s.dirBtn, small && s.dirBtnSmall, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityLabel={`Walking directions to ${to}`}
    >
      <Text style={[s.dirBtnText, small && s.dirBtnTextSmall]}>🚶 Directions ↗</Text>
    </Pressable>
  );
}

function PointCard({ p }: Readonly<{ p: MapPoint }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const route = mobileRoute(p.href);
  const accent = accentFor(p.layer, C);
  const sev = p.severity ? severityColors(C)[p.severity] : undefined;

  const head = (
    <View style={s.pointHead}>
      <View style={[s.pointGlyph, { borderColor: withAlpha(accent, 0.4) }]}>
        <Text style={s.pointGlyphText}>{LAYER_GLYPH[p.layer]}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.pointTitle}>{p.title}</Text>
        {p.subtitle ? <Text style={s.pointSub} numberOfLines={2}>{p.subtitle}</Text> : null}
        {(p.category || p.quarter || p.severity) ? (
          <View style={s.chipRow}>
            {p.severity ? <Pill label={p.severity} color={sev} border={sev} /> : null}
            {p.category ? <Pill label={prettyCategory(p.category)} /> : null}
            {p.quarter ? <Pill label={p.quarter} /> : null}
          </View>
        ) : null}
      </View>
      {route ? <Text style={s.chevron}>›</Text> : null}
    </View>
  );

  return (
    <View style={s.card}>
      {route ? (
        <Pressable accessibilityRole="button" onPress={() => push(route)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          {head}
        </Pressable>
      ) : head}
      <DirectionsButton lat={p.lat} lng={p.lng} to={p.title} />
    </View>
  );
}

function AreaCard({ a }: Readonly<{ a: MapArea }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const sev = severityColors(C)[a.severity];
  return (
    <View style={[s.card, { borderColor: withAlpha(sev, 0.5) }]}>
      <View style={[s.chipRow, { marginTop: 0 }]}>
        <Pill label={a.severity} color={sev} border={sev} />
        <Pill label="Directive" />
      </View>
      <Text style={[s.pointTitle, { marginTop: 8 }]}>{a.title}</Text>
      <Text style={s.pointSub}>
        Affected radius ≈ {formatRadius(a.radiusM)}
        {a.until ? ` · in effect until ${fmtDateTime(a.until)}` : ""}
      </Text>
      <DirectionsButton lat={a.lat} lng={a.lng} to={a.title} />
    </View>
  );
}

function TrailCard({ t }: Readonly<{ t: MapTrail }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const accent = t.color ?? C.goldBrand;
  return (
    <View style={s.card}>
      <View style={[s.chipRow, { marginTop: 0 }]}>
        <Pill label={t.kind === "festival" ? "Festival route" : "Heritage walk"} color={accent} border={accent} />
        <Pill label={`${t.stops.length} stops`} />
      </View>
      <Text style={[s.pointTitle, { marginTop: 8 }]}>{t.title}</Text>
      {t.description ? <Text style={s.pointSub}>{t.description}</Text> : null}
      <View style={{ marginTop: 14, gap: 14 }}>
        {t.stops.map((stop) => (
          <View key={`${t.id}-${stop.n}`} style={s.stopRow}>
            <View style={[s.stopNum, { backgroundColor: accent }]}>
              <Text style={s.stopNumText}>{stop.n}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.stopTitle}>{stop.title}</Text>
              {stop.story ? <Text style={s.stopStory}>{stop.story}</Text> : null}
              <DirectionsButton lat={stop.lat} lng={stop.lng} to={stop.title} small />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Explore() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [layer, setLayer] = useState<MapLayer | null>(null);
  const { data, error, loading, refreshing, reload } = useApi<MapData>(() => api.mapData(), "map");

  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const presentLayers = LAYER_META.filter((m) => data.points.some((p) => p.layer === m.layer));
  const shownLayers = layer ? presentLayers.filter((m) => m.layer === layer) : presentLayers;
  // Directives + trails are their own cross-cutting sections — surface them in
  // the "All" view; a specific-layer filter narrows to just that layer's pins.
  const showExtras = layer === null;
  const empty = data.points.length === 0 && data.trails.length === 0 && data.areas.length === 0;

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.greenText} />}
    >
      <PhotoHero
        kicker="The map · Cape Coast"
        title="Explore Oguaa"
        lede="Everything on the coast that sits on the map — businesses, events, schools, heritage, safety notices, and the walking trails between them. Tap Directions on any pin to set off on foot."
        count={`${data.points.length} places · ${data.trails.length} trails · ${data.areas.length} active ${data.areas.length === 1 ? "directive" : "directives"}`}
      />

      <View style={{ padding: 16, gap: 18 }}>
        {presentLayers.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
            <Pressable accessibilityRole="button" onPress={() => setLayer(null)} style={[s.filter, layer === null && s.filterOn]}>
              <Text style={[s.filterText, layer === null && s.filterTextOn]}>All</Text>
            </Pressable>
            {presentLayers.map((m) => (
              <Pressable accessibilityRole="button"
                key={m.layer}
                onPress={() => setLayer(layer === m.layer ? null : m.layer)}
                style={[s.filter, layer === m.layer && s.filterOn]}
              >
                <Text style={[s.filterText, layer === m.layer && s.filterTextOn]}>{m.glyph} {m.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {showExtras && data.areas.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={s.section}>⚠  ACTIVE DIRECTIVES</Text>
            {data.areas.map((a) => <AreaCard key={a.id} a={a} />)}
          </View>
        ) : null}

        {shownLayers.map((m) => {
          const pts = data.points.filter((p) => p.layer === m.layer);
          if (pts.length === 0) return null;
          return (
            <View key={m.layer} style={{ gap: 10 }}>
              <Text style={s.section}>{m.glyph}  {m.label.toUpperCase()} · {pts.length}</Text>
              {pts.map((p) => <PointCard key={p.id} p={p} />)}
            </View>
          );
        })}

        {showExtras && data.trails.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={s.section}>🚶  WALKING TRAILS</Text>
            {data.trails.map((t) => <TrailCard key={t.id} t={t} />)}
          </View>
        ) : null}

        {empty ? (
          <EmptyState glyph="🗺" title="Nothing on the map yet" body="No listings carry coordinates yet. Pull to refresh, or check back soon." />
        ) : null}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  filters: { flexDirection: "row", gap: 8, paddingRight: 8 },
  filter: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  filterOn: { borderColor: C.green, backgroundColor: C.green },
  filterText: { color: C.inkMuted, fontSize: 13, ...S(600) },
  filterTextOn: { color: ON_GREEN },
  section: { color: C.inkFaint, fontSize: 11, letterSpacing: 1.5, ...D(700) },
  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 14 },
  pointHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  pointGlyph: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
  pointGlyphText: { fontSize: 19 },
  pointTitle: { ...S(700), fontSize: 16, color: C.ink },
  pointSub: { color: C.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8 },
  chevron: { color: C.inkFaint, fontSize: 22, ...S(700), marginLeft: 4 },
  dirBtn: { alignSelf: "flex-start", marginTop: 12, backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  dirBtnText: { color: ON_GREEN, ...S(700), fontSize: 13 },
  dirBtnSmall: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.paper, borderWidth: 1, borderColor: C.green },
  dirBtnTextSmall: { color: C.greenText, fontSize: 12 },
  stopRow: { flexDirection: "row", gap: 12 },
  stopNum: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 2 },
  stopNumText: { color: ON_GREEN, ...S(700), fontSize: 13 },
  stopTitle: { ...S(700), fontSize: 15, color: C.ink },
  stopStory: { color: C.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 3 },
});
