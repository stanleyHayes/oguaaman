// Interactive Leaflet map centred on Cape Coast (OpenStreetMap tiles, no API key).
// We don't geocode server-side, so the pin marks the town centre; the
// "Get directions" link resolves the exact address in the user's maps app.
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";

// Vite tree-shakes Leaflet's default icon assets; re-wire them manually.
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
const geocodeCache = new Map<string, [number, number]>();

export function LocationMap({ address, query, className = "", latitude, longitude }: Readonly<{ address?: string; query?: string; className?: string; latitude?: number; longitude?: number }>) {
  const rawQuery = useMemo(() => [query ?? address, "Cape Coast", "Ghana"].filter(Boolean).join(", "), [query, address]);
  const q = encodeURIComponent(rawQuery);
  const directions = `https://www.google.com/maps/search/?api=1&query=${q}`;
  const key = rawQuery.trim().toLowerCase();
  const cached = key ? geocodeCache.get(key) : undefined;
  const [position, setPosition] = useState<[number, number] | null>(cached ?? null);
  const [geocoded, setGeocoded] = useState<boolean>(!!cached);
  const hasExplicitCoords = typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude);
  const resolvedPosition: [number, number] = hasExplicitCoords ? [latitude, longitude] : (cached ?? position ?? CAPE_COAST);
  const resolvedGeocoded = hasExplicitCoords || !!cached || geocoded;

  useEffect(() => {
    if (hasExplicitCoords || !key || cached) {
      return;
    }
    const controller = new AbortController();
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(rawQuery)}`;
    fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { lat: string; lon: string }[]) => {
        const row = rows[0];
        if (!row) {
          return;
        }
        const lat = Number(row.lat);
        const lon = Number(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return;
        }
        const p: [number, number] = [lat, lon];
        geocodeCache.set(key, p);
        setPosition(p);
        setGeocoded(true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [rawQuery, key, cached, hasExplicitCoords]);

  return (
    <div className={`overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream ${className}`}>
      <MapContainer
        center={resolvedPosition}
        zoom={14}
        scrollWheelZoom={false}
        style={{ height: "176px", width: "100%" }}
        key={resolvedPosition.join(",")}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Marker position={resolvedPosition}>
          {address && <Popup>{address}{!resolvedGeocoded ? " (Cape Coast area)" : ""}</Popup>}
        </Marker>
      </MapContainer>
      <div className="p-4">
        {address && <p className="text-sm text-ink"><span aria-hidden>📍</span> {address}</p>}
        <a
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-teal-text"
        >
          Get directions <span aria-hidden>↗</span>
        </a>
        <p className="mt-2 text-[0.7rem] leading-snug text-ink-faint">
          Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap</a> contributors. Pin is geocoded from the listing location when available; otherwise it falls back to Cape Coast town centre.
        </p>
      </div>
    </div>
  );
}
