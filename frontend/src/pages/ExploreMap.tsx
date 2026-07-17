// Explore Cape Coast — a full-screen Leaflet map of every geo-tagged entity on
// the platform (GET /api/map). Layers toggle on/off, markers open a slide-up
// detail panel with a "View details" link and a walking-directions flow
// (browser geolocation → OSRM route → polyline, with a Google Maps deep-link
// fallback). Modes reframe the same data: Heritage/Festival trails, a Safety
// view, and "Rep your quarter" colouring. The last payload is cached in
// localStorage so the map still renders offline.
import { useEffect, useMemo, useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import { usePageTitle } from "@/lib/use-page-title";
import { countdown, SEVERITY_LABEL } from "@/lib/directives";
import type { MapData, MapPoint, MapLayer, MapTrail, IncidentSeverity, DirectiveSeverity } from "@/lib/types";

// Vite tree-shakes Leaflet's default icon assets; re-wire them (same fix as
// components/location-map.tsx) so any default marker still resolves.
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

const CAPE_COAST: [number, number] = [5.1053, -1.2466];
const MAP_CACHE_KEY = "oguaa.map.cache.v1";

// OSRM-compatible routing base; override with VITE_ROUTING_URL to drop in a
// paid provider/token later. Public demo server: router.project-osrm.org.
const ROUTING_BASE =
  ((import.meta.env.VITE_ROUTING_URL as string | undefined) ?? "https://router.project-osrm.org").replace(/\/+$/, "");

type Mode = "explore" | "heritage" | "festival" | "safety" | "quarter";

const MODES: { id: Mode; label: string }[] = [
  { id: "explore", label: "Explore" },
  { id: "heritage", label: "Heritage trail" },
  { id: "festival", label: "Festival" },
  { id: "safety", label: "Safety" },
  { id: "quarter", label: "Rep your quarter" },
];

const LAYERS: { id: MapLayer; label: string; color: string; glyph: string }[] = [
  { id: "business", label: "Businesses", color: "#C9822E", glyph: "🏪" },
  { id: "events", label: "Events", color: "#0E7C6B", glyph: "🎉" },
  { id: "landmarks", label: "Heritage", color: "#8A5AA8", glyph: "🏛️" },
  { id: "institutions", label: "Schools", color: "#2F855A", glyph: "🎓" },
  { id: "safety", label: "Safety", color: "#B0503C", glyph: "⚠️" },
  { id: "lostfound", label: "Lost & Found", color: "#3E7CB1", glyph: "🔑" },
  { id: "services", label: "Services", color: "#4C40A8", glyph: "🚑" },
  { id: "transport", label: "Transport", color: "#64748B", glyph: "🚌" },
];
const LAYER_BY_ID = Object.fromEntries(LAYERS.map((l) => [l.id, l])) as Record<MapLayer, (typeof LAYERS)[number]>;

// Default subset (explore) and per-mode presets. Switching mode presets the
// visible layers; the user can still toggle chips afterwards.
const DEFAULT_LAYERS: MapLayer[] = ["business", "events", "landmarks", "institutions", "safety"];
const MODE_LAYERS: Record<Mode, MapLayer[]> = {
  explore: DEFAULT_LAYERS,
  heritage: ["landmarks"],
  festival: ["events"],
  safety: ["safety"],
  quarter: ["business"],
};

// critical=maroon, high=clay, medium=gold, low=teal (matches lib/incidents).
const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  critical: "#7C2D2D",
  high: "#B0503C",
  medium: "#C7A24A",
  low: "#0E7C6B",
};
const AREA_COLOR: Record<DirectiveSeverity, string> = SEVERITY_COLOR;

const QUARTER_PALETTE = ["#C9822E", "#0E7C6B", "#8A5AA8", "#2F855A", "#B0503C", "#3E7CB1", "#4C40A8", "#B8862F", "#7C2D2D", "#0B6557"];

// ── helpers ────────────────────────────────────────────────────────────────

function quarterColor(q: string): string {
  let h = 0;
  for (let i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) >>> 0;
  return QUARTER_PALETTE[h % QUARTER_PALETTE.length];
}

function pointColor(p: MapPoint, mode: Mode): string {
  if (mode === "quarter" && p.quarter) return quarterColor(p.quarter);
  if (p.kind === "incident" && p.severity) return SEVERITY_COLOR[p.severity];
  return LAYER_BY_ID[p.layer]?.color ?? "#64748B";
}
function pointGlyph(p: MapPoint): string {
  return LAYER_BY_ID[p.layer]?.glyph ?? "📍";
}

function pinIcon(color: string, glyph: string, selected: boolean): L.DivIcon {
  const size = selected ? 38 : 30;
  const anchor = selected ? 36 : 28;
  const shadow = selected
    ? "box-shadow:0 0 0 4px rgba(255,255,255,.6),0 4px 10px rgba(0,0,0,.4);"
    : "box-shadow:0 2px 6px rgba(0,0,0,.4);";
  return L.divIcon({
    className: "oguaa-map-pin",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(45deg);background:${color};border:2px solid #fff;${shadow}display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(-45deg);font-size:${selected ? 18 : 14}px;line-height:1;">${glyph}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, anchor],
    popupAnchor: [0, -anchor + 4],
  });
}

function stopIcon(color: string, n: number): L.DivIcon {
  return L.divIcon({
    className: "oguaa-map-stop",
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -12],
  });
}

function userIcon(): L.DivIcon {
  return L.divIcon({
    className: "oguaa-map-user",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.28),0 1px 4px rgba(0,0,0,.4);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
function fmtDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

interface RouteResult {
  coords: [number, number][];
  distanceM: number;
  durationS: number; // walking estimate
  straight: boolean;
  to: string; // target point id
}

interface OsrmResponse {
  routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[];
}

// Try the walking profile first; if it 400s (some OSRM demo builds lack foot),
// fall back to driving but re-estimate a walking ETA from the distance.
async function fetchRoute(from: [number, number], to: [number, number]): Promise<Omit<RouteResult, "to"> | null> {
  for (const profile of ["foot", "driving"] as const) {
    try {
      const url = `${ROUTING_BASE}/route/v1/${profile}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as OsrmResponse;
      const route = json.routes?.[0];
      const coordinates = route?.geometry?.coordinates;
      if (!route || !coordinates?.length) continue;
      const coords = coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
      // Walking ≈ 5 km/h (1.389 m/s); OSRM's foot duration is already walking.
      const durationS = profile === "foot" ? route.duration : route.distance / 1.389;
      return { coords, distanceM: route.distance, durationS, straight: false };
    } catch {
      /* try next profile */
    }
  }
  return null;
}

function getPosition(): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

function gmapsWalkLink(p: MapPoint, from: [number, number] | null): string {
  const base = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
  return from ? `${base}&origin=${from[0]},${from[1]}` : base;
}

function readCache(): MapData | null {
  try {
    const raw = localStorage.getItem(MAP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MapData>;
    if (!parsed || !Array.isArray(parsed.points)) return null;
    return { points: parsed.points, trails: parsed.trails ?? [], areas: parsed.areas ?? [] };
  } catch {
    return null;
  }
}

// ── loader (offline-friendly) ───────────────────────────────────────────────

interface LoaderData {
  data: MapData;
  stale: boolean;
}

export async function loader(): Promise<LoaderData> {
  try {
    const data = await api.mapData();
    try {
      localStorage.setItem(MAP_CACHE_KEY, JSON.stringify(data));
    } catch {
      /* quota / disabled storage — ignore */
    }
    return { data, stale: false };
  } catch (err) {
    const cached = readCache();
    if (cached) return { data: cached, stale: true };
    throw err; // no cache to fall back to → surface the route error boundary
  }
}

// ── map effect helpers (must live inside MapContainer) ──────────────────────

function MapReady() {
  const map = useMap();
  useEffect(() => {
    // Leaflet in a flex/calc'd container can mount before it knows its size.
    const t = setTimeout(() => map.invalidateSize(), 60);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);
  return null;
}

function MapEffects({ focus, routeCoords }: Readonly<{ focus: { latlng: [number, number]; nonce: number } | null; routeCoords: [number, number][] | null }>) {
  const map = useMap();
  useEffect(() => {
    if (routeCoords && routeCoords.length > 1) {
      map.fitBounds(routeCoords as L.LatLngBoundsLiteral, { padding: [64, 64], maxZoom: 16 });
    }
  }, [routeCoords, map]);
  useEffect(() => {
    if (focus) map.flyTo(focus.latlng, Math.max(map.getZoom(), 15), { duration: 0.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, map]);
  return null;
}

// ── page ────────────────────────────────────────────────────────────────────

export function Component() {
  const { data, stale } = useLoaderData() as LoaderData;
  usePageTitle("Explore Cape Coast");

  const [mode, setMode] = useState<Mode>("explore");
  const [activeLayers, setActiveLayers] = useState<Set<MapLayer>>(() => new Set(DEFAULT_LAYERS));
  const [quarterFilter, setQuarterFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const [view, setView] = useState<{ latlng: [number, number]; nonce: number } | null>(null);

  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeStatus, setRouteStatus] = useState<"idle" | "locating" | "routing" | "done" | "error">("idle");
  const [routeError, setRouteError] = useState<string | null>(null);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showLayers, setShowLayers] = useState(false);

  const heritageTrail = useMemo(() => data.trails.find((t) => t.kind === "heritage") ?? null, [data.trails]);
  const festivalTrail = useMemo(() => data.trails.find((t) => t.kind === "festival") ?? null, [data.trails]);
  const activeTrail: MapTrail | null = mode === "heritage" ? heritageTrail : mode === "festival" ? festivalTrail : null;
  const showAreas = (mode === "festival" || mode === "safety") && data.areas.length > 0;

  const quarters = useMemo(() => {
    const s = new Set<string>();
    data.points.forEach((p) => p.quarter && s.add(p.quarter));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [data.points]);

  const visiblePoints = useMemo(
    () =>
      data.points.filter((p) => {
        if (!activeLayers.has(p.layer)) return false;
        if (mode === "quarter" && quarterFilter && p.quarter !== quarterFilter) return false;
        return true;
      }),
    [data.points, activeLayers, mode, quarterFilter],
  );

  // Rebuild markers only when the inputs that shape them change — the 1s
  // countdown tick below then re-renders the page cheaply (memo unchanged).
  const pointMarkers = useMemo(
    () =>
      visiblePoints.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={pinIcon(pointColor(p, mode), pointGlyph(p), selected?.id === p.id)}
          eventHandlers={{ click: () => selectPoint(p) }}
        />
      )),
    // selectPoint is stable enough for our purposes; selected drives the highlight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visiblePoints, mode, selected?.id],
  );

  // Tick the "clears in …" countdown once a second, only while areas are shown.
  useEffect(() => {
    if (!showAreas) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [showAreas]);

  function changeMode(m: Mode) {
    setMode(m);
    setActiveLayers(new Set(MODE_LAYERS[m]));
    if (m !== "quarter") setQuarterFilter(null);
  }

  function toggleLayer(id: MapLayer) {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Only stable setState calls here, so the memoised marker click handlers stay
  // correct even when captured in an older render. Directions state is reset by
  // the effect below when the selected point changes.
  function selectPoint(p: MapPoint) {
    setSelected(p);
    setView({ latlng: [p.lat, p.lng], nonce: Date.now() });
  }

  // Selection changed → drop any directions result/status that wasn't for this
  // exact point, so the panel never shows a stale route or error for a neighbour.
  useEffect(() => {
    setRoute((r) => (r && selected && r.to === selected.id ? r : null));
    setRouteStatus("idle");
    setRouteError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  function closePanel() {
    setSelected(null);
    setRoute(null);
    setRouteStatus("idle");
    setRouteError(null);
  }

  async function startDirections(p: MapPoint) {
    setRouteStatus("locating");
    setRouteError(null);
    let from = origin;
    try {
      from = await getPosition();
      setOrigin(from);
    } catch {
      setRouteStatus("error");
      setRouteError("We couldn't get your location. Enable location access, or open the walking route in Google Maps below.");
      return;
    }
    setRouteStatus("routing");
    const dest: [number, number] = [p.lat, p.lng];
    const r = await fetchRoute(from, dest);
    if (r) {
      setRoute({ ...r, to: p.id });
    } else {
      // Routing unreachable — draw a straight line and show crow-flies distance.
      const d = haversineM(from, dest);
      setRoute({ coords: [from, dest], distanceM: d, durationS: d / 1.389, straight: true, to: p.id });
    }
    setRouteStatus("done");
  }

  const activeRoute = route && selected && route.to === selected.id ? route : null;

  return (
    <div className="relative h-[calc(100dvh-3.5rem)] min-h-[560px] w-full overflow-hidden bg-cream">
      <MapContainer
        center={CAPE_COAST}
        zoom={14}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
        style={{ background: "var(--color-cream)" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        <ZoomControl position="bottomright" />

        {pointMarkers}

        {activeTrail && (
          <>
            <Polyline
              positions={activeTrail.path}
              pathOptions={{ color: activeTrail.color ?? "#B07D32", weight: 4, opacity: 0.85, dashArray: "2 9", lineCap: "round" }}
            />
            {activeTrail.stops.map((s) => (
              <Marker key={`${activeTrail.id}-${s.n}`} position={[s.lat, s.lng]} icon={stopIcon(activeTrail.color ?? "#B07D32", s.n)}>
                <Popup>
                  <div style={{ minWidth: 180 }}>
                    <strong>
                      {s.n}. {s.title}
                    </strong>
                    {s.story && <p style={{ marginTop: 4, fontSize: 12, lineHeight: 1.4 }}>{s.story}</p>}
                  </div>
                </Popup>
              </Marker>
            ))}
          </>
        )}

        {showAreas &&
          data.areas.map((a) => {
            const color = AREA_COLOR[a.severity] ?? "#B0503C";
            const untilMs = a.until ? Date.parse(a.until) : NaN;
            const label = !Number.isNaN(untilMs) ? countdown(untilMs, nowMs) : "in effect";
            return (
              <Circle key={a.id} center={[a.lat, a.lng]} radius={a.radiusM} pathOptions={{ color, fillColor: color, fillOpacity: 0.15, weight: 2 }}>
                <Popup>
                  <div style={{ minWidth: 190 }}>
                    <strong>{a.title}</strong>
                    <p style={{ marginTop: 4, fontSize: 12 }}>Road closure · {SEVERITY_LABEL[a.severity]}</p>
                    <p style={{ marginTop: 2, fontSize: 12, fontWeight: 600 }}>{label}</p>
                  </div>
                </Popup>
              </Circle>
            );
          })}

        {activeRoute && (
          <Polyline
            positions={activeRoute.coords}
            pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.85, dashArray: activeRoute.straight ? "4 10" : undefined, lineCap: "round" }}
          />
        )}
        {origin && <Marker position={origin} icon={userIcon()} />}

        <MapReady />
        <MapEffects focus={view} routeCoords={activeRoute?.coords ?? null} />
      </MapContainer>

      {/* ── Top controls: mode switcher, layer chips (double as the legend), quarter filter ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-sand bg-cream/95 p-1 shadow-md backdrop-blur [scrollbar-width:none]">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => changeMode(m.id)}
                aria-pressed={mode === m.id}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${mode === m.id ? "bg-green text-on-green" : "text-ink-muted hover:text-ink"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowLayers((v) => !v)}
            aria-expanded={showLayers}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-sand bg-cream/95 px-3 py-1.5 text-xs font-semibold text-ink-muted shadow-md backdrop-blur transition-colors hover:text-ink sm:hidden"
          >
            Layers <span aria-hidden>{showLayers ? "▲" : "▾"}</span>
          </button>
        </div>

        <div className={`${showLayers ? "flex" : "hidden"} pointer-events-auto max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl border border-sand bg-cream/95 p-2 shadow-md backdrop-blur [scrollbar-width:none] sm:flex`}>
          {LAYERS.map((l) => {
            const on = activeLayers.has(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleLayer(l.id)}
                aria-pressed={on}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${on ? "border-transparent text-ink" : "border-sand text-ink-faint opacity-60 hover:opacity-100"}`}
                style={on ? { backgroundColor: `color-mix(in srgb, ${l.color} 16%, transparent)` } : undefined}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
                {l.label}
              </button>
            );
          })}
        </div>

        {mode === "quarter" && quarters.length > 0 && (
          <div className="pointer-events-auto flex w-fit max-w-full items-center gap-2 rounded-full border border-sand bg-cream/95 px-3 py-1.5 shadow-md backdrop-blur">
            <label htmlFor="quarter-filter" className="text-xs font-semibold text-ink-muted">
              Quarter
            </label>
            <select
              id="quarter-filter"
              value={quarterFilter ?? ""}
              onChange={(e) => setQuarterFilter(e.target.value || null)}
              className="max-w-[10rem] bg-transparent text-xs font-medium text-ink outline-none"
            >
              <option value="">All quarters</option>
              {quarters.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>
        )}

        {activeTrail && (
          <div className="pointer-events-auto w-fit max-w-sm rounded-2xl border border-sand bg-cream/95 px-3 py-2 shadow-md backdrop-blur">
            <p className="text-xs font-bold" style={{ color: activeTrail.color ?? "var(--color-gold-text)" }}>
              {activeTrail.title}
            </p>
            {activeTrail.description && <p className="mt-0.5 text-[0.7rem] leading-snug text-ink-muted">{activeTrail.description}</p>}
            <p className="mt-1 text-[0.65rem] text-ink-faint">Tap a numbered stop for its story.</p>
          </div>
        )}

        {stale && (
          <div className="pointer-events-auto w-fit rounded-full border border-gold-border/40 bg-gold/[0.14] px-3 py-1 text-[0.7rem] font-semibold text-gold-text shadow-sm backdrop-blur">
            Offline · showing your last saved map
          </div>
        )}
      </div>

      {selected && (
        <DetailPanel
          point={selected}
          route={activeRoute}
          routeStatus={routeStatus}
          routeError={routeError}
          origin={origin}
          onClose={closePanel}
          onDirections={() => startDirections(selected)}
          onClearRoute={() => {
            setRoute(null);
            setRouteStatus("idle");
            setRouteError(null);
          }}
        />
      )}
    </div>
  );
}

// ── detail / directions panel (slide-up on mobile, floating card on desktop) ──

function DetailPanel({
  point,
  route,
  routeStatus,
  routeError,
  origin,
  onClose,
  onDirections,
  onClearRoute,
}: Readonly<{
  point: MapPoint;
  route: RouteResult | null;
  routeStatus: "idle" | "locating" | "routing" | "done" | "error";
  routeError: string | null;
  origin: [number, number] | null;
  onClose: () => void;
  onDirections: () => void;
  onClearRoute: () => void;
}>) {
  const layer = LAYER_BY_ID[point.layer];
  const internalHref = point.href && point.href.startsWith("/") ? point.href : null;
  const externalHref = point.href && !point.href.startsWith("/") ? point.href : null;
  const busy = routeStatus === "locating" || routeStatus === "routing";
  const color = point.kind === "incident" && point.severity ? SEVERITY_COLOR[point.severity] : layer?.color ?? "#64748B";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1100] flex justify-center p-3 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:justify-start sm:p-0">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-sand bg-cream p-4 shadow-[var(--shadow-lift)] sm:w-[22rem]">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm" style={{ backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)` }} aria-hidden>
            {pointGlyph(point)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide" style={{ color }}>
              {layer?.label ?? point.layer}
            </p>
            <h2 className="truncate text-lg font-semibold leading-tight text-ink">{point.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full p-1 text-ink-faint transition-colors hover:bg-paper hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {point.subtitle && <p className="mt-2 text-sm text-ink-muted">{point.subtitle}</p>}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {point.kind === "incident" && point.severity && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold text-cream" style={{ backgroundColor: SEVERITY_COLOR[point.severity] }}>
              {point.severity}
            </span>
          )}
          {point.category && <span className="inline-flex items-center rounded-full border border-sand bg-paper px-2.5 py-0.5 text-[0.7rem] text-ink-muted">{point.category}</span>}
          {point.quarter && <span className="inline-flex items-center rounded-full border border-sand bg-paper px-2.5 py-0.5 text-[0.7rem] text-ink-muted">📍 {point.quarter}</span>}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {internalHref && (
            <Link to={internalHref} className="inline-flex items-center gap-1.5 rounded-full bg-green px-4 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-green-900">
              View details <span aria-hidden>→</span>
            </Link>
          )}
          {externalHref && (
            <a href={externalHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-green px-4 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-green-900">
              View details <span aria-hidden>↗</span>
            </a>
          )}
          <button
            type="button"
            onClick={onDirections}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal/[0.08] px-4 py-2 text-sm font-semibold text-teal-text transition-colors hover:border-teal disabled:opacity-60"
          >
            {busy ? "Locating…" : "Directions"} <span aria-hidden>🧭</span>
          </button>
        </div>

        {/* Directions status */}
        {routeStatus === "locating" && <p className="mt-3 text-xs text-ink-muted">Finding your location…</p>}
        {routeStatus === "routing" && <p className="mt-3 text-xs text-ink-muted">Plotting the best walking route…</p>}

        {routeStatus === "done" && route && (
          <div className="mt-3 rounded-xl border border-sand bg-paper p-3">
            <div className="flex items-center gap-3">
              <span className="text-lg" aria-hidden>
                🚶
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {fmtDistance(route.distanceM)} · {fmtDuration(route.durationS)} walk
                </p>
                <p className="text-[0.7rem] text-ink-faint">{route.straight ? "Straight-line estimate — routing was unavailable" : "Following footpaths and streets"}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <a href={gmapsWalkLink(point, origin)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-teal-text underline underline-offset-2">
                Open in Google Maps ↗
              </a>
              <button type="button" onClick={onClearRoute} className="text-xs font-medium text-ink-faint transition-colors hover:text-ink">
                Clear route
              </button>
            </div>
          </div>
        )}

        {routeStatus === "error" && (
          <div className="mt-3 rounded-xl border border-clay/30 bg-clay/[0.08] p-3">
            <p className="text-xs text-clay-text">{routeError}</p>
            <a href={gmapsWalkLink(point, origin)} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-xs font-semibold text-teal-text underline underline-offset-2">
              Open walking route in Google Maps ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
