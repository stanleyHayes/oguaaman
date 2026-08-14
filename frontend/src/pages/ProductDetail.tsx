import { useState } from "react";
import { Link, useLoaderData, useParams, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing, StoreItem } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, CTA as Cta, Pill } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { ProductStructuredData, NoIndex } from "@/components/structured-data";
import { completePayment } from "@/lib/paystack";
import { affiliateCodeFromLocation } from "@/lib/affiliate-attribution";

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
  const [business, commerce] = await Promise.all([api.business(params.slug!), api.businessCommerceStatus(params.slug!).catch(() => ({ enabled: false }))]);
  return { business, commerceEnabled: commerce.enabled };
}

const cedis = (pesewas: number) =>
  "GH₵ " + (pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 });

export function Component() {
  const { business, commerceEnabled } = useLoaderData() as { business: Listing; commerceEnabled: boolean };
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
  return <ProductPage business={business} item={item} priceless={priceless} commerceEnabled={commerceEnabled} />;
}

function ProductPage({ business, item, priceless, commerceEnabled }: Readonly<{ business: Listing; item: StoreItem; priceless: boolean; commerceEnabled: boolean }>) {
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [affiliateCode] = useState(() => affiliateCodeFromLocation());
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  async function buy() {
    setBusy(true); setCheckoutError("");
    try {
      const payment = await api.startOrder(business.slug, { buyerName, buyerEmail, buyerPhone, fulfilment, deliveryAddress, couponCode, affiliateCode, lines: [{ productId: item.id!, quantity }] });
      await completePayment(payment, { onSuccess: async () => { window.location.assign(`/business/${business.slug}/order?reference=${encodeURIComponent(payment.reference)}`); } });
    } catch (error) { setCheckoutError(error instanceof Error ? error.message : "Could not start checkout."); }
    finally { setBusy(false); }
  }

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
              Payments are verified by Oguaa and split automatically through Paystack. The shop receives its proceeds directly, less the disclosed platform fee.
            </p>
          </div>
          {!priceless && item.available && commerceEnabled && <div className="mt-6 rounded-[var(--radius-card)] border border-gold-border/35 bg-paper p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-text">Buy securely</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Order from {business.title}</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <input aria-label="Your name" placeholder="Your name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="rounded-lg border border-sand bg-cream px-3 py-2.5" />
              <input aria-label="Email receipt" type="email" placeholder="Email for receipt" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} className="rounded-lg border border-sand bg-cream px-3 py-2.5" />
              <input aria-label="Phone number" placeholder="Phone number" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} className="rounded-lg border border-sand bg-cream px-3 py-2.5" />
              <input aria-label="Quantity" type="number" min={1} max={20} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value))))} className="rounded-lg border border-sand bg-cream px-3 py-2.5" />
              <select aria-label="Fulfilment" value={fulfilment} onChange={(e) => setFulfilment(e.target.value as "pickup" | "delivery")} className="rounded-lg border border-sand bg-cream px-3 py-2.5"><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select>
              <input aria-label="Coupon code" placeholder="Coupon code (optional)" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} className="rounded-lg border border-sand bg-cream px-3 py-2.5 uppercase" />
              {affiliateCode && <p className="self-center text-sm text-teal-text">Affiliate referral: {affiliateCode}</p>}
              {fulfilment === "delivery" && <textarea aria-label="Delivery address" placeholder="Delivery address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} className="sm:col-span-2 rounded-lg border border-sand bg-cream px-3 py-2.5" />}
            </div>
            {checkoutError && <p role="alert" className="mt-3 text-sm text-clay-text">{checkoutError}</p>}
            <button type="button" disabled={busy || !buyerName || !buyerEmail || !buyerPhone || (fulfilment === "delivery" && !deliveryAddress)} onClick={buy} className="mt-5 min-h-11 rounded-full bg-green px-6 font-semibold text-on-green disabled:opacity-50">{busy ? "Opening Paystack…" : `Pay ${cedis(item.pricePesewas! * quantity)}`}</button>
            <p className="mt-3 text-xs text-ink-faint">Final discount and fee allocation are calculated securely by the server before Paystack opens.</p>
          </div>}
          {!commerceEnabled && <p className="mt-5 rounded-lg border border-sand bg-cream p-4 text-sm text-ink-muted">Online checkout will appear after this business completes Oguaa verification. You can still contact the shop directly.</p>}
        </div>
      </Container>
    </>
  );
}
