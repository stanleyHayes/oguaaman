import { useCallback, useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

export type LatLng = [number, number];
const CAPE_COAST: LatLng = [5.1053, -1.2466];

function Pin({ value, onChange }: Readonly<{ value: LatLng | null; onChange: (value: LatLng) => void }>) {
  useMapEvents({ click: (event) => onChange([event.latlng.lat, event.latlng.lng]) });
  if (!value) return null;
  return <Marker position={value} draggable eventHandlers={{ dragend(event) { const point = (event.target as L.Marker).getLatLng(); onChange([point.lat, point.lng]); } }} />;
}

function Ready({ onReady }: Readonly<{ onReady: (map: L.Map) => void }>) {
  const map = useMap();
  useEffect(() => onReady(map), [map, onReady]);
  return null;
}

export function LocationPicker({ value, onChange, hint }: Readonly<{ value: LatLng | null; onChange: (value: LatLng | null) => void; hint: string }>) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const onReady = useCallback((next: L.Map) => setMap(next), []);

  function locate() {
    if (!navigator.geolocation) { setError("Your browser cannot share a location. Drop the pin by hand instead."); return; }
    setLocating(true); setError("");
    navigator.geolocation.getCurrentPosition((position) => {
      const point: LatLng = [position.coords.latitude, position.coords.longitude];
      setLocating(false); onChange(point); map?.setView(point, 16);
    }, () => { setLocating(false); setError("Could not get your location. Drop the pin by hand instead."); }, { enableHighAccuracy: true, timeout: 10000 });
  }

  return <div><span className="mb-1.5 block text-sm font-medium text-ink">Pin your exact location</span><div className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream"><MapContainer center={value ?? CAPE_COAST} zoom={value ? 16 : 14} scrollWheelZoom={false} style={{ height: 260, width: "100%" }}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' /><Ready onReady={onReady} /><Pin value={value} onChange={onChange} /></MapContainer><div className="flex flex-wrap items-center gap-2 p-3"><button type="button" onClick={locate} disabled={locating} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-green/30 px-3.5 text-sm font-semibold text-green-text hover:border-green disabled:opacity-60"><span aria-hidden>📍</span>{locating ? "Locating…" : "Use my location"}</button>{value ? <><span className="text-xs text-ink-muted">Pinned at {value[0].toFixed(5)}, {value[1].toFixed(5)}</span><button type="button" onClick={() => onChange(null)} className="ml-auto min-h-10 rounded-lg border border-sand px-3 text-sm text-ink-muted hover:border-clay hover:text-clay-text">Clear pin</button></> : <span className="text-xs text-ink-faint">No pin yet — tap the map to drop one.</span>}</div></div>{error && <p className="mt-1.5 text-xs text-clay-text">{error}</p>}<p className="mt-1.5 text-xs leading-relaxed text-ink-faint">{hint}</p></div>;
}
