import { Link } from "react-router-dom";
import { Adinkra } from "@/components/adinkra";
import { SectionIcon } from "@/components/section-icon";
import { Section, Eyebrow } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { useGoals, STATUS_LABEL, type GoalStatus } from "@/lib/goals";

const STATUS_STYLES: Record<GoalStatus, { chip: string; marker: string }> = {
  active: {
    chip: "border-teal/40 bg-teal/15 text-cream",
    marker: "bg-teal",
  },
  achieved: {
    chip: "border-teal/40 bg-teal/15 text-cream",
    marker: "bg-teal",
  },
  pending_review: {
    chip: "border-gold/40 bg-gold/15 text-cream",
    marker: "bg-gold",
  },
  missed: {
    chip: "border-clay/45 bg-clay/15 text-cream",
    marker: "bg-clay",
  },
};

function GoalStatusChip({ status }: Readonly<{ status: GoalStatus }>) {
  const style = STATUS_STYLES[status];
  const label = status === "pending_review" ? "Awaiting review" : STATUS_LABEL[status];

  return (
    <span
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] ${style.chip}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.marker}`} aria-hidden />
      {label}
    </span>
  );
}

/**
 * The featured annual town commitment, read live from /api/goals. Its public
 * promise and accountability details share one compact dossier so the home
 * page keeps its momentum without losing any of the goal's context.
 */
export function TownGoal() {
  const goals = useGoals();
  const featured = goals.find((goal) => goal.featured);
  if (!featured) return null;

  return (
    <Section tone="paper" size="wide" className="relative overflow-hidden">
      <article
        aria-labelledby="town-goal-title"
        className="on-dark on-dark-pin relative isolate overflow-hidden rounded-[var(--radius-card)] border border-green/10 bg-green-900 shadow-[var(--shadow-lift)] lg:grid lg:grid-cols-[minmax(0,1.16fr)_minmax(21rem,0.84fr)]"
      >
        <div className="panel-perspective-grid" aria-hidden />
        <Adinkra
          name="adinkrahene"
          size={320}
          labelled={false}
          className="pointer-events-none absolute -bottom-36 -left-24 text-gold/[0.055]"
          aria-hidden
        />

        <div className="relative px-6 py-10 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <Reveal>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/[0.12] text-gold">
                <SectionIcon id="better" className="h-5 w-5" />
              </span>
              <div>
                <Eyebrow className="!text-gold">Oguaa’s goal</Eyebrow>
                <p className="mt-0.5 text-xs font-semibold text-cream/60">
                  Public commitment · {featured.periodLabel}
                </p>
              </div>
            </div>

            <h2
              id="town-goal-title"
              className="mt-8 max-w-3xl font-display text-[clamp(2.55rem,5.4vw,4.8rem)] font-semibold leading-[0.98] tracking-[-0.025em] text-cream"
            >
              {featured.title}
            </h2>

            {featured.description && (
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-cream/78 sm:text-lg">
                {featured.description}
              </p>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-cream/15 pt-6">
              <GoalStatusChip status={featured.status} />
              {featured.setAtDurbar && (
                <span className="inline-flex min-h-9 items-center rounded-full border border-cream/20 bg-cream/[0.055] px-3.5 py-1.5 text-xs font-semibold text-cream/78">
                  Set at the durbar
                </span>
              )}
            </div>
          </Reveal>
        </div>

        <div className="theme-surface relative flex flex-col border-t border-green/10 bg-cream px-6 py-8 text-ink sm:px-9 sm:py-10 lg:border-l lg:border-t-0 lg:px-10 lg:py-12">
          <Reveal className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold-text">
                  Accountability card
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  The measure the town has agreed to meet.
                </p>
              </div>
              <span className="text-4xl font-semibold leading-none text-green/20" aria-hidden>
                {featured.periodLabel.slice(-2)}
              </span>
            </div>

            {featured.target && (
              <div className="mt-8 border-y border-green/12 py-7">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-ink-faint">
                  Public target
                </p>
                <p className="mt-3 text-xl font-semibold leading-snug text-ink sm:text-2xl">
                  {featured.target}
                </p>
              </div>
            )}

            <dl className={`grid gap-5 ${featured.target ? "mt-7" : "mt-10"}`}>
              <div className="flex items-baseline justify-between gap-5 border-b border-green/10 pb-4">
                <dt className="text-[0.65rem] font-bold uppercase tracking-[0.17em] text-ink-faint">
                  Goal period
                </dt>
                <dd className="text-sm font-semibold text-ink">{featured.periodLabel}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-5 border-b border-green/10 pb-4">
                <dt className="text-[0.65rem] font-bold uppercase tracking-[0.17em] text-ink-faint">
                  Current status
                </dt>
                <dd className="text-sm font-semibold text-green-text">
                  {STATUS_LABEL[featured.status]}
                </dd>
              </div>
            </dl>

            <Link
              to="/better#goals"
              className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gold-brand px-5 py-3 text-center text-sm font-bold text-green-900 transition-colors hover:bg-gold lg:mt-auto lg:translate-y-2"
            >
              Follow the town’s goals
            </Link>
          </Reveal>
        </div>
      </article>
    </Section>
  );
}
