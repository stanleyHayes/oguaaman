import { Container, CTA, Eyebrow } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import type { Goal, GoalStatus } from "@/lib/types";

// ── Town Goals (civic accountability) ────────────────────────────────────────
// The town's collective commitments (GET /api/goals): the flagship annual goal
// set at the grand durbar plus finer cadences, shown to remind everyone and
// judged achieved/missed by an accountability officer. Shared by the home banner
// and the /better board so both read of a piece.

const CADENCE_LABEL: Record<Goal["cadence"], string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Half-year",
  annual: "Annual",
};

function statusChip(status: GoalStatus): { label: string; cls: string } {
  switch (status) {
    case "achieved":
      return { label: "Achieved ✓", cls: "bg-green/12 text-green-text" };
    case "missed":
      return { label: "Missed ✗", cls: "bg-clay/12 text-clay-text" };
    case "pending_review":
      return { label: "Awaiting review", cls: "bg-gold/20 text-gold-text" };
    default:
      return { label: "In progress", cls: "bg-green/12 text-green-text" };
  }
}

function StatusChip({ status, onDark = false }: Readonly<{ status: GoalStatus; onDark?: boolean }>) {
  const { label, cls } = statusChip(status);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${onDark ? "bg-cream/15 text-cream" : cls}`}>
      {label}
    </span>
  );
}

/** The headline goal to feature: the explicit `featured` one, else the current
 *  annual goal, else nothing. */
function featuredGoal(goals: Goal[]): Goal | undefined {
  return (
    goals.find((g) => g.featured) ??
    goals.find((g) => g.cadence === "annual" && (g.status === "active" || g.status === "pending_review"))
  );
}

/** Prominent home banner: the town's featured (annual/durbar) goal. Renders
 *  nothing until a featured goal exists. */
export function GoalBanner({ goals }: Readonly<{ goals: Goal[] }>) {
  const goal = featuredGoal(goals);
  if (!goal) return null;
  return (
    <section className="bg-paper py-6 sm:py-8" aria-labelledby="home-goal-title">
      <Container size="wide">
        <Reveal>
          <article className="on-dark on-dark-pin relative overflow-hidden rounded-[var(--radius-card)] border border-gold/20 bg-green-900 text-cream shadow-[var(--shadow-card)]">
            <span className="absolute inset-y-0 left-0 w-1 bg-gold-brand" aria-hidden />
            <span className="bg-dotgrid pointer-events-none absolute inset-0 opacity-30" aria-hidden />
            <div className="relative grid md:grid-cols-[minmax(0,1fr)_13.5rem] md:items-stretch">
              <div className="px-5 py-5 sm:px-7 sm:py-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Eyebrow className="!text-gold">Oguaa’s goal for {goal.periodLabel}</Eyebrow>
                  <StatusChip status={goal.status} onDark />
                </div>
                <h2 id="home-goal-title" className="mt-2.5 max-w-3xl text-xl font-semibold leading-snug text-cream sm:text-2xl">{goal.title}</h2>
                <div className="mt-3 flex flex-col gap-1.5 text-sm leading-relaxed text-cream/75 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                  {goal.target && (
                    <p className="max-w-3xl">
                      <span className="font-semibold text-gold">Target — </span>{goal.target}
                    </p>
                  )}
                  {goal.setAtDurbar && (
                    <p className="shrink-0 text-xs text-cream/60">Set at the grand durbar · judged at the next Fetu Afahye.</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-cream/12 bg-cream/[0.045] px-5 py-4 md:flex-col md:items-start md:justify-center md:border-l md:border-t-0 md:px-6">
                <div className="hidden md:block">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-cream/45">Town accountability</p>
                  <p className="mt-1 text-xs leading-snug text-cream/65">See every commitment and its record.</p>
                </div>
                <CTA to="/better#goals" variant="gold" className="w-full !px-4 !py-2 sm:w-auto md:w-full">See the town’s goals</CTA>
              </div>
            </div>
          </article>
        </Reveal>
      </Container>
    </section>
  );
}

function GoalLedgerRow({ goal, index }: Readonly<{ goal: Goal; index: number }>) {
  return (
    <article className="grid gap-4 border-b border-sand px-5 py-5 last:border-b-0 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-start sm:px-6">
      <span className="pt-0.5 text-[0.65rem] font-bold tracking-[0.16em] text-gold-text" aria-hidden>
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-ink-faint">
          {CADENCE_LABEL[goal.cadence]} · {goal.periodLabel}
        </p>
        <h3 className="mt-2 text-lg font-bold leading-snug text-ink">{goal.title}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{goal.description}</p>
        {goal.target && (
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            <span className="font-bold text-gold-text">Target — </span>
            {goal.target}
          </p>
        )}
      </div>
      <div className="sm:pt-0.5">
        <StatusChip status={goal.status} />
      </div>
    </article>
  );
}

function RecordCard({ goal }: Readonly<{ goal: Goal }>) {
  const achieved = goal.status === "achieved";
  return (
    <article className={`relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border bg-paper p-5 sm:p-6 ${achieved ? "border-green/20" : "border-clay/20"}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${achieved ? "bg-green" : "bg-clay"}`} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">
          {CADENCE_LABEL[goal.cadence]} · {goal.periodLabel}
        </span>
        <StatusChip status={goal.status} />
      </div>
      <h4 className="mt-3 text-lg font-semibold text-ink">{goal.title}</h4>
      {goal.reviewNote && <p className="mt-2 text-sm italic text-ink-muted">“{goal.reviewNote}”</p>}
      {goal.reviewedByName && <p className="mt-3 text-xs text-ink-faint">Judged by {goal.reviewedByName}</p>}
    </article>
  );
}

/** The full Town Goals board for the /better page: featured hero, the goals in
 *  progress now, and the honest record of what was kept and missed. */
export function GoalsBoard({ goals }: Readonly<{ goals: Goal[] }>) {
  if (goals.length === 0) return null;
  const featured = featuredGoal(goals);
  const current = goals.filter((g) => g !== featured && (g.status === "active" || g.status === "pending_review"));
  const record = goals.filter((g) => g !== featured && (g.status === "achieved" || g.status === "missed"));

  return (
    <section id="goals" className="scroll-mt-32 bg-sand py-16 sm:py-24">
      <Container size="wide">
        <Reveal className="grid gap-6 lg:grid-cols-[minmax(0,0.65fr)_minmax(22rem,0.35fr)] lg:items-end">
          <div>
            <Eyebrow>The town’s goals</Eyebrow>
            <h2 className="mt-3 max-w-3xl text-4xl font-semibold text-ink sm:text-5xl">What Oguaa is holding itself to.</h2>
          </div>
          <p className="max-w-xl leading-relaxed text-ink-muted lg:justify-self-end">
            Set together, shown to remind everyone, and judged honestly — kept or missed — by an accountability officer.
          </p>
        </Reveal>

        {featured && (
          <Reveal className="mt-10">
            <article className="on-dark on-dark-pin relative overflow-hidden rounded-[calc(var(--radius-card)+0.35rem)] bg-green-900 text-cream shadow-[var(--shadow-lift)] lg:grid lg:grid-cols-[minmax(0,0.68fr)_minmax(18rem,0.32fr)]">
              <div className="bg-dotgrid relative px-6 py-8 sm:px-9 sm:py-10">
                <div className="flex flex-wrap items-center gap-3">
                  <Eyebrow className="!text-gold">Oguaa’s goal for {featured.periodLabel}</Eyebrow>
                  <StatusChip status={featured.status} onDark />
                </div>
                <h3 className="mt-4 max-w-3xl text-2xl font-bold leading-tight text-cream sm:text-3xl">{featured.title}</h3>
                <p className="mt-4 max-w-2xl leading-relaxed text-cream/82">{featured.description}</p>
                {featured.setAtDurbar && (
                  <p className="mt-5 inline-flex rounded-full border border-cream/18 bg-cream/[0.06] px-3 py-1.5 text-xs font-semibold text-cream/70">
                    Set at the grand durbar · to be judged at the next Fetu Afahye.
                  </p>
                )}
              </div>
              <div className="border-t border-cream/12 bg-cream/[0.055] p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-9">
                {featured.target && (
                  <>
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-gold">The target</p>
                    <p className="mt-4 text-lg font-semibold leading-relaxed text-cream">{featured.target}</p>
                  </>
                )}
                <div className={featured.target ? "mt-8 border-t border-cream/12 pt-5" : ""}>
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.15em] text-cream/50">Cadence</p>
                  <p className="mt-1.5 text-sm font-semibold text-cream">{CADENCE_LABEL[featured.cadence]} · {featured.periodLabel}</p>
                </div>
                {(featured.reviewNote || featured.reviewedByName) && (
                  <div className="mt-6 border-t border-cream/12 pt-5">
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.15em] text-cream/50">The review</p>
                    {featured.reviewNote && <p className="mt-2 text-sm italic leading-relaxed text-cream/80">“{featured.reviewNote}”</p>}
                    {featured.reviewedByName && <p className="mt-2 text-xs text-cream/55">Judged by {featured.reviewedByName}</p>}
                  </div>
                )}
              </div>
            </article>
          </Reveal>
        )}

        {current.length > 0 && (
          <div className="mt-8 overflow-hidden rounded-[var(--radius-card)] border border-sand bg-paper shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-4 border-b border-sand bg-cream px-5 py-4 sm:px-6">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-ink">In progress now</h3>
              <span className="text-xs font-semibold text-ink-faint">{current.length} active</span>
            </div>
            <div>
              {current.map((goal, index) => (
                <GoalLedgerRow key={goal.id} goal={goal} index={index} />
              ))}
            </div>
          </div>
        )}

        {record.length > 0 && (
          <div className="mt-12">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.17em] text-gold-text">Accountability archive</p>
                <h3 className="mt-1.5 text-xl font-bold text-ink">The record — kept &amp; missed</h3>
              </div>
              <span className="text-xs font-semibold text-ink-faint">{record.length} reviewed</span>
            </div>
            <Stagger className="mt-5 grid gap-5 sm:grid-cols-2">
              {record.map((g, i) => (
                <StaggerItem key={g.id} index={i}>
                  <RecordCard goal={g} />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        )}
      </Container>
    </section>
  );
}
