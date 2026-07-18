import { useEffect, useMemo, type CSSProperties } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView } from "react-native-webview";
import { useTheme } from "@/lib/theme-context";
import type { MapLayer, MapPoint } from "@/lib/types";

interface MapViewProps {
  lat: number;
  lng: number;
  zoom?: number;
  title?: string;
  style?: StyleProp<ViewStyle>;
}

interface TownMapProps {
  points: MapPoint[];
  style?: StyleProp<ViewStyle>;
  onPointPress?: (id: string) => void;
}

const CAPE_COAST: [number, number] = [5.1053, -1.2466];
const MAP_MESSAGE = "oguaa-map-point";

const PIN_COLORS: Record<MapLayer, string> = {
  business: "#C9822E",
  property: "#0E7C6B",
  events: "#0E7C6B",
  landmarks: "#8A5AA8",
  institutions: "#2F855A",
  safety: "#B0503C",
  lostfound: "#3E7CB1",
  services: "#4C40A8",
  transport: "#64748B",
};

const PIN_LABELS: Record<MapLayer, string> = {
  business: "Business",
  property: "Rent & Stay",
  events: "Event",
  landmarks: "Heritage",
  institutions: "Institution",
  safety: "Safety",
  lostfound: "Lost & Found",
  services: "Service",
  transport: "Transport",
};

// The same icon language as the portal map, embedded in each Leaflet div icon
// so pins do not depend on platform emoji fonts or bundled marker images.
const PIN_SYMBOLS: Record<MapLayer, string> = {
  business: '<path d="M16.5 20h15l-1.8-5h-11.4l-1.8 5Z"/><path d="M18 21v10h12V21M22 31v-6h4v6"/>',
  property: '<path d="m15 23 9-8 9 8"/><path d="M18 21v11h12V21M22 32v-7h4v7"/>',
  events: '<rect x="16.5" y="16.5" width="15" height="14.5" rx="2"/><path d="M20 14.5v4M28 14.5v4M16.5 21.5h15"/><circle cx="21" cy="25.5" r="1" fill="currentColor" stroke="none"/><circle cx="27" cy="25.5" r="1" fill="currentColor" stroke="none"/>',
  landmarks: '<path d="m15.5 20 8.5-5 8.5 5M17 21h14M18.5 21v9M23 21v9M27.5 21v9M16.5 31h15"/>',
  institutions: '<path d="m15 20 9-4.5 9 4.5-9 4.5-9-4.5Z"/><path d="M19 22.5v4c2.8 2.2 7.2 2.2 10 0v-4M33 20v6"/>',
  safety: '<path d="M24 14.5 31 18v5c0 4.8-2.8 8-7 10-4.2-2-7-5.2-7-10v-5l7-3.5Z"/><path d="M24 19v6M24 28.5v.25"/>',
  lostfound: '<circle cx="22" cy="22" r="5.5"/><path d="m26 26 5.5 5.5M22 19.5v5M19.5 22h5"/>',
  services: '<path d="M21 15.5h6v5h5v6h-5v5h-6v-5h-5v-6h5v-5Z"/>',
  transport: '<rect x="16" y="15.5" width="16" height="15" rx="3"/><path d="M18 22h12M19 18h10M19 31v2M29 31v2"/><circle cx="20" cy="27" r="1" fill="currentColor" stroke="none"/><circle cx="28" cy="27" r="1" fill="currentColor" stroke="none"/>',
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** A compact single-location map used by detail screens. */
export function MapView({ lat, lng, zoom = 14, title, style }: Readonly<MapViewProps>) {
  const { C } = useTheme();
  const safeLat = clamp(Number.isFinite(lat) ? lat : CAPE_COAST[0], -85, 85);
  const safeLng = clamp(Number.isFinite(lng) ? lng : CAPE_COAST[1], -180, 180);
  const point = useMemo<MapPoint>(() => ({
    id: "location",
    title: title ?? "Location",
    lat: safeLat,
    lng: safeLng,
    layer: "landmarks",
    kind: "landmark",
  }), [safeLat, safeLng, title]);
  const html = useMemo(
    () => leafletHtml([point], zoom, C.paper, C.cream, C.ink, C.goldText, false),
    [point, zoom, C.paper, C.cream, C.ink, C.goldText],
  );

  return <MapFrame html={html} title={title ?? "Location map"} style={style} />;
}

/** Full-town map used by Explore. The grouped card list remains below it as the
 * low-bandwidth and assistive-technology fallback. */
export function TownMap({ points, style, onPointPress }: Readonly<TownMapProps>) {
  const { C } = useTheme();
  const safePoints = useMemo(
    () => points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    [points],
  );
  const html = useMemo(
    () => leafletHtml(safePoints, 14, C.paper, C.cream, C.ink, C.goldText, true),
    [safePoints, C.paper, C.cream, C.ink, C.goldText],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || !onPointPress || typeof window === "undefined") return;
    const receive = (event: MessageEvent) => {
      const id = readPointMessage(event.data);
      if (id) onPointPress(id);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onPointPress]);

  return (
    <MapFrame
      html={html}
      title={`Map of ${safePoints.length} places in Oguaa`}
      style={style}
      onPointPress={onPointPress}
    />
  );
}

function MapFrame({ html, title, style, onPointPress }: Readonly<{
  html: string;
  title: string;
  style?: StyleProp<ViewStyle>;
  onPointPress?: (id: string) => void;
}>) {
  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, style]}>
        <iframe title={title} srcDoc={html} style={iframeStyle} loading="lazy" />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        androidLayerType="hardware"
        onMessage={(event) => {
          const id = readPointMessage(event.nativeEvent.data);
          if (id) onPointPress?.(id);
        }}
      />
    </View>
  );
}

function readPointMessage(value: unknown): string | null {
  try {
    const message = typeof value === "string" ? JSON.parse(value) as unknown : value;
    if (!message || typeof message !== "object") return null;
    const record = message as Record<string, unknown>;
    return record.type === MAP_MESSAGE && typeof record.id === "string" ? record.id : null;
  } catch {
    return null;
  }
}

const iframeStyle: CSSProperties = { border: 0, width: "100%", height: "100%" };

const styles = StyleSheet.create({
  container: { overflow: "hidden", backgroundColor: "#ece4d3" },
  webview: { flex: 1, backgroundColor: "transparent" },
});

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function leafletHtml(points: MapPoint[], zoom: number, bg: string, surface: string, ink: string, goldText: string, fitAll: boolean): string {
  const payload = points.map((point) => ({
    id: point.id,
    title: point.title,
    subtitle: point.subtitle ?? "",
    layer: point.layer,
    layerLabel: PIN_LABELS[point.layer] ?? point.layer,
    lat: clamp(point.lat, -85, 85),
    lng: clamp(point.lng, -180, 180),
    color: PIN_COLORS[point.layer] ?? "#64748B",
    symbol: PIN_SYMBOLS[point.layer] ?? PIN_SYMBOLS.landmarks,
  }));
  const first = payload[0];
  const centerLat = first?.lat ?? CAPE_COAST[0];
  const centerLng = first?.lng ?? CAPE_COAST[1];

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: ${bg}; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .leaflet-control-attribution { font-size: 8px; }
  .oguaa-pin { background: transparent; border: 0; }
  .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: ${surface}; color: ${ink}; }
  .leaflet-popup-content-wrapper { border-radius: 12px; box-shadow: 0 10px 30px rgba(5,21,14,.24); }
  .leaflet-popup-content { margin: 11px 13px; min-width: 140px; }
  .popup-kind { color: ${goldText}; font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .popup-title { margin-top: 3px; font-size: 14px; font-weight: 750; line-height: 1.2; }
  .popup-sub { margin-top: 4px; opacity: .72; font-size: 11px; line-height: 1.35; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  (function() {
    var points = ${safeJson(payload)};
    var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([${centerLat}, ${centerLng}], ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    var bounds = [];
    points.forEach(function(point) {
      var pin = '<svg width="38" height="48" viewBox="0 0 48 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block;overflow:visible;filter:drop-shadow(0 3px 3px rgba(5,21,14,.42))">' +
        '<path d="M24 1.5C11.6 1.5 2.5 10.7 2.5 23c0 16.4 21.5 35.5 21.5 35.5S45.5 39.4 45.5 23C45.5 10.7 36.4 1.5 24 1.5Z" fill="' + point.color + '" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>' +
        '<circle cx="24" cy="23" r="14.5" fill="#F6F1E7" stroke="rgba(12,44,31,.18)"/>' +
        '<g color="#0C2C1F" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + point.symbol + '</g></svg>';
      var icon = L.divIcon({ className: 'oguaa-pin', html: pin, iconSize: [38, 48], iconAnchor: [19, 46], popupAnchor: [0, -39] });
      var marker = L.marker([point.lat, point.lng], { icon: icon, title: point.title }).addTo(map);
      var popup = document.createElement('div');
      var kind = document.createElement('div');
      kind.className = 'popup-kind';
      kind.textContent = point.layerLabel;
      var title = document.createElement('div');
      title.className = 'popup-title';
      title.textContent = point.title;
      popup.appendChild(kind);
      popup.appendChild(title);
      if (point.subtitle) {
        var subtitle = document.createElement('div');
        subtitle.className = 'popup-sub';
        subtitle.textContent = point.subtitle;
        popup.appendChild(subtitle);
      }
      marker.bindPopup(popup);
      marker.on('click', function() {
        var message = JSON.stringify({ type: '${MAP_MESSAGE}', id: point.id });
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
        else if (window.parent) window.parent.postMessage(message, '*');
      });
      bounds.push([point.lat, point.lng]);
    });
    if (${fitAll ? "true" : "false"} && bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    setTimeout(function() { map.invalidateSize(); }, 60);
  })();
</script>
</body>
</html>`;
}
