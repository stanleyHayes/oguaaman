import { SectionRenderer } from "@/components/profile-sections";
import { Reveal } from "@/components/motion";
import { cldCover } from "@/lib/cloudinary";
import type { Listing } from "@/lib/types";

// A customer-facing window into a Supporter business. The first photograph is
// treated as the shop window; the remaining media forms a compact visual rail.
export function Storefront({ business: b }: Readonly<{ business: Listing }>) {
  const photos = b.photos ?? [];
  const videos = b.videos ?? [];
  const sections = (b.sections ?? []).filter((section) => !section.hidden);
  if (photos.length === 0 && videos.length === 0 && sections.length === 0) return null;

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
    </section>
  );
}
