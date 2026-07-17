import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { InstitutionView, Organization } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, VerifiedBadge, Avatar, SampleNote } from "@/components/ui";
import { LocationMap } from "@/components/location-map";
import { Crest } from "@/components/crest";
import { EventCard } from "@/components/cards";
import { ManageBar } from "@/components/institution-claim";
import { SectionRenderer, Gallery } from "@/components/profile-sections";
import { initials, formatDate } from "@/lib/format";
import { SCHOOL_PHOTOS } from "@/lib/cape-coast-photos";

type SchoolData = InstitutionView & { peers: Organization[] };

export async function loader({ params }: LoaderFunctionArgs): Promise<SchoolData> {
  const [view, peers] = await Promise.all([
    api.institution(params.slug!),
    api.schools().catch(() => [] as Organization[]),
  ]);
  return { ...view, peers };
}

export function Component() {
  const { institution: org, events, officialEvents, peers } = useLoaderData() as SchoolData;
  usePageTitle(org.name);
  const c1 = org.houseColors?.[0] ?? "#123F2D";
  const c2 = org.houseColors?.[1] ?? "#C7A24A";
  const announcement = officialEvents[0];
  const upcoming = events.filter((e) => (e.details.startsAt ?? "") >= "2026-06-03");

  // Rivalry signals: top schools by member count in the same kind as this org.
  const rivals = peers
    .filter((p) => p.id !== org.id && p.kind === org.kind && (p.memberCount ?? 0) > 0)
    .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0))
    .slice(0, 5);
  const maxCount = Math.max(org.memberCount ?? 0, ...rivals.map((r) => r.memberCount ?? 0), 1);

  const schemaType = org.kind === "school" ? "EducationalOrganization" : "Organization";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: org.name,
    alternateName: org.officialTitle ?? undefined,
    description: org.summary,
    ...(org.founded ? { foundingDate: String(org.founded) } : {}),
    ...(org.crestUrl ? { logo: org.crestUrl } : {}),
    ...(org.jurisdiction ? { address: { "@type": "PostalAddress", addressLocality: org.jurisdiction, addressCountry: "GH" } } : {}),
    ...(org.contact?.find((c) => c.label?.toLowerCase() === "website") ? { url: org.contact.find((c) => c.label?.toLowerCase() === "website")!.url } : {}),
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="on-dark on-dark-pin relative overflow-hidden text-cream" style={{ background: `radial-gradient(120% 140% at 80% -20%, ${c1}F2 0%, ${c1} 55%, ${c1}E0 100%)` }}>
        {SCHOOL_PHOTOS[org.slug] && (
          <>
            <img src={SCHOOL_PHOTOS[org.slug]} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 h-full w-full object-cover opacity-25" />
            <span className="absolute inset-0" style={{ background: `radial-gradient(120% 140% at 80% -20%, ${c1}E6 0%, ${c1}D9 55%, ${c1}E0 100%)` }} aria-hidden />
          </>
        )}
        <div className="bg-dotgrid absolute inset-0 opacity-40" aria-hidden />
        <Container className="relative py-12 text-center">
          <div className="mx-auto w-fit"><Crest colors={org.houseColors} label={initials(org.name)} size={88} src={org.crestUrl} /></div>
          <h1 className="mt-4 text-3xl font-semibold text-cream sm:text-4xl">{org.name}</h1>
          {org.motto && <p className="mt-2 italic" style={{ color: c2 }}>{org.motto}</p>}
          {org.verified && <div className="mt-5"><VerifiedBadge label="Verified · Official profile" verifiedAs={org.name} onDark /></div>}
        </Container>
      </section>

      <ManageBar slug={org.slug} name={org.name} />

      <div className="border-b border-sand bg-cream">
        <Container>
          <dl className="grid grid-cols-2 divide-sand sm:grid-cols-4 sm:divide-x">
            {([["Established", org.founded ? String(org.founded) : "—"], ["Type", org.classification ?? "—"], ["Members", org.memberCount ? `${org.memberCount} on Oguaa` : "—"], ["Jurisdiction", org.jurisdiction ?? "Cape Coast"]] as const).map(([k, v]) => (
              <div key={k} className="px-3 py-4 text-center">
                <dt className="text-[0.62rem] font-semibold uppercase tracking-wider text-ink-faint">{k}</dt>
                <dd className="mt-1.5 text-base text-green-text">{v}</dd>
              </div>
            ))}
          </dl>
          {(org.gesCategory || org.boardingType || org.genderPolicy || org.ghanaPostGPS || org.quarterTag || org.asafoTag) && (
            <dl className="flex flex-wrap gap-x-8 gap-y-2 border-t border-sand px-4 py-3">
              {org.gesCategory && <div className="flex gap-2 text-xs"><dt className="font-semibold uppercase tracking-wide text-ink-faint">Category</dt><dd className="text-green-text">{org.gesCategory}</dd></div>}
              {org.boardingType && <div className="flex gap-2 text-xs"><dt className="font-semibold uppercase tracking-wide text-ink-faint">Boarding</dt><dd className="text-green-text capitalize">{org.boardingType}</dd></div>}
              {org.genderPolicy && <div className="flex gap-2 text-xs"><dt className="font-semibold uppercase tracking-wide text-ink-faint">Admission</dt><dd className="text-green-text capitalize">{org.genderPolicy}</dd></div>}
              {org.ghanaPostGPS && <div className="flex gap-2 text-xs"><dt className="font-semibold uppercase tracking-wide text-ink-faint">GhanaPost</dt><dd className="text-green-text">{org.ghanaPostGPS}</dd></div>}
              {org.quarterTag && <div className="flex gap-2 text-xs"><dt className="font-semibold uppercase tracking-wide text-ink-faint">Quarter</dt><dd className="text-green-text">{org.quarterTag}</dd></div>}
              {org.asafoTag && <div className="flex gap-2 text-xs"><dt className="font-semibold uppercase tracking-wide text-ink-faint">Asafo</dt><dd className="text-green-text">{org.asafoTag}</dd></div>}
            </dl>
          )}
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
                  <p className="mt-2 flex items-center gap-2 text-lg text-ink">
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
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-maroon-text">Official notice</p>
              <h3 className="mt-2 text-2xl font-semibold text-ink">{announcement.title}</h3>
              <p className="mt-3 text-ink-muted">{announcement.details.description}</p>
              <div className="mt-4 flex items-center gap-3 border-t border-dashed border-sand pt-3">
                <Avatar initials={initials((org.offices ?? [])[0]?.holderName ?? org.name)} size={34} />
                <p className="text-sm text-ink-muted">
                  Posted by <span className="font-medium text-ink">{(org.offices ?? [])[0]?.holderName ?? org.name}</span>{(org.offices ?? [])[0] && ` · ${(org.offices ?? [])[0].role}`}{org.verified && <span className="font-medium text-green-text"> · verified</span>}<br />official channel
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

        {(org.jurisdiction || org.name) && (
          <section>
            <SecHead>Location</SecHead>
            {org.ghanaPostGPS && <p className="mb-3 text-sm text-ink-muted">GhanaPost GPS: <span className="font-mono text-green-text">{org.ghanaPostGPS}</span></p>}
            <LocationMap address={org.jurisdiction ?? "Cape Coast"} query={`${org.name} ${org.jurisdiction ?? "Cape Coast"}`} latitude={org.latitude} longitude={org.longitude} />
          </section>
        )}

        {org.momoNumber && (
          <section>
            <SecHead>Support</SecHead>
            <div className="rounded-lg border border-gold-border bg-paper p-4">
              <p className="text-sm font-medium text-ink">Send a gift or donation via Mobile Money</p>
              <p className="mt-1 font-mono text-lg text-green-text">{org.momoNumber}</p>
              <p className="mt-1 text-xs text-ink-faint">MTN MoMo · Telecel Cash · AirtelTigo Money accepted.</p>
            </div>
          </section>
        )}
      </Container>

      {rivals.length > 0 && (org.memberCount ?? 0) > 0 && (
        <Container className="py-10">
          <h2 className="text-lg font-semibold text-ink">Oguaa schools by community strength</h2>
          <p className="mt-1 text-sm text-ink-muted">Members on Oguaa — a measure of how many people from each school have joined the platform.</p>
          <div className="mt-5 space-y-3">
            {[{ id: org.id, name: org.name, memberCount: org.memberCount ?? 0, slug: org.slug }, ...rivals].map((r) => (
              <div key={r.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <Link to={`/education/${r.slug}`} className={r.id === org.id ? "font-semibold text-green-text" : "text-ink-muted hover:text-ink"}>
                    {r.name}{r.id === org.id ? " ✦" : ""}
                  </Link>
                  <span className="tabular-nums text-ink-faint">{r.memberCount}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-sand">
                  <div
                    className={r.id === org.id ? "h-full rounded-full bg-green" : "h-full rounded-full bg-sand-500"}
                    style={{ width: `${Math.round(((r.memberCount ?? 0) / maxCount) * 100)}%`, backgroundColor: r.id === org.id ? undefined : "#b0a090" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Container>
      )}

      <div className="on-dark on-dark-pin bg-green-900 py-5 text-center text-sm text-cream/70">
        An official profile on <Link to="/" className="font-semibold text-gold">Oguaa</Link>
        {org.verifiedOn && ` · Verified ${formatDate(org.verifiedOn)}`}
      </div>

      {!org.crestUrl && <Container><SampleNote>Sample content — the crest is a generic placeholder, not the institution's real mark.</SampleNote></Container>}
    </article>
  );
}

function SecHead({ children }: Readonly<{ children: ReactNode }>) {
  return <h2 className="mb-4 flex items-center gap-3 text-xl font-semibold text-ink">{children}<span className="h-px flex-1 bg-sand" /></h2>;
}
function Chip({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-sand bg-cream px-3.5 py-1.5 text-sm text-green-text"><span className="h-1.5 w-1.5 rounded-full bg-gold-brand" aria-hidden />{children}</span>;
}
