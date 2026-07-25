import { SectionRenderer } from "@/components/profile-sections";
import { Reveal } from "@/components/motion";
import { cldCover } from "@/lib/cloudinary";
import type { Listing, StoreItem } from "@/lib/types";

// price renders integer pesewas as GH₵ with two decimals, or an empty string.
function price(pesewas?: number): string {
  if (!pesewas || pesewas <= 0) return "";
  return `GH₵ ${(pesewas / 100).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A customer-facing window into a Supporter business. The first photograph is
// treated as the shop window; the remaining media forms a compact visual rail.
export function Storefront({ business: b }: Readonly<{ business: Listing }>) {
  const photos = b.photos ?? [];
  const videos = b.videos ?? [];
  const sections = (b.sections ?? []).filter((section) => !section.hidden);
  const products = (b.products ?? []).filter((item) => item.available);
  const services = (b.services ?? []).filter((item) => item.available);
  const primaryContact = b.details.contact?.[0];
  if (photos.length === 0 && videos.length === 0 && sections.length === 0 && products.length === 0 && services.length === 0) return null;

  const [leadPhoto, ...otherPhotos] = photos;

  return (
    <section id="storefront" className="scroll-mt-28 space-y-16" aria-label="Business storefront">
      {(photos.length > 0 || videos.length > 0) && (
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="eyebrow text-gold-text">Inside the business</p>
              <h2 id="storefront-title" className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">The shop window</h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-ink-muted">A closer look at the people, place and work behind {b.title}.</p>
          </div>

          {leadPhoto && (
            <>
              <div className={`mt-7 grid gap-3 ${otherPhotos.length > 0 ? "lg:grid-cols-[1.55fr_0.85fr]" : ""}`}>
                <figure className="group relative min-h-72 overflow-hidden rounded-[var(--radius-card)] bg-green-900 shadow-[var(--shadow-card)] sm:min-h-[28rem]">
                  <img src={cldCover(leadPhoto.url, 1200)} alt={leadPhoto.alt ?? ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.025]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-green-900/75 via-transparent to-transparent" aria-hidden />
                  {leadPhoto.caption && <figcaption className="on-dark-pin absolute inset-x-0 bottom-0 p-5 text-sm text-cream sm:p-7">{leadPhoto.caption}</figcaption>}
                </figure>

                {otherPhotos.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                    {otherPhotos.slice(0, 2).map((photo, index) => (
                      <figure key={photo.id} className="group relative min-h-44 overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
                        <img src={cldCover(photo.url, 700)} alt={photo.alt ?? ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
                        {photo.caption && <figcaption className="on-dark-pin absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10 text-xs text-cream">{photo.caption}</figcaption>}
                        {index === 1 && otherPhotos.length > 2 && <span className="on-dark-pin absolute right-3 top-3 rounded-full bg-green-900/80 px-3 py-1 text-xs font-semibold text-cream backdrop-blur-sm">+{otherPhotos.length - 2} more</span>}
                      </figure>
                    ))}
                  </div>
                )}
              </div>
              {otherPhotos.length > 2 && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {otherPhotos.slice(2).map((photo) => (
                    <figure key={photo.id} className="group relative min-h-52 overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
                      <img src={cldCover(photo.url, 700)} alt={photo.alt ?? ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
                      {photo.caption && <figcaption className="on-dark-pin absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10 text-xs text-cream">{photo.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              )}
            </>
          )}

          {!leadPhoto && videos.length > 0 && (
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {videos.map((video) => (
                <figure key={video.id} className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-green-900 shadow-[var(--shadow-card)]">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user media; caption optional */}
                  <video src={video.url} controls preload="metadata" playsInline className="aspect-video w-full bg-black" />
                  {video.caption && <figcaption className="bg-cream px-4 py-3 text-xs text-ink-muted">{video.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}

          {leadPhoto && videos.length > 0 && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {videos.map((video) => (
                <figure key={video.id} className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-green-900 shadow-[var(--shadow-card)]">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user media; caption optional */}
                  <video src={video.url} controls preload="metadata" playsInline className="aspect-video w-full bg-black" />
                  {video.caption && <figcaption className="bg-cream px-4 py-3 text-xs text-ink-muted">{video.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </Reveal>
      )}

      {sections.length > 0 && (
        <Reveal className="space-y-10 rounded-[var(--radius-card)] border border-sand bg-cream p-6 shadow-[var(--shadow-card)] sm:p-8">
          <SectionRenderer sections={sections} />
        </Reveal>
      )}

      {products.length > 0 && <ProductCatalog items={products} contact={primaryContact} />}
      {services.length > 0 && <ServiceCatalog items={services} contact={primaryContact} />}
    </section>
  );
}

function ProductCatalog({ items, contact }: Readonly<{ items: StoreItem[]; contact?: { label: string; url: string } }>) {
  return (
    <section id="products" className="scroll-mt-28">
      <Reveal>
        <CatalogHeading eyebrow="From the counter" title="Products to take home" count={items.length} copy="Current favourites from this Oguaa storefront. Ask the business directly about availability and collection." />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => {
          const tag = price(item.pricePesewas);
          return (
            <article key={item.id ?? item.name} className="group flex min-h-[23rem] flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition duration-300 hover:-translate-y-1 hover:border-gold-border/50 hover:shadow-[var(--shadow-lift)]">
              <div className="relative aspect-[4/3] overflow-hidden bg-[linear-gradient(145deg,rgba(176,125,50,0.2),rgba(176,80,60,0.1)_48%,rgba(18,63,45,0.14))]">
                {item.imageUrl ? (
                  <img src={cldCover(item.imageUrl, 700)} alt={item.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gold-text">
                    <CatalogGlyph kind="product" />
                  </div>
                )}
                <span className="on-dark-pin absolute left-3 top-3 rounded-full border border-gold/45 bg-green-900/85 px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.16em] !text-gold backdrop-blur-sm">Product {String(index + 1).padStart(2, "0")}</span>
                {tag && <span className="absolute bottom-3 right-3 rounded-full bg-gold-brand px-3 py-1.5 text-sm font-bold text-green-900 shadow-lg">{tag}</span>}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-[0.63rem] font-bold uppercase tracking-[0.17em] text-clay-text">Available from this business</p>
                <h3 className="mt-2 text-xl font-semibold leading-tight text-ink">{item.name}</h3>
                {item.description && <p className="mt-3 text-sm leading-relaxed text-ink-muted">{item.description}</p>}
                <div className="mt-auto flex items-end justify-between gap-3 border-t border-sand pt-4">
                  <p className="text-xs text-ink-faint">{item.unit || "Ask about availability"}</p>
                  {contact ? <a href={contact.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-bold text-green-text transition-colors hover:text-gold-text">Ask to order <span aria-hidden>↗</span></a> : <span className="text-xs font-semibold text-green-text">Enquire directly</span>}
                </div>
              </div>
            </article>
          );
        })}
        </div>
      </Reveal>
    </section>
  );
}

function ServiceCatalog({ items, contact }: Readonly<{ items: StoreItem[]; contact?: { label: string; url: string } }>) {
  return (
    <section id="storefront-services" className="scroll-mt-28">
      <Reveal>
        <CatalogHeading eyebrow="Made around your needs" title="Services you can book" count={items.length} copy="From one-off help to full-scale delivery. Rates are starting points; confirm scope and timing with the business." />
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {items.map((item, index) => {
          const tag = price(item.pricePesewas);
          return (
            <article key={item.id ?? item.name} className="group relative isolate min-h-[18rem] overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-6 shadow-[var(--shadow-card)] transition duration-300 hover:border-teal/45 hover:shadow-[var(--shadow-lift)] sm:p-7">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal via-gold-brand to-clay" aria-hidden />
              <div className="pointer-events-none absolute -bottom-12 -right-10 text-teal opacity-[0.055] transition-transform duration-500 group-hover:-translate-x-2 group-hover:-translate-y-2" aria-hidden><CatalogGlyph kind="service" large /></div>
              <div className="relative flex h-full flex-col">
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-teal/25 bg-teal/[0.08] text-teal-text"><CatalogGlyph kind="service" compact /></span>
                  <span className="text-xs font-bold tabular-nums tracking-[0.16em] text-ink-faint">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-6 max-w-sm text-2xl font-semibold leading-tight text-ink">{item.name}</h3>
                {item.description && <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-muted">{item.description}</p>}
                <div className="mt-auto flex items-end justify-between gap-4 border-t border-sand pt-5">
                  <div>
                    <p className="text-[0.6rem] font-bold uppercase tracking-[0.15em] text-ink-faint">Starting rate</p>
                    <p className="mt-1 text-lg font-bold text-gold-text">{tag || "Quote on request"}</p>
                    {item.unit && <p className="mt-0.5 text-xs text-ink-faint">{item.unit}</p>}
                  </div>
                  {contact && <a href={contact.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green text-lg text-on-green transition-colors hover:bg-gold-brand hover:text-green-900" aria-label={`Ask about ${item.name}`}>↗</a>}
                </div>
              </div>
            </article>
          );
        })}
        </div>
      </Reveal>
    </section>
  );
}

function CatalogHeading({ eyebrow, title, count, copy }: Readonly<{ eyebrow: string; title: string; count: number; copy: string }>) {
  return (
    <div className="flex flex-col gap-5 border-b border-sand pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow text-gold-text">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">{title}</h2>
      </div>
      <div className="flex max-w-md items-start gap-4">
        <span className="flex h-10 min-w-10 items-center justify-center rounded-full bg-green text-sm font-bold text-on-green">{count}</span>
        <p className="text-sm leading-relaxed text-ink-muted">{copy}</p>
      </div>
    </div>
  );
}

function CatalogGlyph({ kind, large = false, compact = false }: Readonly<{ kind: "product" | "service"; large?: boolean; compact?: boolean }>) {
  const size = large ? "h-52 w-52" : compact ? "h-5 w-5" : "h-20 w-20";
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={size} aria-hidden>
      {kind === "product" ? (
        <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /><path d="M8 13h8" /></>
      ) : (
        <><path d="M4 15s2-2 4-2h4a2 2 0 1 1 0 4H9" /><path d="m4 15-2 2 5 5 2-2h6a4 4 0 0 0 2.8-1.2L22 15" /><path d="m17 3 .8 2.2L20 6l-2.2.8L17 9l-.8-2.2L14 6l2.2-.8L17 3Z" /></>
      )}
    </svg>
  );
}
