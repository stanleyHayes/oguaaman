// A no-key location card: an ambient OpenStreetMap embed centred on Cape Coast
// plus a "Get directions" link that resolves the exact address in the visitor's
// own maps app (spec §12 maps). We don't geocode server-side, so the embedded pin
// marks the town; directions do the precise routing — stated plainly.

const CAPE_COAST = { lat: 5.1053, lon: -1.2466 };
// A bounding box framing Cape Coast for the embedded map.
const BBOX = "-1.300,5.075,-1.185,5.135";
const MAP_SRC = `https://www.openstreetmap.org/export/embed.html?bbox=${BBOX}&layer=mapnik&marker=${CAPE_COAST.lat},${CAPE_COAST.lon}`;

export function LocationMap({ address, query, className = "" }: { address?: string; query?: string; className?: string }) {
  const q = encodeURIComponent([query ?? address, "Cape Coast", "Ghana"].filter(Boolean).join(", "));
  const directions = `https://www.google.com/maps/search/?api=1&query=${q}`;
  return (
    <div className={`overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream ${className}`}>
      <iframe
        title="Map of Cape Coast"
        src={MAP_SRC}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-44 w-full border-0"
      />
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
          Map data © OpenStreetMap. The pin marks Cape Coast; directions open the exact address in your maps app.
        </p>
      </div>
    </div>
  );
}
