type RelicKind =
  | "star"
  | "compass"
  | "drum"
  | "stool"
  | "castle"
  | "crown"
  | "palanquin"
  | "lighthouse"
  | "book"
  | "canoe"
  | "candle"
  | "knot"
  | "bridge"
  | "torch"
  | "scroll"
  | "hourglass"
  | "shield"
  | "key"
  | "megaphone"
  | "anchor"
  | "house";

const SECTION_RELIC: Record<string, RelicKind> = {
  home: "star",
  music: "drum",
  people: "stool",
  heritage: "castle",
  culture: "crown",
  festivals: "palanquin",
  visit: "lighthouse",
  education: "book",
  business: "canoe",
  memoriam: "candle",
  community: "knot",
  diaspora: "bridge",
  youth: "torch",
  news: "scroll",
  events: "hourglass",
  safety: "shield",
  lostfound: "key",
  map: "compass",
  better: "megaphone",
  outside: "anchor",
  property: "house",
};

const RELIC_TITLE: Record<RelicKind, string> = {
  star: "Oguaa guiding star",
  compass: "Town compass",
  drum: "Oguaa drum",
  stool: "Chiefly stool",
  castle: "Cape Coast Castle",
  crown: "Traditional crown",
  palanquin: "Festival palanquin",
  lighthouse: "Cape Coast lighthouse",
  book: "Education book",
  canoe: "Fishing canoe",
  candle: "Memorial candle",
  knot: "Community knot",
  bridge: "Diaspora bridge",
  torch: "Youth torch",
  scroll: "News scroll",
  hourglass: "Events hourglass",
  shield: "Safety shield",
  key: "Lost and found key",
  megaphone: "Better Oguaa voice",
  anchor: "Coastal anchor",
  house: "Rent and stay house",
};

function Icon({
  kind,
  className,
}: Readonly<{
  kind: RelicKind;
  className?: string;
}>) {
  const stroke = "currentColor";
  const common = { fill: "none", stroke, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "star":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M32 8l6.4 13 14.3 2-10.3 10 2.4 14.3L32 40.7 19.2 47.3l2.4-14.3L11.3 23l14.3-2z" />
        </svg>
      );
    case "compass":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <circle {...common} cx="32" cy="32" r="22" />
          <path {...common} d="M22 42l6-16 16-6-6 16zM32 32l12-12" />
        </svg>
      );
    case "drum":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <ellipse {...common} cx="32" cy="16" rx="16" ry="6" />
          <path {...common} d="M16 16v24c0 3.3 7.2 6 16 6s16-2.7 16-6V16" />
          <ellipse {...common} cx="32" cy="40" rx="16" ry="6" />
        </svg>
      );
    case "stool":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <ellipse {...common} cx="32" cy="16" rx="18" ry="6" />
          <path {...common} d="M20 20v18M44 20v18M25 38h14M22 46h20" />
        </svg>
      );
    case "castle":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M10 50h44V28H10zM16 28v-8h8v8M28 28v-8h8v8M40 28v-8h8v8M28 50V38h8v12" />
        </svg>
      );
    case "crown":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M12 44h40l-4-22-12 9-4-13-4 13-12-9zM14 44h36v6H14z" />
        </svg>
      );
    case "palanquin":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M6 44h52M10 38h44M20 38V24h24v14M16 24h32" />
        </svg>
      );
    case "lighthouse":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M24 50h16l-3-28h-10zM26 22l6-8 6 8M20 50h24M40 26l12-4M24 26l-12-4" />
        </svg>
      );
    case "book":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M10 18h22c4 0 8 2 10 5 2-3 6-5 10-5h2v30h-2c-4 0-8 2-10 5-2-3-6-5-10-5H10zM32 23v30" />
        </svg>
      );
    case "canoe":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M8 40c4 6 12 10 24 10s20-4 24-10H8zM30 20v18M30 22l14 6" />
        </svg>
      );
    case "candle":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M24 50h16V22H24zM22 50h20M32 10c3 3 3 7 0 10-3-3-3-7 0-10z" />
        </svg>
      );
    case "knot":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M20 20c6-6 18-6 24 0s6 18 0 24-18 6-24 0-6-18 0-24zm0 24l24-24" />
        </svg>
      );
    case "bridge":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M8 44h48M14 44V24M50 44V24M14 24c6 0 10 4 18 4s12-4 18-4" />
        </svg>
      );
    case "torch":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M24 50l8-22 8 22M32 10c5 4 6 9 2 14-4-2-6-6-2-14zM28 28h8" />
        </svg>
      );
    case "scroll":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M16 18h32v28H16zM16 18c-4 0-6 2-6 6s2 6 6 6M48 46c4 0 6-2 6-6s-2-6-6-6M24 28h16M24 34h12" />
        </svg>
      );
    case "hourglass":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M18 12h28M18 52h28M22 12c0 10 20 10 20 20S22 42 22 52M42 12c0 10-20 10-20 20s20 10 20 20" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M32 10l18 8v14c0 12-8 18-18 22-10-4-18-10-18-22V18zM24 32h16M32 24v16" />
        </svg>
      );
    case "key":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M20 34a8 8 0 1 1 8 8h-8v-8zm16 0h18M46 34v8M52 34v6" />
        </svg>
      );
    case "megaphone":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M12 34h12l20 8V18l-20 8H12zM24 42l4 10M50 26l6-4M50 38l6 4" />
        </svg>
      );
    case "anchor":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M32 10a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 8v28M20 30h24M18 42c0 6 6 12 14 12M46 42c0 6-6 12-14 12" />
        </svg>
      );
    case "house":
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden>
          <path {...common} d="M10 30l22-18 22 18M16 28v24h32V28M28 52V38h8v14" />
        </svg>
      );
  }
}

export function HeroRelic({ sectionId, onDark }: Readonly<{ sectionId: string; onDark?: boolean }>) {
  const kind = SECTION_RELIC[sectionId] ?? "castle";
  const fg = onDark ? "text-cream/85" : "text-green";
  const ring = onDark ? "border-cream/20 bg-green-950/30" : "border-sand bg-cream/70";
  const chip = onDark ? "bg-green-950/65 text-cream/80" : "bg-paper/90 text-ink-faint";

  return (
    <aside className="absolute right-3 top-1/2 hidden h-[16rem] w-[18rem] -translate-y-1/2 lg:block xl:right-4" aria-label={`${RELIC_TITLE[kind]} section symbol`}>
      <div className={`relative h-full w-full overflow-hidden rounded-[2rem] border ${ring}`}>
        <div className="absolute inset-0 opacity-70 [background:radial-gradient(circle_at_30%_20%,rgba(176,125,50,0.2),transparent_40%),radial-gradient(circle_at_70%_80%,rgba(14,124,107,0.2),transparent_38%)]" />
        <div className="absolute inset-4 rounded-[1.35rem] border border-current/15" />
        <div className="absolute inset-0 grid place-items-center">
          <Icon kind={kind} className={`h-40 w-40 ${fg}`} />
        </div>
      </div>
      <div className={`pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.1em] ${chip}`}>
        {RELIC_TITLE[kind]}
      </div>
    </aside>
  );
}
