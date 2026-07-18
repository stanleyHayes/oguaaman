import { Link } from "react-router-dom";
import { Adinkra } from "@/components/adinkra";
import { SectionIcon } from "@/components/section-icon";
import { Section, Eyebrow } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import {
  RINGS,
  useCivic,
  type CivicBehaviour,
  type CivicRing,
} from "@/lib/civic";

const RING_LABELS = Object.fromEntries(
  RINGS.map((ring) => [ring.key, ring.label]),
) as Record<CivicRing, string>;

function DirectionIcon({ type }: Readonly<{ type: CivicBehaviour["type"] }>) {
  if (type === "do") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function BehaviourGroup({
  type,
  items,
}: Readonly<{
  type: CivicBehaviour["type"];
  items: CivicBehaviour[];
}>) {
  const isDo = type === "do";

  return (
    <div
      className={`overflow-hidden rounded-[var(--radius-card)] border ${
        isDo
          ? "border-teal/20 bg-teal/[0.045]"
          : "border-clay/20 bg-clay/[0.045]"
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-green/10 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className={`on-dark-pin grid h-7 w-7 place-items-center rounded-full text-cream ${
              isDo ? "bg-teal" : "bg-clay"
            }`}
          >
            <DirectionIcon type={type} />
          </span>
          <div>
            <p className={`text-[0.65rem] font-bold uppercase tracking-[0.2em] ${isDo ? "text-teal-text" : "text-clay-text"}`}>
              {isDo ? "Do" : "Stop"}
            </p>
            <p className="text-xs font-medium text-ink-muted">
              {isDo ? "Keep this moving" : "Leave this behind"}
            </p>
          </div>
        </div>
        <span className="text-2xl font-semibold text-ink-faint/55" aria-hidden>
          0{items.length}
        </span>
      </div>

      <Stagger as="ul" className="divide-y divide-green/10">
        {items.map((behaviour, index) => (
          <StaggerItem as="li" key={behaviour.slug} index={index}>
            <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 px-4 py-4">
              <span
                className={`pt-0.5 text-[0.62rem] font-bold tracking-[0.16em] ${
                  isDo ? "text-teal-text" : "text-clay-text"
                }`}
                aria-hidden
              >
                0{index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold leading-snug text-ink">
                  {behaviour.title}
                </p>
                <p className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  {RING_LABELS[behaviour.ring]} ring
                </p>
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}

function RingsFallback() {
  return (
    <Stagger as="ol" className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-green/10 bg-green/10 sm:grid-cols-2">
      {RINGS.map((ring, index) => (
        <StaggerItem as="li" key={ring.key} index={index} className="bg-paper p-4">
          <div className="flex items-start gap-3">
            <span className="on-dark-pin grid h-8 w-8 shrink-0 place-items-center rounded-full bg-green text-xs font-bold text-cream">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-bold text-ink">{ring.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{ring.note}</p>
            </div>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

/**
 * Home manifesto — frames the civic code as a shared practice, with live
 * examples from /api/civic and the six rings of responsibility.
 */
export function TownCode() {
  const { behaviors } = useCivic();
  const dos = behaviors.filter((behaviour) => behaviour.type === "do").slice(0, 3);
  const stops = behaviors.filter((behaviour) => behaviour.type === "stop").slice(0, 3);
  const hasExamples = dos.length > 0 || stops.length > 0;

  return (
    <Section tone="sand" size="wide" className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute -left-28 top-16 h-64 w-64 rounded-full border border-gold/15"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-10 h-44 w-44 rounded-full bg-gold/[0.08] blur-3xl"
        aria-hidden
      />

      <article
        aria-labelledby="town-code-title"
        className="on-dark on-dark-pin relative isolate overflow-hidden rounded-[calc(var(--radius-card)+0.5rem)] border border-green/10 bg-green-900 shadow-[var(--shadow-lift)] lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)]"
      >
        <div className="bg-contours relative overflow-hidden px-6 py-10 sm:px-10 sm:py-12 lg:px-12 lg:py-16">
          <div
            className="pointer-events-none absolute -left-32 -top-36 h-80 w-80 rounded-full border border-gold/10"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full border border-gold/10"
            aria-hidden
          />
          <Adinkra
            name="funtunfunefu"
            size={260}
            labelled={false}
            className="pointer-events-none absolute -bottom-16 -right-10 text-gold/[0.07]"
            aria-hidden
          />

          <Reveal className="relative z-10">
            <div className="mb-7 flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-gold/25 bg-gold/[0.12] text-gold">
                <SectionIcon id="better" className="h-5 w-5" />
              </span>
              <Eyebrow className="!text-gold">The civic revolution · Oguaa</Eyebrow>
            </div>

            <h2
              id="town-code-title"
              className="max-w-lg font-display text-[clamp(2.8rem,6vw,5.4rem)] font-semibold leading-[0.92] tracking-[-0.035em] text-cream"
            >
              Build a <span className="italic text-gold">better</span>
              <br />
              Oguaa.
            </h2>

            <p className="mt-7 max-w-xl text-base leading-relaxed text-cream/78 sm:text-lg">
              A great town is built by small habits, kept by everyone — the way we
              greet, the way we trade, the way we keep the shore and the street.
              This is the code of Cape Coast, ringed from the self to the nation —
              and a pledge you can make today.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/better#pledge"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gold-brand px-5 py-2.5 text-sm font-bold text-green-900 transition-colors hover:bg-gold"
              >
                Take the pledge
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <Link
                to="/better"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-cream/30 bg-cream/[0.04] px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-gold hover:bg-cream/[0.08]"
              >
                See the town’s code
              </Link>
            </div>
          </Reveal>
        </div>

        <div className="theme-surface relative border-t border-green/10 bg-cream px-5 py-7 text-ink sm:px-7 sm:py-9 lg:border-l lg:border-t-0 lg:px-8 lg:py-10">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold-text">
                The code, in practice
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
                From self to nation.
              </h3>
            </div>
            <div className="text-right">
              <p className="text-4xl font-semibold leading-none text-green">06</p>
              <p className="mt-1 text-[0.58rem] font-bold uppercase tracking-[0.17em] text-ink-faint">
                Civic rings
              </p>
            </div>
          </div>

          <ol className="relative mb-7 grid grid-cols-6" aria-label="Six civic rings, from self to nation">
            <span className="absolute left-[8.33%] right-[8.33%] top-3.5 h-px bg-green/15" aria-hidden />
            {RINGS.map((ring, index) => (
              <li key={ring.key} className="relative flex min-w-0 flex-col items-center text-center">
                <span
                  className={`relative z-10 grid h-7 w-7 place-items-center rounded-full border text-[0.6rem] font-bold ${
                    index === 0 || index === RINGS.length - 1
                      ? "on-dark-pin border-green bg-green text-cream"
                      : "border-green/20 bg-cream text-green"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="mt-2 w-full truncate px-0.5 text-[0.55rem] font-bold uppercase tracking-[0.08em] text-ink-muted sm:text-[0.62rem]">
                  {ring.label}
                </span>
              </li>
            ))}
          </ol>

          {hasExamples ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {dos.length > 0 && <BehaviourGroup type="do" items={dos} />}
              {stops.length > 0 && <BehaviourGroup type="stop" items={stops} />}
            </div>
          ) : (
            <RingsFallback />
          )}
        </div>
      </article>
    </Section>
  );
}
