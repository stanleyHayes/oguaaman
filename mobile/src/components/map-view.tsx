import { useMemo } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { WebView } from "react-native-webview";
import { useTheme } from "@/lib/theme-context";

interface MapViewProps {
  lat: number;
  lng: number;
  zoom?: number;
  title?: string;
  style?: ViewStyle;
}

const CAPE_COAST: [number, number] = [5.1053, -1.2466];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function MapView({ lat, lng, zoom = 14, title, style }: Readonly<MapViewProps>) {
  const { C } = useTheme();
  const safeLat = clamp(Number.isFinite(lat) ? lat : CAPE_COAST[0], -85, 85);
  const safeLng = clamp(Number.isFinite(lng) ? lng : CAPE_COAST[1], -180, 180);

  const webHtml = useMemo(() => leafletHtml(safeLat, safeLng, zoom, title ?? "Location", C.paper), [safeLat, safeLng, zoom, title, C.paper]);

  if (Platform.OS === "web") {
    return <WebFallback lat={safeLat} lng={safeLng} zoom={zoom} style={style} />;
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        source={{ html: webHtml }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        androidLayerType="hardware"
      />
    </View>
  );
}

function WebFallback({ lat, lng, zoom, style }: Readonly<{ lat: number; lng: number; zoom: number; style?: ViewStyle }>) {
  // Approximate a small bounding box around the pin for the OSM embed.
  const span = 0.02 * Math.pow(2, 14 - Math.max(1, zoom));
  const bbox = `${lng - span},${lat - span},${lng + span},${lat + span}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lng}`;
  return (
    <View style={[styles.container, style]}>
      <iframe title="Map" src={src} style={styles.iframe} loading="lazy" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: "hidden", backgroundColor: "#ece4d3" },
  webview: { flex: 1, backgroundColor: "transparent" },
  iframe: { border: 0, width: "100%", height: "100%" } as unknown as ViewStyle,
});

function leafletHtml(lat: number, lng: number, zoom: number, title: string, bg: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: ${bg}; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  (function() {
    var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([${lat}, ${lng}], ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    L.marker([${lat}, ${lng}]).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
  })();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c] ?? c);
}
