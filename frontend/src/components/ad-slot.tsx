import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { adFillExpected, adImage, afterPaint, markAdSeen, newViewId, pickAd, PLACEMENT_FORMAT, rememberAdFill } from "@/lib/ads";
import { LEGAL } from "@/lib/legal";
import type { AdFormat, AdPlacementSlug, AdSlateAd } from "@/lib/types";
import { ReportButton } from "./report-button";

// Paid ads (spec §3.9). Ads must never look like news (AAG Code Art. 13): they
// sit on a sand surface inside a gold hairline frame, carry a square "Ad" flag
// and the sponsor line verbatim from the API, and never use the news card or
// its type scale. Nothing inside an ad animates, and a failed or empty slate
// renders nothing at all — an ad must never break a page.

/** What the frame needs to draw an ad. A slate ad fits; so does a wizard preview. */
export type AdDisplay = Pick<AdSlateAd, "format" | "imageUrl" | "imageUrlDesktop" | "imageUrlMobile" | "headline" | "body" | "alt" | "chip" | "sponsorLine" | "political" | "electionName" | "syntheticMedia"> & {
  /** The tracked click link. Omitted in previews, which never link out. */
  clickUrl?: string;
  /** Campaign id, for "Report this ad". */
  id?: string;
};

const INFO_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 7.5h.01" />
  </svg>
);

/** The "Why am I seeing this ad?" control and its panel. */
function WhyThisAd({ ad, why, preview }: Readonly<{ ad: AdDisplay; why: string; preview: boolean }>) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative -my-2 -mr-2">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Why am I seeing this ad?"
        title="Why am I seeing this ad?"
        className="grid h-11 w-11 place-items-center rounded-full text-ink-faint transition-colors hover:bg-gold/[0.12] hover:text-ink focus-visible:text-ink active:translate-y-px"
      >
        {INFO_ICON}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Why am I seeing this ad?"
          className="absolute right-0 top-full z-40 mt-1 w-[19rem] max-w-[calc(100vw-2.5rem)] rounded-[var(--radius-card)] border border-sand bg-paper p-4 text-left text-sm text-ink shadow-[var(--shadow-lift)]"
        >
          <p className="font-semibold text-ink">Why am I seeing this ad?</p>
          <p className="mt-2 text-pretty leading-relaxed text-ink-muted">
            This ad is shown to everyone who views {why}. Oguaa doesn&rsquo;t use your profile, location, reading history or any tracking to choose ads.
          </p>
          <p className="mt-3 border-t border-sand pt-3 text-xs font-medium text-ink">{ad.sponsorLine}</p>
          {ad.political && (
            <div className="mt-2 space-y-1 text-xs text-ink-muted">
              {ad.electionName && <p>Election: {ad.electionName}</p>}
              <Link to={LEGAL.advertising} className="inline-flex min-h-11 items-center font-semibold text-teal-text underline-offset-2 hover:underline">
                Read the Advertising Policy
              </Link>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-sand pt-3">
            {!preview && ad.id ? <ReportButton target={{ type: "ad", id: ad.id }} label="Report this ad" /> : <span className="text-xs text-ink-faint">Report this ad</span>}
            <Link to="/ads/library" className="inline-flex min-h-11 items-center text-xs font-semibold text-teal-text underline-offset-2 hover:underline">
              See all political ads
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** A creative image with a sand ground while it loads; the box is sized by its parent. */
function CreativeImage({ src, alt, onError }: Readonly<{ src?: string; alt: string; onError?: () => void }>) {
  if (!src) return <span aria-hidden className="block h-full w-full bg-dotgrid" />;
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={onError} className="h-full w-full object-cover" />;
}

/** Which banner image a preview shows; live slots follow the viewport. */
export type BannerVariant = "desktop" | "mobile";

function BannerCreative({ ad, onError, variant }: Readonly<{ ad: AdDisplay; onError?: () => void; variant?: BannerVariant }>) {
  if (variant) {
    const desktop = variant === "desktop";
    return (
      <span className={`mx-auto block w-full overflow-hidden rounded-[3px] bg-sand ${desktop ? "aspect-[728/90] max-w-[728px]" : "aspect-[320/100] max-w-[320px]"}`}>
        <CreativeImage src={desktop ? adImage(ad.imageUrlDesktop, 728, 90) : adImage(ad.imageUrlMobile, 320, 100)} alt={ad.alt} onError={onError} />
      </span>
    );
  }
  return (
    <span className="mx-auto block aspect-[320/100] w-full max-w-[728px] overflow-hidden rounded-[3px] bg-sand md:aspect-[728/90]">
      <picture>
        {ad.imageUrlDesktop && <source media="(min-width: 768px)" srcSet={adImage(ad.imageUrlDesktop, 728, 90)} />}
        <CreativeImage src={adImage(ad.imageUrlMobile ?? ad.imageUrlDesktop, 320, 100)} alt={ad.alt} onError={onError} />
      </picture>
    </span>
  );
}

function RectCreative({ ad, onError }: Readonly<{ ad: AdDisplay; onError?: () => void }>) {
  return (
    <span className="mx-auto block aspect-[300/250] w-full max-w-[300px] overflow-hidden rounded-[3px] bg-sand">
      <CreativeImage src={adImage(ad.imageUrl, 300, 250)} alt={ad.alt} onError={onError} />
    </span>
  );
}

function CardCreative({ ad, linked, onError }: Readonly<{ ad: AdDisplay; linked: boolean; onError?: () => void }>) {
  return (
    <span className="grid gap-3 @lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] @3xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] @lg:items-center @lg:gap-5">
      <span className="block aspect-[1200/628] w-full overflow-hidden rounded-[3px] bg-sand">
        <CreativeImage src={adImage(ad.imageUrl, 600, 314)} alt={ad.alt} onError={onError} />
      </span>
      <span className="block min-w-0">
        {ad.headline && (
          <span className="block text-[0.98rem] font-medium leading-snug text-ink decoration-gold-border/70 underline-offset-[3px] group-hover:underline">
            {ad.headline}
          </span>
        )}
        {ad.body && <span className="mt-1 block text-sm leading-relaxed text-ink-muted">{ad.body}</span>}
        {linked && (
          <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-green-text">
            Visit the advertiser <span aria-hidden>↗</span>
          </span>
        )}
      </span>
    </span>
  );
}

function Creative({ ad, linked, onError, variant }: Readonly<{ ad: AdDisplay; linked: boolean; onError?: () => void; variant?: BannerVariant }>) {
  if (ad.format === "banner") return <BannerCreative ad={ad} onError={onError} variant={variant} />;
  if (ad.format === "rect") return <RectCreative ad={ad} onError={onError} />;
  return <CardCreative ad={ad} linked={linked} onError={onError} />;
}

const FRAME_PAD: Record<AdFormat, string> = {
  banner: "px-2.5 pb-2.5 sm:px-3",
  card: "px-3 pb-3 sm:px-4 sm:pb-4",
  rect: "px-2.5 pb-2.5",
};

/** The frame every ad sits in: sand ground, gold hairline, a warm shadow from the theme's gold. */
const FRAME_BOX =
  "@container relative rounded-md border border-gold-border/45 bg-sand/50 shadow-[0_10px_26px_-18px_color-mix(in_oklab,var(--color-gold-text)_45%,transparent)]";

/** The flag row's left side: the API's chip text verbatim, then the word "Advertisement". */
function AdLabel({ chip }: Readonly<{ chip: string }>) {
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex shrink-0 items-center rounded-none bg-ink px-1.5 py-[3px] text-[0.62rem] font-bold uppercase leading-none tracking-[0.14em] text-paper">
        {chip}
      </span>
      <span className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-ink-muted">Advertisement</span>
    </p>
  );
}

/**
 * One ad, drawn exactly as it runs: the flag row, the creative (a tracked link
 * that opens in a new tab), the sponsor line and the synthetic-media notice.
 * `preview` draws the same frame without the link, beacon or report — the
 * wizard and the campaign page use it to show the real slot.
 */
export function AdFrame({
  ad,
  why,
  preview = false,
  creativeRef,
  onImageError,
  bannerVariant,
  className = "",
}: Readonly<{
  ad: AdDisplay;
  why: string;
  preview?: boolean;
  creativeRef?: RefObject<HTMLElement | null>;
  onImageError?: () => void;
  /** Previews only: draw the desktop or the phone banner regardless of screen width. */
  bannerVariant?: BannerVariant;
  className?: string;
}>) {
  const linked = !preview && Boolean(ad.clickUrl);
  const inner: ReactNode = <Creative ad={ad} linked={linked} onError={onImageError} variant={bannerVariant} />;
  return (
    <aside
      aria-label={ad.political ? "Political advertisement" : "Advertisement"}
      className={`${FRAME_BOX} transition-[border-color] duration-200 has-[a:hover]:border-gold-border ${className}`}
    >
      <div className="flex items-center justify-between gap-2 py-2 pl-2.5 pr-2.5 sm:pl-3">
        <AdLabel chip={ad.chip} />
        {preview ? (
          <span className="grid h-7 w-7 place-items-center text-ink-faint" aria-hidden>{INFO_ICON}</span>
        ) : (
          <WhyThisAd ad={ad} why={why} preview={preview} />
        )}
      </div>
      <div className={FRAME_PAD[ad.format]}>
        {linked ? (
          <a
            ref={creativeRef as RefObject<HTMLAnchorElement | null> | undefined}
            href={ad.clickUrl}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="group block rounded-[3px] outline-offset-4 active:translate-y-px"
          >
            {inner}
          </a>
        ) : (
          <div ref={creativeRef as RefObject<HTMLDivElement | null> | undefined}>{inner}</div>
        )}
        <div className="mt-2 space-y-0.5">
          <p className="text-xs font-medium text-ink-muted">{ad.sponsorLine}</p>
          {ad.syntheticMedia && <p className="text-xs text-ink-muted">Contains AI-generated or altered media</p>}
        </div>
      </div>
    </aside>
  );
}

/**
 * Counts one viewable impression (spec §3.9): at least half of the creative in
 * view for one continuous second while the page is visible. Fires once.
 */
function useViewableImpression(ref: RefObject<HTMLElement | null>, enabled: boolean, onViewable: () => void) {
  const fire = useEffectEvent(onViewable);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === "undefined") return;
    let timer: number | undefined;
    let inView = false;
    let done = false;
    const stop = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const start = () => {
      if (done || timer !== undefined || document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => {
        done = true;
        timer = undefined;
        fire();
      }, 1000);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) inView = e.isIntersecting && e.intersectionRatio >= 0.5;
        if (inView) start();
        else stop();
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") stop();
      else if (inView) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ref, enabled]);
}

/** A bar standing in for a line of text in the placeholder. */
function Bar({ className }: Readonly<{ className: string }>) {
  return <span className={`block rounded-[2px] bg-ink/[0.06] ${className}`} />;
}

/** The creative's box at its final size, empty. */
function PlaceholderCreative({ format }: Readonly<{ format: AdFormat }>) {
  if (format === "banner") return <span className="mx-auto block aspect-[320/100] w-full max-w-[728px] rounded-[3px] bg-sand md:aspect-[728/90]" />;
  if (format === "rect") return <span className="mx-auto block aspect-[300/250] w-full max-w-[300px] rounded-[3px] bg-sand" />;
  return (
    <span className="grid gap-3 @lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] @3xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] @lg:items-center @lg:gap-5">
      <span className="block aspect-[1200/628] w-full rounded-[3px] bg-sand" />
      <span className="block space-y-2 py-1">
        <Bar className="h-3.5 w-4/5" />
        <Bar className="h-3 w-full" />
        <Bar className="h-3 w-3/5" />
        <Bar className="mt-3.5 h-2.5 w-28" />
      </span>
    </span>
  );
}

/**
 * The slot's frame at its final size while the slate loads, so the page does
 * not jump when the ad arrives. Static: nothing inside an ad frame moves.
 */
function AdPlaceholder({ format }: Readonly<{ format: AdFormat }>) {
  return (
    <div aria-hidden className={FRAME_BOX}>
      <div className="flex items-center justify-between gap-2 py-2 pl-2.5 pr-2.5 sm:pl-3">
        <span className="flex items-center gap-2">
          <span className="block h-4 w-7 bg-ink/10" />
          <Bar className="h-2 w-24" />
        </span>
        <span className="block h-7 w-7" />
      </div>
      <div className={FRAME_PAD[format]}>
        <PlaceholderCreative format={format} />
        <span className="mt-2 flex h-4 items-center">
          <Bar className="h-2.5 w-40 max-w-full" />
        </span>
      </div>
    </div>
  );
}

/** What a slot's slate came back with: an ad to draw, or nothing (empty, capped or failed). */
type SlotResult = { key: string; ad: AdSlateAd; why: string; viewId: string } | { key: string; ad: null };

/**
 * An ad slot. Loads its slate after first paint with no credentials, picks one
 * ad by weight (skipping campaigns already shown three times this session),
 * and renders nothing at all on an error, an empty slate, or a broken image.
 * When this placement showed an ad earlier in the session it keeps the frame's
 * space while loading, and collapses only if the slate comes back empty.
 */
export function AdSlot({
  placement,
  section,
  political = false,
  className = "",
}: Readonly<{
  placement: AdPlacementSlug;
  /** The page section, for contextual serving ("home", "news", "events"). */
  section: string;
  /** True on election-related pages: political ads are then excluded. */
  political?: boolean;
  className?: string;
}>) {
  const key = `${placement}|${section}|${political ? "political-excluded" : "all"}`;
  const [result, setResult] = useState<SlotResult | null>(null);
  const [expectFill] = useState(() => adFillExpected(placement));
  const [brokenView, setBrokenView] = useState<string | null>(null);
  const creativeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const cancel = afterPaint(() => {
      api
        .adSlate(placement, section, political, ctrl.signal)
        .then((slate) => {
          if (ctrl.signal.aborted) return;
          const ad = pickAd(Array.isArray(slate.ads) ? slate.ads : []);
          if (!ad || ad.format !== PLACEMENT_FORMAT[placement]) {
            rememberAdFill(placement, false);
            setResult({ key, ad: null });
            return;
          }
          markAdSeen(ad.id);
          rememberAdFill(placement, true);
          setResult({ key, ad, why: slate.why || "this page", viewId: newViewId() });
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setResult({ key, ad: null });
        });
    });
    return () => {
      cancel();
      ctrl.abort();
    };
  }, [key, placement, section, political]);

  const current = result?.key === key ? result : null;
  const shown = current?.ad ? current : null;
  const failed = shown !== null && brokenView === shown.viewId;

  useViewableImpression(creativeRef, shown !== null && !failed, () => {
    if (!shown) return;
    api.adBeacon({ c: shown.ad.id, p: placement, v: shown.viewId, t: shown.ad.token, e: shown.ad.exp });
  });

  if (!current) {
    // Still loading. Hold the space if an ad is likely: the last slate on this
    // page filled, or (first load) this placement filled earlier this session.
    const reserve = result ? result.ad !== null : expectFill;
    return reserve ? (
      <div className={className}>
        <AdPlaceholder format={PLACEMENT_FORMAT[placement]} />
      </div>
    ) : null;
  }
  if (!shown || failed) return null;
  return (
    <div className={className}>
      <AdFrame ad={shown.ad} why={shown.why} creativeRef={creativeRef} onImageError={() => setBrokenView(shown.viewId)} />
    </div>
  );
}
