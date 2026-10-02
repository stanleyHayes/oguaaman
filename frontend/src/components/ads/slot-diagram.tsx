import type { JSX } from "react";
import type { AdPlacementSlug } from "@/lib/types";

// A small wireframe of the page each placement runs on, with the ad's spot in
// gold. Drawn in theme tokens so it reads in light and dark.

const BLOCK = "fill-sand";
const INK = "fill-ink-faint/35";
const HERO = "fill-green/70";
const SLOT = "fill-gold-brand";

function Lines({ x, y, w, n, gap = 6 }: Readonly<{ x: number; y: number; w: number; n: number; gap?: number }>) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect key={`l${i}`} x={x} y={y + i * gap} width={i === n - 1 ? w * 0.6 : w} height={2.5} rx={1.25} className={INK} />
      ))}
    </>
  );
}

function HomeBanner() {
  return (
    <>
      <rect x={6} y={6} width={148} height={30} rx={3} className={HERO} />
      <rect x={34} y={42} width={92} height={10} rx={1.5} className={SLOT} />
      <rect x={6} y={58} width={46} height={30} rx={3} className={BLOCK} />
      <rect x={57} y={58} width={46} height={30} rx={3} className={BLOCK} />
      <rect x={108} y={58} width={46} height={30} rx={3} className={BLOCK} />
    </>
  );
}

function FeedCard() {
  return (
    <>
      <rect x={6} y={6} width={148} height={22} rx={3} className={BLOCK} />
      <rect x={6} y={32} width={46} height={18} rx={3} className={BLOCK} />
      <rect x={57} y={32} width={46} height={18} rx={3} className={BLOCK} />
      <rect x={108} y={32} width={46} height={18} rx={3} className={BLOCK} />
      <rect x={6} y={54} width={148} height={16} rx={1.5} className={SLOT} />
      <rect x={6} y={74} width={46} height={14} rx={3} className={BLOCK} />
      <rect x={57} y={74} width={46} height={14} rx={3} className={BLOCK} />
      <rect x={108} y={74} width={46} height={14} rx={3} className={BLOCK} />
    </>
  );
}

function ArticleRect() {
  return (
    <>
      <rect x={6} y={6} width={148} height={24} rx={3} className={HERO} />
      <Lines x={8} y={38} w={98} n={7} gap={7} />
      <rect x={116} y={36} width={38} height={22} rx={3} className={BLOCK} />
      <rect x={116} y={62} width={38} height={26} rx={1.5} className={SLOT} />
    </>
  );
}

function MarketingCard() {
  return (
    <>
      <rect x={6} y={6} width={148} height={20} rx={3} className={HERO} />
      <rect x={6} y={30} width={72} height={20} rx={3} className={BLOCK} />
      <rect x={82} y={30} width={72} height={20} rx={3} className={BLOCK} />
      <rect x={30} y={54} width={100} height={16} rx={1.5} className={SLOT} />
      <rect x={6} y={74} width={148} height={14} rx={3} className={BLOCK} />
    </>
  );
}

function AppCard() {
  return (
    <>
      <rect x={52} y={3} width={56} height={88} rx={8} className="fill-none stroke-ink-faint/50" strokeWidth={1.5} />
      <rect x={57} y={10} width={46} height={16} rx={2.5} className={HERO} />
      <rect x={57} y={30} width={46} height={12} rx={2.5} className={BLOCK} />
      <rect x={57} y={46} width={46} height={16} rx={1.5} className={SLOT} />
      <rect x={57} y={66} width={46} height={12} rx={2.5} className={BLOCK} />
    </>
  );
}

const DIAGRAMS: Record<AdPlacementSlug, () => JSX.Element> = {
  "portal-home-banner": HomeBanner,
  "portal-feed-card": FeedCard,
  "portal-article-rect": ArticleRect,
  "marketing-card": MarketingCard,
  "app-card": AppCard,
};

/** Where on the page a placement runs, as a wireframe with the ad in gold. */
export function SlotDiagram({ placement, className = "" }: Readonly<{ placement: AdPlacementSlug; className?: string }>) {
  return (
    <svg viewBox="0 0 160 94" role="img" aria-label="Where the ad appears on the page, marked in gold" className={`h-auto w-full ${className}`}>
      <rect x={0.5} y={0.5} width={159} height={93} rx={6} className="fill-paper stroke-sand" />
      {DIAGRAMS[placement]()}
    </svg>
  );
}
