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
  if (photos.length === 0 && videos.length === 0 && sections.length === 0 && products.length === 0 && services.length === 0) return null;

  const [leadPhoto, ...otherPhotos] = photos;

  return (
    <section className="scroll-mt-24 space-y-12" aria-label="Business storefront">
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

      {products.length > 0 && <StoreCatalog title="Products" eyebrow="What they sell" items={products} />}
      {services.length > 0 && <StoreCatalog title="Services" eyebrow="What they offer" items={services} />}
    </section>
  );
}

// StoreCatalog renders a business's products or services as a card grid.
function StoreCatalog({ title, eyebrow, items }: Readonly<{ title: string; eyebrow: string; items: StoreItem[] }>) {
  return (
    <Reveal>
      <p className="eyebrow text-gold-text">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">{title}</h2>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const tag = price(item.pricePesewas);
          return (
            <article key={item.id ?? item.name} className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
              {item.imageUrl && (
                <img src={cldCover(item.imageUrl, 600)} alt={item.name} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              )}
              <div className="flex flex-1 flex-col p-4">
                <h3 className="text-base font-semibold text-ink">{item.name}</h3>
                {item.description && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{item.description}</p>}
                {tag && (
                  <p className="mt-auto pt-3 text-sm font-semibold text-clay-text">
                    {tag}{item.unit ? <span className="font-normal text-ink-faint"> · {item.unit}</span> : null}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </Reveal>
  );
}
