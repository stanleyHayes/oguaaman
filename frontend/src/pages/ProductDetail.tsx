import { Link, useLoaderData, useParams, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing, StoreItem } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, CTA as Cta, Pill } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { ProductStructuredData, NoIndex } from "@/components/structured-data";

/**
 * One product from a shop's catalogue, at its own URL.
 *
 * A product used to exist only as a row inside the business document, with no
 * address of its own — and a thing with no URL cannot be a search result,
 * however good its structured data. This page is what makes a trader's stock
 * findable: it is listed in the dynamic sitemap and carries Product + Offer
 * JSON-LD naming the shop as seller.
 */
export async function loader({ params }: LoaderFunctionArgs) {
  return api.business(params.slug!);
}

const cedis = (pesewas: number) =>
  "GH₵ " + (pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 });

export function Component() {
  const business = useLoaderData() as Listing;
  const { productId } = useParams();
  const item: StoreItem | undefined = (business.products ?? []).find((p) => p.id === productId);

  usePageTitle(item ? `${item.name} · ${business.title}` : business.title);

  if (!item) {
    return (
      <Container className="py-20">
        <EmptyState
          icon={<EmptyGlyph name="inbox" />}
          title="That item is no longer listed"
          description={`${business.title} may have removed it or renamed it. The rest of the shop is still here.`}
          actions={<Cta to={`/business/${business.slug}`} variant="gold">Back to {business.title}</Cta>}
        />
      </Container>
    );
  }

  const priceless = !item.pricePesewas || item.pricePesewas <= 0;

  return (
    <>
      {/* Illustrative shops are never offered to a search engine. */}
      {business.demo ? <NoIndex /> : <ProductStructuredData business={business} item={item} />}

      <section className="on-dark on-dark-pin bg-green text-cream">
        <Container className="py-10">
          <nav aria-label="Breadcrumb" className="text-sm text-cream/70">
            <Link to="/business" className="hover:text-gold">Business</Link>
            <span className="mx-2" aria-hidden>›</span>
            <Link to={`/business/${business.slug}`} className="hover:text-gold">{business.title}</Link>
          </nav>
          <h1 className="mt-3 text-4xl font-semibold text-cream sm:text-5xl">{item.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!priceless && (
              <span className="text-2xl font-semibold text-gold">
                {cedis(item.pricePesewas!)}{item.unit ? <span className="ml-1 text-base font-normal text-cream/70">{item.unit}</span> : null}
              </span>
            )}
            <Pill tone={item.available ? "green" : "clay"}>{item.available ? "Available" : "Not available"}</Pill>
          </div>
        </Container>
      </section>

      <Container className="grid gap-8 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Thumb
            seed={item.id ?? item.name}
            label={item.name}
            src={item.imageUrl ?? business.coverImageUrl}
            className="aspect-[4/3] w-full rounded-[var(--radius-card)]"
            coverWidth={900}
          />
        </div>
        <div>
          {item.description && <p className="text-lg leading-relaxed text-ink">{item.description}</p>}
          <div className="mt-8 rounded-[var(--radius-card)] border border-sand bg-cream p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">Sold by</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{business.title}</h2>
            {business.details?.address && (
              <p className="mt-1 text-sm text-ink-muted">{String(business.details.address)}</p>
            )}
            {business.details?.openingHours && (
              <p className="mt-1 text-sm text-ink-muted">{String(business.details.openingHours)}</p>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <Cta to={`/business/${business.slug}`} variant="gold">Visit the shop</Cta>
              {/* Contact goes to whatever the trader published — usually WhatsApp.
                  Oguaaman does not take the order or the payment. */}
              {(business.details?.contact as { label: string; url: string }[] | undefined)?.slice(0, 1).map((c) => (
                <a
                  key={c.url}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center rounded-full border border-green px-5 text-sm font-semibold text-green-text hover:bg-green/[0.06]"
                >
                  {c.label}
                </a>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-faint">
              Oguaaman lists this item for the shop. Arrange payment and collection with {business.title} directly.
            </p>
          </div>
        </div>
      </Container>
    </>
  );
}
