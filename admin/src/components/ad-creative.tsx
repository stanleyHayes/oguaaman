import { useState } from "react";
import type { AdCampaign } from "@/lib/types";
import { cld } from "@/lib/cloudinary";

// Staff see the ad exactly as the portal's ad slot draws it (frontend
// components/ad-slot.tsx AdFrame): a sand frame with a gold hairline, a square
// flag with the chip text ("Ad" / "Political ad") and the word
// "Advertisement", the ⓘ "Why am I seeing this ad?" mark, then the sponsor
// line and the AI-media notice under the creative. Ads must never look like
// news (AAG Code Art. 13): no purple, no motion, no news-card component.

const FILL = "f_auto,q_auto";
const sized = (url: string | undefined, w: number, h: number) => cld(url, `c_fill,w_${w * 2},h_${h * 2},${FILL}`);

type AdLike = Pick<AdCampaign, "political" | "sponsorLine" | "creative" | "placement"> & { electionName?: string };

/** The frame every ad sits in (same classes as the portal's AdFrame). */
const FRAME =
  "relative rounded-md border border-gold-border/45 bg-sand/50 shadow-[0_10px_26px_-18px_color-mix(in_oklab,var(--color-gold-text)_45%,transparent)]";

/** The chip the API sends with the slate: readers see exactly this text. */
function flagText(political: boolean): string {
  return political ? "Political ad" : "Ad";
}

/** The flag row's left side: the square chip, then "Advertisement" (always shown, wraps when narrow). */
function Flag({ political }: Readonly<{ political: boolean }>) {
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex shrink-0 items-center rounded-none bg-ink px-1.5 py-[3px] text-[0.62rem] font-bold uppercase leading-none tracking-[0.14em] text-paper">
        {flagText(political)}
      </span>
      <span className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-ink-muted">Advertisement</span>
    </p>
  );
}

/** The portal's ⓘ, drawn as it is in previews (not a control here). */
function WhyMark() {
  return (
    <span aria-hidden title="Why am I seeing this ad?" className="grid size-7 shrink-0 place-items-center text-ink-faint">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 7.5h.01" />
      </svg>
    </span>
  );
}

function FlagRow({ political }: Readonly<{ political: boolean }>) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 pl-2.5 pr-2.5 sm:pl-3">
      <Flag political={political} />
      <WhyMark />
    </div>
  );
}

/** Image with a reserved box: nothing shifts while it loads, and a sand
 *  field (with the alt text) stands in if it fails. */
function SlotImage({ src, alt, ratio, className = "" }: Readonly<{ src?: string; alt: string; ratio: string; className?: string }>) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative w-full overflow-hidden rounded-[3px] bg-sand ${className}`} style={{ aspectRatio: ratio }}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center px-3 text-center text-xs text-ink-faint">{src ? "Image didn't load" : "No image"}</span>
      )}
    </div>
  );
}

/** Under the creative: the sponsor line exactly as sent, then the AI-media notice. */
function SponsorLines({ ad }: Readonly<{ ad: AdLike }>) {
  return (
    <div className="mt-2 space-y-0.5">
      <p className="text-xs font-medium text-ink-muted">{ad.sponsorLine || "Sponsor line is set on approval"}</p>
      {ad.creative.containsSyntheticMedia && <p className="text-xs text-ink-muted">Contains AI-generated or altered media</p>}
    </div>
  );
}

function BannerPreview({ ad }: Readonly<{ ad: AdLike }>) {
  const c = ad.creative;
  return (
    <div className="grid gap-4">
      <figure className="min-w-0">
        <figcaption className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">Desktop · 728×90</figcaption>
        <div className={`${FRAME} max-w-[760px]`}>
          <FlagRow political={ad.political} />
          <div className="px-2.5 pb-2.5 sm:px-3">
            <SlotImage src={sized(c.imageUrlDesktop, 728, 90)} alt={c.alt} ratio="728 / 90" className="mx-auto max-w-[728px]" />
            <SponsorLines ad={ad} />
          </div>
        </div>
      </figure>
      <figure className="min-w-0">
        <figcaption className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">Mobile · 320×100</figcaption>
        <div className={`${FRAME} max-w-[22rem]`}>
          <FlagRow political={ad.political} />
          <div className="px-2.5 pb-2.5 sm:px-3">
            <SlotImage src={sized(c.imageUrlMobile, 320, 100)} alt={c.alt} ratio="320 / 100" className="mx-auto max-w-[320px]" />
            <SponsorLines ad={ad} />
          </div>
        </div>
      </figure>
    </div>
  );
}

function CardPreview({ ad, compact }: Readonly<{ ad: AdLike; compact?: boolean }>) {
  const c = ad.creative;
  return (
    <div className={`${FRAME} ${compact ? "max-w-xs" : "max-w-md"}`}>
      <FlagRow political={ad.political} />
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <SlotImage src={sized(c.imageUrl, 600, 314)} alt={c.alt} ratio="1200 / 628" />
        <div className="mt-3 min-w-0">
          {c.headline && <p className="text-[0.98rem] font-medium leading-snug text-ink">{c.headline}</p>}
          {c.body && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{c.body}</p>}
          <p className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-green-text">
            Visit the advertiser <span aria-hidden>↗</span>
          </p>
        </div>
        <SponsorLines ad={ad} />
      </div>
    </div>
  );
}

function RectPreview({ ad }: Readonly<{ ad: AdLike }>) {
  const c = ad.creative;
  return (
    <div className={`${FRAME} w-full max-w-[20rem]`}>
      <FlagRow political={ad.political} />
      <div className="px-2.5 pb-2.5">
        <SlotImage src={sized(c.imageUrl, 300, 250)} alt={c.alt} ratio="300 / 250" className="mx-auto max-w-[300px]" />
        <SponsorLines ad={ad} />
      </div>
    </div>
  );
}

/**
 * The creative rendered as its slot renders it, with the reader-facing labels.
 * The election name is shown in the ad's details, not inside the slot.
 */
export function AdSlotPreview({ ad, compact = false }: Readonly<{ ad: AdLike; compact?: boolean }>) {
  if (ad.creative.format === "banner") return <BannerPreview ad={ad} />;
  if (ad.creative.format === "rect") return <RectPreview ad={ad} />;
  return <CardPreview ad={ad} compact={compact} />;
}

/** A small, fixed-size thumbnail for queue rows (aspect follows the format). */
export function AdThumb({ ad }: Readonly<{ ad: Pick<AdCampaign, "creative"> }>) {
  const c = ad.creative;
  const src = c.format === "banner" ? c.imageUrlDesktop ?? c.imageUrlMobile : c.imageUrl;
  const box = c.format === "banner" ? "h-6 w-[7.5rem]" : c.format === "rect" ? "h-12 w-[3.6rem]" : "h-12 w-[5.75rem]";
  const w = c.format === "banner" ? 240 : 184;
  const [failed, setFailed] = useState(false);
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-[4px] border border-gold-border/40 bg-sand ${box}`}>
      {src && !failed && (
        <img src={cld(src, `c_fill,w_${w},${FILL}`)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}
