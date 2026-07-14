import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import type { InstitutionView } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, VerifiedBadge, Avatar, SampleNote } from "@/components/ui";
import { Crest } from "@/components/crest";
import { EventCard } from "@/components/cards";
import { ManageBar } from "@/components/institution-claim";
import { SectionRenderer, Gallery } from "@/components/profile-sections";
import { initials, formatDate } from "@/lib/format";
import { SCHOOL_PHOTOS } from "@/lib/cape-coast-photos";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.institution(params.slug!);
}

export function Component() {
  const { institution: org, events, officialEvents } = useLoaderData() as InstitutionView;
  const c1 = org.houseColors?.[0] ?? "#123F2D";
  const c2 = org.houseColors?.[1] ?? "#C7A24A";
  const announcement = officialEvents[0];
  const upcoming = events.filter((e) => (e.details.startsAt ?? "") >= "2026-06-03");

  return (
    <article>
      <section className="on-dark relative overflow-hidden text-cream" style={{ background: `radial-gradient(120% 140% at 80% -20%, ${c1}F2 0%, ${c1} 55%, ${c1}E0 100%)` }}>
        {SCHOOL_PHOTOS[org.slug] && (
          <>
            <img src={SCHOOL_PHOTOS[org.slug]} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 h-full w-full object-cover opacity-25" />
            <span className="absolute inset-0" style={{ background: `radial-gradient(120% 140% at 80% -20%, ${c1}E6 0%, ${c1}D9 55%, ${c1}E0 100%)` }} aria-hidden />
          </>
        )}
        <div className="bg-dotgrid absolute inset-0 opacity-40" aria-hidden />
        <Container className="relative py-12 text-center">
          <div className="mx-auto w-fit"><Crest colors={org.houseColors} label={initials(org.name)} size={88} src={org.crestUrl} /></div>
          <h1 className="mt-4 font-display text-3xl font-semibold sm:text-4xl" style={{ color: "#F6F1E7" }}>{org.name}</h1>
          {org.motto && <p className="mt-2 font-display italic" style={{ color: c2 }}>{org.motto}</p>}
          <div className="mt-5"><VerifiedBadge label="Verified · Official profile" onDark /></div>
        </Container>
      </section>

      <ManageBar slug={org.slug} name={org.name} />

      <div className="border-b border-sand bg-cream">
        <Container>
          <dl className="grid grid-cols-2 divide-sand sm:grid-cols-4 sm:divide-x">
            {([["Established", org.founded ? String(org.founded) : "—"], ["Type", org.classification ?? "—"], ["Members", org.memberCount ? `${org.memberCount} on Oguaa` : "—"], ["Jurisdiction", org.jurisdiction ?? "Cape Coast"]] as const).map(([k, v]) => (
              <div key={k} className="px-3 py-4 text-center">
                <dt className="text-[0.62rem] font-semibold uppercase tracking-wider text-ink-faint">{k}</dt>
                <dd className="mt-1.5 font-display text-base text-green">{v}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </div>

      <Container className="space-y-12 py-12">
        <section>
          <SecHead>About</SecHead>
          <p className="font-serif text-lg leading-relaxed text-ink">{org.summary}</p>
          {org.history && <p className="mt-4 leading-relaxed text-ink-muted">{org.history}</p>}
        </section>

        <SectionRenderer sections={org.sections} />

        {org.gallery && org.gallery.length > 0 && (
          <section>
            <SecHead>Gallery</SecHead>
            <Gallery media={org.gallery} />
          </section>
        )}

        {(org.offices ?? []).length > 0 && (
          <section>
            <SecHead>Offices &amp; office-holders</SecHead>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(org.offices ?? []).map((o) => (
                <div key={o.id} className="rounded-[var(--radius-card)] border border-sand bg-cream p-4">
                  <p className="text-[0.68rem] font-bold uppercase tracking-wider text-gold-text">{o.role}</p>
                  <p className="mt-2 flex items-center gap-2 font-display text-lg text-ink">
                    {o.verified && (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
                        <circle cx="12" cy="12" r="10" fill="#DFF0E5" /><path d="M8 12.4l2.6 2.6L16 9.4" stroke="#123F2D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {o.holderName ?? "Vacant"}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-faint">An office is a position within an institution, held by a verified member. Office-holders can post officially on the institution's behalf.</p>
          </section>
        )}

        {announcement && (
          <section>
            <SecHead>Official announcement</SecHead>
            <div className="rounded-[var(--radius-card)] border border-sand border-l-4 border-l-gold-brand bg-gradient-to-b from-[#FFFDF8] to-[#FBF8F0] p-6">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-maroon-900">Official notice</p>
              <h3 className="mt-2 font-display text-2xl font-semibold text-ink">{announcement.title}</h3>
              <p className="mt-3 text-ink-muted">{announcement.details.description}</p>
              <div className="mt-4 flex items-center gap-3 border-t border-dashed border-sand pt-3">
                <Avatar initials={initials((org.offices ?? [])[0]?.holderName ?? org.name)} size={34} />
                <p className="text-sm text-ink-muted">
                  Posted by <span className="font-medium text-ink">{(org.offices ?? [])[0]?.holderName ?? org.name}</span>{(org.offices ?? [])[0] && ` · ${(org.offices ?? [])[0].role}`} <span className="font-medium text-green">· verified</span><br />official channel
                </p>
              </div>
            </div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section>
            <SecHead>Upcoming official events</SecHead>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{upcoming.map((e) => <EventCard key={e.id} event={e} />)}</div>
          </section>
        )}

        <section>
          <SecHead>Affiliations</SecHead>
          <div className="flex flex-wrap gap-2.5">
            {org.osaName && <Chip>{org.osaName}</Chip>}
            <Chip>Oguaa Traditional Area</Chip>
            {org.kind === "school" && <Chip>Cape Coast Metro Education Directorate</Chip>}
            {org.memberCount ? <Chip>{org.memberCount} members on Oguaa</Chip> : null}
          </div>
        </section>
      </Container>

      <div className="on-dark bg-green-900 py-5 text-center text-sm text-cream/70">
        An official profile on <Link to="/" className="font-display font-semibold text-gold">Oguaa</Link>
        {org.verifiedOn && ` · Verified ${formatDate(org.verifiedOn)}`}
      </div>

      {!org.crestUrl && <Container><SampleNote>Sample content — the crest is a generic placeholder, not the institution's real mark.</SampleNote></Container>}
    </article>
  );
}

function SecHead({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 flex items-center gap-3 font-display text-xl font-semibold text-ink">{children}<span className="h-px flex-1 bg-sand" /></h2>;
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-sand bg-cream px-3.5 py-1.5 text-sm text-green"><span className="h-1.5 w-1.5 rounded-full bg-gold-brand" aria-hidden />{children}</span>;
}
