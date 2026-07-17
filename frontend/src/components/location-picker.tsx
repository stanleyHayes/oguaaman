// A small interactive Leaflet map for "claim your spot on the map" — the owner
// taps the map (or drags the pin) to set an exact [lat, lng], which is reported
// up to the parent form. Centred on Cape Coast, OpenStreetMap tiles, no API key
// and no server-side geocoding. Mirrors the Leaflet wiring in location-map.tsx.
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useState } from "react";

// Vite tree-shakes Leaflet's default icon assets; re-wire them manually. Safe to
// run again even if location-map.tsx already did (mergeOptions is idempotent).
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const CAPE_COAST: [number, number] = [5.1053, -1.2466];

export type LatLng = [number, number];

function inRange(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// Handles map clicks (drop / move the pin) and renders the draggable marker.
function PinLayer({ value, onChange }: Readonly<{ value: LatLng | null; onChange: (v: LatLng) => void }>) {
  useMapEvents({
    click(e) {
      onChange([e.latlng.lat, e.latlng.lng]);
    },
  });
  if (!value) return null;
  return (
    <Marker
      position={value}
      draggable
      eventHandlers={{
        dragend(e) {
          const p = (e.target as L.Marker).getLatLng();
          onChange([p.lat, p.lng]);
        },
      }}
    />
  );
}

// Lifts the Leaflet map instance to the parent so "Use my location" can recenter.
function MapReady({ onReady }: Readonly<{ onReady: (m: L.Map) => void }>) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

export function LocationPicker({
  value,
  onChange,
  label = "Pin your exact location",
  hint = "Optional — tap the map or drag the pin to your exact spot. This is what places you on the town map.",
  className = "",
}: Readonly<{
  value: LatLng | null;
  onChange: (v: LatLng | null) => void;
  label?: string;
  hint?: string;
  className?: string;
}>) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const onReady = useCallback((m: L.Map) => setMap(m), []);

  // center/zoom are only read on mount, so an editing prefill lands correctly and
  // later click/drag updates don't yank the viewport around.
  const initialCenter = value ?? CAPE_COAST;

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Your browser can’t share a location — drop the pin by hand.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p: LatLng = [pos.coords.latitude, pos.coords.longitude];
        if (!inRange(p[0], p[1])) return;
        onChange(p);
        map?.setView(p, 16);
      },
      () => {
        setLocating(false);
        setGeoError("Couldn’t get your location. Drop the pin by hand instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className={className}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream">
        <MapContainer
          center={initialCenter}
          zoom={value ? 16 : 14}
          scrollWheelZoom={false}
          style={{ height: "260px", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapReady onReady={onReady} />
          <PinLayer value={value} onChange={onChange} />
        </MapContainer>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-full border border-green/30 px-3.5 py-1.5 text-sm font-semibold text-green-text transition-colors hover:border-green disabled:opacity-60"
          >
            <span aria-hidden>📍</span> {locating ? "Locating…" : "Use my location"}
          </button>
          {value ? (
            <>
              <span className="text-xs text-ink-muted">Pinned at {value[0].toFixed(5)}, {value[1].toFixed(5)}</span>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="ml-auto rounded-full border border-sand px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-clay hover:text-clay-text"
              >
                Clear pin
              </button>
            </>
          ) : (
            <span className="text-xs text-ink-faint">No pin yet — tap the map to drop one.</span>
          )}
        </div>
      </div>
      {geoError && <p className="mt-1.5 text-xs text-clay-text">{geoError}</p>}
      {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}
