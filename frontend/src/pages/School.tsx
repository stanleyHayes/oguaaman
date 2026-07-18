import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import type { ReactNode } from "react";
import { usePageTitle } from "@/lib/use-page-title";
import type { InstitutionView, Organization } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, VerifiedBadge, Avatar, SampleNote } from "@/components/ui";
import { LocationMap } from "@/components/location-map";
import { Crest } from "@/components/crest";
import { EventCard } from "@/components/cards";
import { ManageBar } from "@/components/institution-claim";
import { SectionRenderer, Gallery } from "@/components/profile-sections";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { initials, formatDate } from "@/lib/format";
import { cldCover } from "@/lib/cloudinary";
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
  const primary = org.houseColors?.[0] ?? "#123F2D";
  const accent = org.houseColors?.[1] ?? "#C7A24A";
  const announcement = officialEvents[0];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((event) => (event.details.startsAt ?? "") >= today);
  const heroPhoto = SCHOOL_PHOTOS[org.slug] ?? org.gallery?.find((asset) => asset.url)?.url;

  const rivals = peers
    .filter((peer) => peer.id !== org.id && peer.kind === org.kind && (peer.memberCount ?? 0) > 0)
    .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0))
    .slice(0, 5);
  const maxCount = Math.max(org.memberCount ?? 0, ...rivals.map((rival) => rival.memberCount ?? 0), 1);

  const facts = [
    { label: "Institution type", value: org.classification },
    { label: "GES category", value: org.gesCategory },
    { label: "Boarding", value: org.boardingType },
    { label: "Admission", value: org.genderPolicy },
    { label: "GhanaPost GPS", value: org.ghanaPostGPS },
    { label: "Quarter", value: org.quarterTag },
    { label: "Asafo", value: org.asafoTag },
    { label: "NHIS accredited", value: org.nhisAccredited ? "Yes" : undefined },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));

  const schemaType = org.kind === "school" ? "EducationalOrganization" : "Organization";
  const website = org.contact?.find((contact) => contact.label?.toLowerCase() === "website");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: org.name,
    alternateName: org.officialTitle ?? undefined,
    description: org.summary,
    ...(org.founded ? { foundingDate: String(org.founded) } : {}),
    ...(org.crestUrl ? { logo: org.crestUrl } : {}),
    ...(org.jurisdiction ? { address: { "@type": "PostalAddress", addressLocality: org.jurisdiction, addressCountry: "GH" } } : {}),
    ...(website ? { url: website.url } : {}),
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section
        className="on-dark on-dark-pin relative isolate overflow-hidden text-cream"
        style={{ background: "linear-gradient(125deg," + primary + " 0%,#0C2C1F 72%,#071A12 100%)" }}
      >
        {heroPhoto && (
          <>
            <img
              src={cldCover(heroPhoto, 1400)}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover opacity-30"
              onError={(event) => { event.currentTarget.style.display = "none"; }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-green-900/95 via-green-900/80 to-green-900/45" aria-hidden />
          </>
        )}
        <div className="bg-dotgrid absolute inset-0 opacity-30" aria-hidden />
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full border border-cream/10" aria-hidden />

        <Container size="wide" className="relative py-10 sm:py-14 lg:py-16">
          <Reveal>
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-2 text-sm text-cream/65">
                <li><Link to="/" className="transition-colors hover:text-gold">Home</Link></li>
                <li aria-hidden>/</li>
                <li><Link to="/education" className="transition-colors hover:text-gold">Education</Link></li>
                <li aria-hidden>/</li>
                <li className="max-w-52 truncate text-cream/90" aria-current="page">{org.name}</li>
              </ol>
            </nav>
          </Reveal>

          <div className="mt-8 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-14">
            <div className="order-2 lg:order-1">
              <Reveal delay={0.05} className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cream/20 bg-cream/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-cream/90 backdrop-blur-sm">{org.kind.replaceAll("-", " ")}</span>
                {org.verified && <VerifiedBadge label="Official profile" verifiedAs={org.name} onDark />}
              </Reveal>
              <Reveal as="h1" delay={0.1} className="mt-4 max-w-4xl text-5xl font-semibold leading-[0.97] text-cream sm:text-6xl lg:text-7xl">
                {org.name}
              </Reveal>
              {org.officialTitle && org.officialTitle !== org.name && <Reveal delay={0.14} className="mt-3 text-sm uppercase tracking-[0.16em] text-cream/65">{org.officialTitle}</Reveal>}
              {org.motto && (
                <Reveal delay={0.18} className="mt-6 max-w-2xl">
                  <p className="border-l-2 pl-5 text-xl italic leading-relaxed" style={{ borderColor: accent, color: accent }}>{org.motto}</p>
                </Reveal>
              )}
            </div>

            <Reveal delay={0.12} className="order-1 lg:order-2">
              <div className="relative mx-auto flex aspect-square w-52 items-center justify-center rounded-[2rem] border border-cream/15 bg-cream/10 p-7 shadow-2xl backdrop-blur-md lg:ml-auto lg:mr-0 lg:w-64">
                <span className="absolute inset-3 rounded-[1.5rem] border border-cream/10" aria-hidden />
                <Crest colors={org.houseColors} label={initials(org.name)} size={132} src={org.crestUrl} />
              </div>
            </Reveal>
          </div>

          <Stagger className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-cream/15 sm:grid-cols-2 lg:grid-cols-4">
            <HeroFact label="Established" value={org.founded ? String(org.founded) : "Not recorded"} />
            <HeroFact label="Type" value={org.classification ?? org.kind.replaceAll("-", " ")} />
            <HeroFact label="Community" value={org.memberCount ? org.memberCount + " members" : "Open profile"} />
            <HeroFact label="Jurisdiction" value={org.jurisdiction ?? "Cape Coast"} />
          </Stagger>
        </Container>
      </section>

      <ManageBar slug={org.slug} name={org.name} />

      <Container size="wide" className="space-y-14 py-12 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.45fr)_22rem] lg:gap-14">
          <div className="min-w-0 space-y-12">
            <Reveal as="section">
              <p className="eyebrow text-green-text">Institution profile</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">A place built into Oguaa</h2>
              <div className="mt-4 h-1 w-16 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
              <p className="mt-7 text-xl leading-relaxed text-ink">{org.summary}</p>
              {org.history && (
                <div className="relative mt-7 overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-6 shadow-[var(--shadow-card)] sm:p-8">
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: primary }} aria-hidden />
                  <p className="leading-relaxed text-ink-muted">{org.history}</p>
                </div>
              )}
            </Reveal>

            {(org.offices ?? []).length > 0 && (
              <Reveal as="section">
                <SectionTitle>Leadership &amp; office-holders</SectionTitle>
                <Stagger className="grid gap-3 sm:grid-cols-2">
                  {(org.offices ?? []).map((office) => (
                    <StaggerItem key={office.id} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-sand bg-cream p-4 shadow-[var(--shadow-card)]">
                      <Avatar initials={initials(office.holderName ?? office.role)} size={44} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{office.holderName ?? "Vacant"}</p>
                        <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-gold-text">{office.role}</p>
                      </div>
                      {office.verified && <span className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green/[0.08] text-green-text" aria-label="Verified office-holder" title="Verified office-holder">✓</span>}
                    </StaggerItem>
                  ))}
                </Stagger>
                <p className="mt-3 text-xs leading-relaxed text-ink-faint">Verified office-holders can publish through the institution's official channel.</p>
              </Reveal>
            )}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
              <div className="px-5 py-4 text-on-green" style={{ backgroundColor: primary }}>
                <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>Institution facts</p>
                <h2 className="mt-1 text-2xl font-semibold text-on-green">At a glance</h2>
              </div>
              <dl className="divide-y divide-sand px-5">
                {facts.map((fact) => <FactRow key={fact.label} label={fact.label} value={fact.value} />)}
                {facts.length === 0 && <FactRow label="Profile type" value={org.kind.replaceAll("-", " ")} />}
              </dl>
            </div>

            {(org.contact?.length ?? 0) > 0 && (
              <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
                <p className="eyebrow text-teal-text">Official contact</p>
                <div className="mt-4 grid gap-2">
                  {org.contact?.map((contact) => (
                    <a key={contact.label} href={contact.url} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between rounded-full border border-teal/30 px-4 py-2.5 text-sm font-semibold text-teal-text transition-colors hover:bg-teal hover:text-cream">
                      {contact.label} <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>↗</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
              <p className="eyebrow text-gold-text">Affiliations</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {org.osaName && <Chip>{org.osaName}</Chip>}
                <Chip>Oguaa Traditional Area</Chip>
                {org.kind === "school" && <Chip>Cape Coast Metro Education Directorate</Chip>}
                {org.memberCount ? <Chip>{org.memberCount} members on Oguaa</Chip> : null}
              </div>
            </div>
          </aside>
        </div>

        {(org.sections?.length ?? 0) > 0 && (
          <Reveal className="space-y-12">
            <SectionRenderer sections={org.sections} />
          </Reveal>
        )}

        {org.gallery && org.gallery.length > 0 && (
          <Reveal as="section">
            <SectionTitle>Campus &amp; community gallery</SectionTitle>
            <Gallery media={org.gallery} />
          </Reveal>
        )}

        {(announcement || upcoming.length > 0) && (
          <section>
            <SectionTitle>From the official channel</SectionTitle>
            <div className="grid gap-6 lg:grid-cols-2">
              {announcement && (
                <Reveal className="relative overflow-hidden rounded-[var(--radius-card)] border border-gold-border/45 bg-gold/[0.07] p-6 shadow-[var(--shadow-card)]">
                  <span className="absolute -right-5 -top-8 text-8xl text-gold opacity-10" aria-hidden>✦</span>
                  <p className="eyebrow text-maroon-text">Official notice</p>
                  <h3 className="mt-3 text-2xl font-semibold text-ink">{announcement.title}</h3>
                  {announcement.details.description && <p className="mt-3 leading-relaxed text-ink-muted">{announcement.details.description}</p>}
                  <div className="mt-5 flex items-center gap-3 border-t border-gold-border/20 pt-4">
                    <Avatar initials={initials((org.offices ?? [])[0]?.holderName ?? org.name)} size={38} />
                    <p className="text-sm leading-snug text-ink-muted">
                      <span className="font-medium text-ink">{(org.offices ?? [])[0]?.holderName ?? org.name}</span>
                      {(org.offices ?? [])[0] && <span> · {(org.offices ?? [])[0].role}</span>}
                      {org.verified && <span className="block text-green-text">Verified official channel</span>}
                    </p>
                  </div>
                </Reveal>
              )}
              {upcoming.length > 0 && (
                <Reveal>
                  <p className="eyebrow mb-3 text-teal-text">Coming up</p>
                  <div className="grid gap-3">{upcoming.map((event) => <EventCard key={event.id} event={event} />)}</div>
                </Reveal>
              )}
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.6fr)]">
          {(org.jurisdiction || org.name) && (
            <Reveal as="section">
              <p className="eyebrow text-teal-text">Visit</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink">Find {org.name}</h2>
              {org.ghanaPostGPS && <p className="mt-3 text-sm text-ink-muted">GhanaPost GPS: <span className="font-mono text-green-text">{org.ghanaPostGPS}</span></p>}
              <LocationMap className="mt-5" address={org.jurisdiction ?? "Cape Coast"} query={org.name + " " + (org.jurisdiction ?? "Cape Coast")} latitude={org.latitude} longitude={org.longitude} />
            </Reveal>
          )}

          <div className="space-y-5">
            {org.momoNumber && (
              <Reveal className="rounded-[var(--radius-card)] border border-gold-border/45 bg-gold/[0.07] p-6">
                <p className="eyebrow text-gold-text">Support the institution</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Send a gift by Mobile Money</h2>
                <p className="mt-4 font-mono text-xl font-semibold text-green-text">{org.momoNumber}</p>
                <p className="mt-2 text-xs leading-relaxed text-ink-faint">MTN MoMo, Telecel Cash and AirtelTigo Money accepted.</p>
              </Reveal>
            )}
            {(org.verificationArtifacts?.length ?? 0) > 0 && (
              <Reveal className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
                <p className="eyebrow text-green-text">Verified sources</p>
                <div className="mt-3 grid gap-2">
                  {org.verificationArtifacts?.map((artifact) => (
                    <a key={artifact.label} href={artifact.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-green-text hover:underline">{artifact.label} ↗</a>
                  ))}
                </div>
              </Reveal>
            )}
          </div>
        </div>
      </Container>

      {rivals.length > 0 && (org.memberCount ?? 0) > 0 && (
        <section className="border-y border-sand bg-cream py-12">
          <Container size="wide" className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
            <div>
              <p className="eyebrow text-gold-text">Community strength</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink">Oguaa schools, together</h2>
              <p className="mt-4 text-sm leading-relaxed text-ink-muted">A friendly view of how many people from each school have joined the platform — not a league table of academic performance.</p>
            </div>
            <div className="space-y-4 rounded-[var(--radius-card)] border border-sand bg-paper p-5 shadow-[var(--shadow-card)] sm:p-6">
              {[{ id: org.id, name: org.name, memberCount: org.memberCount ?? 0, slug: org.slug }, ...rivals].map((rival) => (
                <div key={rival.id}>
                  <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                    <Link to={"/education/" + rival.slug} className={rival.id === org.id ? "font-semibold text-green-text" : "text-ink-muted transition-colors hover:text-ink"}>
                      {rival.name}{rival.id === org.id ? " · you are here" : ""}
                    </Link>
                    <span className="shrink-0 font-semibold tabular-nums text-ink">{rival.memberCount}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-sand">
                    <div className="h-full rounded-full" style={{ width: Math.round(((rival.memberCount ?? 0) / maxCount) * 100) + "%", backgroundColor: rival.id === org.id ? primary : "#B07D32" }} />
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      <div className="on-dark on-dark-pin bg-green-900 py-6 text-center text-sm text-cream/70">
        An official profile on <Link to="/" className="font-semibold text-gold">Oguaa</Link>
        {org.verifiedOn && " · Verified " + formatDate(org.verifiedOn)}
      </div>

      {!org.crestUrl && <Container><SampleNote>Sample content — the crest is a generic placeholder, not the institution's real mark.</SampleNote></Container>}
    </article>
  );
}

function HeroFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <StaggerItem className="bg-green-900/65 px-5 py-4 backdrop-blur-sm">
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-gold">{label}</p>
      <p className="mt-1 capitalize text-cream">{value}</p>
    </StaggerItem>
  );
}

function FactRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex justify-between gap-4 py-3.5">
      <dt className="text-sm text-ink-faint">{label}</dt>
      <dd className="max-w-40 text-right text-sm font-medium capitalize text-ink">{value}</dd>
    </div>
  );
}

function SectionTitle({ children }: Readonly<{ children: ReactNode }>) {
  return <h2 className="mb-5 flex items-center gap-3 text-2xl font-semibold text-ink sm:text-3xl">{children}<span className="h-px flex-1 bg-sand" /></h2>;
}

function Chip({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-sand bg-paper px-3.5 py-1.5 text-sm text-green-text"><span className="h-1.5 w-1.5 rounded-full bg-gold-brand" aria-hidden />{children}</span>;
}
