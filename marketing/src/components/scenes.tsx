/**
 * Hand-drawn SVG scene illustrations of Cape Coast — the marketing site's
 * "media". We illustrate rather than ship unlicensed photos: line-and-fill art
 * in the Castle/Canopy/Canoe palette, on-brand with the Adinkra line work.
 * Each scene fills its card's image area (object-cover via width/height 100%).
 */
import type { CSSProperties, ComponentType } from "react";

const wrap: CSSProperties = { display: "block", width: "100%", height: "100%" };

// Palette (hex — SVG fills need literals).
const C = {
  paper: "#FBF8F1", cream: "#F6F1E7", sand: "#ECE4D3",
  green900: "#0C2C1F", green: "#123F2D", teal: "#0E7C6B",
  gold: "#C7A24A", goldBrand: "#B07D32", clay: "#B0503C", maroon: "#7C2D2D", ink: "#1A2E22",
};

type SceneProps = { className?: string };

/** Cape Coast Castle — white battlements on the rock above the Atlantic, at dawn. */
export function CastleScene({ className }: Readonly<SceneProps>) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Cape Coast Castle by the sea" className={className} style={wrap}>
      <defs>
        <linearGradient id="sky-castle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2E2B8" /><stop offset="1" stopColor={C.cream} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#sky-castle)" />
      <circle cx="258" cy="50" r="26" fill={C.gold} opacity="0.85" />
      {/* sea */}
      <rect y="132" width="320" height="68" fill={C.teal} opacity="0.92" />
      <g stroke={C.cream} strokeWidth="1.4" opacity="0.5" fill="none" strokeLinecap="round">
        <path d="M0 150 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" />
        <path d="M0 168 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" />
      </g>
      {/* rock */}
      <path d="M0 138 Q80 120 150 132 T320 130 V134 H0 Z" fill={C.green900} opacity="0.18" />
      {/* castle wall */}
      <g fill={C.paper} stroke={C.ink} strokeWidth="1.2" opacity="0.97">
        <rect x="40" y="92" width="200" height="46" />
        {/* crenellations */}
        {[40, 64, 88, 112, 136, 160, 184, 208].map((x) => <rect key={x} x={x} y="84" width="12" height="10" />)}
        {/* towers */}
        <rect x="34" y="74" width="26" height="64" />
        <rect x="220" y="70" width="30" height="68" />
        {[34, 46, 220, 232, 244].map((x) => <rect key={`t${x}`} x={x} y={x < 200 ? 66 : 62} width="8" height="8" />)}
      </g>
      {/* gate + windows */}
      <path d="M126 138 v-20 a14 14 0 0 1 28 0 v20 Z" fill={C.green} />
      <g fill={C.gold} opacity="0.8">
        <rect x="44" y="100" width="6" height="10" /><rect x="232" y="92" width="6" height="12" />
        <rect x="100" y="104" width="6" height="9" /><rect x="180" y="104" width="6" height="9" />
      </g>
      {/* flagpole + pennant */}
      <line x1="235" y1="48" x2="235" y2="70" stroke={C.ink} strokeWidth="1.4" />
      <path d="M235 50 l16 5 -16 5 Z" fill={C.clay} />
    </svg>
  );
}

/** Kakum National Park — the rope canopy walkway above the rainforest. */
export function CanopyScene({ className }: Readonly<SceneProps>) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Kakum canopy walkway above the rainforest" className={className} style={wrap}>
      <defs>
        <linearGradient id="sky-kakum" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#DDEBD9" /><stop offset="1" stopColor="#CFE2C7" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#sky-kakum)" />
      {/* distant canopy */}
      <g fill={C.teal} opacity="0.35">
        <circle cx="40" cy="150" r="40" /><circle cx="120" cy="160" r="46" /><circle cx="210" cy="150" r="44" /><circle cx="290" cy="162" r="40" />
      </g>
      {/* trees */}
      <g fill={C.green}>
        <rect x="44" y="70" width="10" height="120" rx="3" />
        <rect x="266" y="58" width="10" height="132" rx="3" />
        <circle cx="49" cy="60" r="34" opacity="0.95" /><circle cx="271" cy="50" r="40" opacity="0.95" />
      </g>
      <g fill={C.green900} opacity="0.35">
        <circle cx="30" cy="66" r="16" /><circle cx="290" cy="56" r="18" />
      </g>
      {/* rope bridge */}
      <path d="M54 104 Q160 132 266 96" fill="none" stroke={C.goldBrand} strokeWidth="2" />
      <path d="M54 120 Q160 150 266 112" fill="none" stroke={C.goldBrand} strokeWidth="2" />
      {/* planks */}
      <g stroke={C.clay} strokeWidth="3" opacity="0.9">
        {Array.from({ length: 16 }).map((_, i) => {
          const x = 60 + i * 13;
          const y = 132 - Math.sin((i / 15) * Math.PI) * 22;
          return <line key={x} x1={x} y1={y} x2={x} y2={y - 12} />;
        })}
      </g>
      {/* suspension verticals */}
      <g stroke={C.goldBrand} strokeWidth="1" opacity="0.7">
        {Array.from({ length: 9 }).map((_, i) => {
          const x = 66 + i * 24;
          const top = 102 - Math.sin((i / 8) * Math.PI) * 6;
          const bot = 130 - Math.sin((i / 8) * Math.PI) * 22;
          return <line key={x} x1={x} y1={top} x2={x} y2={bot} />;
        })}
      </g>
    </svg>
  );
}

/** The coast — fishing canoes drawn up on the shore. */
export function CoastScene({ className }: Readonly<SceneProps>) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Fishing canoes on the Cape Coast shore" className={className} style={wrap}>
      <rect width="320" height="200" fill={C.cream} />
      <rect width="320" height="120" fill="#BFE0DA" />
      <rect y="118" width="320" height="82" fill={C.sand} />
      {/* sea waves */}
      <g stroke={C.teal} strokeWidth="1.6" opacity="0.55" fill="none" strokeLinecap="round">
        <path d="M0 96 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" />
        <path d="M0 110 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" />
      </g>
      {/* gulls */}
      <g stroke={C.ink} strokeWidth="1.4" fill="none" opacity="0.55" strokeLinecap="round">
        <path d="M40 40 q6 -6 12 0 q6 -6 12 0" /><path d="M70 56 q5 -5 10 0 q5 -5 10 0" />
      </g>
      {/* canoes */}
      {[
        { x: 40, c: C.clay, f: C.gold },
        { x: 150, c: C.maroon, f: C.teal },
        { x: 250, c: C.green, f: C.gold },
      ].map((b) => (
        <g key={b.x} transform={`translate(${b.x},132)`}>
          <path d="M0 24 Q40 44 80 24 L72 30 Q40 46 8 30 Z" fill={b.c} />
          <path d="M0 24 Q40 44 80 24" fill="none" stroke={C.ink} strokeWidth="1" opacity="0.4" />
          <line x1="40" y1="24" x2="40" y2="-2" stroke={C.ink} strokeWidth="1.6" />
          <path d="M40 0 l12 4 -12 5 Z" fill={b.f} />
        </g>
      ))}
    </svg>
  );
}

/** Fosu Lagoon — calm water, mangroves and a wading bird. */
export function LagoonScene({ className }: Readonly<SceneProps>) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Fosu Lagoon with mangroves and a heron" className={className} style={wrap}>
      <defs>
        <linearGradient id="sky-lagoon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.cream} /><stop offset="1" stopColor="#E7EFE0" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#sky-lagoon)" />
      <circle cx="60" cy="48" r="20" fill={C.gold} opacity="0.6" />
      {/* water */}
      <rect y="120" width="320" height="80" fill={C.teal} opacity="0.8" />
      <g stroke={C.cream} strokeWidth="1.2" opacity="0.45" fill="none">
        <line x1="20" y1="138" x2="120" y2="138" /><line x1="180" y1="150" x2="300" y2="150" /><line x1="60" y1="164" x2="200" y2="164" />
      </g>
      {/* mangroves */}
      <g fill={C.green}>
        <circle cx="40" cy="108" r="26" /><circle cx="78" cy="112" r="22" /><circle cx="285" cy="106" r="28" /><circle cx="250" cy="114" r="20" />
      </g>
      <g stroke={C.green900} strokeWidth="2" opacity="0.5">
        <line x1="40" y1="120" x2="40" y2="134" /><line x1="78" y1="124" x2="78" y2="136" /><line x1="285" y1="118" x2="285" y2="132" />
      </g>
      {/* heron */}
      <g transform="translate(160,96)" stroke={C.ink} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85">
        <path d="M0 30 l4 -22 l10 -8" /><path d="M14 0 l10 4" />
        <line x1="2" y1="30" x2="2" y2="44" /><line x1="6" y1="30" x2="9" y2="44" />
      </g>
    </svg>
  );
}

/** Kotokuraba Market — stalls and the crab the market is named for. */
export function MarketScene({ className }: Readonly<SceneProps>) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Kotokuraba market stalls" className={className} style={wrap}>
      <rect width="320" height="200" fill={C.cream} />
      <rect y="150" width="320" height="50" fill={C.sand} />
      {/* stall canopies */}
      {[
        { x: 20, c: C.clay }, { x: 100, c: C.gold }, { x: 180, c: C.teal }, { x: 250, c: C.maroon },
      ].map((s) => (
        <g key={s.x} transform={`translate(${s.x},70)`}>
          <path d="M0 30 L40 8 L80 30 Z" fill={s.c} />
          <rect x="6" y="30" width="68" height="50" fill={C.paper} stroke={C.sand} />
          <line x1="6" y1="44" x2="74" y2="44" stroke={s.c} strokeWidth="3" opacity="0.5" />
          {/* baskets */}
          <ellipse cx="24" cy="74" rx="9" ry="5" fill={C.goldBrand} />
          <ellipse cx="54" cy="74" rx="9" ry="5" fill={C.clay} />
        </g>
      ))}
      {/* crab sign */}
      <g transform="translate(150,28)" stroke={C.maroon} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 8 c-9 0 -13 6 -13 12 s4 6 13 6 13 0 13 -6 -4 -12 -13 -12Z" fill={C.clay} fillOpacity="0.25" />
        <path d="M-10 14 l-10 -6 3 -7M10 14 l10 -6 -3 -7" />
        <path d="M-7 26 l-5 9M0 28 v9M7 26 l5 9" />
      </g>
    </svg>
  );
}

/** Fort William — the 19th-century lighthouse fort on its hill. */
export function LighthouseScene({ className }: Readonly<SceneProps>) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Fort William lighthouse on the hill" className={className} style={wrap}>
      <defs>
        <linearGradient id="sky-fort" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CFE0E8" /><stop offset="1" stopColor={C.cream} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#sky-fort)" />
      {/* hill */}
      <path d="M0 200 Q160 110 320 200 Z" fill={C.green} opacity="0.9" />
      <path d="M0 200 Q160 120 320 200 Z" fill={C.green900} opacity="0.25" />
      {/* light beams */}
      <g fill={C.gold} opacity="0.28">
        <path d="M160 70 L70 30 L74 54 Z" /><path d="M160 70 L250 30 L246 54 Z" />
      </g>
      {/* tower */}
      <g>
        <path d="M150 80 L170 80 L176 168 L144 168 Z" fill={C.paper} stroke={C.ink} strokeWidth="1.2" />
        <rect x="146" y="100" width="28" height="9" fill={C.clay} />
        <rect x="147" y="128" width="30" height="9" fill={C.clay} />
        <rect x="152" y="62" width="16" height="20" fill={C.green} stroke={C.ink} strokeWidth="1" />
        <circle cx="160" cy="72" r="5" fill={C.gold} />
      </g>
    </svg>
  );
}

/**
 * The hand-drawn scene to use for a heritage place, by slug — so the Visit grid
 * and each detail page agree on a place's illustration. Anything unmapped (e.g. a
 * new place added in the admin) falls back to the shore.
 */
export function sceneForSlug(slug: string): ComponentType<SceneProps> {
  const map: Record<string, ComponentType<SceneProps>> = {
    "cape-coast-castle": CastleScene,
    "kakum-national-park": CanopyScene,
    "elmina-castle": CastleScene,
    "fort-william-lighthouse": LighthouseScene,
    "fosu-lagoon": LagoonScene,
    "kotokuraba-market": MarketScene,
    "assin-manso-slave-river": CoastScene,
    "bakaano-fishing-shore": CoastScene,
    "fort-william-anomabu": CastleScene,
    "fort-victoria-cape-coast": LighthouseScene,
    "victoria-park-cape-coast": DurbarScene,
    "hans-cottage-botel": LagoonScene,
    "brenu-akyinim-beach": BeachScene,
    "biriwa-beach": BeachScene,
    "chapel-square-cape-coast": MarketScene,
  };
  return map[slug] ?? CoastScene;
}

/** The schools on the hills — a hilltop college with a clock/bell tower above the sea. */
export function CollegeScene({ className }: Readonly<SceneProps>) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A Cape Coast college on its hill above the sea" className={className} style={wrap}>
      <defs>
        <linearGradient id="sky-college" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E9DFC0" /><stop offset="1" stopColor={C.cream} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#sky-college)" />
      <circle cx="262" cy="44" r="22" fill={C.gold} opacity="0.8" />
      {/* sea strip far below */}
      <rect y="170" width="320" height="30" fill={C.teal} opacity="0.85" />
      {/* the green hill */}
      <path d="M0 176 Q160 120 320 176 V200 H0 Z" fill={C.green} />
      <path d="M0 176 Q160 132 320 176 V200 H0 Z" fill={C.green900} opacity="0.3" />
      {/* the long college building on the crest */}
      <g stroke={C.ink} strokeWidth="1.1">
        {/* wings */}
        <rect x="40" y="120" width="80" height="36" fill={C.paper} />
        <rect x="200" y="120" width="80" height="36" fill={C.paper} />
        {/* central block + clock tower */}
        <rect x="120" y="104" width="80" height="52" fill={C.cream} />
        <rect x="148" y="70" width="24" height="40" fill={C.paper} />
        <path d="M146 70 L160 54 L174 70 Z" fill={C.clay} />
        <circle cx="160" cy="84" r="6" fill={C.gold} stroke={C.ink} strokeWidth="1" />
        {/* roofs */}
        <path d="M38 120 L80 104 L122 120 Z" fill={C.clay} />
        <path d="M198 120 L240 104 L282 120 Z" fill={C.clay} />
      </g>
      {/* arched windows */}
      <g fill={C.green}>
        {[52, 70, 88, 212, 230, 248].map((x) => <path key={x} d={`M${x} 156 v-16 a5 5 0 0 1 10 0 v16 Z`} />)}
        <path d="M132 156 v-22 a8 8 0 0 1 16 0 v22 Z" fill={C.green} />
        <path d="M172 156 v-22 a8 8 0 0 1 16 0 v22 Z" fill={C.green} />
      </g>
      {/* flag */}
      <line x1="160" y1="40" x2="160" y2="56" stroke={C.ink} strokeWidth="1.4" />
      <path d="M160 42 l14 4 -14 5 Z" fill={C.gold} />
    </svg>
  );
}

/** Fetu Afahye — the grand durbar: a state umbrella, a palanquin and Asafo flags. */
export function DurbarScene({ className }: Readonly<SceneProps>) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="The Fetu Afahye durbar — a chief's palanquin under a state umbrella" className={className} style={wrap}>
      <defs>
        <linearGradient id="sky-durbar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2DEA6" /><stop offset="1" stopColor={C.cream} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#sky-durbar)" />
      <circle cx="60" cy="46" r="20" fill={C.gold} opacity="0.7" />
      {/* ground */}
      <rect y="160" width="320" height="40" fill={C.sand} />
      {/* Asafo frankaa flags on poles */}
      {[
        { x: 30, c: C.maroon }, { x: 70, c: C.teal }, { x: 250, c: C.green }, { x: 292, c: C.clay },
      ].map((f) => (
        <g key={f.x}>
          <line x1={f.x} y1="92" x2={f.x} y2="162" stroke={C.ink} strokeWidth="1.4" />
          <path d={`M${f.x} 94 h26 l-8 8 8 8 h-26 Z`} fill={f.c} />
        </g>
      ))}
      {/* crowd suggestion */}
      <g fill={C.green900} opacity="0.35">
        {Array.from({ length: 16 }).map((_, i) => {
          const cx = 24 + i * 18;
          return <circle key={cx} cx={cx} cy={158} r="6" />;
        })}
      </g>
      {/* the great state umbrella */}
      <g>
        <line x1="160" y1="70" x2="160" y2="150" stroke={C.ink} strokeWidth="2" />
        <path d="M104 78 Q160 36 216 78 Z" fill={C.clay} stroke={C.ink} strokeWidth="1.2" />
        <path d="M104 78 Q132 64 160 78 Q188 64 216 78" fill="none" stroke={C.gold} strokeWidth="1.4" />
        <circle cx="160" cy="34" r="4" fill={C.gold} />
        {/* valance scallops */}
        <path d="M104 78 q7 8 14 0 q7 8 14 0 q7 8 14 0 q7 8 14 0 q7 8 14 0 q7 8 14 0 q7 8 14 0 q7 8 14 0" fill="none" stroke={C.gold} strokeWidth="1.6" />
      </g>
      {/* the palanquin (chief borne on a platform) */}
      <g>
        <rect x="138" y="120" width="44" height="22" rx="3" fill={C.gold} stroke={C.ink} strokeWidth="1.2" />
        <line x1="118" y1="131" x2="202" y2="131" stroke={C.ink} strokeWidth="2.4" />
        {/* the seated figure */}
        <circle cx="160" cy="112" r="8" fill={C.maroon} stroke={C.ink} strokeWidth="1" />
        <path d="M150 120 q10 -10 20 0 Z" fill={C.maroon} />
      </g>
    </svg>
  );
}

/** The coast to stay for — palms, golden sand and the Atlantic. */
export function BeachScene({ className }: Readonly<SceneProps>) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A Cape Coast beach with palms and the Atlantic" className={className} style={wrap}>
      <defs>
        <linearGradient id="sky-beach" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CFE6E6" /><stop offset="1" stopColor="#EAF1E8" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#sky-beach)" />
      <circle cx="250" cy="48" r="22" fill={C.gold} opacity="0.75" />
      {/* sea */}
      <rect y="96" width="320" height="50" fill={C.teal} opacity="0.85" />
      <g stroke={C.cream} strokeWidth="1.4" opacity="0.5" fill="none" strokeLinecap="round">
        <path d="M0 118 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" />
        <path d="M0 134 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" />
      </g>
      {/* sand */}
      <path d="M0 140 Q160 128 320 140 V200 H0 Z" fill={C.sand} />
      <path d="M0 150 Q160 140 320 150" fill="none" stroke={C.goldBrand} strokeWidth="1" opacity="0.4" />
      {/* palms */}
      {[{ x: 56, h: 70 }, { x: 92, h: 54 }].map((p) => (
        <g key={p.x} stroke={C.green} strokeWidth="3" fill="none" strokeLinecap="round">
          <path d={`M${p.x} 150 q-6 -${p.h * 0.6} 2 -${p.h}`} stroke={C.green900} />
          <g stroke={C.green}>
            <path d={`M${p.x + 2} ${150 - p.h} q-20 -6 -32 6`} />
            <path d={`M${p.x + 2} ${150 - p.h} q20 -6 32 6`} />
            <path d={`M${p.x + 2} ${150 - p.h} q-14 8 -26 22`} />
            <path d={`M${p.x + 2} ${150 - p.h} q14 8 26 22`} />
          </g>
        </g>
      ))}
      {/* a parasol and a drawn-up canoe */}
      <g transform="translate(214,150)">
        <line x1="0" y1="0" x2="0" y2="-30" stroke={C.ink} strokeWidth="1.6" />
        <path d="M-20 -28 Q0 -44 20 -28 Z" fill={C.clay} stroke={C.ink} strokeWidth="1" />
      </g>
      <g transform="translate(262,158)">
        <path d="M0 8 Q24 22 48 8 L42 14 Q24 24 6 14 Z" fill={C.maroon} />
      </g>
    </svg>
  );
}

/**
 * A regalia seal medallion used for leadership where we have no photograph — a
 * gold ring with a stool/Adinkra motif. variant changes the inner mark.
 */
export function Seal({ variant = "stool", className }: Readonly<{ variant?: "stool" | "asafo" | "civic" | "school"; className?: string }>) {
  return (
    <svg viewBox="0 0 96 96" role="img" aria-label="Oguaa regalia seal" className={className} style={{ display: "block" }}>
      <circle cx="48" cy="48" r="46" fill={C.green900} />
      <circle cx="48" cy="48" r="46" fill="none" stroke={C.gold} strokeWidth="2" />
      <circle cx="48" cy="48" r="38" fill="none" stroke={C.gold} strokeWidth="1" opacity="0.6" />
      <g stroke={C.gold} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {variant === "stool" && (
          <>
            {/* an Akan stool */}
            <path d="M30 56 h36" /><path d="M34 56 v8 M62 56 v8" />
            <path d="M30 44 q18 -14 36 0" /><path d="M30 44 v12 M66 44 v12" />
            <circle cx="48" cy="50" r="3" />
          </>
        )}
        {variant === "asafo" && (
          <>
            {/* crossed flags / guard */}
            <path d="M34 64 L52 32 M62 64 L44 32" /><path d="M52 36 l12 3 -10 6 Z" fill={C.gold} />
          </>
        )}
        {variant === "civic" && (
          <>
            {/* sun & waves (the coast) */}
            <circle cx="48" cy="40" r="9" /><path d="M30 60 q9 -6 18 0 t18 0" /><path d="M32 68 q8 -5 16 0 t16 0" />
          </>
        )}
        {variant === "school" && (
          <>
            {/* open book */}
            <path d="M48 36 v30" /><path d="M48 38 q-12 -8 -18 -2 v26 q6 -6 18 0" /><path d="M48 38 q12 -8 18 -2 v26 q-6 -6 -18 0" />
          </>
        )}
      </g>
    </svg>
  );
}
