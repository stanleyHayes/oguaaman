import { useEffect, useId, useState } from "react";
import { useLoaderData } from "react-router-dom";
import { Adinkra, type AdinkraName } from "@/components/adinkra";
import { GoalsBoard } from "@/components/goals";
import { Reveal, Stagger, StaggerItem, WordReveal } from "@/components/motion";
import { SectionIcon } from "@/components/section-icon";
import { Container, CTA, Eyebrow } from "@/components/ui";
import { api } from "@/lib/api";
import type {
  CivicBehaviour,
  CivicData,
  CivicLesson,
  CivicRing,
  Goal,
} from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";

export async function loader(): Promise<CivicData & { goals: Goal[] }> {
  const [civic, goals] = await Promise.all([
    api.civic(),
    api.goals().catch(() => [] as Goal[]),
  ]);
  return { ...civic, goals };
}

const PLEDGE_KEY = "oguaa.civic-pledge";
const RING_ORDER: CivicRing[] = ["self", "home", "school", "work", "town", "nation"];
const HERO_GRADIENT = "linear-gradient(142deg, #174E38 0%, #0C2C1F 58%, #071E15 100%)";

const RING_META: Record<
  CivicRing,
  {
    label: string;
    fante?: string;
    blurb: string;
    symbol: AdinkraName;
    accent: string;
  }
> = {
  self: {
    label: "Self",
    blurb: "It begins with you — the person you are when no one is watching.",
    symbol: "dwennimmen",
    accent: "bg-green",
  },
  home: {
    label: "Home",
    blurb: "The first republic — how we live with family, tenants and neighbours.",
    symbol: "funtunfunefu",
    accent: "bg-gold-brand",
  },
  school: {
    label: "School",
    blurb: "The Citadel of Education — habits carried from the classroom into life.",
    symbol: "sankofa",
    accent: "bg-maroon-900",
  },
  work: {
    label: "Work",
    blurb: "The working city — markets, offices and trade done with pride.",
    symbol: "nkyinkyim",
    accent: "bg-teal",
  },
  town: {
    label: "Town",
    fante: "Oguaa",
    blurb: "Cape Coast civic life — the shore, the markets, the queue, the elders.",
    symbol: "crab",
    accent: "bg-clay",
  },
  nation: {
    label: "Nation",
    blurb: "One Ghana — the town's habits scaled up to a country.",
    symbol: "adinkrahene",
    accent: "bg-green",
  },
};

const LESSON_SYMBOLS: AdinkraName[] = [
  "adinkrahene",
  "sankofa",
  "nkyinkyim",
  "dwennimmen",
  "funtunfunefu",
  "crab",
];

function DirectionGlyph({ type, className = "h-4 w-4" }: Readonly<{ type: CivicBehaviour["type"]; className?: string }>) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {type === "do" ? (
        <path d="m5 12 4 4L19 6" />
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m7 7 10 10" />
        </>
      )}
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function ManifestoHero({
  behaviors,
  populatedRings,
  pledgeCount,
}: Readonly<{
  behaviors: CivicBehaviour[];
  populatedRings: number;
  pledgeCount: number;
}>) {
  const doCount = behaviors.filter((behavior) => behavior.type === "do").length;
  const stopCount = behaviors.filter((behavior) => behavior.type === "stop").length;
  const metrics = [
    { value: behaviors.length, label: "behaviours" },
    { value: doCount, label: "to keep" },
    { value: stopCount, label: "to drop" },
    { value: populatedRings, label: "rings of life" },
  ];

  return (
    <section className="bg-sand py-5 sm:py-8">
      <Container size="wide">
        <article className="on-dark on-dark-pin relative isolate overflow-hidden rounded-[calc(var(--radius-card)+0.5rem)] bg-green-900 shadow-[var(--shadow-lift)] lg:grid lg:grid-cols-[minmax(0,0.92fr)_minmax(24rem,1.08fr)]">
          <div className="bg-dotgrid relative overflow-hidden px-6 py-12 sm:px-10 sm:py-16 lg:px-12 lg:py-20" style={{ background: HERO_GRADIENT }}>
            <Adinkra
              name="funtunfunefu"
              size={300}
              labelled={false}
              className="pointer-events-none absolute -bottom-20 -right-16 text-gold/[0.07]"
            />
            <Reveal className="relative z-10">
              <div className="mb-7 flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-full border border-gold/30 bg-gold/[0.12] text-gold">
                  <SectionIcon id="better" className="h-5 w-5" />
                </span>
                <Eyebrow className="!text-gold">The civic revolution · Oguaa</Eyebrow>
              </div>
            </Reveal>

            <WordReveal
              as="h1"
              text="Build a better Oguaa."
              accentWords={["better"]}
              accentClassName="italic text-gold"
              className="relative z-10 max-w-xl text-[clamp(3.2rem,7vw,6.25rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-cream"
            />

            <Reveal as="p" delay={0.08} className="relative z-10 mt-7 max-w-xl text-base leading-relaxed text-cream/82 sm:text-lg">
              Great towns are not built by grand gestures. They are built by the small daily
              behaviours of ordinary people — the litter picked up, the queue kept, the elder
              greeted, the work done well. This is the quiet revolution, and it is ours to start.
            </Reveal>

            <Reveal delay={0.14} className="relative z-10 mt-8 flex flex-wrap gap-3">
              <a href="#pledge" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gold-brand px-5 py-2.5 text-sm font-bold text-green-900 transition-colors hover:bg-gold">
                Take the pledge
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
              <a href="#behaviours" className="inline-flex min-h-11 items-center justify-center rounded-full border border-cream/30 bg-cream/[0.04] px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-gold hover:bg-cream/[0.08]">
                Explore the town code
              </a>
            </Reveal>

            {behaviors.length > 0 && (
              <Reveal delay={0.2} className="relative z-10 mt-10">
                <dl className="grid grid-cols-2 border-y border-cream/15 sm:grid-cols-4">
                  {metrics.map((metric, index) => (
                    <div key={metric.label} className={`py-4 ${index % 2 === 0 ? "pr-4" : "border-l border-cream/15 pl-4"} ${index >= 2 ? "border-t border-cream/15" : ""} sm:border-l sm:border-t-0 sm:border-cream/15 sm:px-4 sm:first:border-l-0 sm:first:pl-0`}>
                      <dt className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-cream/55">{metric.label}</dt>
                      <dd className="mt-1 text-2xl font-bold text-gold">{String(metric.value).padStart(2, "0")}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            )}
          </div>

          <div className="theme-surface relative border-t border-green/10 bg-cream px-5 py-8 text-ink sm:px-8 sm:py-10 lg:border-l lg:border-t-0 lg:px-10 lg:py-12">
            <div className="flex items-end justify-between gap-4 border-b border-sand pb-6">
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold-text">The civic field guide</p>
                <h2 className="mt-2 text-3xl font-semibold text-ink">From self to nation.</h2>
              </div>
              <span className="text-4xl font-semibold leading-none text-green" aria-hidden>06</span>
            </div>

            <ol className="mt-2 divide-y divide-sand">
              {RING_ORDER.map((ring, index) => {
                const meta = RING_META[ring];
                return (
                  <li key={ring} className="grid grid-cols-[2.25rem_2.5rem_minmax(0,1fr)] items-center gap-3 py-3.5">
                    <span className="text-[0.64rem] font-bold tracking-[0.14em] text-ink-faint">0{index + 1}</span>
                    <span className="grid h-10 w-10 place-items-center rounded-full border border-green/12 bg-paper text-gold-text">
                      <Adinkra name={meta.symbol} size={20} labelled={false} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink">
                        {meta.label}
                        {meta.fante && <span className="ml-1.5 text-xs italic text-gold-text">{meta.fante}</span>}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-ink-muted">{meta.blurb}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-6 flex items-center gap-3 rounded-[var(--radius-card)] border border-green/15 bg-green/[0.05] p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-green text-sm font-bold text-on-green">
                {pledgeCount}
              </span>
              <p className="text-sm leading-relaxed text-ink-muted">
                {pledgeCount > 0
                  ? `You have pledged ${pledgeCount} ${pledgeCount === 1 ? "behaviour" : "behaviours"}.`
                  : "Tick the habits you'll live by to begin your pledge."}
              </p>
            </div>
          </div>
        </article>
      </Container>
    </section>
  );
}

function CivicNav() {
  const items = [
    { href: "#goals", label: "Town goals" },
    { href: "#behaviours", label: "Town code" },
    { href: "#pledge", label: "Your pledge" },
    { href: "#lessons", label: "Civic lessons" },
  ];

  return (
    <nav aria-label="On this page" className="border-y border-sand bg-paper">
      <Container size="wide">
        <ol className="flex snap-x items-stretch overflow-x-auto border-l border-sand">
          {items.map((item, index) => (
            <li key={item.href} className="min-w-[10.5rem] flex-1 snap-start">
              <a href={item.href} className="group flex min-h-16 items-center gap-3 border-r border-sand px-4 py-3 transition-colors hover:bg-cream">
                <span className="text-[0.62rem] font-bold tracking-[0.15em] text-gold-text">0{index + 1}</span>
                <span className="text-sm font-semibold text-ink group-hover:text-green-text">{item.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </Container>
    </nav>
  );
}

function RingSelector({
  rings,
  groups,
  active,
  onSelect,
}: Readonly<{
  rings: CivicRing[];
  groups: Record<CivicRing, CivicBehaviour[]>;
  active: CivicRing;
  onSelect: (ring: CivicRing) => void;
}>) {
  return (
    <div className="rounded-[var(--radius-card)] border border-sand bg-paper p-2 shadow-[var(--shadow-card)]" aria-label="Choose a civic ring">
      <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
        {rings.map((ring, index) => {
          const meta = RING_META[ring];
          const selected = ring === active;
          return (
            <button
              key={ring}
              type="button"
              onClick={() => onSelect(ring)}
              aria-pressed={selected}
              className={`relative flex min-h-14 items-center gap-3 overflow-hidden rounded-[calc(var(--radius-card)-0.25rem)] border px-3 py-2.5 text-left transition-colors ${
                selected
                  ? "border-green bg-green text-on-green"
                  : "border-transparent text-ink hover:border-sand hover:bg-cream"
              }`}
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${meta.accent}`} aria-hidden />
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${selected ? "bg-cream/12 text-gold" : "border border-sand bg-cream text-gold-text"}`}>
                <Adinkra name={meta.symbol} size={17} labelled={false} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {meta.label}
                  {meta.fante && <span className={`ml-1 text-[0.65rem] italic ${selected ? "text-gold" : "text-gold-text"}`}>{meta.fante}</span>}
                </span>
                <span className={`mt-0.5 block text-[0.62rem] font-semibold uppercase tracking-[0.12em] ${selected ? "text-on-green/65" : "text-ink-faint"}`}>
                  0{index + 1} · {groups[ring].length} {groups[ring].length === 1 ? "habit" : "habits"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BehaviourRow({
  behavior,
  checked,
  onToggle,
}: Readonly<{
  behavior: CivicBehaviour;
  checked: boolean;
  onToggle: () => void;
}>) {
  const whyId = useId();
  const [open, setOpen] = useState(false);
  const isDo = behavior.type === "do";

  return (
    <li className="bg-paper px-4 py-5 sm:px-5">
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3.5">
        <label className="group grid h-11 w-11 cursor-pointer place-items-center rounded-full" title={checked ? "Remove from pledge" : "Add to pledge"}>
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="sr-only"
          />
          <span className={`grid h-7 w-7 place-items-center rounded-lg border transition-colors ${
            checked
              ? "border-gold-brand bg-gold-brand text-green-900"
              : "border-green/25 bg-cream text-transparent group-hover:border-green"
          }`}>
            <CheckGlyph />
          </span>
          <span className="sr-only">
            {checked ? "Remove" : "Add"} {behavior.title} {checked ? "from" : "to"} your pledge
          </span>
        </label>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="max-w-md text-base font-bold leading-snug text-ink">{behavior.title}</h4>
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[0.6rem] font-bold uppercase tracking-[0.14em] ${
              isDo ? "bg-teal/[0.09] text-teal-text" : "bg-clay/[0.09] text-clay-text"
            }`}>
              <DirectionGlyph type={behavior.type} className="h-3.5 w-3.5" />
              {isDo ? "Do" : "Stop"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{behavior.description}</p>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={whyId}
            className={`mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] transition-colors ${isDo ? "text-teal-text hover:text-green-text" : "text-clay-text hover:text-clay"}`}
          >
            Why it matters
            <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-45" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <div id={whyId} hidden={!open} className={`border-l-2 pl-3 text-sm leading-relaxed text-ink-muted ${isDo ? "border-teal/40" : "border-clay/40"}`}>
            {behavior.why}
          </div>
        </div>
      </div>
    </li>
  );
}

function BehaviourLane({
  type,
  items,
  pledged,
  onToggle,
}: Readonly<{
  type: CivicBehaviour["type"];
  items: CivicBehaviour[];
  pledged: Set<string>;
  onToggle: (slug: string) => void;
}>) {
  if (items.length === 0) return null;
  const isDo = type === "do";

  return (
    <fieldset className={`min-w-0 overflow-hidden rounded-[var(--radius-card)] border ${isDo ? "border-teal/25" : "border-clay/25"}`}>
      <legend className="sr-only">{isDo ? "Behaviours to keep" : "Behaviours to stop"}</legend>
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-5 ${isDo ? "border-teal/20 bg-teal/[0.06]" : "border-clay/20 bg-clay/[0.06]"}`}>
        <div className="flex items-center gap-2.5">
          <span className={`grid h-8 w-8 place-items-center rounded-full text-on-green ${isDo ? "bg-green" : "bg-maroon-900"}`}>
            <DirectionGlyph type={type} />
          </span>
          <div>
            <p className={`text-[0.68rem] font-bold uppercase tracking-[0.18em] ${isDo ? "text-teal-text" : "text-clay-text"}`}>{isDo ? "Do" : "Stop"}</p>
            <p className="text-xs text-ink-muted">{isDo ? "Keep this moving" : "Leave this behind"}</p>
          </div>
        </div>
        <span className="text-xl font-semibold text-ink-faint">{String(items.length).padStart(2, "0")}</span>
      </div>
      <ul className="divide-y divide-sand">
        {items.map((behavior) => (
          <BehaviourRow
            key={behavior.slug}
            behavior={behavior}
            checked={pledged.has(behavior.slug)}
            onToggle={() => onToggle(behavior.slug)}
          />
        ))}
      </ul>
    </fieldset>
  );
}

function PledgeReceipt({
  count,
  total,
  onClear,
}: Readonly<{
  count: number;
  total: number;
  onClear: () => void;
}>) {
  const progress = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <aside id="pledge" className="on-dark on-dark-pin scroll-mt-32 overflow-hidden rounded-[var(--radius-card)] bg-green-900 p-5 text-cream shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow className="!text-gold">Your part</Eyebrow>
          <h2 className="mt-2 text-2xl font-semibold">Your civic pledge.</h2>
        </div>
        <Adinkra name="funtunfunefu" size={32} labelled={false} className="text-gold" />
      </div>

      <div className="mt-7 flex items-end gap-2">
        <span className="text-5xl font-bold leading-none text-gold">{String(count).padStart(2, "0")}</span>
        <span className="pb-1 text-sm text-cream/60">/ {String(total).padStart(2, "0")}</span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-cream/12" aria-hidden>
        <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>

      <p role="status" aria-live="polite" className="mt-5 text-sm leading-relaxed text-cream/78">
        {count > 0
          ? `Medaase — you pledged ${count} ${count === 1 ? "behaviour" : "behaviours"} for a better Oguaa.`
          : "Tick the habits you'll live by to begin your pledge."}
      </p>
      <p className="mt-3 border-t border-cream/12 pt-4 text-xs leading-relaxed text-cream/55">
        Nothing is sent anywhere. Your pledge is kept privately on this device — a promise from you to your town.
      </p>

      {count > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 inline-flex min-h-11 items-center rounded-full border border-cream/25 px-4 py-2 text-sm font-semibold text-cream transition-colors hover:border-clay hover:text-gold"
        >
          Clear pledge
        </button>
      )}
    </aside>
  );
}

function TownCode({
  groups,
  rings,
  activeRing,
  onSelectRing,
  pledged,
  pledgeCount,
  totalBehaviors,
  onToggle,
  onClear,
}: Readonly<{
  groups: Record<CivicRing, CivicBehaviour[]>;
  rings: CivicRing[];
  activeRing: CivicRing;
  onSelectRing: (ring: CivicRing) => void;
  pledged: Set<string>;
  pledgeCount: number;
  totalBehaviors: number;
  onToggle: (slug: string) => void;
  onClear: () => void;
}>) {
  const activeMeta = RING_META[activeRing];
  const activeItems = groups[activeRing];
  const dos = activeItems.filter((behavior) => behavior.type === "do");
  const stops = activeItems.filter((behavior) => behavior.type === "stop");
  const hasBothLanes = dos.length > 0 && stops.length > 0;

  return (
    <section id="behaviours" className="scroll-mt-32 bg-cream py-16 sm:py-24">
      <Container size="wide">
        <Reveal className="grid gap-6 lg:grid-cols-[minmax(0,0.68fr)_minmax(22rem,0.32fr)] lg:items-end">
          <div>
            <Eyebrow>From the self outward</Eyebrow>
            <h2 className="mt-3 max-w-3xl text-4xl font-semibold text-ink sm:text-5xl">The code is something you practise.</h2>
          </div>
          <p className="max-w-xl text-base leading-relaxed text-ink-muted lg:justify-self-end">
            Six rings of civic life, each widening from the person you are to the nation we share. Read the code, open the reason, then add the habits you will live by.
          </p>
        </Reveal>

        {rings.length === 0 ? (
          <div className="mt-10 grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <PledgeReceipt count={0} total={0} onClear={onClear} />
            <Reveal className="rounded-[var(--radius-card)] border border-dashed border-gold-brand/50 bg-paper p-10 text-center">
              <Adinkra name="funtunfunefu" size={40} className="mx-auto text-gold-brand" />
              <p className="mx-auto mt-4 max-w-md text-ink-muted">The civic charter is being written. Check back soon — the behaviours that build a better Oguaa are on their way.</p>
            </Reveal>
          </div>
        ) : (
          <div className="mt-12 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
            <div className="space-y-5 lg:sticky lg:top-[7.5rem]">
              <RingSelector rings={rings} groups={groups} active={activeRing} onSelect={onSelectRing} />
              <PledgeReceipt count={pledgeCount} total={totalBehaviors} onClear={onClear} />
            </div>

            <Reveal className="min-w-0 rounded-[calc(var(--radius-card)+0.25rem)] border border-sand bg-paper p-4 shadow-[var(--shadow-card)] sm:p-6 lg:p-8">
              <div className="flex flex-col gap-5 border-b border-sand pb-7 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-gold-border/25 bg-gold/[0.10] text-gold-text">
                    <Adinkra name={activeMeta.symbol} size={28} />
                  </span>
                  <div>
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-gold-text">The {activeMeta.label.toLowerCase()} ring</p>
                    <h2 className="mt-1.5 text-3xl font-semibold text-ink sm:text-4xl">
                      {activeMeta.label}
                      {activeMeta.fante && <span className="ml-2 text-lg italic text-gold-text">{activeMeta.fante}</span>}
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">{activeMeta.blurb}</p>
                  </div>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <p className="text-3xl font-semibold text-green-text">{String(activeItems.length).padStart(2, "0")}</p>
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.15em] text-ink-faint">habits in this ring</p>
                </div>
              </div>

              <div className={`mt-6 grid gap-5 ${hasBothLanes ? "xl:grid-cols-2" : ""}`}>
                <BehaviourLane type="do" items={dos} pledged={pledged} onToggle={onToggle} />
                <BehaviourLane type="stop" items={stops} pledged={pledged} onToggle={onToggle} />
              </div>
            </Reveal>
          </div>
        )}
      </Container>
    </section>
  );
}

function CivilizationArchive({ civilizations }: Readonly<{ civilizations: CivicLesson[] }>) {
  const [activeSlug, setActiveSlug] = useState(civilizations[0]?.slug ?? "");
  if (civilizations.length === 0) return null;

  const activeIndex = Math.max(0, civilizations.findIndex((lesson) => lesson.slug === activeSlug));
  const active = civilizations[activeIndex];
  const symbol = LESSON_SYMBOLS[activeIndex % LESSON_SYMBOLS.length];

  return (
    <section id="lessons" className="scroll-mt-32 bg-paper py-16 sm:py-24">
      <Container size="wide">
        <Reveal className="grid gap-6 lg:grid-cols-[minmax(0,0.62fr)_minmax(22rem,0.38fr)] lg:items-end">
          <div>
            <Eyebrow>What made them great</Eyebrow>
            <h2 className="mt-3 max-w-3xl text-4xl font-semibold text-ink sm:text-5xl">Civic habits outlast empires.</h2>
          </div>
          <p className="max-w-xl leading-relaxed text-ink-muted lg:justify-self-end">
            Every civilization that flourished did so on shared civic behaviour — not on wealth or arms alone. Their lessons still have something to say to Oguaa.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(16rem,0.36fr)_minmax(0,0.64fr)]">
          <Stagger className="grid grid-cols-2 gap-2 rounded-[var(--radius-card)] border border-sand bg-cream p-2 shadow-[var(--shadow-card)] sm:grid-cols-3 lg:grid-cols-1">
            {civilizations.map((lesson, index) => {
              const selected = lesson.slug === active.slug;
              return (
                <StaggerItem key={lesson.slug} index={index}>
                  <button
                    type="button"
                    onClick={() => setActiveSlug(lesson.slug)}
                    aria-pressed={selected}
                    className={`flex min-h-16 w-full items-center gap-3 rounded-[calc(var(--radius-card)-0.25rem)] border px-3 py-3 text-left transition-colors ${
                      selected
                        ? "border-green bg-green text-on-green"
                        : "border-transparent text-ink hover:border-sand hover:bg-paper"
                    }`}
                  >
                    <span className={`text-[0.62rem] font-bold tracking-[0.14em] ${selected ? "text-gold" : "text-gold-text"}`}>0{index + 1}</span>
                    <span className="min-w-0">
                      <span className={`block text-[0.6rem] font-bold uppercase tracking-[0.12em] ${selected ? "text-on-green/65" : "text-ink-faint"}`}>{lesson.era}</span>
                      <span className="mt-0.5 block truncate text-sm font-bold">{lesson.name}</span>
                    </span>
                  </button>
                </StaggerItem>
              );
            })}
          </Stagger>

          <Reveal className="on-dark on-dark-pin relative min-h-[25rem] overflow-hidden rounded-[calc(var(--radius-card)+0.25rem)] bg-green-900 p-7 text-cream shadow-[var(--shadow-lift)] sm:p-10 lg:p-12">
            <Adinkra name={symbol} size={250} labelled={false} className="pointer-events-none absolute -bottom-12 -right-10 text-gold/[0.07]" />
            <div className="relative z-10 flex h-full flex-col">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold">{active.era}</p>
                  <h3 className="mt-3 text-3xl font-semibold text-cream sm:text-4xl">{active.name}</h3>
                </div>
                <span className="text-5xl font-semibold leading-none text-cream/12" aria-hidden>0{activeIndex + 1}</span>
              </div>

              <div className="mt-10 max-w-xl border-l-2 border-gold pl-5">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-gold">The principle</p>
                <p className="mt-2 text-xl font-semibold leading-snug text-cream">{active.principle}</p>
              </div>

              <p className="mt-7 max-w-2xl text-base leading-relaxed text-cream/78">{active.lesson}</p>

              <div className="mt-auto flex items-center gap-3 pt-10 text-xs font-semibold uppercase tracking-[0.14em] text-cream/55">
                <Adinkra name={symbol} size={20} labelled={false} className="text-gold" />
                Lesson {activeIndex + 1} of {civilizations.length}
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

function ClosingBand() {
  return (
    <section className="on-dark on-dark-pin bg-green py-16 text-cream sm:py-20">
      <Container size="wide">
        <Reveal className="grid gap-8 lg:grid-cols-[minmax(0,0.68fr)_minmax(18rem,0.32fr)] lg:items-center">
          <div className="flex items-start gap-5">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/[0.12] text-gold">
              <Adinkra name="funtunfunefu" size={27} labelled={false} />
            </span>
            <div>
              <Eyebrow className="!text-gold">From pledge to practice</Eyebrow>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">A town is the sum of its habits.</h2>
              <p className="mt-4 max-w-2xl text-cream/78">
                Pride, then cohesion, then a place worth showing the world. Turn the pledge into practice — back a project, keep an event, or simply live the greens today.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <CTA to="/projects" variant="gold">Back a project</CTA>
            <CTA to="/community" variant="outline-dark">Join the community</CTA>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

function groupBehaviors(behaviors: CivicBehaviour[]): Record<CivicRing, CivicBehaviour[]> {
  return Object.fromEntries(
    RING_ORDER.map((ring) => [ring, behaviors.filter((behavior) => behavior.ring === ring)]),
  ) as Record<CivicRing, CivicBehaviour[]>;
}

function readPledge(): Set<string> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(PLEDGE_KEY) : null;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

export function Component() {
  usePageTitle("Build a better Oguaa");
  const { behaviors, civilizations, goals } = useLoaderData() as CivicData & { goals: Goal[] };
  const groups = groupBehaviors(behaviors);
  const rings = RING_ORDER.filter((ring) => groups[ring].length > 0);
  const [activeRing, setActiveRing] = useState<CivicRing>(rings[0] ?? "self");
  const [pledged, setPledged] = useState<Set<string>>(readPledge);

  useEffect(() => {
    try {
      localStorage.setItem(PLEDGE_KEY, JSON.stringify([...pledged]));
    } catch {
      /* Private browsing or blocked storage: keep the pledge in memory. */
    }
  }, [pledged]);

  const togglePledge = (slug: string) => {
    setPledged((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const pledgeCount = behaviors.reduce(
    (count, behavior) => count + (pledged.has(behavior.slug) ? 1 : 0),
    0,
  );

  return (
    <>
      <ManifestoHero behaviors={behaviors} populatedRings={rings.length} pledgeCount={pledgeCount} />
      <CivicNav />
      <GoalsBoard goals={goals} />
      <TownCode
        groups={groups}
        rings={rings}
        activeRing={activeRing}
        onSelectRing={setActiveRing}
        pledged={pledged}
        pledgeCount={pledgeCount}
        totalBehaviors={behaviors.length}
        onToggle={togglePledge}
        onClear={() => setPledged(new Set())}
      />
      <CivilizationArchive civilizations={civilizations} />
      <ClosingBand />
    </>
  );
}
