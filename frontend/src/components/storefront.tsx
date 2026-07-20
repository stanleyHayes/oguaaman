import { SectionRenderer } from "@/components/profile-sections";
import { Reveal } from "@/components/motion";
import { cldCover } from "@/lib/cloudinary";
import type { Listing } from "@/lib/types";

// Storefront renders a business's Supporter storefront: a device-uploaded photo
// + video gallery and the owner-composed profile sections (reusing the same
// SectionRenderer that powers institution pages). Renders nothing when empty.
export function Storefront({ business: b }: Readonly<{ business: Listing }>) {
  const photos = b.photos ?? [];
  const videos = b.videos ?? [];
  const sections = (b.sections ?? []).filter((s) => !s.hidden);
  if (photos.length === 0 && videos.length === 0 && sections.length === 0) return null;

  return (
    <>
      {(photos.length > 0 || videos.length > 0) && (
        <Reveal as="section" className="scroll-mt-24">
          <p className="eyebrow text-teal-text">The storefront</p>
          <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">Gallery</h2>
          <div className="mt-4 h-1 w-16 rounded-full bg-teal" aria-hidden />

          {photos.length > 0 && (
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((p) => (
                <figure key={p.id} className="group overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
                  <img
                    src={cldCover(p.url, 800)}
                    alt={p.alt ?? ""}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                  {p.caption && <figcaption className="px-3 py-2 text-xs text-ink-muted">{p.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}

          {videos.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {videos.map((v) => (
                <figure key={v.id} className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-ink shadow-[var(--shadow-card)]">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user media; caption optional */}
                  <video src={v.url} controls preload="metadata" playsInline className="aspect-video w-full bg-black" />
                  {v.caption && <figcaption className="bg-cream px-3 py-2 text-xs text-ink-muted">{v.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </Reveal>
      )}

      {sections.length > 0 && <SectionRenderer sections={sections} />}
    </>
  );
}
