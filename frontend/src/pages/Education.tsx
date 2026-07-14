import { Link, useLoaderData } from "react-router-dom";
import type { Organization } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SectionHeading, VerifiedBadge, SampleNote } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { Crest } from "@/components/crest";
import { initials } from "@/lib/format";
import { EDUCATION_BLURB, SAMPLE_NOTICE } from "@/lib/content";
import { SCHOOL_PHOTOS } from "@/lib/cape-coast-photos";

export async function loader() {
  return api.schools();
}

export function Component() {
  const schools = useLoaderData() as Organization[];
  return (
    <>
      <PageHero tone="maroon" kicker="Rep your school · the powerhouse" title="The Citadel of Education" symbol="dwennimmen" lede="Within a few square miles sit the oldest and most decorated schools in Ghana. We don't build communities from scratch — we give existing, loyal Old Students networks a home.">
        <Cta to="/me" variant="primary">Rep your school →</Cta>
      </PageHero>

      <Container size="prose" className="py-12">
        <p className="font-serif text-lg leading-relaxed text-ink">{EDUCATION_BLURB}</p>
      </Container>

      <Container size="wide" className="pb-8">
        <SectionHeading kicker="Official, verified profiles" title="The schools on the hills" accentClass="bg-maroon-900" />
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {schools.map((s) => (
            <Link key={s.id} to={`/education/${s.slug}`} className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
              <div className="relative flex items-center gap-4 overflow-hidden p-5" style={{ background: `linear-gradient(135deg, ${s.houseColors?.[0]}, ${s.houseColors?.[0]}E6)` }}>
                {SCHOOL_PHOTOS[s.slug] && (
                  <>
                    <img src={SCHOOL_PHOTOS[s.slug]} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 h-full w-full object-cover opacity-40" />
                    <span className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${s.houseColors?.[0]}E6, ${s.houseColors?.[0]}B3)` }} aria-hidden />
                  </>
                )}
                <span className="relative shrink-0"><Crest colors={s.houseColors} label={initials(s.name)} size={56} src={s.crestUrl} /></span>
                <div className="relative min-w-0">
                  <h3 className="text-xl font-semibold leading-tight text-cream">{s.name}</h3>
                  <p className="text-xs text-cream/75">Est. {s.founded}</p>
                </div>
              </div>
              <div className="flex flex-1 flex-col p-5">
                {s.motto && <p className="text-sm italic text-gold-text">{s.motto}</p>}
                <p className="mt-2 text-sm text-ink-muted">{s.classification}</p>
                <div className="mt-4 flex items-center justify-between">
                  <VerifiedBadge label="Official" />
                  {s.osaName && <span className="text-xs text-ink-faint">{s.osaName}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Container>

      <section className="bg-cream py-14">
        <Container size="narrow" className="text-center">
          <Adinkra name="dwennimmen" size={34} className="mx-auto text-maroon-900" />
          <h2 className="mt-5 text-2xl font-semibold text-ink">The oldest rivalry, the deepest loyalty</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
            The Mfantsipim–Adisadel rivalry — Methodist against Anglican — is the oldest in Ghana, and since 1992 the Fun Games have turned it into cooperation. Here your school is a tribe you never leave. The OSA network is the natural source of mentors and funders for today's youth.
          </p>
        </Container>
      </section>

      <Container><SampleNote>{SAMPLE_NOTICE} School crests are generic placeholders, not the institutions' real marks.</SampleNote></Container>
    </>
  );
}
