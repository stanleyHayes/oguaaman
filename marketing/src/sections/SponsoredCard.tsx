import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Container } from "@/components/ui";
import { AD_LIBRARY_URL as LIBRARY_URL, AD_POLICY_URL as POLICY_URL } from "@/config";
import {
  MARKETING_PLACEMENT,
  beacon,
  clickUrl,
  fetchSlate,
  fillExpected,
  markSeen,
  newViewId,
  pickAd,
  rememberFill,
  type AdSection,
  type SlateAd,
} from "@/lib/ads";

/**
 * The marketing site's one ad slot (`marketing-card`, spec sections 3.9 and 9).
 *
 * Deliberately not a news card, and drawn the way the portal draws every ad:
 * a sand frame with a gold hairline; inside it a square flag with the API's
 * chip text and the word "Advertisement", the ⓘ "Why am I seeing this ad?"
 * control, the creative, and the sponsor strip underneath. Nothing inside it
 * moves. It renders nothing during prerender, when the slate is empty and on
 * any error, so it can never break a page. If it showed an ad earlier in the
 * session it keeps the frame's space while loading, so the page doesn't jump.
 */

/** Viewable impression: half the creative on screen for one continuous second. */
const VIEW_THRESHOLD = 0.5;
const VIEW_DWELL_MS = 1000;


interface Shown {
  ad: SlateAd;
  why: string;
  viewId: string;
}

/** What the slate for a section came back with: an ad, or nothing to show. */
interface SlotResult {
  section: AdSection;
  shown: Shown | null;
}

type Layout = "band" | "inline";

/** Wait for the browser to be idle after first paint before asking for an ad. */
function afterPaint(fn: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(fn, { timeout: 2000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 1);
  return () => window.clearTimeout(id);
}

/** Fetch the slate after paint and pick one creative (weighted, session-capped). */
function useSlateAd(section: AdSection): { loading: boolean; shown: Shown | null } {
  const [result, setResult] = useState<SlotResult | null>(null);

  useEffect(() => {
    // Prerender guard: the marketing site is built ahead of time and ads are
    // never part of the static HTML.
    if (typeof window === "undefined") return;
    const controller = new AbortController();
    let cancelled = false;
    const cancelIdle = afterPaint(() => {
      void fetchSlate(MARKETING_PLACEMENT, section, controller.signal).then((slate) => {
        if (cancelled) return;
        const ad = pickAd(slate.ads);
        if (!ad) {
          rememberFill(false);
          setResult({ section, shown: null });
          return;
        }
        markSeen(ad.id);
        rememberFill(true);
        setResult({ section, shown: { ad, why: slate.why, viewId: newViewId() } });
      });
    });
    return () => {
      cancelled = true;
      cancelIdle();
      controller.abort();
    };
  }, [section]);

  const current = result?.section === section ? result : null;
  return { loading: current === null, shown: current?.shown ?? null };
}

/**
 * Send one beacon once the creative has been at least half visible for a full
 * second while the tab is visible. The clock restarts whenever the ad leaves
 * the viewport or the tab is hidden.
 */
function useViewability(target: RefObject<HTMLElement | null>, shown: Shown | null, ready: boolean) {
  useEffect(() => {
    const el = target.current;
    if (!el || !shown || !ready || typeof IntersectionObserver === "undefined") return;

    let inView = false;
    let sent = false;
    let timer: number | undefined;

    const stop = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const arm = () => {
      if (sent || timer !== undefined || !inView || document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => {
        sent = true;
        timer = undefined;
        beacon(shown.ad, MARKETING_PLACEMENT, shown.viewId);
        observer.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
      }, VIEW_DWELL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") arm();
      else stop();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting && entry.intersectionRatio >= VIEW_THRESHOLD;
        if (inView) arm();
        else stop();
      },
      { threshold: [0, VIEW_THRESHOLD] },
    );

    observer.observe(el);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [target, shown, ready]);
}

/** The portal's ⓘ, so the control looks the same on every surface. */
function InfoGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </svg>
  );
}

/** The frame every ad sits in: sand ground, gold hairline, a warm shadow from the theme's gold. */
const FRAME =
  "relative overflow-hidden rounded-md border border-gold-border/45 bg-sand/55 shadow-[0_10px_26px_-18px_color-mix(in_oklab,var(--color-gold-text)_45%,transparent)]";

/** The flag row's left side: the chip verbatim in a square flag, then "Advertisement" (always shown, wraps when narrow). */
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

/** A bar standing in for a line of text in the placeholder. */
function Bar({ className }: Readonly<{ className: string }>) {
  return <span className={`block rounded-[2px] bg-ink/[0.06] ${className}`} />;
}

/** The frame at its final size while the slate loads. Static: nothing inside an ad frame moves. */
function AdPlaceholder() {
  return (
    <div aria-hidden className={FRAME}>
      <div className="flex items-center justify-between gap-2 py-2 pl-3 pr-3 sm:pl-4">
        <span className="flex items-center gap-2">
          <span className="block h-4 w-7 bg-ink/10" />
          <Bar className="h-2 w-24" />
        </span>
        <span className="block h-7 w-7" />
      </div>
      <div className="grid gap-4 px-3 pb-4 sm:px-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-center md:gap-7">
        <span className="block aspect-[1200/628] rounded-[3px] bg-sand" />
        <span className="block space-y-2.5">
          <Bar className="h-4 w-4/5" />
          <Bar className="h-3 w-full max-w-[46ch]" />
          <Bar className="h-3 w-3/5" />
          <span className="flex h-11 items-center">
            <Bar className="h-3 w-36" />
          </span>
        </span>
      </div>
      <div className="border-t border-gold-border/35 px-3 py-3 sm:px-4">
        <span className="flex h-4 items-center">
          <Bar className="h-2.5 w-48 max-w-full" />
        </span>
      </div>
    </div>
  );
}

const PANEL_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-4 text-sm font-semibold transition-[color,background-color,border-color,transform] duration-200 active:translate-y-px motion-reduce:transition-none";

function WhyPanel({
  id,
  titleId,
  shown,
  onClose,
}: Readonly<{ id: string; titleId: string; shown: Shown; onClose: () => void }>) {
  const { ad, why } = shown;
  return (
    <div id={id} role="region" aria-labelledby={titleId} className="border-t border-gold-border/35 bg-paper px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <h3 id={titleId} className="text-base font-semibold text-ink">
          Why am I seeing this ad?
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 -mt-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-sm font-medium text-ink-muted transition-colors duration-200 hover:bg-sand/70 hover:text-ink active:translate-y-px"
        >
          Close
        </button>
      </div>
      <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-pretty text-ink-muted">
        This ad is shown to everyone who views {why}. Oguaa doesn't use your profile, location, reading history or any
        tracking to choose ads.
      </p>
      <div className="mt-4 space-y-1 border-y border-sand py-3 text-sm">
        <p className="font-semibold text-ink">{ad.sponsorLine}</p>
        {ad.political && ad.electionName && <p className="text-ink-muted">Election: {ad.electionName}</p>}
      </div>
      {ad.political && (
        <p className="mt-3 text-sm">
          <a href={POLICY_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-green-text underline decoration-green-text/30 underline-offset-4 transition-colors hover:decoration-green-text">
            Read the Advertising Policy
          </a>
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2.5">
        <a
          href={`${LIBRARY_URL}?report=${encodeURIComponent(ad.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${PANEL_BUTTON} border border-clay/35 text-clay-text hover:border-clay hover:bg-clay/[0.06]`}
        >
          Report this ad
        </a>
        <a
          href={LIBRARY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${PANEL_BUTTON} border border-green/25 text-green-text hover:border-green/60 hover:bg-green/[0.05]`}
        >
          See all political ads <span aria-hidden>↗</span>
        </a>
      </div>
    </div>
  );
}

function AdFrame({ shown }: Readonly<{ shown: Shown }>) {
  const { ad } = shown;
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const creativeRef = useRef<HTMLAnchorElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();

  useViewability(creativeRef, shown, loaded && !broken);

  if (broken) return null;

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };
  const label = ad.political ? "Political advertisement" : "Advertisement";

  return (
    <aside
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) close();
      }}
      className={`${FRAME} transition-colors duration-200 has-[a[data-creative]:hover]:border-gold-border`}
    >
      <div className="flex items-center justify-between gap-2 py-2 pl-3 pr-3 sm:pl-4">
        <AdLabel chip={ad.chip} />
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label="Why am I seeing this ad?"
          title="Why am I seeing this ad?"
          onClick={() => setOpen((v) => !v)}
          className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-faint transition-colors duration-200 hover:bg-gold/[0.12] hover:text-ink focus-visible:text-ink active:translate-y-px aria-expanded:bg-gold/[0.12] aria-expanded:text-ink"
        >
          <InfoGlyph />
        </button>
      </div>

      <a
        ref={creativeRef}
        data-creative
        href={clickUrl(ad, MARKETING_PLACEMENT)}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className="group grid gap-4 px-3 pb-4 outline-offset-[-3px] active:translate-y-px sm:px-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-center md:gap-7"
      >
        <div className="relative aspect-[1200/628] overflow-hidden rounded-[3px] bg-sand">
          <img
            src={ad.imageUrl}
            alt={ad.alt}
            width={1200}
            height={628}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col justify-center gap-2 md:pr-2">
          {ad.headline && (
            <p className="text-base font-medium leading-snug text-balance text-ink decoration-gold-border/70 underline-offset-4 group-hover:underline">
              {ad.headline}
            </p>
          )}
          {ad.body && <p className="max-w-[46ch] text-sm leading-relaxed text-pretty text-ink-muted">{ad.body}</p>}
          <span className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-green-text">
            Visit the advertiser <span aria-hidden>↗</span>
            <span className="sr-only">(opens in a new tab)</span>
          </span>
        </div>
      </a>

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-t border-gold-border/35 px-3 py-3 text-xs sm:px-4">
        <p className="font-medium text-ink-muted">{ad.sponsorLine}</p>
        {ad.syntheticMedia && <p className="text-ink-muted">Contains AI-generated or altered media</p>}
      </div>

      {open && <WhyPanel id={panelId} titleId={titleId} shown={shown} onClose={close} />}
    </aside>
  );
}

/**
 * `layout="band"` wraps the slot in its own page band (Home); `"inline"` drops
 * it into an existing container (the news list). Either way it renders nothing
 * until there is an ad to show.
 */
export function SponsoredCard({
  section,
  layout = "inline",
  className = "",
}: Readonly<{ section: AdSection; layout?: Layout; className?: string }>) {
  const [expectFill] = useState(fillExpected);
  const { loading, shown } = useSlateAd(section);

  let frame: ReactNode = null;
  // Keyed by view so a new pick resets the image and disclosure state.
  if (shown) frame = <AdFrame key={shown.viewId} shown={shown} />;
  else if (loading && expectFill) frame = <AdPlaceholder />;
  if (!frame) return null;

  if (layout === "inline") return <div className={className}>{frame}</div>;
  return (
    <section aria-label={shown ? "Sponsored" : undefined} className={`bg-paper py-12 sm:py-16 ${className}`}>
      <Container size="wide">{frame}</Container>
    </section>
  );
}
