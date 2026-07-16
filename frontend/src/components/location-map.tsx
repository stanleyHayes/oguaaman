// Interactive Leaflet map centred on Cape Coast (OpenStreetMap tiles, no API key).
// We don't geocode server-side, so the pin marks the town centre; the
// "Get directions" link resolves the exact address in the user's maps app.
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

export function LocationMap({ address, query, className = "" }: Readonly<{ address?: string; query?: string; className?: string }>) {
  const q = encodeURIComponent([query ?? address, "Cape Coast", "Ghana"].filter(Boolean).join(", "));
  const directions = `https://www.google.com/maps/search/?api=1&query=${q}`;
  return (
    <div className={`overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream ${className}`}>
      <MapContainer
        center={CAPE_COAST}
        zoom={14}
        scrollWheelZoom={false}
        style={{ height: "176px", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Marker position={CAPE_COAST}>
          {address && <Popup>{address}</Popup>}
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
          Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap</a> contributors. Pin marks Cape Coast town centre; directions open your maps app.
        </p>
      </div>
    </div>
  );
}
