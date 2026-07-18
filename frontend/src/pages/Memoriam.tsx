import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, CTA as Cta, Pill } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { Thumb } from "@/components/cards";
import { Reveal, StaggerItem } from "@/components/motion";
import { YENKAE_DESCRIPTION } from "@/lib/content";
import { initials, lifeDates } from "@/lib/format";

export async function loader() {
  return api.memorials();
}

function memorialImage(memorial: Listing): string | undefined {
  return memorial.coverImageUrl ?? memorial.details.gallery?.find((item) => item.url)?.url;
}

export function Component() {
  const memorials = useLoaderData() as Listing[];
  usePageTitle("In Memoriam");

  const featured = memorials.find((memorial) => memorial.featured) ?? memorials[0];
  const remaining = featured ? memorials.filter((memorial) => memorial.id !== featured.id) : [];
  const candles = memorials.reduce((total, memorial) => total + (memorial.details.candles ?? 0), 0);
  const remembering = memorials.reduce((total, memorial) => total + (memorial.details.rememberedByCount ?? 0), 0);

  return (
    <>
      <section className="on-dark on-dark-pin relative overflow-hidden bg-green text-on-green">
        <div className="pointer-events-none absolute -left-28 top-16 h-72 w-72 rounded-full border border-gold/15" aria-hidden />
        <div className="pointer-events-none absolute -left-16 top-28 h-44 w-44 rounded-full border border-gold/15" aria-hidden />
        <Adinkra name="nyame-nwu-na-mawu" size={260} labelled={false} className="pointer-events-none absolute -bottom-16 right-[38%] hidden text-cream/[0.035] lg:block" />

        <Container size="wide" className="grid min-h-[600px] items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:py-24">
          <div className="relative z-10 max-w-2xl">
            <p className="eyebrow text-gold">Yɛnkae · In Memoriam</p>
            <Reveal as="h1" className="mt-5 text-5xl font-semibold leading-[0.98] text-cream sm:text-6xl lg:text-7xl">
              The names<br />we carry.
            </Reveal>
            <Reveal as="p" delay={0.08} className="mt-7 max-w-xl text-base leading-relaxed text-cream/75 sm:text-lg">
              {YENKAE_DESCRIPTION}
            </Reveal>

            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#lives" className="inline-flex items-center justify-center rounded-full bg-gold-brand px-5 py-2.5 text-sm font-semibold text-green-900 transition-colors hover:bg-gold">
                Remember with us
              </a>
              <Cta to="/submit?type=memorial" variant="outline-dark">Create a memorial</Cta>
            </div>

            <dl className="mt-10 grid max-w-xl grid-cols-3 border-y border-cream/15 py-5">
              <MemoryStat value={memorials.length} label="lives held here" />
              <MemoryStat value={candles} label="candles lit" />
              <MemoryStat value={remembering} label="remembering" />
            </dl>
          </div>

          <div className="relative hidden min-h-[440px] lg:block" aria-label="Portraits from the memorial archive">
            {memorials.length > 0 ? (
              <div className="absolute inset-0 grid grid-cols-2 gap-4">
                {memorials.slice(0, 4).map((memorial, index) => (
                  <Link
                    key={memorial.id}
                    to={`/memoriam/${memorial.slug}`}
                    aria-label={`Remember ${memorial.title}`}
                    className={`group relative overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-cream/5 ${index % 2 === 0 ? "translate-y-7" : "-translate-y-5"}`}
                  >
                    <Thumb
                      seed={memorial.slug}
                      label={initials(memorial.title)}
                      src={memorialImage(memorial)}
                      rounded="rounded-none"
                      className="h-full min-h-[210px] w-full transition-transform duration-700 group-hover:scale-[1.04]"
                      coverWidth={520}
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-green via-green/70 to-transparent px-5 pb-5 pt-16">
                      <span className="block text-lg font-semibold text-cream">{memorial.title}</span>
                      <span className="mt-1 block text-xs uppercase tracking-[0.16em] text-gold">{lifeDates(memorial.details.bornYear, memorial.details.diedDate)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-[var(--radius-card)] border border-cream/15 bg-cream/5">
                <Adinkra name="gye-nyame" size={120} className="text-gold/70" />
              </div>
            )}
          </div>
        </Container>
      </section>

      <section className="border-b border-sand bg-cream">
        <Container size="wide" className="grid divide-y divide-sand py-3 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Promise title="Permanent" copy="A lasting place for stories, photographs and tributes." />
          <Promise title="Family-guided" copy="Families can claim, correct and shape every memorial." />
          <Promise title="Held with care" copy="Every page is reviewed for dignity before publication." />
        </Container>
      </section>

      <section id="lives" className="bg-paper py-16 sm:py-20">
        <Container size="wide">
          <div className="flex flex-col gap-5 border-b border-sand pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow text-gold-text">The remembrance room</p>
              <h2 className="mt-3 max-w-2xl text-4xl font-semibold text-ink sm:text-5xl">Every life leaves a light.</h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-ink-muted">
              Open a story, leave a tribute or light a candle. Small acts of remembrance keep a community close.
            </p>
          </div>

          {featured ? (
            <div className="mt-10">
              <FeaturedMemorial memorial={featured} />
              {remaining.length > 0 && (
                <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {remaining.map((memorial, index) => (
                    <StaggerItem key={memorial.id} index={index} lift>
                      <MemorialTile memorial={memorial} />
                    </StaggerItem>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-10 rounded-[var(--radius-card)] border border-dashed border-sand bg-cream px-6 py-16 text-center">
              <Adinkra name="nyame-nwu-na-mawu" size={50} className="mx-auto text-gold-brand" />
              <h3 className="mt-5 text-xl font-semibold text-ink">The remembrance room is ready</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">Create the first memorial and give a loved one’s story a permanent home.</p>
            </div>
          )}
        </Container>
      </section>

      <section className="bg-gold-brand py-12 sm:py-14">
        <Container size="wide" className="flex flex-col items-start justify-between gap-7 md:flex-row md:items-center">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green text-gold">
              <Adinkra name="sankofa" size={25} labelled={false} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-green/65">A place that stays</p>
              <h2 className="mt-1 text-3xl font-semibold text-green sm:text-4xl">Tell the story only you know.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-green/75">Begin with a name and a memory. Photographs, life stories and associations can be added with the family’s guidance.</p>
            </div>
          </div>
          <Cta to="/submit?type=memorial" variant="primary" className="shrink-0">Create a memorial</Cta>
        </Container>
      </section>
    </>
  );
}

function MemoryStat({ value, label }: Readonly<{ value: number; label: string }>) {
  return (
    <div className="px-3 first:pl-0 sm:px-5 sm:first:pl-0">
      <dt className="text-2xl font-semibold text-cream sm:text-3xl">{value.toLocaleString()}</dt>
      <dd className="mt-1 text-[0.68rem] uppercase tracking-[0.15em] text-cream/55">{label}</dd>
    </div>
  );
}

function Promise({ title, copy }: Readonly<{ title: string; copy: string }>) {
  return (
    <div className="flex gap-3 px-3 py-4 first:pl-0 last:pr-0 sm:px-6">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-brand" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{copy}</p>
      </div>
    </div>
  );
}

function FeaturedMemorial({ memorial }: Readonly<{ memorial: Listing }>) {
  const details = memorial.details;
  return (
    <Link to={`/memoriam/${memorial.slug}`} className="group grid overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)] md:grid-cols-[0.92fr_1.08fr]">
      <Thumb
        seed={memorial.slug}
        label={initials(memorial.title)}
        src={memorialImage(memorial)}
        rounded="rounded-none"
        className="min-h-[310px] w-full md:min-h-[440px]"
        coverWidth={900}
      />
      <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="gold">Featured remembrance</Pill>
          <span className="text-xs uppercase tracking-[0.17em] text-gold-text">{lifeDates(details.bornYear, details.diedDate)}</span>
        </div>
        <h3 className="mt-6 text-3xl font-semibold text-ink transition-colors group-hover:text-gold-text sm:text-4xl">
          {details.honorific ? `${details.honorific} ` : ""}{memorial.title}
        </h3>
        {details.epitaph && <p className="mt-5 max-w-xl text-lg italic leading-relaxed text-ink-muted">“{details.epitaph}”</p>}
        {details.lifeStory && <p className="mt-5 line-clamp-3 max-w-xl text-sm leading-relaxed text-ink-muted">{details.lifeStory}</p>}
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-sand pt-5 text-xs text-ink-faint">
          <span>{details.candles ?? 0} candles lit</span>
          <span>{details.rememberedByCount ?? 0} remembering</span>
          <span className="font-semibold text-gold-text">Enter their story →</span>
        </div>
      </div>
    </Link>
  );
}

function MemorialTile({ memorial }: Readonly<{ memorial: Listing }>) {
  const details = memorial.details;
  return (
    <Link to={`/memoriam/${memorial.slug}`} className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
      <div className="relative overflow-hidden">
        <Thumb seed={memorial.slug} label={initials(memorial.title)} src={memorialImage(memorial)} rounded="rounded-none" className="aspect-[5/4] w-full transition-transform duration-700 group-hover:scale-[1.04]" />
        <span className="absolute bottom-4 left-4 rounded-full bg-green/90 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-cream backdrop-blur-sm">
          {lifeDates(details.bornYear, details.diedDate)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-2xl font-semibold text-ink transition-colors group-hover:text-gold-text">
          {details.honorific ? `${details.honorific} ` : ""}{memorial.title}
        </h3>
        {details.epitaph && <p className="mt-3 line-clamp-3 text-sm italic leading-relaxed text-ink-muted">“{details.epitaph}”</p>}
        <div className="mt-auto flex items-center justify-between gap-4 border-t border-sand pt-5 text-xs text-ink-faint">
          <span>{details.candles ?? 0} candles · {details.rememberedByCount ?? 0} remembering</span>
          <span className="shrink-0 font-semibold text-gold-text">Remember →</span>
        </div>
      </div>
    </Link>
  );
}
