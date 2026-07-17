import { useRef, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SampleNote } from "@/components/ui";
import { BusinessCard } from "@/components/cards";
import { LayoutPill, StaggerItem } from "@/components/motion";
import { Pagination } from "@/components/pagination";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { SAMPLE_NOTICE } from "@/lib/content";

const PER_PAGE = 12;

export async function loader() {
  return api.businesses();
}

export function Component() {
  const businesses = useLoaderData() as Listing[];
  usePageTitle("Business Directory");
  const [params] = useSearchParams();
  const cat = params.get("cat") ?? undefined;
  const categories = [...new Set(businesses.map((b) => b.details.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  // Supporters float to the top of whichever slice is showing.
  const shown = (cat ? businesses.filter((b) => b.details.category === cat) : businesses)
    .slice()
    .sort((a, b) => Number(!!b.supporter) - Number(!!a.supporter));

  // Numbered pagination over the (client-side) filtered directory. The trade
  // filter is derived from the full set, so we keep loading it whole and page
  // the display; changing trade resets to page 1 (adjust-state-during-render).
  const [page, setPage] = useState(1);
  const [prevCat, setPrevCat] = useState(cat);
  const listRef = useRef<HTMLDivElement>(null);
  if (prevCat !== cat) { setPrevCat(cat); setPage(1); }
  const totalPages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const current = Math.min(page, totalPages);
  const pageItems = shown.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  function goToPage(next: number) {
    setPage(next);
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <PageHero tone="teal" kicker="The working city" title="Business & trade" symbol="crab" image="/uploads/seed/market-women.jpg" lede="From the Kotokuraba market to the fishing harbour and the guesthouses by the Castle — the directory of the working city. Born of the market, still trading.">
        <Cta to="/submit?type=business" variant="gold">List your business</Cta>
      </PageHero>

      <Container size="wide" className="py-12">
        {categories.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-ink-faint">Browse by trade:</span>
            <Link to="/business" className={`relative rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${!cat ? "border-teal text-cream" : "border-sand bg-cream text-ink-muted hover:border-teal"}`}>
              {!cat && <LayoutPill layoutId="biz-cat" className="absolute inset-0 rounded-full bg-teal" />}
              <span className="relative">All</span>
            </Link>
            {categories.map((c) => (
              <Link key={c} to={`/business?cat=${encodeURIComponent(c)}`} className={`relative rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${cat === c ? "border-teal text-cream" : "border-sand bg-cream text-ink-muted hover:border-teal"}`}>
                {cat === c && <LayoutPill layoutId="biz-cat" className="absolute inset-0 rounded-full bg-teal" />}
                <span className="relative">{c}</span>
              </Link>
            ))}
          </div>
        )}

        <div ref={listRef} className="scroll-mt-24">
          <p className="mt-6 text-sm text-ink-faint">{shown.length} {shown.length === 1 ? "business" : "businesses"}{cat ? ` in ${cat}` : ""} · ★ Supporters first</p>

          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{pageItems.map((b, i) => <StaggerItem key={b.id} index={i} lift><BusinessCard business={b} /></StaggerItem>)}</div>
          {shown.length === 0 && (
            <EmptyState
              icon={<EmptyGlyph name="building" />}
              title="No businesses here yet"
              actions={<Link to="/submit?type=business" className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green">List yours →</Link>}
            />
          )}
          <Pagination page={current} totalPages={totalPages} onPageChange={goToPage} />
        </div>
      </Container>

      <section className="on-dark on-dark-pin bg-green py-14 text-cream">
        <Container size="narrow" className="text-center">
          <h2 className="text-3xl font-semibold">Open for trade in Oguaa?</h2>
          <p className="mx-auto mt-3 max-w-lg text-cream/80">List your business free — or become a Supporter for the gold badge and priority placement across the directory.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Cta to="/submit?type=business" variant="gold">List your business</Cta>
            <Cta to="/community" variant="outline-dark">How it works</Cta>
          </div>
        </Container>
      </section>

      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </>
  );
}
