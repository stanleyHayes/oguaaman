import { useMemo, useState, type FC } from "react";
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
import { StaggerIn } from "@/components/anim";
import { TownMap } from "@/components/map-view";
import { AlertTriangleIcon, ArrowUpRightIcon, BuildingIcon, BusIcon, CalendarIcon, ChevronRightIcon, GradCapIcon, HeartIcon, LandmarkIcon, MapIcon, SearchIcon, ShoppingBagIcon, WalkingIcon, type IconProps } from "@/components/icons";

// Explore uses the same /api/map feed as the portal. A lightweight Leaflet view
// now restores the category pins on mobile; the grouped cards remain directly
// below as an accessible, low-bandwidth fallback with walking directions.

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

const LAYER_META: { layer: MapLayer; label: string; icon: FC<IconProps> }[] = [
  { layer: "business", label: "Businesses", icon: ShoppingBagIcon },
  { layer: "property", label: "Rent & Stay", icon: BuildingIcon },
  { layer: "events", label: "Events", icon: CalendarIcon },
  { layer: "institutions", label: "Schools & Institutions", icon: GradCapIcon },
  { layer: "landmarks", label: "Heritage & Landmarks", icon: LandmarkIcon },
  { layer: "safety", label: "Safety", icon: AlertTriangleIcon },
  { layer: "lostfound", label: "Lost & Found", icon: SearchIcon },
  { layer: "services", label: "Services", icon: HeartIcon },
  { layer: "transport", label: "Transport", icon: BusIcon },
];
const LAYER_ICON: Record<MapLayer, FC<IconProps>> = Object.fromEntries(
  LAYER_META.map((m) => [m.layer, m.icon]),
) as Record<MapLayer, React.FC<IconProps>>;

function accentFor(layer: MapLayer, C: Palette): string {
  switch (layer) {
    case "business": return C.goldBrand;
    case "property": return C.tealText;
    case "events": return C.teal;
    case "institutions": return C.green;
    case "landmarks": return C.goldText;
    case "safety": return C.maroonText;
    case "lostfound": return C.clayText;
    case "services": return C.tealText;
    case "transport": return C.greenSlate;
  }
}

function layerLabel(layer: MapLayer): string {
  return LAYER_META.find((item) => item.layer === layer)?.label ?? layer;
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <WalkingIcon size={small ? 12 : 14} color={small ? C.greenText : ON_GREEN} strokeWidth={2} />
        <Text style={[s.dirBtnText, small && s.dirBtnTextSmall]}>Directions</Text>
        <ArrowUpRightIcon size={small ? 11 : 12} color={small ? C.greenText : ON_GREEN} strokeWidth={2.5} />
      </View>
    </Pressable>
  );
}

function PointCard({ p }: Readonly<{ p: MapPoint }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const route = mobileRoute(p.href);
  const accent = accentFor(p.layer, C);
  const sev = p.severity ? severityColors(C)[p.severity] : undefined;

  const Icon = LAYER_ICON[p.layer];
  const head = (
    <View style={s.pointHead}>
      <View style={[s.pointGlyph, { borderColor: withAlpha(accent, 0.42), backgroundColor: withAlpha(accent, 0.08) }]}>
        <Icon size={18} color={accent} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.pointKicker, { color: accent }]}>{layerLabel(p.layer).toUpperCase()}</Text>
        <Text style={s.pointTitle} numberOfLines={2}>{p.title}</Text>
        {p.subtitle ? <Text style={s.pointSub} numberOfLines={2}>{p.subtitle}</Text> : null}
        {(p.category || p.quarter || p.severity) ? (
          <View style={s.chipRow}>
            {p.severity ? <Pill label={p.severity} color={sev} border={sev} /> : null}
            {p.category ? <Pill label={prettyCategory(p.category)} /> : null}
            {p.quarter ? <Pill label={p.quarter} /> : null}
          </View>
        ) : null}
      </View>
      {route ? <View style={s.cardChevron}><ChevronRightIcon size={15} color={C.greenText} strokeWidth={2.3} /></View> : null}
    </View>
  );

  return (
    <View style={s.card}>
      <View style={[s.cardAccent, { backgroundColor: accent }]} />
      {route ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${p.title}`} onPress={() => push(route)} style={({ pressed }) => pressed && s.cardPressed}>
          {head}
        </Pressable>
      ) : head}
      <View style={s.pointActions}>
        <Text style={s.coordinates}>{p.lat.toFixed(4)} · {p.lng.toFixed(4)}</Text>
        <DirectionsButton lat={p.lat} lng={p.lng} to={p.title} small />
      </View>
    </View>
  );
}

function AreaCard({ a }: Readonly<{ a: MapArea }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const sev = severityColors(C)[a.severity];
  return (
    <View style={[s.card, { borderColor: withAlpha(sev, 0.5) }]}>
      <View style={[s.cardAccent, { backgroundColor: sev }]} />
      <Text style={[s.pointKicker, { color: sev }]}>ACTIVE DIRECTIVE</Text>
      <View style={[s.chipRow, { marginTop: 5 }]}>
        <Pill label={a.severity} color={sev} border={sev} />
        <Pill label="Directive" />
      </View>
      <Text style={[s.pointTitle, { marginTop: 7 }]}>{a.title}</Text>
      <Text style={s.pointSub}>
        Affected radius ≈ {formatRadius(a.radiusM)}
        {a.until ? ` · in effect until ${fmtDateTime(a.until)}` : ""}
      </Text>
      <View style={s.pointActions}>
        <Text style={s.coordinates}>Safety notice</Text>
        <DirectionsButton lat={a.lat} lng={a.lng} to={a.title} small />
      </View>
    </View>
  );
}

function TrailCard({ t }: Readonly<{ t: MapTrail }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const accent = t.color ?? C.goldBrand;
  return (
    <View style={s.card}>
      <View style={[s.cardAccent, { backgroundColor: accent }]} />
      <Text style={[s.pointKicker, { color: accent }]}>EXPLORE ON FOOT</Text>
      <View style={[s.chipRow, { marginTop: 5 }]}>
        <Pill label={t.kind === "festival" ? "Festival route" : "Heritage walk"} color={accent} border={accent} />
        <Pill label={`${t.stops.length} stops`} />
      </View>
      <Text style={[s.pointTitle, { marginTop: 8 }]}>{t.title}</Text>
      {t.description ? <Text style={s.pointSub}>{t.description}</Text> : null}
      <View style={s.stopsList}>
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, error, loading, refreshing, reload } = useApi<MapData>(() => api.mapData(), "map");

  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const presentLayers = LAYER_META.filter((m) => data.points.some((p) => p.layer === m.layer));
  const shownLayers = layer ? presentLayers.filter((m) => m.layer === layer) : presentLayers;
  const visiblePoints = layer ? data.points.filter((point) => point.layer === layer) : data.points;
  const selectedPoint = visiblePoints.find((point) => point.id === selectedId) ?? null;
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
        lede="Businesses, schools, heritage, safety notices and walking trails — now with the town’s category pins back on the map."
        count={`${data.points.length} places · ${data.trails.length} trails · ${data.areas.length} active ${data.areas.length === 1 ? "directive" : "directives"}`}
      />

      <View style={{ padding: 16, gap: 18 }}>
        {presentLayers.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: layer === null }} onPress={() => setLayer(null)} style={[s.filter, layer === null && s.filterOn]}>
              <Text style={[s.filterText, layer === null && s.filterTextOn]}>All</Text>
            </Pressable>
            {presentLayers.map((m) => {
              const Icon = m.icon;
              return (
                <Pressable accessibilityRole="button"
                  key={m.layer}
                  accessibilityState={{ selected: layer === m.layer }}
                  onPress={() => setLayer(layer === m.layer ? null : m.layer)}
                  style={[s.filter, layer === m.layer && s.filterOn]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon size={14} color={layer === m.layer ? ON_GREEN : C.inkMuted} strokeWidth={2} />
                    <Text style={[s.filterText, layer === m.layer && s.filterTextOn]}>{m.label}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {visiblePoints.length > 0 ? (
          <View style={s.mapShell}>
            <View style={s.mapHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.mapKicker}>{layer ? "FILTERED MAP" : "THE TOWN AT A GLANCE"}</Text>
                <Text style={s.mapTitle}>{visiblePoints.length} {visiblePoints.length === 1 ? "place" : "places"} on this view</Text>
              </View>
              <View style={s.liveBadge}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>LIVE</Text>
              </View>
            </View>
            <TownMap points={visiblePoints} onPointPress={setSelectedId} style={s.map} />
            <Text style={s.mapHint}>Tap a pin for its name. The full details and walking directions remain in the cards below.</Text>
            {selectedPoint ? (
              <View style={s.mapSelection}>
                <View style={[s.selectionMark, { backgroundColor: accentFor(selectedPoint.layer, C) }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.selectionKind}>{layerLabel(selectedPoint.layer).toUpperCase()}</Text>
                  <Text style={s.selectionTitle} numberOfLines={1}>{selectedPoint.title}</Text>
                </View>
                <DirectionsButton lat={selectedPoint.lat} lng={selectedPoint.lng} to={selectedPoint.title} small />
              </View>
            ) : null}
          </View>
        ) : null}

        {showExtras && data.areas.length > 0 ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AlertTriangleIcon size={14} color={C.maroonText} strokeWidth={2} />
              <Text style={s.section}>ACTIVE DIRECTIVES</Text>
            </View>
            {data.areas.map((a, i) => <StaggerIn key={a.id} index={i}><AreaCard a={a} /></StaggerIn>)}
          </View>
        ) : null}

        {shownLayers.map((m) => {
          const pts = data.points.filter((p) => p.layer === m.layer);
          if (pts.length === 0) return null;
          const Icon = LAYER_ICON[m.layer];
          return (
            <View key={m.layer} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon size={14} color={accentFor(m.layer, C)} strokeWidth={2} />
                <Text style={s.section}>{m.label.toUpperCase()} · {pts.length}</Text>
              </View>
              {pts.map((p, i) => <StaggerIn key={p.id} index={i}><PointCard p={p} /></StaggerIn>)}
            </View>
          );
        })}

        {showExtras && data.trails.length > 0 ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <WalkingIcon size={14} color={C.greenText} strokeWidth={2} />
              <Text style={s.section}>WALKING TRAILS</Text>
            </View>
            {data.trails.map((t, i) => <StaggerIn key={t.id} index={i}><TrailCard t={t} /></StaggerIn>)}
          </View>
        ) : null}

        {empty ? (
          <EmptyState icon={<MapIcon size={56} color={C.inkFaint} strokeWidth={1.5} />} title="Nothing on the map yet" body="No listings carry coordinates yet. Pull to refresh, or check back soon." />
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
  section: { color: C.inkFaint, fontSize: 10, letterSpacing: 1.5, ...S(700) },
  mapShell: { overflow: "hidden", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 18 },
  mapHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  mapKicker: { color: C.goldText, fontSize: 9, letterSpacing: 1.5, ...S(700) },
  mapTitle: { color: C.ink, fontSize: 17, marginTop: 2, ...D(600) },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.teal },
  liveText: { color: C.inkMuted, fontSize: 9, letterSpacing: 1, ...S(700) },
  map: { height: 300, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.sand },
  mapHint: { color: C.inkFaint, fontSize: 11.5, lineHeight: 16, paddingHorizontal: 16, paddingVertical: 11 },
  mapSelection: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: C.sand, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 10 },
  selectionMark: { width: 4, height: 32, borderRadius: 2 },
  selectionKind: { color: C.inkFaint, fontSize: 9, letterSpacing: 1.2, ...S(700) },
  selectionTitle: { color: C.ink, fontSize: 14, marginTop: 1, ...S(700) },
  card: { position: "relative", overflow: "hidden", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 15, paddingVertical: 12, paddingLeft: 16, paddingRight: 12 },
  cardAccent: { position: "absolute", top: 0, bottom: 0, left: 0, width: 3 },
  cardPressed: { opacity: 0.7 },
  pointHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  pointGlyph: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pointGlyphText: { fontSize: 19 },
  pointKicker: { ...S(700), fontSize: 8.5, letterSpacing: 1.2 },
  pointTitle: { ...S(700), fontSize: 15.5, lineHeight: 19, color: C.ink, marginTop: 2 },
  pointSub: { color: C.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center", marginTop: 6 },
  cardChevron: { width: 27, height: 27, borderRadius: 14, backgroundColor: withAlpha(C.green, 0.09), alignItems: "center", justifyContent: "center" },
  pointActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 9, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sand },
  coordinates: { ...S(600), color: C.inkFaint, fontSize: 9.5, letterSpacing: 0.3 },
  chevron: { color: C.inkFaint, fontSize: 22, ...S(700), marginLeft: 4 },
  dirBtn: { alignSelf: "flex-start", marginTop: 10, backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  dirBtnText: { color: ON_GREEN, ...S(700), fontSize: 13 },
  dirBtnSmall: { minHeight: 44, marginTop: 0, paddingHorizontal: 11, paddingVertical: 6, justifyContent: "center", backgroundColor: C.paper, borderWidth: 1, borderColor: C.green },
  dirBtnTextSmall: { color: C.greenText, fontSize: 11 },
  stopsList: { marginTop: 12, gap: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sand },
  stopRow: { flexDirection: "row", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.sand },
  stopNum: { width: 25, height: 25, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 1 },
  stopNumText: { color: ON_GREEN, ...S(700), fontSize: 13 },
  stopTitle: { ...S(700), fontSize: 15, color: C.ink },
  stopStory: { color: C.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 3 },
});
