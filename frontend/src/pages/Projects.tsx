import { Link, useLoaderData } from "react-router-dom";
import { Adinkra } from "@/components/adinkra";
import { Thumb } from "@/components/cards";
import { EmptyGlyph, EmptyState } from "@/components/empty-state";
import { Reveal, StaggerItem } from "@/components/motion";
import { Skeleton, SkeletonText } from "@/components/skeleton";
import { Container, CTA as Cta, Pill } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, initials, tagLabel } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";

export async function loader() {
  return api.projects();
}

export const cedis = (pesewas?: number) =>
  `GH₵ ${((pesewas ?? 0) / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;

function progressPercent(raised?: number, goal?: number): number {
  if (!goal || goal <= 0) return 0;
  return Math.max(0, Math.round(((raised ?? 0) / goal) * 100));
}

export function ProgressBar({
  raised,
  goal,
  onDark = false,
  compact = false,
}: Readonly<{
  raised?: number;
  goal?: number;
  onDark?: boolean;
  compact?: boolean;
}>) {
  const pct = progressPercent(raised, goal);
  const visualPct = Math.min(100, pct);
  const track = onDark ? "bg-cream/15" : "bg-sand";
  const amountTone = onDark ? "text-cream" : "text-green-text";
  const metaTone = onDark ? "text-cream/60" : "text-ink-faint";
  const label = goal
    ? `${cedis(raised)} raised, ${pct}% of ${cedis(goal)}`
    : `${cedis(raised)} raised; target being finalised`;

  return (
    <div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={visualPct}
        className={`${compact ? "h-2" : "h-2.5"} w-full overflow-hidden rounded-full ${track}`}
      >
        <div className="h-full rounded-full bg-gold-brand transition-[width]" style={{ width: `${visualPct}%` }} />
      </div>
      <div className={`mt-2 flex items-baseline justify-between gap-4 ${compact ? "text-xs" : "text-sm"}`}>
        <span className={`font-semibold ${amountTone}`}>{cedis(raised)} raised</span>
        <span className={`text-right ${metaTone}`}>{goal ? `${pct}% of ${cedis(goal)}` : "Target being finalised"}</span>
      </div>
    </div>
  );
}

export function HydrateFallback() {
  return (
    <div className="bg-paper">
      <div className="bg-green-900 py-16">
        <Container size="wide" className="grid gap-10 lg:grid-cols-2">
          <div>
            <Skeleton className="h-4 w-36 bg-cream/15" />
            <Skeleton className="mt-8 h-14 w-full max-w-xl bg-cream/15" />
            <Skeleton className="mt-3 h-14 w-4/5 max-w-lg bg-cream/15" />
            <SkeletonText lines={3} className="mt-7 max-w-xl opacity-30" />
          </div>
          <Skeleton className="aspect-[4/3] w-full bg-cream/15" />
        </Container>
      </div>
      <Container size="wide" className="py-12">
        <SkeletonText lines={2} className="max-w-xl" />
        <Skeleton className="mt-8 h-[30rem] w-full" />
      </Container>
    </div>
  );
}

export function Component() {
  const projects = useLoaderData() as Listing[];
  usePageTitle("Community Projects");

  const lead = projects.find((project) => project.featured) ?? projects[0];
  const remaining = lead ? projects.filter((project) => project.id !== lead.id) : [];
  const target = projects.reduce((sum, project) => sum + (project.details.goalPesewas ?? 0), 0);
  const raised = projects.reduce((sum, project) => sum + (project.details.raisedPesewas ?? 0), 0);
  const backers = projects.reduce((sum, project) => sum + (project.details.backers ?? 0), 0);

  return (
    <>
      <section className="on-dark on-dark-pin relative isolate overflow-hidden bg-green-900 text-cream">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_5%,rgba(176,125,50,0.2),transparent_34%),linear-gradient(135deg,#0C2C1F_0%,#123F2D_58%,#081C14_100%)]" aria-hidden />
        <div className="bg-dotgrid absolute inset-0 opacity-30" aria-hidden />
        <Adinkra name="funtunfunefu" size={330} labelled={false} className="pointer-events-none absolute -bottom-24 -left-20 text-cream/[0.035]" />

        <Container size="wide" className="relative grid min-h-[620px] items-center gap-12 py-14 sm:py-18 lg:grid-cols-[0.94fr_1.06fr] lg:py-20">
          <div className="max-w-2xl">
            <p className="eyebrow text-gold">Adopt a project · Build Oguaa</p>
            <Reveal as="h1" className="mt-5 text-5xl font-semibold leading-[0.96] text-cream sm:text-6xl lg:text-7xl">
              Put community pride to work.
            </Reveal>
            <Reveal as="p" delay={0.08} className="mt-7 max-w-xl text-base leading-relaxed text-cream/74 sm:text-lg">
              Concrete, costed improvements for Cape Coast — proposed with local institutions and funded openly by residents and the diaspora.
            </Reveal>
            <Reveal delay={0.12} className="mt-8 flex flex-wrap gap-3">
              <a href="#open-projects" className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold-brand px-5 text-sm font-semibold text-green-900 transition-colors hover:bg-gold">
                See the projects <span aria-hidden>↓</span>
              </a>
              <Cta to="/better" variant="outline-dark" className="min-h-11">Our civic promise</Cta>
            </Reveal>

            <dl className="mt-10 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-cream/15 sm:grid-cols-4">
              <PortfolioStat value={String(projects.length)} label="community projects" />
              <PortfolioStat value={cedis(raised)} label="raised together" />
              <PortfolioStat value={cedis(target)} label="combined target" />
              <PortfolioStat value={String(backers)} label="backers" />
            </dl>
          </div>

          <div className="min-w-0">
            {lead ? <HeroProject project={lead} /> : <EmptyHero />}
          </div>
        </Container>
      </section>

      <section className="border-b border-sand bg-cream">
        <Container size="wide" className="grid divide-y divide-sand py-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <TrustPoint index="01" title="Locally costed" copy="Every target starts with the people and institution doing the work." />
          <TrustPoint index="02" title="Public totals" copy="Every verified pledge updates the amount raised for everyone to see." />
          <TrustPoint index="03" title="Payment verified" copy="Mobile money and card pledges are checked server-side before credit." />
        </Container>
      </section>

      <section id="open-projects" className="scroll-mt-28 bg-paper py-16 sm:py-20">
        <Container size="wide">
          <div className="flex flex-col gap-5 border-b border-sand pb-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="eyebrow text-gold-text">Community projects</p>
              <h2 className="mt-3 max-w-3xl text-4xl font-semibold text-ink sm:text-5xl">Choose the change you want to help finish.</h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-ink-muted">
              Pledge from GH₵ 1. Verified payments update each project’s credited total after confirmation.
            </p>
          </div>

          {projects.length === 0 ? (
            <EmptyState icon={<EmptyGlyph name="heart" />} title="No community projects yet" description="The first campaigns are being costed with their institutions." />
          ) : (
            <div className="mt-10">
              {lead && <LeadProject project={lead} />}
              {remaining.length > 0 && (
                <div className="mt-8 divide-y divide-sand border-y border-sand">
                  {remaining.map((project, index) => (
                    <StaggerItem key={project.id} index={index}>
                      <ProjectRow project={project} />
                    </StaggerItem>
                  ))}
                </div>
              )}
            </div>
          )}
        </Container>
      </section>

      <section className="on-dark on-dark-pin bg-green py-12 text-cream sm:py-14">
        <Container size="wide" className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow text-gold">One Oguaa, near and far</p>
            <h2 className="mt-2 text-3xl font-semibold text-cream sm:text-4xl">Back home, wherever you are.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cream/70">Residents and the diaspora fund the same public total, one verified pledge at a time.</p>
          </div>
          <a href="#open-projects" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-gold-brand px-5 text-sm font-semibold text-green-900 transition-colors hover:bg-gold">Choose a project</a>
        </Container>
      </section>
    </>
  );
}

function PortfolioStat({ value, label }: Readonly<{ value: string; label: string }>) {
  return (
    <div className="bg-green-900/65 px-4 py-4 backdrop-blur-sm">
      <dt className="text-[0.63rem] uppercase tracking-[0.15em] text-cream/50">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-cream sm:text-xl">{value}</dd>
    </div>
  );
}

function HeroProject({ project }: Readonly<{ project: Listing }>) {
  const details = project.details;
  return (
    <Link to={`/projects/${project.slug}`} className="group block overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-cream/[0.06] p-3 shadow-2xl shadow-black/25">
      <div className="relative overflow-hidden rounded-[var(--radius-card)]">
        <Thumb seed={project.slug} label={initials(project.title)} src={project.coverImageUrl} rounded="rounded-none" className="aspect-[5/4] min-h-[390px] w-full transition-transform duration-700 group-hover:scale-[1.035]" coverWidth={1000} />
        <div className="absolute inset-0 bg-gradient-to-t from-green-900 via-green-900/25 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold">Featured project</p>
          <h2 className="mt-2 max-w-xl text-3xl font-semibold leading-tight text-cream sm:text-4xl">{project.title}</h2>
          {details.organiser && <p className="mt-2 text-sm text-cream/65">Led by {details.organiser}</p>}
          <div className="mt-6 border-t border-cream/15 pt-5">
            <ProgressBar raised={details.raisedPesewas} goal={details.goalPesewas} onDark compact />
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyHero() {
  return (
    <div className="flex aspect-[5/4] min-h-[390px] items-center justify-center rounded-[var(--radius-card)] border border-cream/15 bg-cream/[0.05]">
      <Adinkra name="funtunfunefu" size={110} className="text-gold/70" />
    </div>
  );
}

function TrustPoint({ index, title, copy }: Readonly<{ index: string; title: string; copy: string }>) {
  return (
    <div className="flex gap-4 px-2 py-5 first:pl-0 last:pr-0 sm:px-6">
      <span className="text-xs font-bold text-gold-text">{index}</span>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{copy}</p>
      </div>
    </div>
  );
}

function LeadProject({ project }: Readonly<{ project: Listing }>) {
  const details = project.details;
  return (
    <Link to={`/projects/${project.slug}`} className="group grid overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)] lg:grid-cols-[1.02fr_0.98fr]">
      <Thumb seed={project.slug} label={initials(project.title)} src={project.coverImageUrl} rounded="rounded-none" className="min-h-[320px] w-full lg:min-h-[470px]" coverWidth={1000} />
      <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="gold">Start here</Pill>
          {project.townId && <span className="text-xs text-ink-faint">{tagLabel(project.townId)}</span>}
        </div>
        <h3 className="mt-5 text-3xl font-semibold leading-tight text-ink transition-colors group-hover:text-green-text sm:text-4xl">{project.title}</h3>
        {details.organiser && <p className="mt-3 text-sm font-semibold text-gold-text">{details.organiser}</p>}
        {details.description && <p className="mt-5 line-clamp-4 text-base leading-relaxed text-ink-muted">{details.description}</p>}
        {project.tags.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">{project.tags.map((tag) => <Pill key={tag} tone="green">#{tagLabel(tag)}</Pill>)}</div>
        )}
        <div className="mt-8 border-t border-sand pt-6">
          <ProgressBar raised={details.raisedPesewas} goal={details.goalPesewas} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-faint">
            <span>{details.backers ?? 0} backers{details.deadline ? ` · closes ${formatDate(details.deadline)}` : ""}</span>
            <span className="font-semibold text-green-text">Open project <span aria-hidden>→</span></span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ProjectRow({ project }: Readonly<{ project: Listing }>) {
  const details = project.details;
  return (
    <Link to={`/projects/${project.slug}`} className="group grid gap-5 py-7 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center lg:grid-cols-[16rem_minmax(0,1fr)_18rem] lg:gap-8">
      <Thumb seed={project.slug} label={initials(project.title)} src={project.coverImageUrl} rounded="rounded-[var(--radius-card)]" className="aspect-[4/3] w-full" coverWidth={560} />
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          {project.tags.slice(0, 2).map((tag) => <Pill key={tag} tone="green">{tagLabel(tag)}</Pill>)}
        </div>
        <h3 className="mt-3 text-2xl font-semibold leading-tight text-ink transition-colors group-hover:text-green-text">{project.title}</h3>
        {details.organiser && <p className="mt-2 text-xs font-semibold text-gold-text">{details.organiser}</p>}
        {details.description && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-muted">{details.description}</p>}
      </div>
      <div className="sm:col-start-2 lg:col-start-auto">
        <ProgressBar raised={details.raisedPesewas} goal={details.goalPesewas} compact />
        <p className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-faint">
          <span>{details.backers ?? 0} backers{details.deadline ? ` · ${formatDate(details.deadline)}` : ""}</span>
          <span className="shrink-0 font-semibold text-green-text">View <span aria-hidden>→</span></span>
        </p>
      </div>
    </Link>
  );
}
