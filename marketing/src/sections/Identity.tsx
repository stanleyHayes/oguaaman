import type { AdinkraName } from "@/components/adinkra";
import { Section, SectionHeading } from "@/components/ui";
import { Adinkra, SymbolDivider } from "@/components/adinkra";

/**
 * Identity — the "design & values" band (agent_plan.md §2). A deep green-900
 * museum wall that explains where the palette comes from (Cape Coast itself)
 * and lays out the Adinkra vocabulary as a respectful set of museum labels:
 * we borrow the GRAMMAR of these symbols, never reproduce sacred marks. Closes
 * soberly on the Castle, whose history is held with care.
 */

interface Swatch {
  label: string;
  drawn: string;
  /** Inline style so we can paint the exact token colour as a chip. */
  color: string;
  /** Border helps the cream/sand chips read against the dark wall. */
  ring?: boolean;
}

const SWATCHES: Swatch[] = [
  { label: "Castle stone", drawn: "Cream & sand", color: "var(--color-cream)", ring: true },
  { label: "Akan gold", drawn: "Regalia", color: "var(--color-gold)" },
  { label: "Kakum canopy", drawn: "Forest green", color: "var(--color-green)", ring: true },
  { label: "Atlantic teal", drawn: "Sea & lagoon", color: "var(--color-teal)" },
  { label: "Canoe clay", drawn: "Hulls & Asafo red", color: "var(--color-clay)" },
];

interface SymbolEntry {
  name: AdinkraName;
  title: string;
  meaning: string;
}

const SYMBOLS: SymbolEntry[] = [
  {
    name: "sankofa",
    title: "Sankofa",
    meaning: "Go back and fetch it — we learn from the past to build what comes next.",
  },
  {
    name: "funtunfunefu",
    title: "Funtunfunefu",
    meaning: "Two crocodiles, one stomach — unity across our many quarters and companies.",
  },
  {
    name: "gye-nyame",
    title: "Gye Nyame",
    meaning: "Except God — a reminder of what is greater than any one of us.",
  },
  {
    name: "dwennimmen",
    title: "Dwennimmen",
    meaning: "The ram's horns — strength tempered by humility; the heart leads, not the horns.",
  },
  {
    name: "adinkrahene",
    title: "Adinkrahene",
    meaning: "Leadership and the oneness of all things — the seed from which the others grow.",
  },
];

export function Identity() {
  return (
    <Section id="identity" tone="deep" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-contours opacity-60" aria-hidden="true" />

      <div className="relative">
        <SectionHeading
          onDark
          kicker="OUR IDENTITY"
          title="Castle, Canopy & Canoe."
          lede="Our palette is drawn from Cape Coast itself — the pale stone of the Castle and the gold of Akan regalia, the deep forest of Kakum's canopy, and the Atlantic teal and clay of the fishing canoes that come in off the shore. The look of this home is the look of the town."
        />

        {/* Palette — colour chips drawn straight from the town. */}
        <ul className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {SWATCHES.map((s, i) => (
            <li
              key={s.label}
              className={`rise rise-${Math.min(i + 1, 4)} flex flex-col gap-3`}
            >
              <span
                className={`h-16 w-full rounded-[var(--radius-card)] shadow-[var(--shadow-card)] ${
                  s.ring ? "ring-1 ring-cream/20" : ""
                }`}
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              <span>
                <span className="block font-display text-lg font-semibold text-cream">
                  {s.label}
                </span>
                <span className="mt-0.5 block font-mono text-[0.68rem] uppercase tracking-[0.18em] text-gold/80">
                  {s.drawn}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <SymbolDivider name="adinkrahene" className="mt-16 max-w-xs" tone="text-gold" />

        {/* Symbol vocabulary — museum labels. We borrow the grammar, not the sacred mark. */}
        <div className="mt-14">
          <div className="max-w-2xl">
            <p className="eyebrow text-gold/80">A vocabulary, not a reproduction</p>
            <h3 className="mt-3 font-display text-2xl font-semibold text-cream sm:text-3xl">
              The grammar of Adinkra.
            </h3>
            <p className="mt-4 leading-relaxed text-cream/80">
              Adinkra is the visual language of the Akan. We borrow its grammar — clean,
              uniform lines that carry meaning — to mark the values this home is built on.
              These are drawn with respect as our own motifs; they are never reproductions
              of sacred or company-specific marks.
            </p>
          </div>

          <ul className="mt-10 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {SYMBOLS.map((sym, i) => (
              <li
                key={sym.name}
                className={`rise rise-${Math.min(i + 1, 4)} flex items-start gap-4`}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-cream/[0.06] text-gold"
                >
                  <Adinkra name={sym.name} size={28} labelled={false} strokeWidth={1.4} />
                </span>
                <div className="border-l border-cream/15 pl-4">
                  <h4 className="font-display text-lg font-semibold text-cream">{sym.title}</h4>
                  <p className="mt-1.5 text-sm leading-relaxed text-cream/75">{sym.meaning}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Sober closing note — the Castle's history is held with care. */}
        <div className="mt-16 border-t border-cream/15 pt-8">
          <p className="flex items-start gap-3 max-w-3xl font-serif text-base italic leading-relaxed text-cream/70 sm:text-lg">
            <Adinkra
              name="nyame-nwu-na-mawu"
              size={22}
              labelled={false}
              strokeWidth={1.4}
              className="mt-1 shrink-0 text-gold/70"
            />
            <span>
              Cape Coast Castle and its Door of No Return are part of who we are. That
              history is held soberly here, with the care it is owed — never as decoration,
              and never as a tourist gimmick.
            </span>
          </p>
        </div>
      </div>
    </Section>
  );
}
