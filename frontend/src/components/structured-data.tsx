import { useEffect } from "react";
import type { Listing, StoreItem } from "@/lib/types";
import { CITIZEN_URL } from "@/lib/app-urls";

/**
 * Schema.org structured data for shops and their products.
 *
 * This is what lets a Cape Coast trader's stock appear as a product result
 * rather than as an anonymous line inside a page. Google reads it, but only
 * after two other things are true: the page has its own URL (products are given
 * one at /business/:slug/p/:id), and that URL is discoverable (the API emits a
 * dynamic sitemap covering them). Structured data on an undiscoverable page
 * earns nothing, which is why it is the last of the three to be added.
 *
 * Rendered client-side. Google executes JavaScript and picks this up, though
 * SPA pages queue for a second rendering pass and so index more slowly than
 * server-rendered ones. The alternative — serving different markup to crawlers
 * by user-agent — is cloaking, and would risk the whole domain.
 *
 * Illustrative listings emit nothing at all: publishing an invented shop's
 * name, address and prices as structured fact is a guidelines violation.
 */

const CURRENCY = "GHS";
const abs = (path: string) => (path.startsWith("http") ? path : `${CITIZEN_URL}${path}`);

function JsonLd({ data }: Readonly<{ data: unknown }>) {
  // A string child rather than dangerouslySetInnerHTML: React escapes it as
  // text, so no markup can be injected even if a trader puts "<script>" in a
  // product name. `<` is additionally escaped as < because that is the one
  // sequence that could otherwise close this element early — and it stays valid
  // JSON either way.
  return (
    <script type="application/ld+json">
      {JSON.stringify(data).replace(/</g, "\\u003c")}
    </script>
  );
}

/** Price in major units, as Schema.org expects (pesewas are 1/100 of a cedi). */
const cedis = (pesewas?: number) => (pesewas && pesewas > 0 ? (pesewas / 100).toFixed(2) : undefined);

function offerFor(item: StoreItem, url: string) {
  const price = cedis(item.pricePesewas);
  return {
    "@type": "Offer",
    url,
    ...(price ? { price, priceCurrency: CURRENCY } : {}),
    availability: item.available
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
  };
}

/** LocalBusiness for a shop's page, with its catalogue and rating. */
export function BusinessStructuredData({ business: b }: Readonly<{ business: Listing }>) {
  if (b.demo || b.status !== "approved") return null;

  const url = abs(`/business/${b.slug}`);
  const d = b.details ?? {};
  const ratingCount = Number(d.ratingCount ?? 0);
  const ratingAvg = Number(d.ratingAvg ?? 0);

  const data = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${url}#business`,
    name: b.title,
    url,
    ...(b.coverImageUrl ? { image: abs(b.coverImageUrl) } : {}),
    ...(d.description ? { description: String(d.description) } : {}),
    // Only claim an address when the trader actually gave one. An invented or
    // guessed address is worse than none: it is a structured-data violation and
    // it sends people to the wrong door.
    ...(d.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: String(d.address),
            addressLocality: "Cape Coast",
            addressRegion: "Central Region",
            addressCountry: "GH",
          },
        }
      : {}),
    ...(b.latitude != null && b.longitude != null
      ? { geo: { "@type": "GeoCoordinates", latitude: b.latitude, longitude: b.longitude } }
      : {}),
    ...(d.openingHours ? { openingHours: String(d.openingHours) } : {}),
    ...(ratingCount > 0 && ratingAvg > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: ratingAvg,
            reviewCount: ratingCount,
          },
        }
      : {}),
    ...((b.products ?? []).length > 0
      ? {
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: `${b.title} — products`,
            itemListElement: (b.products ?? [])
              .filter((p) => p.available)
              .map((p) => ({
                "@type": "Offer",
                itemOffered: { "@type": "Product", name: p.name },
                ...(cedis(p.pricePesewas) ? { price: cedis(p.pricePesewas), priceCurrency: CURRENCY } : {}),
              })),
          },
        }
      : {}),
  };
  return <JsonLd data={data} />;
}

/** Product + Offer for one item, on its own page. */
export function ProductStructuredData({
  business: b,
  item,
}: Readonly<{ business: Listing; item: StoreItem }>) {
  if (b.demo || b.status !== "approved") return null;

  const businessUrl = abs(`/business/${b.slug}`);
  const url = `${businessUrl}/p/${item.id}`;
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: item.name,
    url,
    ...(item.description ? { description: item.description } : {}),
    ...(b.coverImageUrl ? { image: abs(b.coverImageUrl) } : {}),
    brand: { "@type": "Brand", name: b.title },
    offers: {
      ...offerFor(item, url),
      seller: { "@type": "LocalBusiness", "@id": `${businessUrl}#business`, name: b.title },
    },
  };
  return <JsonLd data={data} />;
}

/**
 * Tells crawlers not to index a page.
 *
 * Used for illustrative listings, so invented content can exist as a preview
 * without ever entering an index.
 *
 * Written into <head> from an effect rather than returned as JSX. React 19 does
 * hoist a rendered <meta>, but it would only ADD one: index.html already ships
 * `robots: index, follow`, and two conflicting robots tags is undefined
 * behaviour. This takes over the existing tag and restores its previous value on
 * unmount, so navigating from an illustrative listing to a real one does not
 * leave the entire SPA marked noindex — which is the failure that would be both
 * catastrophic and completely invisible.
 *
 * Mirrors how usePageTitle already manages the head.
 */
export function NoIndex() {
  useEffect(() => {
    const existing = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = existing?.content ?? null;
    const tag = existing ?? document.head.appendChild(document.createElement("meta"));
    tag.name = "robots";
    tag.content = "noindex, nofollow";
    return () => {
      // Restore whatever the document declared before, so navigating away from
      // a demo listing does not leave the whole SPA marked noindex.
      if (previous === null) tag.remove();
      else tag.content = previous;
    };
  }, []);
  return null;
}
