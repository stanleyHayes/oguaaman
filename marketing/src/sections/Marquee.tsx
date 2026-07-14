import { Adinkra } from "@/components/adinkra";

/**
 * Marquee — a slim, decorative scrolling strip of Cape Coast touchstones.
 *
 * The "marquee-track" utility animates translateX(0 → -50%), so the list is
 * duplicated inline (twice) to make the loop seamless. The whole band is
 * aria-hidden because it is purely ornamental; every name here is announced
 * elsewhere on the page in proper context. Reduced-motion users get a static
 * strip automatically (the utility disables its own animation).
 */

const TOUCHSTONES = [
  "Kotokuraba",
  "Fetu Afahye",
  "Cape Coast Castle",
  "Kakum",
  "Mfantsipim",
  "Asafo Companies",
  "Fosu Lagoon",
  "UCC",
  "Oguaa",
  "Highlife",
  "Wesley Girls'",
  "Adisadel",
  "Door of No Return",
  "Fante Kenkey",
] as const;

function Strip() {
  return (
    <ul className="flex shrink-0 items-center gap-0 whitespace-nowrap">
      {TOUCHSTONES.map((word) => (
        <li key={word} className="flex items-center">
          <span className="px-5 font-mono text-[0.7rem] uppercase tracking-[0.22em] text-cream/75 sm:text-xs sm:tracking-[0.28em]">
            {word}
          </span>
          <Adinkra
            name="crab"
            size={13}
            labelled={false}
            strokeWidth={1.4}
            className="text-gold/70"
          />
        </li>
      ))}
    </ul>
  );
}

export function Marquee() {
  return (
    <div
      aria-hidden="true"
      className="relative w-full overflow-hidden border-y border-white/10 bg-green py-3.5 select-none"
    >
      {/* soft edge fades so words enter and leave the band gracefully */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-green to-transparent sm:w-24" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-green to-transparent sm:w-24" />

      <div className="marquee-track flex w-max items-center hover:[animation-play-state:paused]">
        <Strip />
        <Strip />
      </div>
    </div>
  );
}
