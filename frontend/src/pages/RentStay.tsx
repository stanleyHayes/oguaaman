import { useMemo, useState, type ReactNode } from "react";
import { Link, useLoaderData } from "react-router-dom";
import type { Listing, PropertyOfferType, PropertyType } from "@/lib/types";
import { api } from "@/lib/api";
import { usePageTitle } from "@/lib/use-page-title";
import { Container, Pill } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { EmptyGlyph, EmptyState } from "@/components/empty-state";

export async function loader() {
  return api.properties();
}

const PROPERTY_LABELS: Record<PropertyType, string> = {
  room: "Room",
  apartment: "Apartment",
  house: "House",
  guesthouse: "Guesthouse",
  hostel: "Hostel",
};

const PRICE_CAPS = [500, 1_000, 2_000, 5_000] as const;

function money(pesewas = 0): string {
  return `GH₵${(pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;
}

function coverFor(listing: Listing): string | undefined {
  return listing.coverImageUrl ?? listing.details.gallery?.find((image) => image.url)?.url;
}

function FilterMenu({ label, value, children }: Readonly<{ label: string; value: string; children: ReactNode }>) {
  return (
    <details className="group relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-sand bg-cream px-3.5 py-2 text-sm text-ink transition-colors marker:hidden hover:border-gold-border/70 [&::-webkit-details-marker]:hidden">
        <span className="text-ink-faint">{label}</span>
        <span className="max-w-36 truncate font-semibold">{value}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto h-4 w-4 text-ink-faint transition-transform group-open:rotate-180" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div className="theme-surface absolute left-0 z-30 mt-2 min-w-52 rounded-2xl border border-sand bg-paper p-2 shadow-[var(--shadow-lift)]">
        {children}
      </div>
    </details>
  );
}

function FilterOption({ selected, onClick, children }: Readonly<{ selected: boolean; onClick: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={(event) => {
        onClick();
        const parent = event.currentTarget.closest("details");
        if (parent) parent.open = false;
      }}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${selected ? "bg-green text-on-green" : "text-ink-muted hover:bg-cream hover:text-ink"}`}
    >
      {children}
      {selected && <span aria-hidden>✓</span>}
    </button>
  );
}

function PropertyCard({ property }: Readonly<{ property: Listing }>) {
  const d = property.details;
  const type = d.propertyType ? PROPERTY_LABELS[d.propertyType] : "Property";
  const cadence = d.pricePeriod === "night" ? "night" : "month";
  const unavailable = d.availability && d.availability !== "available";
  return (
    <article className="group overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <Link to={`/rent-stay/${property.slug}`} className="flex h-full flex-col">
        <div className="on-dark-pin relative aspect-[4/3] overflow-hidden bg-green-900">
          <Thumb seed={property.slug} label={property.title.slice(0, 1)} src={coverFor(property)} rounded="rounded-none" className="h-full w-full transition-transform duration-500 group-hover:scale-[1.025]" coverWidth={720} />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <span className="rounded-full bg-green-900/90 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-cream backdrop-blur-sm">
              {d.offerType === "short-stay" ? "Short stay" : "For rent"}
            </span>
            {unavailable && (
              <span className="rounded-full bg-cream/95 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-maroon-text">
                {d.availability}
              </span>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-green-900/90 to-transparent px-4 pb-3 pt-10 text-cream">
            <span className="text-xl font-semibold">{money(d.pricePesewas)}</span>
            <span className="ml-1 text-xs text-cream/75">/ {cadence}</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="gold">{type}</Pill>
            {d.furnished && <Pill tone="teal">Furnished</Pill>}
          </div>
          <h2 className="mt-3 text-xl font-semibold leading-tight text-ink transition-colors group-hover:text-green-text">{property.title}</h2>
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted">{d.description}</p>
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sand pt-4 text-xs text-ink-muted">
            {typeof d.bedrooms === "number" && <span><b className="text-ink">{d.bedrooms}</b> bed</span>}
            {typeof d.bathrooms === "number" && <span><b className="text-ink">{d.bathrooms}</b> bath</span>}
            {(d.area || d.address) && <span className="min-w-0 truncate">⌖ {d.area || d.address}</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}

export function Component() {
  const properties = useLoaderData() as Listing[];
  usePageTitle("Rent & Stay");
  const [offer, setOffer] = useState<"all" | PropertyOfferType>("all");
  const [propertyType, setPropertyType] = useState<"all" | PropertyType>("all");
  const [area, setArea] = useState("all");
  const [maxPrice, setMaxPrice] = useState(0);

  const areas = useMemo(() => [...new Set(properties.map((property) => property.details.area?.trim()).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b)), [properties]);
  const shown = useMemo(() => properties
    .filter((property) => offer === "all" || property.details.offerType === offer)
    .filter((property) => propertyType === "all" || property.details.propertyType === propertyType)
    .filter((property) => area === "all" || property.details.area === area)
    .filter((property) => maxPrice === 0 || (property.details.pricePesewas ?? 0) <= maxPrice * 100)
    .sort((a, b) => Number(a.details.availability !== "available") - Number(b.details.availability !== "available") || (a.details.pricePesewas ?? 0) - (b.details.pricePesewas ?? 0)), [properties, offer, propertyType, area, maxPrice]);

  const hasFilters = offer !== "all" || propertyType !== "all" || area !== "all" || maxPrice > 0;
  function clearFilters() {
    setOffer("all");
    setPropertyType("all");
    setArea("all");
    setMaxPrice(0);
  }

  return (
    <>
      <section className="on-dark on-dark-pin relative isolate overflow-hidden bg-green-900 text-cream">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_24%,rgba(199,162,74,0.27),transparent_25%),radial-gradient(circle_at_12%_105%,rgba(14,124,107,0.42),transparent_38%)]" aria-hidden />
        <div className="bg-dotgrid absolute inset-0 opacity-35" aria-hidden />
        <div className="absolute -right-20 top-12 h-56 w-56 rounded-full border border-gold/20" aria-hidden />
        <div className="absolute -right-10 top-22 h-36 w-36 rounded-full border border-gold/20" aria-hidden />
        <Container size="wide" className="relative grid gap-8 py-14 sm:py-18 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)] lg:items-end lg:py-20">
          <div>
            <p className="eyebrow text-gold">Homes, rooms & guest stays</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[0.98] text-cream sm:text-6xl lg:text-7xl">Find your place in Oguaa.</h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-cream/76 sm:text-lg">Long-term homes and short stays from Cape Coast property professionals — clear prices, useful details and a direct way to enquire.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/submit?type=property" className="rounded-full bg-gold-brand px-5 py-2.5 text-sm font-semibold text-green-900 transition-colors hover:bg-gold">List a property</Link>
              <a href="#properties" className="rounded-full border border-cream/30 px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold">Browse places ↓</a>
            </div>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-cream/15 bg-cream/[0.07] backdrop-blur-sm">
            <HeroStat value={properties.length} label="places" />
            <HeroStat value={areas.length} label="areas" />
            <HeroStat value={properties.filter((property) => property.details.availability === "available").length} label="available" />
          </div>
        </Container>
      </section>

      <Container size="wide" className="py-10 sm:py-12">
        <section id="properties" className="scroll-mt-24" aria-labelledby="property-list-title">
          <div className="flex flex-col gap-5 border-b border-sand pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow text-green-text">Browse the directory</p>
              <h2 id="property-list-title" className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">A place for the season you are in</h2>
            </div>
            <div className="inline-flex w-fit rounded-xl border border-sand bg-cream p-1" aria-label="Offer type">
              {(["all", "long-term", "short-stay"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={offer === value} onClick={() => setOffer(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${offer === value ? "bg-green text-on-green shadow-sm" : "text-ink-muted hover:text-ink"}`}>
                  {value === "all" ? "All" : value === "long-term" ? "Rent" : "Short stay"}
                </button>
              ))}
            </div>
          </div>

          <div className="relative z-20 mt-5 flex flex-wrap items-center gap-2">
            <FilterMenu label="Type" value={propertyType === "all" ? "Any property" : PROPERTY_LABELS[propertyType]}>
              <FilterOption selected={propertyType === "all"} onClick={() => setPropertyType("all")}>Any property</FilterOption>
              {(Object.entries(PROPERTY_LABELS) as [PropertyType, string][]).map(([value, label]) => <FilterOption key={value} selected={propertyType === value} onClick={() => setPropertyType(value)}>{label}</FilterOption>)}
            </FilterMenu>
            <FilterMenu label="Area" value={area === "all" ? "Every area" : area}>
              <FilterOption selected={area === "all"} onClick={() => setArea("all")}>Every area</FilterOption>
              {areas.map((value) => <FilterOption key={value} selected={area === value} onClick={() => setArea(value)}>{value}</FilterOption>)}
            </FilterMenu>
            <FilterMenu label="Budget" value={maxPrice === 0 ? "Any price" : `Up to GH₵${maxPrice.toLocaleString("en-GH")}`}>
              <FilterOption selected={maxPrice === 0} onClick={() => setMaxPrice(0)}>Any price</FilterOption>
              {PRICE_CAPS.map((value) => <FilterOption key={value} selected={maxPrice === value} onClick={() => setMaxPrice(value)}>Up to GH₵{value.toLocaleString("en-GH")}</FilterOption>)}
            </FilterMenu>
            {hasFilters && <button type="button" onClick={clearFilters} className="min-h-11 px-3 text-sm font-semibold text-clay-text hover:underline">Clear filters</button>}
            <p className="w-full pt-1 text-sm text-ink-faint sm:ml-auto sm:w-auto sm:pt-0">{shown.length} {shown.length === 1 ? "place" : "places"}</p>
          </div>

          {shown.length > 0 ? (
            <div className="relative z-10 mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{shown.map((property) => <PropertyCard key={property.id} property={property} />)}</div>
          ) : (
            <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-sand bg-cream">
              <EmptyState
                icon={<EmptyGlyph name="building" />}
                title={properties.length === 0 ? "The first keys are waiting" : "No place matches those filters"}
                description={properties.length === 0 ? "Realtors and property managers can add the first verified rooms, homes and guest stays in Oguaa." : "Try a wider budget or clear one of your filters."}
                actions={properties.length === 0
                  ? <Link to="/submit?type=property" className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green">List the first property →</Link>
                  : <button type="button" onClick={clearFilters} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green">Show every place</button>}
              />
            </div>
          )}
        </section>

        <section className="mt-14 grid gap-5 rounded-[var(--radius-card)] border border-gold-border/35 bg-gold/[0.08] p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="eyebrow text-gold-text">For property professionals</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">Put a trustworthy listing in front of Oguaa.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">Show the price, area, amenities and availability clearly. Every submission is reviewed before it appears here.</p>
          </div>
          <Link to="/submit?type=property" className="inline-flex rounded-full bg-green px-6 py-3 text-sm font-semibold text-on-green transition-colors hover:bg-green-900">Add a property →</Link>
        </section>
      </Container>
    </>
  );
}

function HeroStat({ value, label }: Readonly<{ value: number; label: string }>) {
  return (
    <div className="border-r border-cream/12 p-4 text-center last:border-r-0">
      <span className="block text-2xl font-semibold text-cream">{value}</span>
      <span className="mt-1 block text-[0.65rem] font-bold uppercase tracking-[0.14em] text-cream/55">{label}</span>
    </div>
  );
}
