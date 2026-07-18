import { useMemo } from "react";
import { PageHero } from "@/components/page-hero";
import { MarketScene } from "@/components/scenes";
import { Section, SectionHeading, Eyebrow, CTA } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import {
  useCivic,
  usePledge,
  RINGS,
  type CivicBehaviour,
  type CivicLesson,
} from "@/lib/civic";
import {
  useGoals,
  CADENCE_LABEL,
  CADENCE_ORDER,
  STATUS_LABEL,
  type Goal,
  type GoalStatus,
} from "@/lib/goals";

/**
 * "Building a Better Cape Coast" — the town's civic code, ringed from the self
 * outward, and the lessons of the civilizations that built great, orderly
 * societies. Every behaviour and lesson is read LIVE from /api/civic; the pledge
 * is a private promise kept in the browser. Mirrors the client portal's /better
 * page in the marketing design system.
 */
export function Component() {
  const { behaviors, civilizations } = useCivic();
  const { pledged, toggle, clear } = usePledge();
  const goals = useGoals();

  const featuredGoal = useMemo(() => goals.find((g) => g.featured), [goals]);
  const inProgressByCadence = useMemo(() => {
    const live = goals.filter(
      (g) => !g.featured && (g.status === "active" || g.status === "pending_review"),
    );
    return CADENCE_ORDER.map((cadence) => ({
      cadence,
      items: live.filter((g) => g.cadence === cadence),
    })).filter((group) => group.items.length > 0);
  }, [goals]);
  const record = useMemo(
    () =>
      goals.filter(
        (g) => !g.featured && (g.status === "achieved" || g.status === "missed"),
      ),
    [goals],
  );

  const byRing = useMemo(() => {
    const map = new Map<string, CivicBehaviour[]>();
    for (const b of behaviors) {
      const arr = map.get(b.ring) ?? [];
      arr.push(b);
      map.set(b.ring, arr);
    }
    return map;
  }, [behaviors]);

  return (
    <>
      <PageHero
        scene={MarketScene}
        kicker="Building a better Cape Coast"
        title="The town's code, and a pledge."
        lede="Small habits, kept by everyone, are what turn a town into a great one. Here is the code of Oguaa — ringed from the self outward to the nation — and the pledge you can make today."
      >
        <div className="flex flex-wrap gap-3">
          <CTA href="#pledge" variant="gold">Take the pledge</CTA>
          <CTA href="#code" variant="outline-dark">Read the code</CTA>
        </div>
      </PageHero>

      {/* Pledge intro + live tally (the anchor the hero CTA jumps to). */}
      <Section id="pledge" tone="cream">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow className="justify-center text-gold-text">Yɛn ara asaase ni · this land is ours</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Make it your own promise.</h2>
          <p className="mt-4 text-ink-muted">
            Read the code below and tap <span className="font-semibold text-green-text">“I pledge this”</span> on
            the habits you will keep. Your pledge stays on your device — a quiet
            promise to the town, not a post.
          </p>
          <div className="mt-8 inline-flex items-center gap-4 rounded-full border border-green/20 bg-paper px-6 py-3">
            <span className="text-3xl font-semibold tabular-nums text-green-text">{pledged.size}</span>
            <span className="text-left text-sm leading-tight text-ink-muted">
              {pledged.size === 1 ? "promise" : "promises"} kept
              {behaviors.length > 0 && <> · of {behaviors.length}</>}
            </span>
            {pledged.size > 0 && (
              <button
                type="button"
                onClick={clear}
                className="ml-2 rounded-full border border-clay/30 px-3 py-1 text-xs font-medium text-clay-text transition-colors hover:border-clay"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </Section>

      {/* The town's goals — the public accountability trail (read from /api/goals). */}
      <Section id="goals" tone="sand">
        <SectionHeading
          kicker="The town's goals"
          title="What Oguaa promised — and what we kept."
          lede="Public goals, set in the open and reviewed in the open. The annual goal is set at the durbar; the rest are the promises we track through the year — and the record shows every win and every miss, named honestly."
        />
        {goals.length === 0 ? (
          <p className="mt-12 text-center text-ink-faint">The town’s goals are being set. Check back shortly.</p>
        ) : (
          <div className="mt-14 flex flex-col gap-16">
            {featuredGoal && <DurbarGoalCard goal={featuredGoal} />}

            {inProgressByCadence.length > 0 && (
              <div>
                <div className="flex items-baseline gap-3 border-b border-green/15 pb-3">
                  <h3 className="font-display text-2xl font-semibold text-ink">In progress now</h3>
                  <p className="text-sm text-ink-faint">The promises the town is keeping this period.</p>
                </div>
                <div className="mt-6 flex flex-col gap-10">
                  {inProgressByCadence.map((group) => (
                    <div key={group.cadence}>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
                        {CADENCE_LABEL[group.cadence]}
                      </p>
                      <Stagger className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {group.items.map((g, i) => (
                          <StaggerItem key={g.id} index={i}>
                            <GoalCard goal={g} />
                          </StaggerItem>
                        ))}
                      </Stagger>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {record.length > 0 && (
              <div>
                <div className="flex items-baseline gap-3 border-b border-green/15 pb-3">
                  <h3 className="font-display text-2xl font-semibold text-ink">The record</h3>
                  <p className="text-sm text-ink-faint">Reviewed and closed — the wins and the misses, in the open.</p>
                </div>
                <Stagger className="mt-6 grid gap-5 sm:grid-cols-2">
                  {record.map((g, i) => (
                    <StaggerItem key={g.id} index={i}>
                      <RecordCard goal={g} />
                    </StaggerItem>
                  ))}
                </Stagger>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* The code, grouped by ring. */}
      <Section id="code" tone="paper">
        <SectionHeading
          kicker="The code of Oguaa"
          title="Six rings, from the self to the nation."
          lede="Nothing here is new — it is the town at its best, written down. Keep the ones you can; the rest will follow."
        />
        {behaviors.length === 0 ? (
          <p className="mt-12 text-center text-ink-faint">The town’s code is being written. Check back shortly.</p>
        ) : (
          <div className="mt-14 flex flex-col gap-16">
            {RINGS.map((ring) => {
              const items = byRing.get(ring.key) ?? [];
              if (items.length === 0) return null;
              return (
                <div key={ring.key}>
                  <div className="flex items-baseline gap-3 border-b border-sand pb-3">
                    <h3 className="font-display text-2xl font-semibold text-ink">{ring.label}</h3>
                    <p className="text-sm text-ink-faint">{ring.note}</p>
                  </div>
                  <Stagger className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((b, i) => (
                      <StaggerItem key={b.slug} index={i}>
                        <BehaviourCard
                          behaviour={b}
                          pledged={pledged.has(b.slug)}
                          onToggle={() => toggle(b.slug)}
                        />
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* What made great civilizations great. */}
      {civilizations.length > 0 && (
        <Section tone="deep">
          <SectionHeading
            onDark
            center
            kicker="What made them great"
            title="Lessons from the builders of nations."
            lede="Every great society was built on a shared discipline. Here is what they knew — and what it asks of Oguaa."
          />
          <Stagger className="mt-14 grid gap-6 md:grid-cols-2">
            {civilizations.map((lesson, i) => (
              <StaggerItem key={lesson.slug} index={i}>
                <LessonCard lesson={lesson} />
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}

      <Section tone="green">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">Build the town you want to live in.</h2>
          <p className="mt-4 text-cream/85">
            One kept promise, on one street, on one day, is how it starts.
          </p>
          <div className="mt-8 flex justify-center">
            <CTA href="#pledge" variant="gold">Take the pledge</CTA>
          </div>
        </div>
      </Section>
    </>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SlashMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function BehaviourCard({
  behaviour,
  pledged,
  onToggle,
}: Readonly<{ behaviour: CivicBehaviour; pledged: boolean; onToggle: () => void }>) {
  const isDo = behaviour.type === "do";
  return (
    <article className={`og-card og-card-interactive ${isDo ? "og-card-accent-green" : "og-card-accent-clay"} flex h-full flex-col p-6`}>
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${isDo ? "bg-green/10 text-green-text" : "bg-clay/10 text-clay-text"}`}>
          {isDo ? <CheckMark /> : <SlashMark />}
        </span>
        <span className={`text-[0.68rem] font-bold uppercase tracking-[0.18em] ${isDo ? "text-green-text" : "text-clay-text"}`}>
          {isDo ? "Do" : "Stop"}
        </span>
      </div>
      <h4 className="mt-3 font-display text-lg font-semibold leading-snug text-ink">{behaviour.title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{behaviour.description}</p>
      {behaviour.why && (
        <p className="mt-3 text-xs italic leading-relaxed text-ink-faint">
          <span className="font-semibold not-italic">Why — </span>{behaviour.why}
        </p>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={pledged}
        className={`mt-5 inline-flex items-center justify-center gap-2 self-start rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
          pledged
            ? "bg-green text-cream on-dark-pin hover:bg-green-900"
            : "border border-green/40 text-green-text hover:border-green"
        }`}
      >
        {pledged ? (<><CheckMark /> Pledged</>) : "I pledge this"}
      </button>
    </article>
  );
}

function LessonCard({ lesson }: Readonly<{ lesson: CivicLesson }>) {
  return (
    <Reveal className="og-card og-card-dark og-card-accent-gold h-full p-7">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold">{lesson.era}</p>
      <h3 className="mt-2 font-display text-2xl font-semibold text-cream">{lesson.name}</h3>
      <p className="mt-4 leading-relaxed text-cream/85">{lesson.principle}</p>
      <p className="mt-4 border-t border-cream/12 pt-4 text-sm italic leading-relaxed text-cream/70">
        <span className="font-semibold not-italic text-gold">For Oguaa — </span>{lesson.lesson}
      </p>
    </Reveal>
  );
}

/** Status chip for LIGHT goal cards. Uses the theme-aware `-text` tokens so it
 *  reads dark on the light card in light mode and bright in dark mode. Colours:
 *  active/achieved green, pending_review gold, missed clay. */
function GoalStatusChip({ status }: Readonly<{ status: GoalStatus }>) {
  const styles: Record<GoalStatus, string> = {
    active: "border-green/30 bg-green/[0.07] text-green-text",
    achieved: "border-green/30 bg-green/[0.07] text-green-text",
    pending_review: "border-gold-border/40 bg-gold/[0.12] text-gold-text",
    missed: "border-clay/30 bg-clay/[0.08] text-clay-text",
  };
  const label = status === "pending_review" ? "Awaiting review" : STATUS_LABEL[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.64rem] font-bold uppercase tracking-[0.12em] ${styles[status]}`}>
      {label}
    </span>
  );
}

/** The public review trail: the officer's note + who signed it off. */
function ReviewTrail({ goal, tight = false }: Readonly<{ goal: Goal; tight?: boolean }>) {
  if (!goal.reviewNote && !goal.reviewedByName) return null;
  return (
    <div className={`border-t border-green/12 ${tight ? "mt-3 pt-3" : "mt-5 pt-4"}`}>
      {goal.reviewNote && (
        <p className="text-sm italic leading-relaxed text-ink-muted">“{goal.reviewNote}”</p>
      )}
      {goal.reviewedByName && (
        <p className="mt-2 text-xs font-medium text-ink-faint">Reviewed by {goal.reviewedByName}</p>
      )}
    </div>
  );
}

/** The featured annual goal, framed as the durbar goal — the prominent hero. */
function DurbarGoalCard({ goal }: Readonly<{ goal: Goal }>) {
  return (
    <Reveal>
      <article className="og-card og-card-accent-gold p-8 sm:p-10">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gold-text">
            The durbar goal · {goal.periodLabel}
          </span>
          {goal.setAtDurbar && (
            <span className="inline-flex items-center rounded-full border border-gold-border/40 bg-gold/[0.12] px-2.5 py-0.5 text-[0.64rem] font-semibold text-gold-text">
              Set at the durbar
            </span>
          )}
        </div>
        <h3 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">
          {goal.title}
        </h3>
        {goal.description && (
          <p className="mt-4 max-w-2xl leading-relaxed text-ink-muted">{goal.description}</p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <GoalStatusChip status={goal.status} />
          {goal.target && (
            <span className="text-sm text-ink-muted">
              <span className="font-semibold text-gold-text">Target — </span>{goal.target}
            </span>
          )}
        </div>
        <ReviewTrail goal={goal} />
      </article>
    </Reveal>
  );
}

/** An in-progress goal (active or awaiting review), by cadence. */
function GoalCard({ goal }: Readonly<{ goal: Goal }>) {
  return (
    <article className="og-card flex h-full flex-col p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-ink-faint">
          {goal.periodLabel}
        </span>
        <GoalStatusChip status={goal.status} />
      </div>
      <h4 className="mt-3 font-display text-lg font-semibold leading-snug text-ink">{goal.title}</h4>
      {goal.description && (
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{goal.description}</p>
      )}
      {goal.target && (
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          <span className="font-semibold text-gold-text">Target — </span>{goal.target}
        </p>
      )}
    </article>
  );
}

/** A closed goal in the public record — achieved or missed, shown honestly. */
function RecordCard({ goal }: Readonly<{ goal: Goal }>) {
  const achieved = goal.status === "achieved";
  return (
    <article className={`og-card ${achieved ? "og-card-accent-green" : "og-card-accent-clay"} flex h-full flex-col p-6`}>
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${achieved ? "bg-green/10 text-green-text" : "bg-clay/10 text-clay-text"}`}>
          {achieved ? <CheckMark /> : <SlashMark />}
        </span>
        <GoalStatusChip status={goal.status} />
        <span className="ml-auto text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-faint">
          {goal.periodLabel}
        </span>
      </div>
      <h4 className="mt-3 font-display text-lg font-semibold leading-snug text-ink">{goal.title}</h4>
      {goal.target && (
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          <span className="font-semibold text-gold-text">Target — </span>{goal.target}
        </p>
      )}
      <ReviewTrail goal={goal} tight />
    </article>
  );
}
