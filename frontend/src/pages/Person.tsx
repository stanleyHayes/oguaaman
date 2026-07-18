import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing, Organization } from "@/lib/types";
import { api } from "@/lib/api";
import { useRecordView } from "@/lib/use-record-view";
import { Container, Pill, SampleNote } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { ReportButton } from "@/components/report-button";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { initials } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";

interface PersonData {
  person: Listing;
  schools: Organization[];
  postingOrganization: Organization | null;
}

export async function loader({ params }: LoaderFunctionArgs): Promise<PersonData> {
  const person = await api.person(params.slug!);
  const schoolIds = person.schoolIds ?? [];
  const [schools, postingOrganization] = await Promise.all([
    Promise.all(
      schoolIds.map((id) => api.institution(id).then((view) => view.institution).catch(() => null)),
    ).then((items) => items.filter((item): item is Organization => item !== null)),
    person.postedByOrgId
      ? api.institution(person.postedByOrgId).then((view) => view.institution).catch(() => null)
      : Promise.resolve(null),
  ]);
  return { person, schools, postingOrganization };
}

export function Component() {
  const { person, schools, postingOrganization } = useLoaderData() as PersonData;
  usePageTitle(person.title);
  useRecordView(person.id);
  const d = person.details;
  const biography = (d.bio ?? "").split("\n\n").filter(Boolean);
  const connectionCount = schools.length + (person.townId ? 1 : 0);

  return (
    <article>
      <section className="on-dark on-dark-pin relative isolate overflow-hidden bg-green-900 text-cream">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(199,162,74,0.22),transparent_28%),linear-gradient(125deg,#0C2C1F_0%,#123F2D_55%,#081C14_100%)]" aria-hidden />
        <div className="bg-dotgrid absolute inset-0 opacity-30" aria-hidden />
        <div className="absolute -right-20 top-10 h-72 w-72 rounded-full border border-gold/20 sm:h-96 sm:w-96" aria-hidden />
        <div className="absolute -right-6 top-24 h-52 w-52 rounded-full border border-gold/15 sm:h-72 sm:w-72" aria-hidden />

        <Container size="wide" className="relative py-10 sm:py-14 lg:py-16">
          <Reveal>
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-2 text-sm text-cream/65">
                <li><Link to="/" className="transition-colors hover:text-gold">Home</Link></li>
                <li aria-hidden>/</li>
                <li><Link to="/people" className="transition-colors hover:text-gold">Sons &amp; daughters</Link></li>
                <li aria-hidden>/</li>
                <li className="max-w-48 truncate text-cream/90" aria-current="page">{person.title}</li>
              </ol>
            </nav>
          </Reveal>

          <div className="mt-8 grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-14">
            <div className="order-2 lg:order-1">
              <Reveal delay={0.05} className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gold">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
                  {d.living ? "Living legacy" : "Oguaa legacy"}
                </span>
                {d.era && <span className="rounded-full border border-cream/20 bg-cream/5 px-3 py-1 text-xs text-cream/75">{d.era}</span>}
              </Reveal>
              <Reveal as="h1" delay={0.1} className="mt-4 max-w-4xl text-5xl font-semibold leading-[0.96] text-cream sm:text-6xl lg:text-7xl">
                {person.title}
              </Reveal>
              {d.whyNotable && (
                <Reveal delay={0.16} className="mt-6 max-w-3xl border-l-2 border-gold pl-5 text-lg leading-relaxed text-cream/85 sm:text-xl">
                  {d.whyNotable}
                </Reveal>
              )}
            </div>

            <Reveal delay={0.12} className="order-1 lg:order-2">
              <div className="relative mx-auto w-fit lg:ml-auto lg:mr-0">
                <div className="absolute -inset-3 rotate-3 rounded-[1.75rem] border border-gold/30 bg-gold/10" aria-hidden />
                <Thumb
                  seed={person.slug}
                  label={initials(person.title)}
                  src={person.coverImageUrl}
                  coverWidth={600}
                  className="relative h-56 w-56 rounded-[1.5rem] border border-cream/20 shadow-2xl sm:h-64 sm:w-64 lg:h-72 lg:w-72"
                />
                <span className="absolute -bottom-4 -left-4 inline-flex h-14 w-14 items-center justify-center rounded-full border-4 border-green-900 bg-gold-brand text-xl font-bold text-green-900 shadow-lg" aria-hidden>
                  ✦
                </span>
              </div>
            </Reveal>
          </div>

          <Stagger className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-cream/15 sm:grid-cols-3">
            <StaggerItem className="bg-green-900/70 px-5 py-4 backdrop-blur-sm">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-gold">Era</p>
              <p className="mt-1 text-base text-cream">{d.era ?? "Not recorded"}</p>
            </StaggerItem>
            <StaggerItem className="bg-green-900/70 px-5 py-4 backdrop-blur-sm">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-gold">Status</p>
              <p className="mt-1 text-base text-cream">{d.living ? "Living" : "Remembered"}</p>
            </StaggerItem>
            <StaggerItem className="bg-green-900/70 px-5 py-4 backdrop-blur-sm">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-gold">Oguaa ties</p>
              <p className="mt-1 text-base text-cream">{connectionCount > 0 ? connectionCount + " recorded" : "Cape Coast"}</p>
            </StaggerItem>
          </Stagger>
        </Container>
      </section>

      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[minmax(0,1.45fr)_22rem] lg:gap-14 lg:py-16">
        <div className="min-w-0 space-y-12">
          <Reveal as="section">
            <p className="eyebrow text-gold-text">The Oguaa story</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">Why we celebrate {person.title}</h2>
            <div className="mt-5 h-1 w-16 rounded-full bg-gold-brand" aria-hidden />
            {biography.length > 0 ? (
              <div className="mt-7 space-y-5 text-lg leading-relaxed text-ink-muted">
                {biography.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            ) : d.whyNotable ? (
              <div className="relative mt-7 overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-6 shadow-[var(--shadow-card)] sm:p-8">
                <span className="absolute left-0 top-0 h-full w-1.5 bg-gold-brand" aria-hidden />
                <p className="text-lg leading-relaxed text-ink sm:text-xl">{d.whyNotable}</p>
              </div>
            ) : (
              <p className="mt-6 text-ink-muted">This community profile is ready for more of their story.</p>
            )}
          </Reveal>

          {person.tags.length > 0 && (
            <Reveal as="section">
              <h2 className="text-2xl font-semibold text-ink">Fields of impact</h2>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {person.tags.map((tag) => <Pill key={tag} tone="gold">#{tag}</Pill>)}
              </div>
            </Reveal>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
            <div className="border-b border-sand bg-green/[0.05] px-5 py-4">
              <p className="eyebrow text-green-text">Oguaa connections</p>
            </div>
            <div className="space-y-4 p-5">
              {person.townId && (
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal/[0.1] text-teal-text" aria-hidden>⌖</span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Community</p>
                    <p className="mt-0.5 capitalize text-ink">{person.townId.replaceAll("-", " ")}</p>
                  </div>
                </div>
              )}
              {schools.map((school) => (
                <div key={school.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/[0.12] text-gold-text" aria-hidden>⌂</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">School</p>
                    <Link to={"/education/" + school.slug} className="mt-0.5 block font-medium text-green-text hover:underline">{school.name}</Link>
                  </div>
                </div>
              ))}
              {postingOrganization && (
                <div className="border-t border-sand pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Published by</p>
                  <Link to={"/education/" + postingOrganization.slug} className="mt-1 block font-medium text-green-text hover:underline">{postingOrganization.name}</Link>
                </div>
              )}
              {!person.townId && schools.length === 0 && !postingOrganization && (
                <p className="text-sm leading-relaxed text-ink-muted">Recognised among the people whose work and life are connected to Cape Coast.</p>
              )}
            </div>
          </div>

          <div className="rounded-[var(--radius-card)] border border-gold-border/40 bg-gold/[0.07] p-5">
            <p className="eyebrow text-gold-text">Help keep the record</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Add what the community knows</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">Share a careful correction, milestone, or connection for steward review.</p>
            <Link to="/submit?type=person" className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-green px-4 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900">
              Contribute to this record
            </Link>
          </div>

          <div className="flex justify-end"><ReportButton listingId={person.id} /></div>
        </aside>
      </Container>

      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </article>
  );
}
