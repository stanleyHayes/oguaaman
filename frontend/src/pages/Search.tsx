import { useEffect, useMemo, useState, type ReactNode} from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { SearchHit } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container } from "@/components/ui";
import { cldAvatar } from "@/lib/cloudinary";

/** Map a search hit to its canonical route in this client. */
function hrefFor(h: SearchHit): string {
  if (h.kind === "member") return `/members/${h.slug}`;
  if (h.kind === "institution") return `/education/${h.slug}`;
  switch (h.type) {
    case "artist": return `/music/${h.slug}`;
    case "business": return `/business/${h.slug}`;
    case "property": return `/rent-stay/${h.slug}`;
    case "memorial": return `/memoriam/${h.slug}`;
    case "person": return `/people/${h.slug}`;
    case "project": return `/projects/${h.slug}`;
    case "event": return "/events";
    default: return "/community";
  }
}

const KIND_LABEL: Record<string, string> = {
  member: "Person", institution: "Institution",
  artist: "Artist", business: "Business", property: "Rent & Stay", memorial: "In memoriam",
  person: "Son / daughter", event: "Event", memory: "Memory", opportunity: "Opportunity", project: "Project",
};
function kindLabel(h: SearchHit): string {
  return KIND_LABEL[h.kind === "listing" ? (h.type ?? "") : h.kind] ?? "Result";
}

export function Component() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounced live search; keeps ?q= in the URL so results are shareable.
  useEffect(() => {
    const term = q.trim();
    setParams(term ? { q: term } : {}, { replace: true });
    if (term.length < 2) return; // `grouped` shows nothing below 2 chars
    let alive = true;
    const t = setTimeout(() => {
      setLoading(true);
      api.search(term)
        .then((r) => { if (alive) setHits(r); })
        .catch(() => { if (alive) setHits([]); })
        .finally(() => { if (alive) setLoading(false); });
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q, setParams]);

  // Below 2 chars we show no results (the effect doesn't search then).
  const grouped = useMemo(() => (q.trim().length < 2 ? [] : (hits ?? [])), [hits, q]);

  let results: ReactNode;
  if (q.trim().length < 2) {
    results = <p className="text-center text-sm text-ink-faint">Type at least two letters to search.</p>;
  } else if (loading && !hits) {
    results = <p className="text-center text-sm text-ink-faint">Searching…</p>;
  } else if (grouped.length === 0) {
    results = <p className="text-center text-sm text-ink-muted">No matches for “{q.trim()}”. Try another spelling.</p>;
  } else {
    results = (
      <ul className="divide-y divide-sand overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream">
        {grouped.map((h) => (
          <li key={`${h.kind}-${h.type ?? ""}-${h.slug}`}>
            <Link to={hrefFor(h)} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-paper">
              <span className="flex min-w-0 items-center gap-3">
                {h.imageUrl && <img src={cldAvatar(h.imageUrl, 40)} alt="" loading="lazy" className={`h-10 w-10 shrink-0 border border-sand object-cover ${h.kind === "listing" && h.type !== "memorial" ? "rounded-lg" : "rounded-full"}`} />}
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{h.title}</span>
                  {h.subtitle && <span className="mt-0.5 block truncate text-sm text-ink-muted">{h.subtitle}</span>}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-sand bg-paper px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint">{kindLabel(h)}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <PageHero tone="teal" kicker="Search" title="Find your people, places & memories" symbol="funtunfunefu" lede="Search across the sons & daughters of Oguaa, the listings, and the institutions of Cape Coast." />
      <Container size="narrow" className="py-10">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a name, business, property or memorial…"
          className="w-full rounded-full border border-sand bg-paper px-5 py-3 text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/15"
        />

        <div className="mt-8">
          {results}
        </div>
      </Container>
    </>
  );
}
